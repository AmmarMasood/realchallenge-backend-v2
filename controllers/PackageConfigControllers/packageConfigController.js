const asyncHandler = require("express-async-handler");
const {
  PackageConfig,
} = require("../../models/PackageConfigModel/packageConfigModel");

// Default package configurations (used for seeding)
const DEFAULT_PACKAGES = [
  {
    packageId: "CHALLENGE_1",
    displayName: "One-Time Challenge",
    description: "Pay once for a single challenge",
    price: 0, // Uses individual challenge price
    currency: "EUR",
    billingInterval: 1,
    challengesAllowed: 1,
    savingsPercent: "",
    priceDisplayText: "",
    isActive: true,
    sortOrder: 1,
  },
  {
    packageId: "CHALLENGE_3",
    displayName: "3 Months Plan",
    description: "3 month subscription with access to 2 paid challenges",
    price: 26.0,
    currency: "EUR",
    billingInterval: 3,
    challengesAllowed: 2,
    savingsPercent: "20%",
    priceDisplayText: "€6 /Week",
    isActive: true,
    sortOrder: 3,
  },
  {
    packageId: "CHALLENGE_12",
    displayName: "12 Months Plan",
    description: "12 month subscription with access to 3 paid challenges",
    price: 19.99,
    currency: "EUR",
    billingInterval: 12,
    challengesAllowed: 3,
    savingsPercent: "40%",
    priceDisplayText: "€4.5 /Week",
    isActive: true,
    sortOrder: 2,
  },
];

// @desc    Get all package configurations (public)
// @route   GET /api/package-config
// @access  Public
const getAllPackages = asyncHandler(async (req, res) => {
  let packages = await PackageConfig.find({ isActive: true })
    .sort({ sortOrder: 1 })
    .lean();

  // If no packages exist, seed with defaults
  if (packages.length === 0) {
    await PackageConfig.insertMany(DEFAULT_PACKAGES);
    packages = await PackageConfig.find({ isActive: true })
      .sort({ sortOrder: 1 })
      .lean();
  }

  res.status(200).json({
    success: true,
    packages,
  });
});

// @desc    Get single package by packageId
// @route   GET /api/package-config/:packageId
// @access  Public
const getPackageById = asyncHandler(async (req, res) => {
  const { packageId } = req.params;

  const package_ = await PackageConfig.findOne({ packageId }).lean();

  if (!package_) {
    res.status(404);
    throw new Error(`Package ${packageId} not found`);
  }

  res.status(200).json({
    success: true,
    package: package_,
  });
});

// @desc    Get all packages for admin (including inactive)
// @route   GET /api/package-config/admin/all
// @access  Private (Admin)
const getAllPackagesAdmin = asyncHandler(async (req, res) => {
  let packages = await PackageConfig.find({})
    .sort({ sortOrder: 1 })
    .populate("updatedBy", "username")
    .lean();

  // If no packages exist, seed with defaults
  if (packages.length === 0) {
    await PackageConfig.insertMany(DEFAULT_PACKAGES);
    packages = await PackageConfig.find({})
      .sort({ sortOrder: 1 })
      .populate("updatedBy", "username")
      .lean();
  }

  res.status(200).json({
    success: true,
    packages,
  });
});

// @desc    Update a package configuration
// @route   PUT /api/package-config/admin/:packageId
// @access  Private (Admin)
const updatePackage = asyncHandler(async (req, res) => {
  const { packageId } = req.params;
  const {
    displayName,
    description,
    price,
    currency,
    billingInterval,
    challengesAllowed,
    savingsPercent,
    priceDisplayText,
    isActive,
    sortOrder,
  } = req.body;

  // Find existing package
  const existingPackage = await PackageConfig.findOne({ packageId });

  if (!existingPackage) {
    res.status(404);
    throw new Error(`Package ${packageId} not found`);
  }

  // Update only provided fields
  const updateData = {
    updatedBy: req.user._id,
  };

  if (displayName !== undefined) updateData.displayName = displayName;
  if (description !== undefined) updateData.description = description;
  if (price !== undefined) updateData.price = price;
  if (currency !== undefined) updateData.currency = currency;
  if (billingInterval !== undefined)
    updateData.billingInterval = billingInterval;
  if (challengesAllowed !== undefined)
    updateData.challengesAllowed = challengesAllowed;
  if (savingsPercent !== undefined) updateData.savingsPercent = savingsPercent;
  if (priceDisplayText !== undefined)
    updateData.priceDisplayText = priceDisplayText;
  if (isActive !== undefined) updateData.isActive = isActive;
  if (sortOrder !== undefined) updateData.sortOrder = sortOrder;

  const updatedPackage = await PackageConfig.findOneAndUpdate(
    { packageId },
    updateData,
    { new: true }
  ).populate("updatedBy", "username");

  res.status(200).json({
    success: true,
    message: "Package updated successfully",
    package: updatedPackage,
  });
});

// @desc    Reset packages to default values
// @route   POST /api/package-config/admin/reset
// @access  Private (Admin)
const resetToDefaults = asyncHandler(async (req, res) => {
  // Delete all existing packages
  await PackageConfig.deleteMany({});

  // Insert defaults
  const packages = await PackageConfig.insertMany(
    DEFAULT_PACKAGES.map((pkg) => ({
      ...pkg,
      updatedBy: req.user._id,
    }))
  );

  res.status(200).json({
    success: true,
    message: "Packages reset to defaults",
    packages,
  });
});

module.exports = {
  getAllPackages,
  getPackageById,
  getAllPackagesAdmin,
  updatePackage,
  resetToDefaults,
};
