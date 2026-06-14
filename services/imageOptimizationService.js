const AWS = require("aws-sdk");
const sharp = require("sharp");
const MediaFiles = require("../models/MediaManagerModels/mediaFileModel");
const { invalidateCloudFrontCache } = require("../config/s3");

const bucketName = process.env.AWS_BUCKET_NAME;
const bucketRegion = process.env.AWS_BUCKET_REGION;

const s3 = new AWS.S3({
  region: bucketRegion,
  accessKeyId: process.env.AWS_BUCKET_ACCESS,
  secretAccessKey: process.env.AWS_BUCKET_SECRET,
});

const OPTIMIZABLE_MIMES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
]);

function isOptimizableImage(mimetype) {
  if (!mimetype) return false;
  return OPTIMIZABLE_MIMES.has(mimetype.toLowerCase());
}

async function compressBuffer(buffer, mimetype) {
  // Preserve original dimensions — only re-encode to reduce file size.
  // rotate() honors EXIF orientation so we don't lose orientation metadata when stripping it.
  const pipeline = sharp(buffer, { failOn: "none" }).rotate();

  const mt = mimetype.toLowerCase();
  if (mt === "image/png") {
    return pipeline
      .png({ compressionLevel: 9, palette: true, effort: 7 })
      .toBuffer();
  }
  if (mt === "image/webp") {
    return pipeline.webp({ quality: 80, effort: 4 }).toBuffer();
  }
  // jpeg / jpg
  return pipeline
    .jpeg({ quality: 80, mozjpeg: true, progressive: true })
    .toBuffer();
}

/**
 * Core optimization: download an S3 object, re-encode it via sharp (same
 * dimensions, smaller bytes), and overwrite the same S3 key if (and only if)
 * the re-encode actually saved bytes. Invalidates CloudFront on overwrite.
 * No DB involvement — callers that track status layer it on top.
 *
 * Returns { overwritten, originalSize, optimizedSize }.
 */
async function optimizeS3ImageInPlace(s3Key, mimetype) {
  const getResult = await s3
    .getObject({ Bucket: bucketName, Key: s3Key })
    .promise();

  const originalBytes = getResult.Body;
  const originalSize = originalBytes.length;

  const optimizedBytes = await compressBuffer(originalBytes, mimetype);
  const optimizedSize = optimizedBytes.length;

  // Only overwrite if we actually saved bytes — avoid re-encoding images
  // that are already well-optimized (since re-encoding always loses a tiny bit of quality).
  if (optimizedSize >= originalSize) {
    console.log(
      `[ImageOpt] Skip overwrite for ${s3Key}: optimized ${optimizedSize} >= original ${originalSize}`
    );
    return { overwritten: false, originalSize, optimizedSize };
  }

  await s3
    .putObject({
      Bucket: bucketName,
      Key: s3Key,
      Body: optimizedBytes,
      ContentType: mimetype,
      CacheControl: "public, max-age=31536000, immutable",
      ContentDisposition: "inline",
      ServerSideEncryption: "AES256",
    })
    .promise();

  await invalidateCloudFrontCache([s3Key]);

  console.log(
    `[ImageOpt] ${s3Key} optimized: ${originalSize} -> ${optimizedSize} bytes (${Math.round(
      (1 - optimizedSize / originalSize) * 100
    )}% reduction)`
  );

  return { overwritten: true, originalSize, optimizedSize };
}

/**
 * Optimize a MediaFiles-tracked image that is already uploaded to S3.
 *
 * Mirrors the video pipeline's contract: fileLink/S3 key never changes,
 * processingStatus transitions none → processing → completed | failed.
 */
async function optimizeImageInPlace({ s3Key, fileId, mimetype }) {
  const mediaFile = await MediaFiles.findById(fileId);
  if (!mediaFile) {
    console.error(`[ImageOpt] File ${fileId} not found`);
    return;
  }

  try {
    mediaFile.processingStatus = "processing";
    if (mediaFile.originalSize == null) {
      mediaFile.originalSize = mediaFile.size;
    }
    await mediaFile.save();

    const { overwritten, optimizedSize } = await optimizeS3ImageInPlace(
      s3Key,
      mimetype
    );

    if (overwritten) {
      mediaFile.size = optimizedSize;
    }
    mediaFile.processingStatus = "completed";
    await mediaFile.save();
  } catch (err) {
    console.error(`[ImageOpt] Failed for file ${fileId}:`, err.message);
    try {
      mediaFile.processingStatus = "failed";
      await mediaFile.save();
    } catch (saveErr) {
      console.error(
        `[ImageOpt] Could not mark ${fileId} failed:`,
        saveErr.message
      );
    }
  }
}

module.exports = {
  isOptimizableImage,
  optimizeImageInPlace,
  optimizeS3ImageInPlace,
};
