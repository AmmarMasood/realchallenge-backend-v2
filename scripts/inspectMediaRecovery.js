/**
 * READ-ONLY. Can the deleted media be recovered without re-uploading?
 *
 * Checks, for the prefixes the missing objects belonged to:
 *   1. Do those MediaFolder records still exist? (a deleted folder is what
 *      prefix-deletes the objects of files moved out of it)
 *   2. Is bucket versioning enabled? If so, a "deleted" object is only hidden
 *      behind a delete marker and can be restored in place — no re-upload.
 *   3. What is actually in the bucket under those prefixes now?
 *
 * Writes nothing. Run: node scripts/inspectMediaRecovery.js
 */

require("dotenv").config();
const mongoose = require("mongoose");
const AWS = require("aws-sdk");

const MediaFiles = require("../models/MediaManagerModels/mediaFileModel");
const MediaFolder = require("../models/MediaManagerModels/mediaFolderModel");
const { User } = require("../models/UserModels/userModel");
const { storageKey, storagePrefix } = require("../utils/mediaStorage");

const s3 = new AWS.S3({
  region: process.env.AWS_BUCKET_REGION,
  accessKeyId: process.env.AWS_BUCKET_ACCESS,
  secretAccessKey: process.env.AWS_BUCKET_SECRET,
});
const Bucket = process.env.AWS_BUCKET_NAME;

(async () => {
  await mongoose.connect(process.env.MONGO_URI, {
    useUnifiedTopology: true,
    useNewUrlParser: true,
    useCreateIndex: true,
    dbName: "realChallengeProduction",
  });

  const files = await MediaFiles.find({}).lean();
  const folders = await MediaFolder.find({}).lean();
  const users = await User.find({}).select("_id firstName lastName email").lean();
  const folderById = new Map(folders.map((f) => [String(f._id), f]));
  const nameOf = (id) => {
    const u = users.find((x) => String(x._id) === String(id));
    return u
      ? [u.firstName, u.lastName].filter(Boolean).join(" ") || u.email
      : String(id);
  };

  // --- 1. bucket versioning ------------------------------------------------
  console.log("=== BUCKET VERSIONING ===");
  let versioning = {};
  try {
    versioning = await s3.getBucketVersioning({ Bucket }).promise();
    console.log(JSON.stringify(versioning));
    console.log(
      versioning.Status === "Enabled"
        ? ">>> Versioning ENABLED — deleted objects are recoverable in place."
        : ">>> Versioning NOT enabled — a delete is permanent."
    );
  } catch (err) {
    console.log("could not read versioning:", err.code || err.message);
  }

  // --- 2. the prefixes the missing objects belong to -----------------------
  const prefixes = [...new Set(files.map((f) => storagePrefix(f)).filter(Boolean))];

  console.log("\n=== SOURCE PREFIXES: does the folder record still exist? ===");
  for (const p of prefixes) {
    const folder = folderById.get(p);
    const usingIt = files.filter((f) => storagePrefix(f) === p).length;
    console.log(
      `  ${p}  files=${usingIt}  folderRecord=${
        folder ? `EXISTS "${folder.name}" (${nameOf(folder.user)})` : "*** DELETED ***"
      }`
    );
  }

  console.log("\n=== CURRENT FOLDERS the moved files now sit in ===");
  const currentFolderIds = [...new Set(files.map((f) => String(f.folderId)))];
  for (const id of currentFolderIds) {
    const folder = folderById.get(id);
    const count = files.filter((f) => String(f.folderId) === id).length;
    console.log(
      `  ${id}  files=${count}  ${
        folder ? `"${folder.name}" (${nameOf(folder.user)})` : "*** FOLDER RECORD MISSING ***"
      }`
    );
  }

  // --- 3. what is actually in the bucket under each prefix -----------------
  console.log("\n=== WHAT IS IN S3 UNDER EACH PREFIX ===");
  const allPrefixes = [...new Set([...prefixes, ...currentFolderIds])];
  for (const p of allPrefixes) {
    try {
      const listed = await s3
        .listObjectsV2({ Bucket, Prefix: `${p}/`, MaxKeys: 1000 })
        .promise();
      console.log(`  ${p}/  -> ${listed.KeyCount} live object(s)`);
      (listed.Contents || [])
        .slice(0, 5)
        .forEach((o) => console.log(`        ${o.Key}  (${o.Size} bytes)`));
      if ((listed.Contents || []).length > 5)
        console.log(`        ... ${listed.Contents.length - 5} more`);
    } catch (err) {
      console.log(`  ${p}/  -> list failed: ${err.code || err.message}`);
    }
  }

  // --- 4. delete markers / old versions, if versioning ever ran ------------
  console.log("\n=== OBJECT VERSIONS & DELETE MARKERS (recovery check) ===");
  for (const p of prefixes) {
    try {
      const v = await s3
        .listObjectVersions({ Bucket, Prefix: `${p}/`, MaxKeys: 1000 })
        .promise();
      const versions = v.Versions || [];
      const markers = v.DeleteMarkers || [];
      console.log(
        `  ${p}/  versions=${versions.length}  deleteMarkers=${markers.length}`
      );
      markers.slice(0, 5).forEach((m) =>
        console.log(`        marker: ${m.Key}  versionId=${m.VersionId}`)
      );
      versions.slice(0, 5).forEach((o) =>
        console.log(`        version: ${o.Key}  ${o.Size} bytes  id=${o.VersionId}`)
      );
    } catch (err) {
      console.log(`  ${p}/  -> listObjectVersions failed: ${err.code || err.message}`);
    }
  }

  await mongoose.disconnect();
})().catch((err) => {
  console.error("FAILED:", err);
  process.exit(1);
});
