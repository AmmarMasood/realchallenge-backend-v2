// s3.js - Updated configuration
const S3 = require("aws-sdk/clients/s3");
const CloudFront = require("aws-sdk/clients/cloudfront");
const fs = require("fs");
const dotenv = require("dotenv");
dotenv.config();

const bucketName = process.env.AWS_BUCKET_NAME;
const bucketRegion = process.env.AWS_BUCKET_REGION;
const accessKey = process.env.AWS_BUCKET_ACCESS;
const secretKey = process.env.AWS_BUCKET_SECRET;
const cloudFrontDomain = process.env.CLOUDFRONT_DOMAIN;
const cloudFrontDistributionId = process.env.CLOUDFRONT_DISTRIBUTION_ID;

const s3 = new S3({
  region: bucketRegion,
  accessKeyId: accessKey,
  secretAccessKey: secretKey,
  signatureVersion: "v4",
  maxRetries: 3,
  httpOptions: {
    timeout: 120000,
    connectTimeout: 5000,
  },
});

const cloudfront = new CloudFront({
  accessKeyId: accessKey,
  secretAccessKey: secretKey,
});

// Helper function to convert S3 URL to CloudFront URL
function getCloudFrontUrl(s3Key) {
  if (cloudFrontDomain) {
    return `https://${cloudFrontDomain}/${s3Key}`;
  }
  return `https://${bucketName}.s3.${bucketRegion}.amazonaws.com/${s3Key}`;
}

// UPDATED: Optimized upload function for video streaming
function uploadFile(file, folderId) {
  const fileStream = fs.createReadStream(file.path);
  let contentType = file.mimetype || "application/octet-stream";

  const isVideo = contentType.startsWith("video/");
  const fileSize = fs.statSync(file.path).size;

  const uploadParams = {
    Bucket: bucketName,
    Body: fileStream,
    Key: `${folderId}/${file.filename}`,
    ContentType: contentType,
    // Use Intelligent Tiering for videos to save costs
    StorageClass: isVideo ? "INTELLIGENT_TIERING" : "STANDARD",
    ServerSideEncryption: "AES256",
    Metadata: {
      "original-name": (file.originalname || "").replace(/[^\x20-\x7E]+/g, ""), // Remove non-ASCII/control chars
      "upload-date": new Date().toISOString(),
      "file-size": fileSize.toString(),
    },
  };

  // Enhanced video-specific settings
  if (isVideo) {
    Object.assign(uploadParams, {
      // Immutable cache for videos (they don't change)
      CacheControl: "public, max-age=31536000, immutable",
      // Inline display for streaming
      ContentDisposition: "inline",
      // Important: This helps with seeking in videos
      ContentEncoding: undefined,
      // Set expiration far in the future
      Expires: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
    });
  } else {
    // Images and other files
    uploadParams.CacheControl = "public, max-age=86400";
  }

  // Use multipart upload for files > 100MB
  const partSize =
    fileSize > 100 * 1024 * 1024
      ? 10 * 1024 * 1024 // 10MB parts for large files
      : 5 * 1024 * 1024; // 5MB parts for smaller files

  return s3
    .upload(uploadParams, {
      partSize: partSize,
      queueSize: 4, // Upload 4 parts in parallel
    })
    .promise()
    .then(async (result) => {
      // Pre-warm CloudFront cache for videos
      if (isVideo && cloudFrontDomain) {
        const cloudFrontUrl = getCloudFrontUrl(`${folderId}/${file.filename}`);
        await prewarmCache(cloudFrontUrl);
      }
      return result;
    });
}

// NEW: Pre-warm CloudFront cache
async function prewarmCache(url) {
  try {
    const https = require("https");

    // Make a HEAD request to pre-warm the cache
    return new Promise((resolve) => {
      https
        .request(url, { method: "HEAD" }, (res) => {
          console.log(
            `Cache pre-warmed for: ${url} - Status: ${res.statusCode}`
          );
          resolve(res.statusCode);
        })
        .on("error", (err) => {
          console.error("Pre-warm error:", err.message);
          resolve(null); // Don't fail upload if pre-warm fails
        })
        .end();
    });
  } catch (error) {
    console.error("Pre-warm exception:", error);
    return null;
  }
}

// NEW: Invalidate CloudFront cache when needed
async function invalidateCloudFrontCache(paths) {
  if (!cloudFrontDistributionId) {
    console.warn("CloudFront Distribution ID not set in environment variables");
    return;
  }

  const params = {
    DistributionId: cloudFrontDistributionId,
    InvalidationBatch: {
      CallerReference: `invalidation-${Date.now()}`,
      Paths: {
        Quantity: paths.length,
        Items: paths.map((path) => (path.startsWith("/") ? path : `/${path}`)),
      },
    },
  };

  try {
    const result = await cloudfront.createInvalidation(params).promise();
    console.log("CloudFront cache invalidated:", result.Invalidation.Id);
    return result;
  } catch (error) {
    console.error("CloudFront invalidation error:", error);
  }
}

// UPDATED: Delete file with cache invalidation
async function deleteFile(folderId, fileName) {
  const deleteParams = {
    Key: `${folderId}/${fileName}`,
    Bucket: bucketName,
  };

  // Delete from S3
  await s3.deleteObject(deleteParams).promise();

  // Invalidate CloudFront cache
  if (cloudFrontDistributionId) {
    await invalidateCloudFrontCache([`${folderId}/${fileName}`]);
  }

  return true;
}

// Delete folder function remains the same
async function deleteFolderFromS3(folderPrefix) {
  const listedObjects = await s3
    .listObjectsV2({
      Bucket: bucketName,
      Prefix: folderPrefix + "/",
    })
    .promise();

  if (!listedObjects.Contents.length) return;

  const deleteParams = {
    Bucket: bucketName,
    Delete: { Objects: [] },
  };

  listedObjects.Contents.forEach(({ Key }) => {
    deleteParams.Delete.Objects.push({ Key });
  });

  await s3.deleteObjects(deleteParams).promise();

  if (listedObjects.IsTruncated) await deleteFolderFromS3(folderPrefix);

  // Invalidate cache for the entire folder
  if (cloudFrontDistributionId) {
    await invalidateCloudFrontCache([`${folderPrefix}/*`]);
  }
}

// Delete thumbnail file
function deleteThumbnailFile(folderId, thumbnailFileName) {
  const deleteParams = {
    Key: `${folderId}/${thumbnailFileName}`,
    Bucket: bucketName,
  };
  return s3.deleteObject(deleteParams).promise();
}

module.exports = {
  deleteFolderFromS3,
  deleteFile,
  deleteThumbnailFile,
  uploadFile,
  getCloudFrontUrl,
  invalidateCloudFrontCache,
  prewarmCache,
};
