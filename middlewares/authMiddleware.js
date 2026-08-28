const jwt = require("jsonwebtoken");
const { User } = require("../models/UserModels/userModel");
const asyncHandler = require("express-async-handler");

// ============================================
// HELPER FUNCTIONS FOR MULTI-ROLE SUPPORT
// ============================================

/**
 * Check if user has a specific role
 * @param {Object} user - User object from req.user
 * @param {String} role - Role to check
 * @returns {Boolean} - True if user has the role
 */
const hasRole = (user, role) => {
  if (!user || !user.roles || !Array.isArray(user.roles)) {
    return false;
  }
  return user.roles.includes(role);
};

/**
 * Check if user has ANY of the specified roles (OR logic)
 * @param {Object} user - User object from req.user
 * @param {String|Array} requiredRoles - Single role or array of roles
 * @returns {Boolean} - True if user has at least one of the required roles
 */
const hasAnyRole = (user, requiredRoles) => {
  if (!user || !user.roles || !Array.isArray(user.roles)) {
    return false;
  }

  // Normalize requiredRoles to array
  const rolesArray = Array.isArray(requiredRoles) ? requiredRoles : [requiredRoles];

  // Check if user has ANY of the required roles (OR logic)
  return user.roles.some(userRole => rolesArray.includes(userRole));
};

/**
 * Validate role combinations
 * Rules:
 * - Admin can ONLY be alone (["admin"])
 * - Customer can ONLY be alone (["customer"])
 * - Other roles can be combined (["trainer", "blogger"])
 * @param {Array} roles - Array of roles to validate
 * @returns {Object} - { isValid: boolean, message: string }
 */
const validateRoleCombination = (roles) => {
  if (!roles || !Array.isArray(roles) || roles.length === 0) {
    return { isValid: false, message: "User must have at least one role" };
  }

  // If "admin" is present, it must be the only role
  if (roles.includes("admin") && roles.length > 1) {
    return { isValid: false, message: "Admin role cannot be combined with other roles" };
  }

  // If "customer" is present, it must be the only role
  if (roles.includes("customer") && roles.length > 1) {
    return { isValid: false, message: "Customer role cannot be combined with other roles" };
  }

  return { isValid: true, message: "Role combination is valid" };
};

const protect = asyncHandler(async (req, res, next) => {
  let token;

  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith("Bearer")
  ) {
    try {
      token = req.headers.authorization.split(" ")[1];

      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      req.user = await User.findById(decoded.id).select("-passwordHash");

      next();
    } catch (error) {
      console.error(error);
      res.status(401);
      throw new Error("Not authorized, token failed");
    }
  }

  if (!token) {
    res.status(401);
    throw new Error("Not authorized, no token");
  }
});

/**
 * Populates req.user when a valid token is present, and simply continues when
 * it is not. For endpoints that must stay reachable by logged-out visitors but
 * still need to know who is asking — e.g. showing an unpublished challenge to
 * the admin previewing it while hiding it from everyone else.
 */
const optionalAuth = asyncHandler(async (req, res, next) => {
  const header = req.headers.authorization;
  if (header && header.startsWith("Bearer")) {
    try {
      const decoded = jwt.verify(header.split(" ")[1], process.env.JWT_SECRET);
      req.user = await User.findById(decoded.id).select("-passwordHash");
    } catch (error) {
      // An invalid or expired token is treated as "not logged in" rather than
      // an error, so public pages keep working with a stale token in storage.
      req.user = undefined;
    }
  }
  next();
});

/**
 * Staff = any signed-in user who is not purely a customer. Mirrors the rule in
 * `allowAllExceptCustomer`: ["customer"] alone is a customer, ["customer",
 * "trainer"] is staff. Logged-out visitors are never staff.
 */
const isStaff = (user) => {
  if (!user || !Array.isArray(user.roles)) return false;
  return user.roles.some((role) => role !== "customer");
};

/**
 * True when a challenge/recipe may be shown to the given user. Customers and
 * logged-out visitors only ever see published, admin-approved items; staff see
 * everything, drafts and unapproved included.
 */
