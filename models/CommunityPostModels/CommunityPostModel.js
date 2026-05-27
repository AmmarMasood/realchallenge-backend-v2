const mongoose = require("mongoose");

const communityPostModel = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
  },
  title: {
    type: String,
    required: true,
  },
  text: {
    type: String,
    required: true,
  },
  image: {
    type: String,
  },
  // Deep-link target for the card click (e.g. /challenge/<slug>/<id>).
  // Mongoose strict mode was silently dropping this for years — schema
  // didn't include it, but the controller and create payload both write
  // it. Adding it now so new posts (and any backfilled ones) actually
  // navigate when clicked.
  url: {
    type: String,
  },
  type: {
    type: String,
  },
  username: {
    type: String,
  },
  avatar: {
    type: String,
  },
  likes: [
    {
      user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    },
  ],
  comments: [
    {
      user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
      text: {
        type: String,
        required: true,
      },
      avatar: {
        type: String,
      },

      date: {
        type: Date,
        default: Date.now,
      },
    },
  ],
  date: {
    type: Date,
    default: Date.now,
  },
});

exports.CommunityPostModel = mongoose.model(
  "CommunityPostModel",
  communityPostModel
);
