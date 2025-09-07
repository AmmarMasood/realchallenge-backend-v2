const S3 = require("aws-sdk/clients/s3");
const fs = require("fs");
const dotenv = require("dotenv");
dotenv.config();

const bucketName = process.env.AWS_BUCKET_NAME;
const bucketRegion = process.env.AWS_BUCKET_REGION;
const accessKey = process.env.AWS_BUCKET_ACCESS;
const secretKey = process.env.AWS_BUCKET_SECRET;
const cloudFrontDomain = process.env.CLOUDFRONT_DOMAIN;

const s3 = new S3({
  region: bucketRegion,
  accessKeyId: accessKey,
  secretAccessKey: secretKey,
});

// Helper function to convert S3 URL to CloudFront URL
function getCloudFrontUrl(s3Key) {
  if (cloudFrontDomain) {
    return `https://${cloudFrontDomain}/${s3Key}`;
  }
  // Fallback to S3 URL if CloudFront not configured
  return `https://${bucketName}.s3.${bucketRegion}.amazonaws.com/${s3Key}`;
}

// upload a file to s3 with optimized settings for video streaming
function uploadFile(file, folderId) {
  const fileStream = fs.createReadStream(file.path);

  let contentType = "application/octet-stream";

  if (file.mimetype) {
    contentType = file.mimetype;
  }

  const uploadParams = {
    Bucket: bucketName,
    Body: fileStream,
    Key: `${folderId}/${file.filename}`, // folderId is unique
    ContentType: contentType,
    // Optimize for video streaming
    CacheControl: contentType.startsWith("video/")
      ? "max-age=31536000, public"
      : "max-age=86400, public", // 1 year for videos, 1 day for others
    Metadata: {
      "optimized-for-streaming": "true",
    },
  };

  // Add additional headers for video files to support range requests
  if (contentType.startsWith("video/")) {
    uploadParams.ContentDisposition = "inline";
    uploadParams.AcceptRanges = "bytes";
  }
  return s3.upload(uploadParams).promise();
}

async function deleteFolderFromS3(folderPrefix) {
  // 1. List all objects with the prefix
  const listedObjects = await s3
    .listObjectsV2({
      Bucket: bucketName,
      Prefix: folderPrefix + "/", // e.g. "myfolder/"
    })
    .promise();

  if (!listedObjects.Contents.length) return;

  // 2. Prepare objects for deletion
  const deleteParams = {
    Bucket: bucketName,
    Delete: { Objects: [] },
  };

  listedObjects.Contents.forEach(({ Key }) => {
    deleteParams.Delete.Objects.push({ Key });
  });

  // 3. Delete all objects
  await s3.deleteObjects(deleteParams).promise();

  // If there are more objects, recursively delete
  if (listedObjects.IsTruncated) await deleteFolderFromS3(folderPrefix);
}

function deleteFile(folderId, fileName) {
  const deleteParams = {
    Key: `${folderId}/${fileName}`,
    Bucket: bucketName,
  };
  return s3.deleteObject(deleteParams).promise();
}

// Delete thumbnail file from S3
function deleteThumbnailFile(folderId, thumbnailFileName) {
  const deleteParams = {
    Key: `${folderId}/${thumbnailFileName}`,
    Bucket: bucketName,
  };
  return s3.deleteObject(deleteParams).promise();
}

exports.deleteFolderFromS3 = deleteFolderFromS3;
exports.deleteFile = deleteFile;
exports.deleteThumbnailFile = deleteThumbnailFile;
exports.uploadFile = uploadFile;
exports.getCloudFrontUrl = getCloudFrontUrl;
