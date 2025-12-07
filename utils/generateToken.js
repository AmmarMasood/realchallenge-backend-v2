const jwt = require("jsonwebtoken");

const generateToken = (id, roles, email, username, isActive) => {
  // Accept either single role (backward compatibility) or array of roles
  const rolesArray = Array.isArray(roles) ? roles : [roles];

  return jwt.sign(
    { id, roles: rolesArray, email, username, isActive },
    process.env.JWT_SECRET,
    {
      expiresIn: "1d",
    }
  );
};

module.exports = generateToken;
