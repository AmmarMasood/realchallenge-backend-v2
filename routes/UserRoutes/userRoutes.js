const express = require("express");
const {
  getAllTrainers,
} = require("../../controllers/UserControllers/trainersController");
const router = express.Router();
const {
  setTimeZone,
  getTimeZone,
  authUser,
  registerUser,
  getUserProfile,
  getAllUsers,
  updateUserProfile,
  updateUserRoles,
  adminResetPassword,
  adminActivateUser,
  deleteUser,
  getUserById,
  allowIfLoggedin,
  grantAccess,
  resetUserPassword,
  newUserPassword,
  registerUserWithSocial,
  socialLogin,
  createUser,
  verifyEmail,
  resendLink,
  checkEmailVerification,
  destroy,
} = require("../../controllers/UserControllers/userController");
const { protect, admin } = require("../../middlewares/authMiddleware");

// users/register/:social
router.put("/timezone", protect, setTimeZone);
router.get("/timezone", protect, getTimeZone);
router.post("/register", registerUser);
router.post("/register/:type", registerUserWithSocial);
router.post("/login", authUser);
router.post("/login/:type", socialLogin);
router.post("/reset-password", resetUserPassword);
router.post("/new-password", newUserPassword);
router.post("/createUser", protect, admin, createUser);

router
  .route("/")
  .get(protect, grantAccess("readAny", "profile"), getAllUsers)
  .put(grantAccess("updateAny", "profile"), updateUserProfile);

//verify Email
router.get("/verify/:token", verifyEmail);
router.post("/verify/check/", protect, checkEmailVerification);
router.post("/verify/resend/", resendLink);

router.get(
  "/profile",
  protect,
  // allowIfLoggedin,
  grantAccess("readOwn", "profile"),
  getUserProfile
);
router
  .route("/:userId")
  .get(protect, grantAccess("readAny", "profile"), getUserById)
  .put(protect, grantAccess("updateOwn", "profile"), updateUserProfile)
  .delete(protect, grantAccess("deleteAny", "profile"), deleteUser);

// Update user roles (admin only)
router.put("/:userId/roles", protect, admin, updateUserRoles);

// Admin reset user password (sends reset email to user)
router.put("/:userId/admin-reset-password", protect, admin, adminResetPassword);

// Admin activate user account
router.put("/:userId/admin-activate", protect, admin, adminActivateUser);

router.route("/destroyUsers").get(destroy);

module.exports = router;
