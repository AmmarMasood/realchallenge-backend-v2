const AWS = require("aws-sdk");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { v4: uuidv4 } = require("uuid");
const ffmpeg = require("fluent-ffmpeg");
const ffmpegStatic = require("ffmpeg-static");
const MediaFiles = require("../models/MediaManagerModels/mediaFileModel");
const { invalidateCloudFrontCache } = require("../config/s3");

// Reuse the same ffmpeg binary the thumbnail/video services rely on.
ffmpeg.setFfmpegPath(ffmpegStatic);

const bucketName = process.env.AWS_BUCKET_NAME;
const bucketRegion = process.env.AWS_BUCKET_REGION;

const s3 = new AWS.S3({
  region: bucketRegion,
  accessKeyId: process.env.AWS_BUCKET_ACCESS,
  secretAccessKey: process.env.AWS_BUCKET_SECRET,
});

// Everything the media manager accepts as "audio". Any of these is transcoded
// to MP3 192kbps. Already-small MP3s are left untouched by the size guard below.
const OPTIMIZABLE_AUDIO_MIMES = new Set([
  "audio/mpeg",
  "audio/mp3",
  "audio/wav",
  "audio/x-wav",
  "audio/ogg",
  "audio/webm",
  "audio/aac",
]);

// Output is always MP3 — universal browser + Chromecast support.
const OUTPUT_MIME = "audio/mpeg";
const OUTPUT_BITRATE = "192k";

// Safety guard for small instances (t3.micro): transcoding pulls the whole file
// into memory, so skip anything unusually large. Real music tracks are well under
// this even as uncompressed WAV.
const MAX_OPTIMIZE_BYTES = 200 * 1024 * 1024; // 200MB

function isOptimizableAudio(mimetype) {
  if (!mimetype) return false;
  return OPTIMIZABLE_AUDIO_MIMES.has(mimetype.toLowerCase());
}

// Transcode a local file to MP3 192kbps via ffmpeg. Returns the output path.
function transcodeToMp3(inputPath, outputPath) {
  return new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .noVideo()
      .audioCodec("libmp3lame")
      .audioBitrate(OUTPUT_BITRATE)
      .format("mp3")
      .on("error", (err) => reject(err))
      .on("end", () => resolve(outputPath))
      .save(outputPath);
  });
}

/**
 * Core optimization: download an S3 object, transcode it to MP3 192kbps, and
 * overwrite the same S3 key if (and only if) the result is actually smaller.
 * Invalidates CloudFront on overwrite. No DB involvement — callers that track
 * status layer it on top.
 *
 * Returns { overwritten, originalSize, optimizedSize }.
 */
async function optimizeS3AudioInPlace(s3Key) {
  const getResult = await s3
    .getObject({ Bucket: bucketName, Key: s3Key })
    .promise();

  const originalBytes = getResult.Body;
  const originalSize = originalBytes.length;

  const tmpDir = os.tmpdir();
  const inputPath = path.join(tmpDir, `audioopt-in-${uuidv4()}`);
  const outputPath = path.join(tmpDir, `audioopt-out-${uuidv4()}.mp3`);

  try {
    await fs.promises.writeFile(inputPath, originalBytes);
    await transcodeToMp3(inputPath, outputPath);

    const optimizedBytes = await fs.promises.readFile(outputPath);
    const optimizedSize = optimizedBytes.length;

    // Only overwrite if we actually saved bytes — avoids re-encoding audio that
    // is already at or below our target bitrate (which would only lose quality).
    if (optimizedSize >= originalSize) {
      console.log(
        `[AudioOpt] Skip overwrite for ${s3Key}: optimized ${optimizedSize} >= original ${originalSize}`
      );
      return { overwritten: false, originalSize, optimizedSize };
    }

    await s3
      .putObject({
        Bucket: bucketName,
        Key: s3Key,
        Body: optimizedBytes,
        ContentType: OUTPUT_MIME,
        CacheControl: "public, max-age=31536000, immutable",
        ContentDisposition: "inline",
        ServerSideEncryption: "AES256",
      })
      .promise();

    await invalidateCloudFrontCache([s3Key]);

    console.log(
      `[AudioOpt] ${s3Key} optimized: ${originalSize} -> ${optimizedSize} bytes (${Math.round(
        (1 - optimizedSize / originalSize) * 100
      )}% reduction)`
    );

    return { overwritten: true, originalSize, optimizedSize };
  } finally {
    // Best-effort cleanup of temp files.
    fs.promises.unlink(inputPath).catch(() => {});
    fs.promises.unlink(outputPath).catch(() => {});
  }
}

/**
 * Optimize a MediaFiles-tracked audio file that is already uploaded to S3.
 *
 * Mirrors the image/video pipeline contract: the S3 key (and therefore the
 * playback URL) never changes, processingStatus transitions
 * none → processing → completed | failed.
 */
async function optimizeAudioInPlace({ s3Key, fileId }) {
  const mediaFile = await MediaFiles.findById(fileId);
  if (!mediaFile) {
    console.error(`[AudioOpt] File ${fileId} not found`);
    return;
  }

  try {
    // Protect small instances from huge in-memory transcodes — leave the original as-is.
    if (mediaFile.size && mediaFile.size > MAX_OPTIMIZE_BYTES) {
      console.log(
        `[AudioOpt] Skip ${fileId}: ${mediaFile.size} bytes exceeds ${MAX_OPTIMIZE_BYTES} cap`
      );
      mediaFile.processingStatus = "completed";
      await mediaFile.save();
      return;
    }

    mediaFile.processingStatus = "processing";
    if (mediaFile.originalSize == null) {
      mediaFile.originalSize = mediaFile.size;
    }
    await mediaFile.save();

    const { overwritten, optimizedSize } = await optimizeS3AudioInPlace(s3Key);

    if (overwritten) {
      mediaFile.size = optimizedSize;
    }
    mediaFile.processingStatus = "completed";
    await mediaFile.save();
  } catch (err) {
    console.error(`[AudioOpt] Failed for file ${fileId}:`, err.message);
    try {
      mediaFile.processingStatus = "failed";
      await mediaFile.save();
    } catch (saveErr) {
      console.error(
        `[AudioOpt] Could not mark ${fileId} failed:`,
        saveErr.message
      );
    }
  }
}

module.exports = {
  isOptimizableAudio,
  optimizeAudioInPlace,
  optimizeS3AudioInPlace,
};
