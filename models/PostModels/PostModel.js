const mongoose = require("mongoose");
const { languages } = require("../../utils/language");

const postSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
  },
  language: {
    type: String,
    enum: languages,
  },
  url: { type: String },
  title: {
    type: String,
    required: true,
  },
  text: {
    type: String,
  },
  image: {
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

exports.Post = mongoose.model("Post", postSchema);
