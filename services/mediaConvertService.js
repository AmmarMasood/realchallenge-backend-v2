const AWS = require("aws-sdk");
const MediaFiles = require("../models/MediaManagerModels/mediaFileModel");
const { invalidateCloudFrontCache } = require("../config/s3");

const bucketName = process.env.AWS_BUCKET_NAME;
const bucketRegion = process.env.AWS_BUCKET_REGION;
const mediaConvertEndpoint = process.env.MEDIACONVERT_ENDPOINT;
const mediaConvertRoleArn = process.env.MEDIACONVERT_ROLE_ARN;

// Reuse the same credentials as S3 (AWS_BUCKET_ACCESS / AWS_BUCKET_SECRET)
const credentials = {
  accessKeyId: process.env.AWS_BUCKET_ACCESS,
  secretAccessKey: process.env.AWS_BUCKET_SECRET,
};

// S3 client for copy/delete/headObject operations
const s3 = new AWS.S3({
  region: bucketRegion,
  ...credentials,
});

// MediaConvert client (uses account-specific endpoint)
let mediaConvert = null;
function getMediaConvertClient() {
  if (!mediaConvert) {
    if (!mediaConvertEndpoint) {
      throw new Error("MEDIACONVERT_ENDPOINT not set in environment variables");
    }
    mediaConvert = new AWS.MediaConvert({
      endpoint: mediaConvertEndpoint,
      region: bucketRegion,
      ...credentials,
    });
  }
  return mediaConvert;
}

/**
 * Create a MediaConvert transcoding job for a video file.
 * Returns the job ID on success.
 */
async function createTranscodeJob(s3InputKey, folderId, fileId) {
  const client = getMediaConvertClient();

  const inputS3Uri = `s3://${bucketName}/${s3InputKey}`;
  // MediaConvert appends the filename; we use a temp prefix to avoid overwriting the original
  const outputS3Prefix = `s3://${bucketName}/${folderId}/mc_`;

  const params = {
    Role: mediaConvertRoleArn,
    Settings: {
      Inputs: [
        {
          FileInput: inputS3Uri,
          AudioSelectors: {
            "Audio Selector 1": {
              DefaultSelection: "DEFAULT",
            },
          },
          VideoSelector: {},
          TimecodeSource: "ZEROBASED",
        },
      ],
      OutputGroups: [
        {
          Name: "File Group",
          OutputGroupSettings: {
            Type: "FILE_GROUP_SETTINGS",
            FileGroupSettings: {
              Destination: outputS3Prefix,
            },
          },
          Outputs: [
            {
              ContainerSettings: {
                Container: "MP4",
                Mp4Settings: {
                  MoovPlacement: "PROGRESSIVE_DOWNLOAD",
                },
              },
              VideoDescription: {
                CodecSettings: {
                  Codec: "H_264",
                  H264Settings: {
                    RateControlMode: "QVBR",
                    QvbrSettings: {
                      QvbrQualityLevel: 7,
                    },
                    MaxBitrate: 5000000, // 5 Mbps max
                    CodecProfile: "HIGH",
                    CodecLevel: "AUTO",
                    SceneChangeDetect: "ENABLED",
                    QualityTuningLevel: "SINGLE_PASS_HQ",
                  },
                },
                // Cap resolution at 1920x1080, preserve aspect ratio
                Width: 1920,
                Height: 1080,
                ScalingBehavior: "DEFAULT",
                RespondToAfd: "NONE",
                AntiAlias: "ENABLED",
              },
              AudioDescriptions: [
                {
                  CodecSettings: {
                    Codec: "AAC",
                    AacSettings: {
                      Bitrate: 128000,
                      CodingMode: "CODING_MODE_2_0",
                      SampleRate: 48000,
                    },
                  },
                },
              ],
            },
          ],
        },
      ],
      TimecodeConfig: {
        Source: "ZEROBASED",
      },
    },
    UserMetadata: {
      fileId: fileId,
      folderId: folderId,
    },
    StatusUpdateInterval: "SECONDS_30",
  };

  const result = await client.createJob(params).promise();
  console.log(
    `[MediaConvert] Job created: ${result.Job.Id} for file ${fileId}`
  );
  return result.Job.Id;
}

/**
 * Get the status of a MediaConvert job.
 * Returns the full job object.
 */
async function getJobStatus(jobId) {
  const client = getMediaConvertClient();
  const result = await client.getJob({ Id: jobId }).promise();
  return result.Job;
}

/**
 * Poll DB for processing files and check their MediaConvert job status.
 * On completion: copy optimized file over original, delete temp, update DB, invalidate CloudFront.
 * On error: mark as failed in DB.
 */
