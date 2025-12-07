// server/roles.js
const AccessControl = require("accesscontrol");
const ac = new AccessControl();
"admin",
  "Trainer",
  "Nutrist",
  "Blogger",
  "ShopManager",
  "Customer",
  (exports.roles = (function () {
    ac.grant("customer")
      .readOwn("profile")
      .updateOwn("profile")
      .readAny("post")
      .updateOwn("post");

    ac.grant("trainer")
      .extend("customer")
      .readAny("challenge")
      .updateAny("challenge")
      .deleteAny("challenge");

    ac.grant("nutrist").extend("customer");

    ac.grant("blogger").extend("customer");

    ac.grant("shopmanager").extend("customer");

    ac.grant("admin")
      .extend("customer")
      .extend("trainer")
      .extend("blogger")
      .extend("shopmanager")
      .readAny("profile")
      .updateAny("profile")
      .deleteAny("profile");

    return ac;
  })());

/**
 * Check if user has permission for a resource action
 * Uses OR logic - user has permission if ANY of their roles has permission
 * @param {Array} userRoles - Array of user's roles
 * @param {String} action - Action to check (e.g., "readAny", "updateOwn")
 * @param {String} resource - Resource to check (e.g., "profile", "challenge")
 * @returns {Boolean} - True if user has permission
 */
exports.hasPermission = function (userRoles, action, resource) {
  if (!userRoles || !Array.isArray(userRoles) || userRoles.length === 0) {
    return false;
  }

  // Check if ANY of the user's roles has the required permission (OR logic)
  for (const role of userRoles) {
    const permission = ac.can(role)[action](resource);
    if (permission.granted) {
      return true;
    }
  }

  return false;
};

/**
 * Get permission object for user's roles
 * Returns the most permissive permission across all roles
 * @param {Array} userRoles - Array of user's roles
 * @param {String} action - Action to check
 * @param {String} resource - Resource to check
 * @returns {Object} - Permission object with granted property and attributes
 */
exports.getPermission = function (userRoles, action, resource) {
  if (!userRoles || !Array.isArray(userRoles) || userRoles.length === 0) {
    return { granted: false, attributes: [] };
  }

  let maxPermission = { granted: false, attributes: [] };

  // Find the most permissive permission across all roles
  for (const role of userRoles) {
    const permission = ac.can(role)[action](resource);
    if (permission.granted) {
      maxPermission = permission;
      // If we found a granted permission, we can return it
      // (in OR logic, first granted permission is sufficient)
      break;
    }
  }

  return maxPermission;
};
