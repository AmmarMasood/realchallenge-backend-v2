const { S3Client, GetObjectCommand, PutObjectCommand } = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
const { execFile } = require("child_process");
const fs = require("fs");
const path = require("path");
const https = require("https");
const http = require("http");

const s3 = new S3Client();

/**
 * Lambda handler: generates a thumbnail from a video stored in S3.
 *
 * Generates a pre-signed URL for the video and passes it directly to FFmpeg,
 * which uses HTTP range requests internally to seek and read the file.
 * This handles videos with moov atom at the end without downloading the whole file.
 *
 * Expected event payload:
 * {
 *   bucketName: string,
 *   videoS3Key: string,
 *   thumbnailS3Key: string,
 *   callbackUrl: string,
 *   callbackSecret: string,
 *   fileId: string
 * }
 */
exports.handler = async (event) => {
  const {
    bucketName,
    videoS3Key,
    thumbnailS3Key,
    callbackUrl,
    callbackSecret,
    fileId,
  } = event;

  console.log(`[ThumbnailGenerator] Processing: ${videoS3Key} for file ${fileId}`);

  const tmpThumbnailPath = path.join("/tmp", "thumbnail.jpg");

  try {
    // Generate a pre-signed URL so FFmpeg can read the video via HTTP
    // FFmpeg handles range requests internally and can seek to moov atom at end of file
    const command = new GetObjectCommand({ Bucket: bucketName, Key: videoS3Key });
    const signedUrl = await getSignedUrl(s3, command, { expiresIn: 300 });

    console.log(`[ThumbnailGenerator] Generated signed URL, running FFmpeg...`);

    // Try to extract a frame at 3 seconds, fall back to 0 seconds
    let thumbnailGenerated = false;

    for (const seekTime of ["3", "0"]) {
      try {
        await runFFmpeg(signedUrl, tmpThumbnailPath, seekTime);
        thumbnailGenerated = true;
        console.log(`[ThumbnailGenerator] Frame extracted at ${seekTime}s`);
        break;
      } catch (err) {
        console.warn(
          `[ThumbnailGenerator] FFmpeg failed at ${seekTime}s: ${err.message}`
        );
      }
    }

    if (!thumbnailGenerated) {
      throw new Error("FFmpeg failed to extract any frame");
    }

    // Upload thumbnail to S3
    const thumbnailBuffer = fs.readFileSync(tmpThumbnailPath);
    await s3.send(
      new PutObjectCommand({
        Bucket: bucketName,
        Key: thumbnailS3Key,
        Body: thumbnailBuffer,
        ContentType: "image/jpeg",
        CacheControl: "public, max-age=86400",
        ServerSideEncryption: "AES256",
      })
    );

    console.log(`[ThumbnailGenerator] Uploaded thumbnail to ${thumbnailS3Key}`);

    // Callback to backend
    await sendCallback(callbackUrl, {
      secret: callbackSecret,
      fileId,
      thumbnailS3Key,
      success: true,
    });

    return { statusCode: 200, body: "Thumbnail generated successfully" };
  } catch (error) {
    console.error(`[ThumbnailGenerator] Error:`, error);

    // Callback with failure
    try {
      await sendCallback(callbackUrl, {
        secret: callbackSecret,
        fileId,
        success: false,
        error: error.message,
      });
    } catch (callbackErr) {
      console.error(`[ThumbnailGenerator] Callback failed:`, callbackErr);
    }

    return { statusCode: 500, body: error.message };
  } finally {
    // Clean up temp files
    try {
      if (fs.existsSync(tmpThumbnailPath)) fs.unlinkSync(tmpThumbnailPath);
    } catch (_) {}
  }
};

/**
 * Run FFmpeg to extract a single frame from a video URL.
 * FFmpeg reads via HTTP and handles range requests/seeking internally.
 */
function runFFmpeg(inputUrl, outputPath, seekTime) {
  return new Promise((resolve, reject) => {
    // FFmpeg layer typically puts binary at /opt/bin/ffmpeg
    const ffmpegPath = fs.existsSync("/opt/bin/ffmpeg")
      ? "/opt/bin/ffmpeg"
      : "ffmpeg";

    const args = [
      "-probesize", "50M",
      "-analyzeduration", "10M",
      "-ss", seekTime,
      "-i", inputUrl,
      "-vframes", "1",
      "-vf", "scale=320:-1",
      "-f", "image2",
      "-y",
      outputPath,
    ];

    execFile(ffmpegPath, args, { timeout: 60000 }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(`FFmpeg error: ${error.message}\nStderr: ${stderr}`));
        return;
      }
      if (!fs.existsSync(outputPath) || fs.statSync(outputPath).size === 0) {
        reject(new Error("FFmpeg produced no output"));
        return;
      }
      resolve(outputPath);
    });
  });
}

/**
 * Send HTTP POST callback to the backend.
 */
function sendCallback(url, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const parsed = new URL(url);
    const transport = parsed.protocol === "https:" ? https : http;

    const options = {
      hostname: parsed.hostname,
      port: parsed.port || (parsed.protocol === "https:" ? 443 : 80),
      path: parsed.pathname + parsed.search,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(data),
      },
    };

    const req = transport.request(options, (res) => {
      let responseBody = "";
      res.on("data", (chunk) => (responseBody += chunk));
      res.on("end", () => {
        console.log(`[ThumbnailGenerator] Callback response: ${res.statusCode}`);
        resolve({ statusCode: res.statusCode, body: responseBody });
      });
    });

    req.on("error", reject);
    req.write(data);
    req.end();
  });
}
