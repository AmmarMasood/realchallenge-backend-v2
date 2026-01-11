// utils/videoValidator.js - Video validation utility for cover videos
const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path;
const videoLimits = require('../config/videoLimits');

ffmpeg.setFfmpegPath(ffmpegPath);

/**
 * Get video metadata (duration, size, dimensions)
 * @param {string} filePath - Path to the video file
 * @returns {Promise<Object>} Video metadata
 */
async function getVideoMetadata(filePath) {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err, metadata) => {
      if (err) {
        console.error('FFprobe error:', err);
        reject(err);
        return;
      }

      const videoStream = metadata.streams.find(s => s.codec_type === 'video');

      if (!videoStream) {
        reject(new Error('No video stream found in file'));
        return;
      }

      resolve({
        duration: metadata.format.duration, // in seconds
        size: metadata.format.size, // in bytes
        width: videoStream.width,
        height: videoStream.height,
        codec: videoStream.codec_name,
        bitrate: metadata.format.bit_rate,
      });
    });
  });
}

/**
 * Validate cover video against configured limits
 * @param {string} filePath - Path to the video file
 * @returns {Promise<Object>} Validation result
 */
async function validateCoverVideo(filePath) {
  const limits = videoLimits.coverVideo;

  try {
    const metadata = await getVideoMetadata(filePath);
    const errors = [];

    // Check duration
    if (metadata.duration > limits.maxDuration) {
      errors.push({
        field: 'duration',
        message: `Cover video duration (${Math.round(metadata.duration)}s) exceeds maximum of ${limits.maxDuration}s`,
        actual: Math.round(metadata.duration),
        limit: limits.maxDuration,
      });
    }

    // Check file size
    const fileSizeMB = metadata.size / (1024 * 1024);
    if (fileSizeMB > limits.maxSize) {
      errors.push({
        field: 'size',
        message: `Cover video size (${fileSizeMB.toFixed(2)}MB) exceeds maximum of ${limits.maxSize}MB`,
        actual: parseFloat(fileSizeMB.toFixed(2)),
        limit: limits.maxSize,
      });
    }

    return {
      valid: errors.length === 0,
      metadata,
      errors,
      limits,
    };
  } catch (error) {
    console.error('Video validation error:', error);
    throw error;
  }
}

module.exports = {
  getVideoMetadata,
  validateCoverVideo,
  videoLimits,
};
