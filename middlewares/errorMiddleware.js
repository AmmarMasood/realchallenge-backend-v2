const notFound = (req, res, next) => {
  const error = new Error(` 404 Not Found`);
  res.status(404);
  next(error);
};

const errorHandler = (err, req, res, next) => {
  const statusCode = res.statusCode === 200 ? 500 : res.statusCode;
  res.status(statusCode);
  return res.json({
    header: {
      error: err ? 1 : 0,
      message: err.message,
    },
  });
};
// process.env.NODE_ENV === "production" ? null : err.stack

module.exports = { notFound, errorHandler };
