const ffmpeg = require('fluent-ffmpeg');
const ffmpegStatic = require('ffmpeg-static');
const fs = require('fs');
const path = require('path');
const { uploadFile } = require('../config/s3');

// Set the ffmpeg binary path
ffmpeg.setFfmpegPath(ffmpegStatic);

class ThumbnailService {
  /**
   * Generate thumbnail for video file
   * @param {Object} videoFile - The video file object from multer
   * @param {string} folderId - The folder ID where video is stored
   * @returns {Promise<string>} - Returns the S3 URL of generated thumbnail
   */
  static async generateVideoThumbnail(videoFile, folderId) {
    return new Promise((resolve, reject) => {
      try {
        // Create thumbnail filename
        const thumbnailFilename = `thumb_${videoFile.filename.split('.')[0]}.jpg`;
        const thumbnailPath = path.join(__dirname, '../uploads', thumbnailFilename);
        
        // Generate thumbnail at 3 seconds into the video
        ffmpeg(videoFile.path)
          .screenshots({
            timestamps: ['3'],
            filename: thumbnailFilename,
            folder: path.join(__dirname, '../uploads'),
            size: '320x?'
          })
          .on('end', async () => {
            try {
              console.log('Thumbnail generated successfully');
              
              // Check if thumbnail file exists
              if (!fs.existsSync(thumbnailPath)) {
                throw new Error('Thumbnail file was not created');
              }

              // Create file object for S3 upload
              const thumbnailFileObj = {
                path: thumbnailPath,
                filename: thumbnailFilename,
                mimetype: 'image/jpeg'
              };

              // Upload thumbnail to S3
              const { Location } = await uploadFile(thumbnailFileObj, folderId);
              
              // Clean up local thumbnail file
              fs.unlinkSync(thumbnailPath);
              
              resolve(Location);
            } catch (uploadError) {
              console.error('Error uploading thumbnail:', uploadError);
              // Clean up thumbnail file if it exists
              if (fs.existsSync(thumbnailPath)) {
                fs.unlinkSync(thumbnailPath);
              }
              reject(uploadError);
            }
          })
          .on('error', (err) => {
            console.error('Error generating thumbnail:', err);
            // Clean up thumbnail file if it exists
            if (fs.existsSync(thumbnailPath)) {
              fs.unlinkSync(thumbnailPath);
            }
            reject(err);
          });
      } catch (error) {
        console.error('Error in generateVideoThumbnail:', error);
        reject(error);
      }
    });
  }

  /**
   * Check if file is a video based on mimetype
   * @param {string} mimetype - The file mimetype
   * @returns {boolean} - Returns true if file is a video
   */
  static isVideoFile(mimetype) {
    return mimetype && mimetype.startsWith('video/');
  }

  /**
   * Get thumbnail filename from video filename
   * @param {string} videoFilename - The original video filename
   * @returns {string} - Returns thumbnail filename
   */
  static getThumbnailFilename(videoFilename) {
    const nameWithoutExt = videoFilename.split('.')[0];
    return `thumb_${nameWithoutExt}.jpg`;
  }
}

module.exports = ThumbnailService;