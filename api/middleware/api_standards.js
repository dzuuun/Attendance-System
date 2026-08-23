function asyncHandler(handler) {
  return (req, res, next) =>
    Promise.resolve(handler(req, res, next)).catch(next);
}
function apiNotFound(_req, res) {
  res.status(404).json({ success: 0, message: "API route not found." });
}
function apiErrorHandler(error, _req, res, _next) {
  console.error(error);
  const databaseError = [
    "ECONNREFUSED",
    "ER_BAD_DB_ERROR",
    "ER_NO_SUCH_TABLE",
  ].includes(error.code);
  res
    .status(databaseError ? 503 : 500)
    .json({
      success: 0,
      message: databaseError
        ? "Database unavailable or schema is outdated."
        : "Unexpected server error.",
    });
}
module.exports = { asyncHandler, apiNotFound, apiErrorHandler };
