/**
 * Put deleted media back at its ORIGINAL S3 key, so every stored URL starts
 * working again with no database edits and no relinking.
 *
 * Why this works: the exercises/workouts store a full CloudFront URL, and the
 * database still records exactly which key each one points at. The folder
 * records are gone, but a folder is only a DB row — S3 does not care, and
 * CloudFront will serve the key the moment an object exists there again.
 *
 * Needs the original files. Match is by the name the user uploaded: a dead key
 * looks like `<folderId>/<uuid>_<originalName>`, so a local file called
 * `01 Groiner to rotation.mp4` restores the key ending `_01 Groiner to rotation.mp4`.
 *
 * Video thumbnails are NOT re-uploaded — they are regenerated from the restored
 * video with ffmpeg, at the exact `thumb_<videoname>.jpg` key the exercises
 * already point at. So you only need to supply the videos and voiceovers.
 *
 * Dry run (default — matches files, uploads nothing):
 *   node scripts/restoreMediaObjects.js --from "D:\\originals"
 *
 * Apply:
 *   node scripts/restoreMediaObjects.js --from "D:\\originals" --apply
 *
 * Options:
 *   --skip-thumbs   don't regenerate thumbnails (needs ffmpeg on PATH otherwise)
 */

require("dotenv").config();
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");
const mongoose = require("mongoose");
const AWS = require("aws-sdk");

const args = process.argv.slice(2);
const APPLY = args.includes("--apply");
const SKIP_THUMBS = args.includes("--skip-thumbs");
const fromIdx = args.indexOf("--from");
const SOURCE_DIR = fromIdx !== -1 ? args[fromIdx + 1] : null;

if (!SOURCE_DIR) {
  console.error('Usage: node scripts/restoreMediaObjects.js --from "<dir>" [--apply] [--skip-thumbs]');
  process.exit(1);
}
if (!fs.existsSync(SOURCE_DIR)) {
  console.error(`Source directory not found: ${SOURCE_DIR}`);
  process.exit(1);
}

const s3 = new AWS.S3({
  region: process.env.AWS_BUCKET_REGION,
  accessKeyId: process.env.AWS_BUCKET_ACCESS,
  secretAccessKey: process.env.AWS_BUCKET_SECRET,
});
const Bucket = process.env.AWS_BUCKET_NAME;
const CDN = process.env.CLOUDFRONT_DOMAIN;

const CONTENT_TYPES = {
  ".mp4": "video/mp4",
  ".mov": "video/quicktime",
  ".webm": "video/webm",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".m4a": "audio/mp4",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
};

const keyFromUrl = (url) => {
  const m = String(url || "").match(/^https?:\/\/[^/]+\/(.+)$/);
  return m ? m[1].split("?")[0] : null;
};

/** `<folderId>/<uuid>_<originalName>` -> `<originalName>` */
const originalNameFromKey = (key) => {
  const base = key.split("/").pop();
  const underscore = base.indexOf("_");
  return underscore === -1 ? base : base.slice(underscore + 1);
};

async function objectExists(key) {
  try {
    await s3.headObject({ Bucket, Key: key }).promise();
    return true;
  } catch (err) {
    if (err.code === "NotFound" || err.statusCode === 404) return false;
    throw err;
  }
}

/** Index the source directory recursively by lowercased basename. */
function indexSourceFiles(dir, index = new Map()) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) indexSourceFiles(full, index);
    else index.set(entry.name.toLowerCase().trim(), full);
  }
  return index;
}

function putObject(key, body, contentType) {
  const isVideo = contentType.startsWith("video/");
  const params = {
    Bucket,
    Key: key,
    Body: body,
    ContentType: contentType,
    ServerSideEncryption: "AES256",
    StorageClass: isVideo ? "INTELLIGENT_TIERING" : "STANDARD",
  };
  if (isVideo || contentType.startsWith("audio/")) {
    params.CacheControl = "public, max-age=31536000, immutable";
    params.ContentDisposition = "inline";
  } else {
    params.CacheControl = "public, max-age=86400";
  }
  return s3.upload(params, { queueSize: 4 }).promise();
}

