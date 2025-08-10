const S3 = require("aws-sdk/clients/s3");
const fs = require("fs");
const dotenv = require("dotenv");
dotenv.config();

const bucketName = process.env.AWS_BUCKET_NAME;
const bucketRegion = process.env.AWS_BUCKET_REGION;
const accessKey = process.env.AWS_BUCKET_ACCESS;
const secretKey = process.env.AWS_BUCKET_SECRET;

const s3 = new S3({
  region: bucketRegion,
  accessKeyId: accessKey,
  secretAccessKey: secretKey,
});

// upload a file to s3
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
  };
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

exports.deleteFolderFromS3 = deleteFolderFromS3;
exports.deleteFile = deleteFile;
exports.uploadFile = uploadFile;
