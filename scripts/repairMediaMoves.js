/**
 * Repair media records damaged by the folder-move bug.
 *
 * Does three things, all idempotent:
 *
 *   1. Backfills `s3Key` on every media file from its `filelink`, pinning the
 *      real storage location so no code path can mis-derive it from `folderId`
 *      again.
 *   2. Reassigns `user` to the owner of the folder the file now sits in, so a
 *      moved file actually belongs to the trainer whose drive it is in (their
 *      "my files" search and their rename/delete permissions both key on this).
 *   3. Clears a `processingStatus` of "failed" on files whose bytes are present
 *      and playable. Those were marked failed only because the transcode
 *      promotion looked for its output under the new folder; the video itself
 *      is fine. They are reset to "none" (unoptimised, but working) rather than
 *      "completed", which would claim an optimisation that never happened.
 *
 * It does NOT re-upload or relink anything: `filelink` is left untouched, which
 * is precisely why exercises keep working.
 *
 * Dry run (default — prints what it would change, writes nothing):
 *   node scripts/repairMediaMoves.js
 *
 * Apply:
 *   node scripts/repairMediaMoves.js --apply
 */

require("dotenv").config();
const mongoose = require("mongoose");
const AWS = require("aws-sdk");

const MediaFiles = require("../models/MediaManagerModels/mediaFileModel");
const MediaFolder = require("../models/MediaManagerModels/mediaFolderModel");
const { storageKey } = require("../utils/mediaStorage");

const APPLY = process.argv.includes("--apply");

const s3 = new AWS.S3({
  region: process.env.AWS_BUCKET_REGION,
  accessKeyId: process.env.AWS_BUCKET_ACCESS,
  secretAccessKey: process.env.AWS_BUCKET_SECRET,
});
const bucketName = process.env.AWS_BUCKET_NAME;

async function objectExists(key) {
  try {
    await s3.headObject({ Bucket: bucketName, Key: key }).promise();
    return true;
  } catch (err) {
    if (err.code === "NotFound" || err.statusCode === 404) return false;
    throw err;
  }
}

(async () => {
  await mongoose.connect(process.env.MONGO_URI, {
    useUnifiedTopology: true,
    useNewUrlParser: true,
    useCreateIndex: true,
    dbName: "realChallengeProduction",
  });

  console.log(APPLY ? "APPLYING CHANGES\n" : "DRY RUN — no writes\n");

  const files = await MediaFiles.find({});
  const folders = await MediaFolder.find({}).lean();
  const folderById = new Map(folders.map((f) => [String(f._id), f]));

  let keyBackfilled = 0;
  let ownerFixed = 0;
  let statusCleared = 0;
  let missingBytes = 0;

  for (const file of files) {
    const changes = [];

    // 1. pin the storage key
    const key = storageKey(file);
    if (!file.s3Key) {
      file.s3Key = key;
      changes.push(`s3Key := ${key}`);
      keyBackfilled++;
    }

    // 2. ownership follows the folder
    const folder = folderById.get(String(file.folderId));
    if (folder && String(folder.user) !== String(file.user)) {
      changes.push(`user := ${folder.user} (owner of "${folder.name}")`);
      file.user = folder.user;
      ownerFixed++;
    }

    // 3. clear a bogus "failed" where the video is actually fine
    let exists = null;
    if (file.processingStatus === "failed") {
      exists = await objectExists(key);
      if (exists) {
        changes.push(`processingStatus: failed -> none (object present)`);
        file.processingStatus = "none";
        statusCleared++;
      }
    }

    if (exists === null && changes.length) exists = await objectExists(key);
    if (exists === false) {
      missingBytes++;
      console.log(
        `  !! BYTES MISSING  "${file.originalName}"  [${key}] — needs re-upload`
      );
    }

    if (changes.length) {
      console.log(`  ${file.originalName}: ${changes.join("; ")}`);
      if (APPLY) await file.save();
    }
  }

  console.log("\n=== RESULT ===");
  console.log(`  s3Key backfilled        : ${keyBackfilled}`);
  console.log(`  ownership reassigned    : ${ownerFixed}`);
  console.log(`  bogus "failed" cleared  : ${statusCleared}`);
  console.log(`  objects missing from S3 : ${missingBytes}`);
  if (!APPLY) console.log("\nDry run — re-run with --apply to write.");

  await mongoose.disconnect();
})().catch((err) => {
  console.error("FAILED:", err);
  process.exit(1);
});
