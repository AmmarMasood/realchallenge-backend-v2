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
 * Optimize an image that is already uploaded to S3.
 * Downloads the object, re-encodes it via sharp (same dimensions, smaller bytes),
 * overwrites the same S3 key, invalidates CloudFront, and updates DB size.
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
        `[ImageOpt] Skip overwrite for ${fileId}: optimized ${optimizedSize} >= original ${originalSize}`
      );
      mediaFile.processingStatus = "completed";
      await mediaFile.save();
      return;
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

    mediaFile.size = optimizedSize;
    mediaFile.processingStatus = "completed";
    await mediaFile.save();

    await invalidateCloudFrontCache([s3Key]);

    console.log(
      `[ImageOpt] File ${fileId} optimized: ${originalSize} -> ${optimizedSize} bytes (${Math.round(
        (1 - optimizedSize / originalSize) * 100
      )}% reduction)`
    );
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
};
