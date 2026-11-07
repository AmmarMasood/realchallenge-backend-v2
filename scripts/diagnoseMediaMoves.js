/**
 * READ-ONLY diagnosis of media files that have been moved between drives.
 *
 * Answers three questions:
 *   1. Which files were moved between trainers (file.user != folder owner)?
 *   2. For every media file, do the bytes still exist in S3 at the key its
 *      `filelink` points at? (A missing object is unrecoverable without a
 *      re-upload — this is what distinguishes "repairable" from "re-upload".)
 *   3. Which exercises point at a URL whose object is missing, or at no media
 *      record at all?
 *
 * Writes nothing. Run with:
 *   node scripts/diagnoseMediaMoves.js
 */

require("dotenv").config();
const mongoose = require("mongoose");
const AWS = require("aws-sdk");

const MediaFiles = require("../models/MediaManagerModels/mediaFileModel");
const MediaFolder = require("../models/MediaManagerModels/mediaFolderModel");
const { Exercise } = require("../models/ChallengeModels/exerciseModel");
const { User } = require("../models/UserModels/userModel");
const { storageKey, storagePrefix } = require("../utils/mediaStorage");

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

async function mapLimit(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        results[i] = await fn(items[i], i);
      }
    })
  );
  return results;
}

(async () => {
  await mongoose.connect(process.env.MONGO_URI, {
    useUnifiedTopology: true,
    useNewUrlParser: true,
    useCreateIndex: true,
    dbName: "realChallengeProduction",
  });
  console.log("Connected.\n");

  const [files, folders, users, exercises] = await Promise.all([
    MediaFiles.find({}).lean(),
    MediaFolder.find({}).lean(),
    User.find({}).select("_id firstName lastName email").lean(),
    Exercise.find({}).select("_id title trainer videoURL").lean(),
  ]);

  const folderById = new Map(folders.map((f) => [String(f._id), f]));
  const userName = new Map(
    users.map((u) => [
      String(u._id),
      [u.firstName, u.lastName].filter(Boolean).join(" ") ||
        u.email ||
        String(u._id),
    ])
  );
  const nameOf = (id) => userName.get(String(id)) || String(id);

  console.log(
    `Media files: ${files.length} | folders: ${folders.length} | exercises: ${exercises.length}\n`
  );

  // --- 1. cross-drive moves ------------------------------------------------
  const crossDrive = files.filter((f) => {
    const folder = folderById.get(String(f.folderId));
    return folder && String(folder.user) !== String(f.user);
  });

  // A file is "moved" if the folder in its storage key is not its current one.
  const moved = files.filter(
    (f) => storagePrefix(f) && storagePrefix(f) !== String(f.folderId)
  );

  console.log("=== 1. MOVED FILES ===");
  console.log(`Owner != folder owner (cross-drive move): ${crossDrive.length}`);
  console.log(`Storage prefix != current folder:         ${moved.length}\n`);

  for (const f of crossDrive) {
    const folder = folderById.get(String(f.folderId));
    console.log(
      `  ${f.originalName}\n` +
        `      uploaded by : ${nameOf(f.user)}\n` +
        `      now in      : "${folder.name}" (${nameOf(folder.user)})\n` +
        `      storage key : ${storageKey(f)}\n` +
        `      status      : ${f.processingStatus}`
    );
  }

  // --- 2. do the bytes exist? ---------------------------------------------
  console.log("\n=== 2. S3 OBJECT PRESENCE ===");
  const presence = await mapLimit(files, 10, async (f) => ({
    file: f,
    key: storageKey(f),
    exists: await objectExists(storageKey(f)),
  }));

  const missing = presence.filter((p) => !p.exists);
  console.log(`Files whose S3 object is MISSING: ${missing.length} / ${files.length}`);
  for (const m of missing) {
    const folder = folderById.get(String(m.file.folderId));
    console.log(
      `  MISSING  ${m.file.originalName}  [${m.key}]  folder="${
        folder ? folder.name : "?"
      }" owner=${nameOf(m.file.user)}`
    );
  }

  // --- 3. affected exercises ----------------------------------------------
  console.log("\n=== 3. EXERCISES ===");
  const linkToFile = new Map(files.map((f) => [f.filelink, f]));
  const missingLinks = new Set(missing.map((m) => m.file.filelink));

  const broken = exercises.filter((e) => e.videoURL && missingLinks.has(e.videoURL));
  const orphaned = exercises.filter(
    (e) => e.videoURL && !linkToFile.has(e.videoURL)
  );

  console.log(`Exercises whose video object is MISSING from S3: ${broken.length}`);
  for (const e of broken) {
    console.log(`  "${e.title}"  trainer=${nameOf(e.trainer)}  ${e.videoURL}`);
  }

  console.log(
    `\nExercises whose videoURL matches no media record: ${orphaned.length}`
  );
  for (const e of orphaned.slice(0, 50)) {
    console.log(`  "${e.title}"  trainer=${nameOf(e.trainer)}  ${e.videoURL}`);
  }
  if (orphaned.length > 50) console.log(`  ... and ${orphaned.length - 50} more`);

  // --- 4. summary ----------------------------------------------------------
  console.log("\n=== SUMMARY ===");
  console.log(`  moved files needing ownership repair : ${crossDrive.length}`);
  console.log(`  files missing s3Key (backfill)       : ${files.filter((f) => !f.s3Key).length}`);
  console.log(`  files marked "failed"                : ${files.filter((f) => f.processingStatus === "failed").length}`);
  console.log(`  files with NO bytes in S3 (re-upload): ${missing.length}`);
  console.log(`  exercises broken by missing bytes    : ${broken.length}`);

  await mongoose.disconnect();
})().catch((err) => {
  console.error("FAILED:", err);
  process.exit(1);
});
