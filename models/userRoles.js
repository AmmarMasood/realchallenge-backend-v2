const mongoose = require("mongoose");

const userRolesSchema = mongoose.Schema(
  {
    // 0 -admin, 1- Trainer, 2- Nutrist, 3- Blogger, 4- Shop Manager, 5- Customer
    id: {
      type: Number,
      required: true,
    },
    role: {
      type: String,
      required: true,
    },
  },
  { timestamps: true }
);

exports.UserRole = mongoose.model("UserRole", userRolesSchema);
