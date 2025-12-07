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
