const jwt = require("jsonwebtoken");

const generateToken = (id, role, email, username, isActive) => {
  return jwt.sign(
    { id, role, email, username, isActive },
    process.env.JWT_SECRET,
    {
      expiresIn: "1d",
    }
  );
};

module.exports = generateToken;
