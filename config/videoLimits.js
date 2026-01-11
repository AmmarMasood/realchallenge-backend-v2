// config/videoLimits.js - Video duration and size limits configuration
module.exports = {
  coverVideo: {
    maxDuration: parseInt(process.env.MAX_COVER_VIDEO_DURATION) || 20, // seconds
    maxSize: parseInt(process.env.MAX_COVER_VIDEO_SIZE) || 50, // MB
    description: "Cover/thumbnail videos for challenge hero section",
  },
};
