const S3 = require("aws-sdk/clients/s3");
const fs = require("fs");
const dotenv = require("dotenv");
dotenv.config();

const bucketName = process.env.AWS_BUCKET_NAME;
const bucketRegion = process.env.AWS_BUCKET_REGION;
const accessKey = process.env.AWS_ACCESS_KEY;
const secretKey = process.env.AWS_SECRET_KEY;

const s3 = new S3({
  region: bucketRegion,
  accessKeyId: accessKey,
  secretAccessKey: secretKey,
});

// upload a file to s3
function uploadFile(file) {
  const fileStream = fs.createReadStream(file.path);
  //   console.log(fileStream);
  console.log(bucketName);
  const uploadParams = {
    Bucket: bucketName,
    Body: fileStream,
    Key: file.filename,
  };
  return s3.upload(uploadParams).promise();
}

exports.uploadFile = uploadFile;

//upload a video
// upload a file to s3
function uploadVideoFile(file, type) {
  const fileStream = fs.createReadStream(file.path);
  //   console.log(fileStream);
  console.log(bucketName);
  const uploadParams = {
    Bucket: bucketName,
    Body: fileStream,
    Key: `${file.filename}.${type}`,
    ContentType: "video/mp4",
  };
  return s3.upload(uploadParams).promise();
}
// const uploadVideoFile = multer({
//   storage: multerS3({
//     s3: s3,
//     bucket: 'some-bucket',
//     metadata: function (req, file, cb) {
//       cb(null, {fieldName: file.fieldname});
//     },
//     key: function (req, file, cb) {
//       cb(null, Date.now().toString())
//     }
//   })
// })

exports.uploadVideoFile = uploadVideoFile;

// get a file from s3
function getFile(fileKey, folder) {
  console.log("who", fileKey, folder);
  const file = fs.readFile(`/uploads/${folder}/${fileKey}`);
  console.log("file", file);
  return file;
}

exports.getFile = getFile;

function deleteFile(filekey) {
  const deleteParams = {
    Key: filekey,
    Bucket: bucketName,
  };
  return s3.deleteObject(deleteParams).promise();
}

exports.deleteFile = deleteFile;