(async () => {
  await mongoose.connect(process.env.MONGO_URI, {
    useUnifiedTopology: true,
    useNewUrlParser: true,
    useCreateIndex: true,
    dbName: "realChallengeProduction",
  });

  console.log(APPLY ? "APPLYING — uploading to S3\n" : "DRY RUN — nothing is uploaded\n");

  const db = mongoose.connection.db;

  // Collect every stored media URL in the app.
  const targets = [
    ["exercises", ["videoURL", "videoThumbnailURL", "voiceOverLink"]],
    ["workouts", ["renderedWorkoutExerciseVideo", "introVideoLink", "audioLink", "coverImage", "coverVideo"]],
    ["challenges", ["introVideoLink", "coverImage", "coverVideo", "audioLink", "thumbnail"]],
  ];

  const referencedKeys = new Set();
  for (const [coll, fields] of targets) {
    const docs = await db.collection(coll).find({}).toArray();
    for (const doc of docs) {
      for (const field of fields) {
        const url = doc[field];
        if (!url || typeof url !== "string") continue;
        if (CDN && !url.includes(CDN) && !url.includes(".amazonaws.com")) continue;
        const key = keyFromUrl(url);
        if (key) referencedKeys.add(key);
      }
    }
  }

  // Which of those are actually missing?
  const missing = [];
  for (const key of referencedKeys) {
    if (!(await objectExists(key))) missing.push(key);
  }

  const thumbKeys = missing.filter((k) => path.basename(k).startsWith("thumb_"));
  const assetKeys = missing.filter((k) => !path.basename(k).startsWith("thumb_"));

  console.log(
    `Referenced objects: ${referencedKeys.size} | missing: ${missing.length} ` +
      `(${assetKeys.length} source files, ${thumbKeys.length} thumbnails)\n`
  );

  const index = indexSourceFiles(SOURCE_DIR);
  console.log(`Source directory holds ${index.size} file(s).\n`);

  // --- 1. restore the source files ----------------------------------------
  console.log("=== SOURCE FILES ===");
  const restored = new Map(); // key -> local path
  const unmatched = [];

  for (const key of assetKeys.sort()) {
    const wanted = originalNameFromKey(key).toLowerCase().trim();
    const local = index.get(wanted);
    if (!local) {
      unmatched.push({ key, wanted });
      console.log(`  MISSING SOURCE  ${originalNameFromKey(key)}`);
      continue;
    }
    restored.set(key, local);
    const ext = path.extname(key).toLowerCase();
    const ct = CONTENT_TYPES[ext] || "application/octet-stream";
    const size = fs.statSync(local).size;
    console.log(`  ${APPLY ? "upload" : "would upload"}  ${originalNameFromKey(key)}  (${size} bytes) -> ${key}`);
    if (APPLY) {
      await putObject(key, fs.createReadStream(local), ct);
    }
  }

  // --- 2. regenerate thumbnails from the restored videos -------------------
  console.log("\n=== THUMBNAILS ===");
  let thumbsDone = 0;
  let thumbsSkipped = 0;

  if (SKIP_THUMBS) {
    console.log("  skipped (--skip-thumbs)");
  } else {
    for (const thumbKey of thumbKeys.sort()) {
      // thumb_<videoBasenameWithoutExt>.jpg  ->  find its video
      const base = path.basename(thumbKey);
      const stem = base.replace(/^thumb_/, "").replace(/\.jpg$/i, "");
      const prefix = thumbKey.split("/").slice(0, -1).join("/");
      const videoKey = [...restored.keys()].find((k) => {
        const vb = path.basename(k);
        return k.startsWith(prefix) && vb.slice(0, vb.lastIndexOf(".")) === stem;
      });

      if (!videoKey) {
        thumbsSkipped++;
        console.log(`  NO SOURCE VIDEO for ${base}`);
        continue;
      }

      console.log(`  ${APPLY ? "generate" : "would generate"}  ${base}  from ${path.basename(videoKey)}`);
      if (!APPLY) continue;

      const localVideo = restored.get(videoKey);
      const tmp = path.join(os.tmpdir(), `rc_thumb_${Date.now()}.jpg`);
      try {
        execFileSync(
          "ffmpeg",
          ["-y", "-ss", "00:00:01", "-i", localVideo, "-vframes", "1", "-q:v", "3", tmp],
          { stdio: "ignore" }
        );
        await putObject(thumbKey, fs.readFileSync(tmp), "image/jpeg");
        thumbsDone++;
      } catch (err) {
        thumbsSkipped++;
        console.log(`      ffmpeg failed for ${base}: ${err.message.split("\n")[0]}`);
      } finally {
        if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
      }
    }
  }

  // --- 3. invalidate CloudFront -------------------------------------------
  if (APPLY && (restored.size || thumbsDone)) {
    const cf = new AWS.CloudFront({
      region: process.env.AWS_BUCKET_REGION,
      accessKeyId: process.env.AWS_BUCKET_ACCESS,
      secretAccessKey: process.env.AWS_BUCKET_SECRET,
    });
    const distId = process.env.CLOUDFRONT_DISTRIBUTION_ID;
    if (distId) {
      try {
        await cf
          .createInvalidation({
            DistributionId: distId,
            InvalidationBatch: {
              CallerReference: `restore-${Date.now()}`,
              // The dead keys may be cached as 403/404 responses.
              Paths: { Quantity: 1, Items: ["/*"] },
            },
          })
          .promise();
        console.log("\nCloudFront invalidation issued for /*");
      } catch (err) {
        console.log(`\nCloudFront invalidation failed: ${err.message}`);
      }
    }
  }

  console.log("\n=== RESULT ===");
  console.log(`  source files ${APPLY ? "restored" : "matched"} : ${restored.size} / ${assetKeys.length}`);
  console.log(`  thumbnails ${APPLY ? "generated" : "to generate"}: ${APPLY ? thumbsDone : thumbKeys.length}`);
  console.log(`  originals NOT found             : ${unmatched.length}`);
  for (const u of unmatched) console.log(`      need: ${u.wanted}`);
  if (thumbsSkipped) console.log(`  thumbnails skipped              : ${thumbsSkipped}`);
  if (!APPLY) console.log("\nDry run — re-run with --apply to upload.");

  await mongoose.disconnect();
})().catch((err) => {
  console.error("FAILED:", err);
  process.exit(1);
});
