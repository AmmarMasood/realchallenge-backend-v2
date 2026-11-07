const {
  storageKey,
  storagePrefix,
  thumbnailStorageKey,
} = require("../utils/mediaStorage");

const CDN = "https://d1example.cloudfront.net";

const UPLOAD_FOLDER = "64aaaaaaaaaaaaaaaaaaaaaa";
const DEST_FOLDER = "64bbbbbbbbbbbbbbbbbbbbbb";
const FILENAME = "0f1e2d3c_squat.mp4";

/** A file sitting in the folder it was uploaded to. */
const unmovedFile = () => ({
  folderId: UPLOAD_FOLDER,
  filename: FILENAME,
  filelink: `${CDN}/${UPLOAD_FOLDER}/${FILENAME}`,
  thumbnailUrl: `${CDN}/${UPLOAD_FOLDER}/thumb_0f1e2d3c_squat.jpg`,
});

/**
 * The same file after being moved to another trainer's drive. A move is
 * metadata-only: folderId changes, the object and the link do not.
 */
const movedFile = () => ({
  ...unmovedFile(),
  folderId: DEST_FOLDER,
});

describe("storageKey", () => {
  it("uses the persisted s3Key when present", () => {
    expect(
      storageKey({ ...movedFile(), s3Key: `${UPLOAD_FOLDER}/${FILENAME}` })
    ).toBe(`${UPLOAD_FOLDER}/${FILENAME}`);
  });

  it("resolves an unmoved legacy file from its link", () => {
    expect(storageKey(unmovedFile())).toBe(`${UPLOAD_FOLDER}/${FILENAME}`);
  });

  it("resolves a MOVED legacy file to where the bytes really are, not its new folder", () => {
    const file = movedFile();
    expect(storageKey(file)).toBe(`${UPLOAD_FOLDER}/${FILENAME}`);
    expect(storageKey(file)).not.toBe(`${file.folderId}/${file.filename}`);
  });

  it("does not decode the key — filenames may contain a literal %", () => {
    const file = {
      folderId: UPLOAD_FOLDER,
      filename: "abc_100%_effort.mp4",
      filelink: `${CDN}/${UPLOAD_FOLDER}/abc_100%_effort.mp4`,
    };
    expect(storageKey(file)).toBe(`${UPLOAD_FOLDER}/abc_100%_effort.mp4`);
  });

  it("keeps spaces in the key, matching how the link is built", () => {
    const file = {
      folderId: UPLOAD_FOLDER,
      filename: "abc_my clip.mp4",
      filelink: `${CDN}/${UPLOAD_FOLDER}/abc_my clip.mp4`,
    };
    expect(storageKey(file)).toBe(`${UPLOAD_FOLDER}/abc_my clip.mp4`);
  });

  it("strips a query string", () => {
    const file = {
      ...unmovedFile(),
      filelink: `${CDN}/${UPLOAD_FOLDER}/${FILENAME}?v=2`,
    };
    expect(storageKey(file)).toBe(`${UPLOAD_FOLDER}/${FILENAME}`);
  });

  it("handles the raw-S3 link form", () => {
    const file = {
      ...unmovedFile(),
      filelink: `https://bucket.s3.eu-north-1.amazonaws.com/${UPLOAD_FOLDER}/${FILENAME}`,
    };
    expect(storageKey(file)).toBe(`${UPLOAD_FOLDER}/${FILENAME}`);
  });

  it("falls back to the folder-derived key only when there is no link", () => {
    expect(storageKey({ folderId: DEST_FOLDER, filename: FILENAME })).toBe(
      `${DEST_FOLDER}/${FILENAME}`
    );
  });

  it("throws on a missing file rather than returning a wrong key", () => {
    expect(() => storageKey(null)).toThrow();
  });
});

describe("storagePrefix", () => {
  it("returns the folder the bytes live under, not the current folder", () => {
    expect(storagePrefix(movedFile())).toBe(UPLOAD_FOLDER);
  });

  it("returns an empty string for a key with no prefix", () => {
    expect(storagePrefix({ s3Key: "loose-object.mp4" })).toBe("");
  });
});

describe("thumbnailStorageKey", () => {
  it("prefers the stored thumbnail URL", () => {
    expect(thumbnailStorageKey(movedFile(), "thumb_ignored.jpg")).toBe(
      `${UPLOAD_FOLDER}/thumb_0f1e2d3c_squat.jpg`
    );
  });

  it("falls back to the video's own prefix, not the destination folder", () => {
    const file = { ...movedFile(), thumbnailUrl: null };
    expect(thumbnailStorageKey(file, "thumb_0f1e2d3c_squat.jpg")).toBe(
      `${UPLOAD_FOLDER}/thumb_0f1e2d3c_squat.jpg`
    );
  });

  it("returns null when there is no thumbnail and no filename to guess from", () => {
    expect(thumbnailStorageKey({ ...movedFile(), thumbnailUrl: null })).toBeNull();
  });
});

describe("the regression this guards", () => {
  it("a moved file's key never follows folderId", () => {
    const file = movedFile();
    const naive = `${file.folderId}/${file.filename}`;
    const correct = storageKey(file);

    // The naive key is what deleteMediaFile, handleJobComplete and
    // retryOptimization used to build. It points at nothing.
    expect(correct).not.toBe(naive);
    expect(file.filelink.endsWith(correct)).toBe(true);
  });
});
