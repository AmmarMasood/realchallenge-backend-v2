const asyncHandler = require("express-async-handler");

// Store active connections for each upload session
const progressConnections = new Map();

// @desc    Establish SSE connection for upload progress
// @route   GET /api/media/progress/:uploadId
// @access  private
const establishProgressConnection = asyncHandler(async (req, res, next) => {
  const uploadId = req.params.uploadId;

  // Handle token authentication from query parameter (since EventSource can't send headers)
  const token = req.query.token;
  let userId;

  if (token) {
    try {
      const jwt = require('jsonwebtoken');
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      userId = decoded.id;
      console.log(`SSE Authentication successful for user: ${userId}`);
    } catch (error) {
      console.error('SSE Token verification failed:', error);
      return res.status(401).json({ message: 'Invalid token for SSE connection' });
    }
  } else if (req.user) {
    // Fallback to middleware auth if available
    userId = req.user._id;
  } else {
    return res.status(401).json({ message: 'Authentication required for SSE connection' });
  }

  console.log(`Establishing progress connection for uploadId: ${uploadId}, userId: ${userId}`);

  // Set SSE headers
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Cache-Control'
  });

  // Store this connection
  const connectionKey = `${userId}-${uploadId}`;
  progressConnections.set(connectionKey, res);

  console.log(`Stored connection: ${connectionKey}`);

  // Send initial connection confirmation
  res.write(`data: ${JSON.stringify({
    type: 'connected',
    uploadId: uploadId,
    timestamp: new Date().toISOString()
  })}\n\n`);

  // Handle client disconnect
  req.on('close', () => {
    console.log(`Client disconnected: ${connectionKey}`);
    progressConnections.delete(connectionKey);
  });

  req.on('aborted', () => {
    console.log(`Client aborted: ${connectionKey}`);
    progressConnections.delete(connectionKey);
  });
});

// Function to send progress update to specific upload session
const sendProgressUpdate = (userId, uploadId, progressData) => {
  const connectionKey = `${userId}-${uploadId}`;
  const connection = progressConnections.get(connectionKey);

  if (connection) {
    try {
      const data = {
        type: 'progress',
        uploadId: uploadId,
        ...progressData,
        timestamp: new Date().toISOString()
      };

      console.log(`Sending progress update to ${connectionKey}:`, data);
      connection.write(`data: ${JSON.stringify(data)}\n\n`);
      return true;
    } catch (error) {
      console.error(`Error sending progress update to ${connectionKey}:`, error);
      progressConnections.delete(connectionKey);
      return false;
    }
  } else {
    console.log(`No connection found for ${connectionKey}`);
    return false;
  }
};

// Function to send completion signal
const sendUploadComplete = (userId, uploadId, result) => {
  const connectionKey = `${userId}-${uploadId}`;
  const connection = progressConnections.get(connectionKey);

  if (connection) {
    try {
      const data = {
        type: 'complete',
        uploadId: uploadId,
        result: result,
        timestamp: new Date().toISOString()
      };

      console.log(`Sending completion to ${connectionKey}:`, data);
      connection.write(`data: ${JSON.stringify(data)}\n\n`);

      // Close connection after completion
      setTimeout(() => {
        connection.end();
        progressConnections.delete(connectionKey);
      }, 1000);

      return true;
    } catch (error) {
      console.error(`Error sending completion to ${connectionKey}:`, error);
      progressConnections.delete(connectionKey);
      return false;
    }
  }
  return false;
};

// Function to send error signal
const sendUploadError = (userId, uploadId, error) => {
  const connectionKey = `${userId}-${uploadId}`;
  const connection = progressConnections.get(connectionKey);

  if (connection) {
    try {
      const data = {
        type: 'error',
        uploadId: uploadId,
        error: error.message || error,
        timestamp: new Date().toISOString()
      };

      console.log(`Sending error to ${connectionKey}:`, data);
      connection.write(`data: ${JSON.stringify(data)}\n\n`);

      // Close connection after error
      setTimeout(() => {
        connection.end();
        progressConnections.delete(connectionKey);
      }, 1000);

      return true;
    } catch (err) {
      console.error(`Error sending error to ${connectionKey}:`, err);
      progressConnections.delete(connectionKey);
      return false;
    }
  }
  return false;
};

// Cleanup function to remove stale connections
const cleanupConnections = () => {
  const now = Date.now();
  for (const [key, connection] of progressConnections.entries()) {
    // Remove connections older than 10 minutes
    if (connection.startTime && now - connection.startTime > 10 * 60 * 1000) {
      try {
        connection.end();
      } catch (error) {
        console.error(`Error closing stale connection ${key}:`, error);
      }
      progressConnections.delete(key);
    }
  }
};

// Run cleanup every 5 minutes
setInterval(cleanupConnections, 5 * 60 * 1000);

module.exports = {
  establishProgressConnection,
  sendProgressUpdate,
  sendUploadComplete,
  sendUploadError,
  cleanupConnections
};