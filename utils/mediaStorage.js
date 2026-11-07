/**
 * Resolving where a media file's bytes actually live in S3.
 *
 * Background — the bug this exists to prevent:
 *
 * Objects are uploaded under the key `<folderId>/<filename>`, and `filelink`
 * is the CloudFront URL of that key. Moving a file between folders (and so
 * between trainer "drives") is a metadata-only operation: `folderId` changes
 * but the S3 object is NOT relocated, because relocating it would change
 * `filelink` and break every exercise/workout/challenge that stored that URL.
 *
 * That is correct and deliberate, but it means `folderId` STOPS describing the
 * storage location the moment a file is moved. Any code that rebuilds the key
 * as `${file.folderId}/${file.filename}` will, for a moved file, point at a key
 * that does not exist — silently failing deletes, failing transcode promotion,
 * and (worst) prefix-deleting a folder can wipe the bytes of files that were
 * moved out of it.
 *
 * So: never rebuild a key from `folderId`. Always go through `storageKey()`.
 */

/**
 * Turn a CloudFront/S3 URL back into its S3 key, or return null.
 *
 * @param {string} url
 * @returns {string|null}
 */
function stripOrigin(url) {
  const match = String(url || "").match(/^https?:\/\/[^/]+\/(.+)$/);
  if (!match) return null;
  return match[1].split("?")[0] || null;
}

/**
 * The S3 key holding this file's bytes.
 *
 * Prefers the persisted `s3Key`. For legacy records written before that field
 * existed, parses `filelink` — which is authoritative, since it is written once
 * at upload and never rewritten, so it records the real location for moved and
 * unmoved files alike. Only falls back to the folder-derived key when there is
 * no usable link at all.
 *
 * @param {object} file - a MediaFiles document or plain object
 * @returns {string} the S3 key
 */
function storageKey(file) {
  if (!file) throw new Error("storageKey: file is required");

  if (file.s3Key) return file.s3Key;

  // `getCloudFrontUrl` builds the link by plain concatenation (no encoding), so
  // stripping the origin is its exact inverse. Do NOT decode here — that would
  // corrupt keys whose filename legitimately contains "%" or "+".
  const key = stripOrigin(file.filelink);
  if (key) return key;

  // Last resort for records with no parseable link. Correct only for files that
  // have never been moved.
  return `${file.folderId}/${file.filename}`;
}

/**
 * The key prefix (the "storage folder") the file's bytes sit under. This is the
 * folder the file was uploaded to, which is NOT necessarily `file.folderId`.
 *
 * Needed by the MediaConvert flow, whose temporary output objects were written
 * next to the original under the upload-time prefix.
 *
 * @param {object} file
 * @returns {string} prefix with no trailing slash ("" if the key has no prefix)
 */
function storagePrefix(file) {
  const parts = storageKey(file).split("/");
  parts.pop();
  return parts.join("/");
}

/**
 * The S3 key of this file's thumbnail, if it has one.
 *
 * Derived from `thumbnailUrl` where possible so that it, too, survives a move.
 *
 * @param {object} file
 * @param {string} [thumbnailFilename] - fallback filename when the URL is absent
 * @returns {string|null}
 */
function thumbnailStorageKey(file, thumbnailFilename) {
  if (!file) return null;

  const fromUrl = stripOrigin(file.thumbnailUrl);
  if (fromUrl) return fromUrl;

  if (!thumbnailFilename) return null;

  const prefix = storagePrefix(file);
  return prefix ? `${prefix}/${thumbnailFilename}` : thumbnailFilename;
}

module.exports = { storageKey, storagePrefix, thumbnailStorageKey };
