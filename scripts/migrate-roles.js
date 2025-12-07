/**
 * Database Migration Script: Single Role to Multiple Roles
 *
 * This script:
 * 1. Adds 'roles' array field to all users
 * 2. Populates 'roles' from existing 'role' field
 * 3. Keeps 'role' field for rollback safety
 *
 * Run with: node scripts/migrate-roles.js
 */

const mongoose = require("mongoose");
const { User } = require("../models/UserModels/userModel");
require("dotenv").config();

const migrateRoles = async () => {
  try {
    // Connect to database
    console.log("Connecting to database...");
    await mongoose.connect(process.env.MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log("✓ Connected to database successfully!\n");

    // Find all users
    console.log("Fetching all users...");
    const users = await User.find({});
    console.log(`Found ${users.length} users to migrate\n`);

    let migratedCount = 0;
    let skippedCount = 0;
    let errorCount = 0;

    // Migrate each user
    for (const user of users) {
      try {
        // Check if user already has roles array populated
        if (user.roles && user.roles.length > 0) {
          console.log(`⊘ Skipping user "${user.username}" - already has roles: [${user.roles.join(", ")}]`);
          skippedCount++;
          continue;
        }

        // Populate roles array from single role field
        const roleValue = user.role || "customer";
        user.roles = [roleValue];

        // Save user
        await user.save();
        console.log(`✓ Migrated user "${user.username}": "${user.role || "customer"}" → [${user.roles.join(", ")}]`);
        migratedCount++;
      } catch (error) {
        console.error(`✗ Error migrating user "${user.username}": ${error.message}`);
        errorCount++;
      }
    }

    // Summary
    console.log("\n===== MIGRATION SUMMARY =====");
    console.log(`Total users processed: ${users.length}`);
    console.log(`Successfully migrated: ${migratedCount}`);
    console.log(`Skipped (already migrated): ${skippedCount}`);
    console.log(`Errors: ${errorCount}`);
    console.log("=============================\n");

    // Verify migration
    console.log("Verifying migration...");
    const usersWithoutRoles = await User.countDocuments({
      $or: [
        { roles: { $exists: false } },
        { roles: { $size: 0 } }
      ]
    });

    if (usersWithoutRoles > 0) {
      console.warn(`⚠ WARNING: ${usersWithoutRoles} users still don't have roles!`);
    } else {
      console.log("✓ All users successfully migrated!");
    }

    // Sample data
    console.log("\nSample migrated users:");
    const sampleUsers = await User.find({}).limit(3);
    sampleUsers.forEach(user => {
      console.log(`  - ${user.username}: roles = [${user.roles.join(", ")}]`);
    });

    // Close connection
    await mongoose.connection.close();
    console.log("\n✓ Database connection closed");
    process.exit(0);
  } catch (error) {
    console.error("✗ Migration failed:", error.message);
    console.error(error);
    process.exit(1);
  }
};

// Run migration
console.log("========== ROLE MIGRATION STARTING ==========\n");
migrateRoles();