async function pollAndProcessJobs() {
  try {
    const processingFiles = await MediaFiles.find({
      processingStatus: "processing",
    });

    if (processingFiles.length === 0) return;

    console.log(
      `[MediaConvert] Polling ${processingFiles.length} processing file(s)...`
    );

    for (const file of processingFiles) {
      try {
        const job = await getJobStatus(file.mediaConvertJobId);

        if (job.Status === "COMPLETE") {
          await handleJobComplete(file, job);
        } else if (job.Status === "ERROR") {
          console.error(
            `[MediaConvert] Job ${file.mediaConvertJobId} failed:`,
            job.ErrorMessage || "Unknown error"
          );
          file.processingStatus = "failed";
          await file.save();
        }
        // PROGRESSING or SUBMITTED — skip, check next cycle
      } catch (err) {
        console.error(
          `[MediaConvert] Error checking job ${file.mediaConvertJobId}:`,
          err.message
        );
      }
    }
  } catch (err) {
    console.error("[MediaConvert] Polling error:", err.message);
  }
}

/**
 * Handle a completed MediaConvert job:
 * 1. Find the output file in S3 (MediaConvert appends to mc_ prefix)
 * 2. Copy it over the original S3 key
 * 3. Delete the temp mc_ file
 * 4. Update DB with new size and status
 * 5. Invalidate CloudFront cache
 */
async function handleJobComplete(file, job) {
  const folderId = file.folderId.toString();
  const originalKey = `${folderId}/${file.filename}`;

  // Find the output file — MediaConvert creates files under the output prefix
  // The output key pattern is: {folderId}/mc_{something}.mp4
  const listResult = await s3
    .listObjectsV2({
      Bucket: bucketName,
      Prefix: `${folderId}/mc_`,
    })
    .promise();

  // Find the output file that was created around the job's completion time
  // Filter to only files modified after the file was created
  const outputFiles = (listResult.Contents || []).filter((obj) => {
    return obj.Key.startsWith(`${folderId}/mc_`) && obj.Key.endsWith(".mp4");
  });

  if (outputFiles.length === 0) {
    console.error(
      `[MediaConvert] No output file found for job ${file.mediaConvertJobId}`
    );
    file.processingStatus = "failed";
    await file.save();
    return;
  }

  // Use the most recently modified file matching our prefix
  const outputFile = outputFiles.sort(
    (a, b) => b.LastModified - a.LastModified
  )[0];

  const tempKey = outputFile.Key;

  console.log(
    `[MediaConvert] Copying optimized file: ${tempKey} -> ${originalKey}`
  );

  // Copy optimized file over original
  await s3
    .copyObject({
      Bucket: bucketName,
      CopySource: `${bucketName}/${tempKey}`,
      Key: originalKey,
      ContentType: "video/mp4",
      CacheControl: "public, max-age=31536000, immutable",
      ContentDisposition: "inline",
      MetadataDirective: "REPLACE",
      ServerSideEncryption: "AES256",
    })
    .promise();

  // Delete temp file
  await s3
    .deleteObject({
      Bucket: bucketName,
      Key: tempKey,
    })
    .promise();

  // Get new file size
  const headResult = await s3
    .headObject({
      Bucket: bucketName,
      Key: originalKey,
    })
    .promise();

  const newSize = headResult.ContentLength;

  // Update DB
  file.processingStatus = "completed";
  file.size = newSize;
  await file.save();

  // Invalidate CloudFront cache for this file
  await invalidateCloudFrontCache([originalKey]);

  console.log(
    `[MediaConvert] File ${file._id} optimized: ${file.originalSize} -> ${newSize} bytes (${Math.round((1 - newSize / file.originalSize) * 100)}% reduction)`
  );
}

/**
 * Mark stale processing files as failed (safety net).
 * Files that have been "processing" for longer than maxAge are marked as failed.
 */
async function cleanupStaleProcessing(maxAgeMs = 60 * 60 * 1000) {
  try {
    const cutoff = new Date(Date.now() - maxAgeMs);
    const result = await MediaFiles.updateMany(
      {
        processingStatus: "processing",
        createdAt: { $lt: cutoff },
      },
      {
        $set: { processingStatus: "failed" },
      }
    );

    if (result.modifiedCount > 0) {
      console.log(
        `[MediaConvert] Marked ${result.modifiedCount} stale processing file(s) as failed`
      );
    }
  } catch (err) {
    console.error("[MediaConvert] Stale cleanup error:", err.message);
  }
}

module.exports = {
  createTranscodeJob,
  getJobStatus,
  pollAndProcessJobs,
  cleanupStaleProcessing,
};
