const AWS = require("aws-sdk");

const lambda = new AWS.Lambda({
  region: process.env.AWS_BUCKET_REGION,
  accessKeyId: process.env.AWS_BUCKET_ACCESS,
  secretAccessKey: process.env.AWS_BUCKET_SECRET,
});

/**
 * Invoke the thumbnail-generator Lambda function (async/fire-and-forget).
 * The Lambda will download the first 10MB of the video, extract a frame,
 * upload the thumbnail to S3, and call back to the backend.
 */
async function invokeThumbnailLambda({ s3Key, folderId, fileId, filename }) {
  const lambdaName = process.env.THUMBNAIL_LAMBDA_NAME;
  if (!lambdaName) {
    throw new Error("THUMBNAIL_LAMBDA_NAME not set in environment variables");
  }

  const backendUrl = process.env.BACKEND_URL;
  if (!backendUrl) {
    throw new Error("BACKEND_URL not set in environment variables");
  }

  // Build thumbnail S3 key: {folderId}/thumb_{basename}.jpg
  const baseName = filename.replace(/\.[^.]+$/, "");
  const thumbnailS3Key = `${folderId}/thumb_${baseName}.jpg`;

  const payload = {
    bucketName: process.env.AWS_BUCKET_NAME,
    videoS3Key: s3Key,
    thumbnailS3Key,
    callbackUrl: `${backendUrl}/api/media/thumbnail-callback`,
    callbackSecret: process.env.THUMBNAIL_CALLBACK_SECRET,
    fileId,
  };

  const params = {
    FunctionName: lambdaName,
    InvocationType: "Event", // async fire-and-forget
    Payload: JSON.stringify(payload),
  };

  const result = await lambda.invoke(params).promise();
  console.log(
    `[ThumbnailLambda] Invoked ${lambdaName} for file ${fileId}, status: ${result.StatusCode}`
  );
  return result;
}

module.exports = {
  invokeThumbnailLambda,
};
