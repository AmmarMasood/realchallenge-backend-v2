const express = require("express");
const router = express.Router();
const { protect, admin } = require("../../middlewares/authMiddleware");

const {
  getAllPackages,
  getPackageById,
  getAllPackagesAdmin,
  updatePackage,
  resetToDefaults,
} = require("../../controllers/PackageConfigControllers/packageConfigController");

// Admin routes (must come before parameterized routes)
router.get("/admin/all", protect, admin, getAllPackagesAdmin);
router.put("/admin/:packageId", protect, admin, updatePackage);
router.post("/admin/reset", protect, admin, resetToDefaults);

// Public routes
router.get("/", getAllPackages);
router.get("/:packageId", getPackageById);

module.exports = router;
