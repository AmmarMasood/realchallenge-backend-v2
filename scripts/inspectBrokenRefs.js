/**
 * READ-ONLY. Full blast radius: every stored media URL across the app that now
 * points at an object which no longer exists in S3.
 *
 * diagnoseMediaMoves.js only checked Exercise.videoURL. Exercises also store
 * voiceOverLink and videoThumbnailURL, and workouts/challenges store their own
 * media URLs — all of which were copied at creation time and so can be dead
 * independently.
 *
 * Writes nothing. Run: node scripts/inspectBrokenRefs.js
 */

require("dotenv").config();
const mongoose = require("mongoose");
const AWS = require("aws-sdk");

const s3 = new AWS.S3({
  region: process.env.AWS_BUCKET_REGION,
  accessKeyId: process.env.AWS_BUCKET_ACCESS,
  secretAccessKey: process.env.AWS_BUCKET_SECRET,
});
const Bucket = process.env.AWS_BUCKET_NAME;
const CDN = process.env.CLOUDFRONT_DOMAIN;

const keyFromUrl = (url) => {
  const m = String(url || "").match(/^https?:\/\/[^/]+\/(.+)$/);
  return m ? m[1].split("?")[0] : null;
};

const existsCache = new Map();
async function objectExists(key) {
  if (existsCache.has(key)) return existsCache.get(key);
  let result;
  try {
    await s3.headObject({ Bucket, Key: key }).promise();
    result = true;
  } catch (err) {
    if (err.code === "NotFound" || err.statusCode === 404) result = false;
    else throw err;
  }
  existsCache.set(key, result);
  return result;
}

(async () => {
  await mongoose.connect(process.env.MONGO_URI, {
    useUnifiedTopology: true,
    useNewUrlParser: true,
    useCreateIndex: true,
    dbName: "realChallengeProduction",
  });

  const db = mongoose.connection.db;

  // Every collection + field that stores a media URL copied at creation time.
  const targets = [
    ["exercises", ["videoURL", "videoThumbnailURL", "voiceOverLink"]],
    ["workouts", ["renderedWorkoutExerciseVideo", "introVideoLink", "audioLink", "coverImage", "coverVideo"]],
    ["challenges", ["introVideoLink", "coverImage", "coverVideo", "audioLink", "thumbnail"]],
    ["musics", ["link", "filelink", "audioLink"]],
  ];

  const broken = [];
  let checked = 0;

  for (const [collName, fields] of targets) {
    let docs;
    try {
      docs = await db.collection(collName).find({}).toArray();
    } catch (err) {
      console.log(`(skipping ${collName}: ${err.message})`);
      continue;
    }
    if (!docs.length) {
      console.log(`${collName}: 0 documents`);
      continue;
    }

    const perField = {};
    for (const doc of docs) {
      for (const field of fields) {
        const url = doc[field];
        if (!url || typeof url !== "string") continue;
        if (CDN && !url.includes(CDN) && !url.includes(".amazonaws.com")) continue;
        const key = keyFromUrl(url);
        if (!key) continue;
        checked++;
        const ok = await objectExists(key);
        if (!ok) {
          perField[field] = (perField[field] || 0) + 1;
          broken.push({
            collection: collName,
            field,
            id: String(doc._id),
            title: doc.title || doc.name || "",
            key,
          });
        }
      }
    }
    const summary = Object.entries(perField)
      .map(([f, n]) => `${f}=${n}`)
      .join(" ");
    console.log(
      `${collName}: ${docs.length} docs | broken refs: ${summary || "none"}`
    );
  }

  console.log(`\nURLs checked: ${checked} | broken: ${broken.length}\n`);

  // Group the dead keys — these are what must be restored.
  const byKey = new Map();
  for (const b of broken) {
    if (!byKey.has(b.key)) byKey.set(b.key, []);
    byKey.get(b.key).push(`${b.collection}.${b.field}`);
  }

  console.log(`=== DISTINCT MISSING OBJECTS: ${byKey.size} ===`);
  for (const [key, refs] of [...byKey.entries()].sort()) {
    const counts = refs.reduce((a, r) => ((a[r] = (a[r] || 0) + 1), a), {});
    const label = Object.entries(counts)
      .map(([r, n]) => `${r}×${n}`)
      .join(", ");
    console.log(`  ${key}\n      referenced by: ${label}`);
  }

  await mongoose.disconnect();
})().catch((err) => {
  console.error("FAILED:", err);
  process.exit(1);
});