const canViewUnpublished = (doc, user, { owns = false } = {}) => {
  if (!doc) return false;

  // Force-deactivated is gone for everyone. Staff still see it so they can
  // manage the fallout; customers lose it even if they bought it.
  if (doc.forceDeactivated) return isStaff(user);

  if (doc.isPublic && doc.adminApproved) return true;

  // Un-publishing only closes the door to new people: anyone who already owns
  // the challenge keeps what they paid for.
  if (owns) return true;

  return isStaff(user);
};

/**
 * Mongo filter restricting a query to what the given user may see. Spread into
 * a `find()` — empty for staff, so they get everything.
 */
const visibilityFilter = (user) =>
  isStaff(user)
    ? {}
    : { isPublic: true, adminApproved: true, forceDeactivated: { $ne: true } };

//Allow access for blogCreation
const allowBlogRoutesAccess = asyncHandler(async (req, res, next) => {
  let token;

  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith("Bearer")
  ) {
    try {
      token = req.headers.authorization.split(" ")[1];

      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      req.user = await User.findById(decoded.id).select("-passwordHash");

      // Check if user has ANY of the allowed roles (admin or blogger)
      if (req.user && hasAnyRole(req.user, ["admin", "blogger"])) {
        next();
      } else {
        return res
          .status(401)
          .json({ message: "Not authorized - requires admin or blogger role" });
      }
    } catch (error) {
      console.error(error);
      res.status(401);
      throw new Error("Not authorized, token failed");
    }
  }

  if (!token) {
    res.status(401);
    throw new Error("Not authorized, no token");
  }
});

//Allow all except customer
const allowAllExceptCustomer = asyncHandler(async (req, res, next) => {
  let token;

  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith("Bearer")
  ) {
    try {
      token = req.headers.authorization.split(" ")[1];

      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      req.user = await User.findById(decoded.id).select("-passwordHash");

      // NEW: Check if user has only customer role
      // If user has ["customer", "trainer"], they should be allowed
      // If user has only ["customer"], they should be denied
      const hasOnlyCustomerRole = req.user.roles && req.user.roles.length === 1 && req.user.roles[0] === "customer";

      if (hasOnlyCustomerRole) {
        return res
          .status(401)
          .json({ message: "Not authorized - customers not allowed" });
      }

      if (req.user && hasAnyRole(req.user, ["admin", "trainer", "nutrist", "blogger", "shopmanager"])) {
        next();
      } else {
        return res
          .status(401)
          .json({ message: "Not authorized - requires non-customer role" });
      }
    } catch (error) {
      console.error(error);
      res.status(401);
      throw new Error("Not authorized, token failed");
    }
  }

  if (!token) {
    res.status(401);
    throw new Error("Not authorized, no token");
  }
});

const admin = (req, res, next) => {
  if (req.user && hasRole(req.user, "admin")) {
    next();
  } else {
    res.status(401);
    throw new Error("Not authorized as an Admin");
  }
};

const trainer = (req, res, next) => {
  if (req.user && hasRole(req.user, "trainer")) {
    next();
  } else {
    res.status(401);
    throw new Error("Not authorized as a Trainer");
  }
};

const customer = (req, res, next) => {
  if (req.user && hasRole(req.user, "customer")) {
    next();
  } else {
    res.status(401);
    throw new Error("Not authorized as a Customer");
  }
};

const nutrist = (req, res, next) => {
  if (req.user && hasRole(req.user, "nutrist")) {
    next();
  } else {
    res.status(401);
    throw new Error("Not authorized as a Nutrist");
  }
};

const blogger = (req, res, next) => {
  if (req.user && hasRole(req.user, "blogger")) {
    next();
  } else {
    res.status(401);
    throw new Error("Not authorized as a Blogger");
  }
};

const shopManager = (req, res, next) => {
  if (req.user && hasRole(req.user, "shopmanager")) {
    next();
  } else {
    res.status(401);
    throw new Error("Not authorized as a Shop-Manager");
  }
};

//   const trainer = (req, res, next) => {
//     if (req.user && req.user.roleId == 1) {
//       next();
//     } else {
//       res.status(401);
//       throw new Error("Not authorized as an Trainer");
//     }
//   };

module.exports = {
  protect,
  optionalAuth,
  canViewUnpublished,
  visibilityFilter,
  isStaff,
  admin,
  trainer,
  nutrist,
  blogger,
  shopManager,
  customer,
  allowAllExceptCustomer,
  allowBlogRoutesAccess,
  hasRole,
  hasAnyRole,
  validateRoleCombination,
};
