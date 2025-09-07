const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('ffmpeg-static');
const path = require('path');
const fs = require('fs');

// Set ffmpeg path
ffmpeg.setFfmpegPath(ffmpegPath);

class VideoOptimizationService {
  
  // Check if file is a video
  static isVideoFile(mimetype) {
    return mimetype && mimetype.startsWith('video/');
  }

  // Compress video for web streaming
  static async compressVideo(inputPath, outputPath, options = {}) {
    return new Promise((resolve, reject) => {
      const {
        quality = 'medium', // low, medium, high
        maxWidth = 1920,
        maxHeight = 1080,
        bitrate = '1000k'
      } = options;

      let command = ffmpeg(inputPath)
        .output(outputPath)
        .format('mp4')
        .videoCodec('libx264')
        .audioCodec('aac')
        .addOptions([
          '-preset fast', // Faster encoding
          '-crf 28', // Reasonable quality/size balance
          '-movflags +faststart', // Enable fast start for web streaming
          '-pix_fmt yuv420p' // Ensure compatibility
        ]);

      // Set video filters for resizing if needed
      command = command.videoFilters([
        {
          filter: 'scale',
          options: `'min(${maxWidth},iw)':'min(${maxHeight},ih)':force_original_aspect_ratio=decrease`
        }
      ]);

      // Set bitrate based on quality
      switch(quality) {
        case 'low':
          command = command.videoBitrate('500k').audioBitrate('64k');
          break;
        case 'medium':
          command = command.videoBitrate('1000k').audioBitrate('128k');
          break;
        case 'high':
          command = command.videoBitrate('2000k').audioBitrate('192k');
          break;
        default:
          command = command.videoBitrate(bitrate).audioBitrate('128k');
      }

      command
        .on('start', (commandLine) => {
          console.log('Video compression started:', commandLine);
        })
        .on('progress', (progress) => {
          console.log(`Processing: ${progress.percent}% done`);
        })
        .on('end', () => {
          console.log('Video compression completed');
          resolve(outputPath);
        })
        .on('error', (err) => {
          console.error('Video compression error:', err);
          reject(err);
        })
        .run();
    });
  }

  // Get video metadata
  static async getVideoMetadata(filePath) {
    return new Promise((resolve, reject) => {
      ffmpeg.ffprobe(filePath, (err, metadata) => {
        if (err) {
          reject(err);
        } else {
          const videoStream = metadata.streams.find(stream => stream.codec_type === 'video');
          resolve({
            duration: metadata.format.duration,
            size: metadata.format.size,
            bitrate: metadata.format.bit_rate,
            width: videoStream?.width,
            height: videoStream?.height,
            codec: videoStream?.codec_name,
            fps: eval(videoStream?.r_frame_rate) // Convert fraction to decimal
          });
        }
      });
    });
  }

  // Process video for optimal streaming
  static async processVideoForStreaming(file, outputDir) {
    const inputPath = file.path;
    const outputFilename = `optimized_${file.filename}`;
    const outputPath = path.join(outputDir, outputFilename);

    try {
      // Get original video metadata
      const metadata = await this.getVideoMetadata(inputPath);
      console.log('Original video metadata:', metadata);

      // Determine compression settings based on original file
      let quality = 'medium';
      if (metadata.size > 100 * 1024 * 1024) { // > 100MB
        quality = 'low';
      } else if (metadata.size < 20 * 1024 * 1024) { // < 20MB
        quality = 'high';
      }

      // Compress video
      await this.compressVideo(inputPath, outputPath, { quality });

      // Return optimized file info
      return {
        originalPath: inputPath,
        optimizedPath: outputPath,
        originalFilename: file.filename,
        optimizedFilename: outputFilename,
        originalMetadata: metadata
      };

    } catch (error) {
      console.error('Video processing error:', error);
      throw error;
    }
  }
}

module.exports = VideoOptimizationService;