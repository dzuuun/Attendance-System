const crypto = require("crypto");
const pool = require("../../db/db");

let ready;
async function ensureSchema() {
  if (!ready)
    ready = pool.query(`CREATE TABLE IF NOT EXISTS api_rate_limits (
      bucket_key CHAR(64) NOT NULL,window_start BIGINT UNSIGNED NOT NULL,
      request_count INT UNSIGNED NOT NULL DEFAULT 1,expires_at DATETIME NOT NULL,
      PRIMARY KEY (bucket_key,window_start),INDEX idx_rate_limit_expiry (expires_at)
    )`);
  await ready;
}

module.exports = function rateLimit({ windowMs, limit, message }) {
  return async (req, res, next) => {
    try {
      await ensureSchema();
      const now = Date.now();
      const windowStart = Math.floor(now / windowMs);
      const identity = String(req.ip || req.socket?.remoteAddress || "unknown");
      const key = crypto
        .createHash("sha256")
        .update(`${req.baseUrl}${req.path}:${identity}`)
        .digest("hex");
      const expiresAt = new Date((windowStart + 1) * windowMs);
      await pool.query(
        "INSERT INTO api_rate_limits (bucket_key,window_start,request_count,expires_at) VALUES (?,?,1,?) ON DUPLICATE KEY UPDATE request_count=request_count+1,expires_at=VALUES(expires_at)",
        [key, windowStart, expiresAt],
      );
      const [[bucket]] = await pool.query(
        "SELECT request_count requestCount FROM api_rate_limits WHERE bucket_key=? AND window_start=?",
        [key, windowStart],
      );
      const count = Number(bucket?.requestCount || 1);
      res.setHeader("RateLimit-Limit", String(limit));
      res.setHeader("RateLimit-Remaining", String(Math.max(0, limit - count)));
      if (count > limit) {
        res.setHeader(
          "Retry-After",
          String(Math.max(1, Math.ceil((expiresAt.getTime() - now) / 1000))),
        );
        return res
          .status(429)
          .json({ message: message || "Too many requests. Try again later." });
      }
      if (Math.random() < 0.01)
        pool
          .query("DELETE FROM api_rate_limits WHERE expires_at<NOW()")
          .catch(() => {});
      next();
    } catch (error) {
      next(error);
    }
  };
};
