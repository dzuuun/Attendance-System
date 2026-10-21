const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const jwt = require("jsonwebtoken");
const secret = "test-kiosk-secret-that-is-at-least-32-characters";
const entranceId = "entrance-device-12345678";
const libraryId = "library-device-12345678";
const token = (id) => jwt.sign({ sub: id, type: "kiosk", jti: `session-${id}` }, secret, {
  expiresIn: "1h", issuer: "taptrack", audience: "taptrack-kiosk",
});
function middleware() {
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../api/middleware/kiosk_auth.js"), "utf8"), {
    module,
    require(name) {
      if (name === "jsonwebtoken") return jwt;
      if (name === "../../auth/auth_validation") return { getJwtSecret: () => secret };
      if (name === "../../config/public-path") return { cookiePath: "/" };
      if (name === "../../db/db") return { query: async (sql) => sql.startsWith("SELECT s.jti") ? [[{ jti: "test", isEnabled: 1 }]] : [[]] };
      if (name === "crypto") return require("node:crypto");
      return {};
    },
  });
  return module.exports.requireKioskSession;
}
const response = () => ({
  statusCode: 200, cookies: [],
  status(code) { this.statusCode = code; return this; },
  json(body) { this.body = body; return this; },
  cookie(name) { this.cookies.push(name); },
});

test("library GET requests select their device cookie when the generic cookie belongs to entrance", async () => {
  const req = {
    body: {}, query: { kioskId: libraryId },
    get: (key) => key === "cookie" ? `taptrack_kiosk_session=${token(entranceId)}; taptrack_kiosk_session_${libraryId}=${token(libraryId)}` : "",
  };
  const res = response();
  let accepted = false;
  await middleware()(req, res, () => { accepted = true; });
  assert.equal(accepted, true);
  assert.equal(req.kioskId, libraryId);
  assert.ok(res.cookies.includes(`taptrack_kiosk_session_${libraryId}`));
});

test("a different kiosk's generic cookie requests verification instead of blocking recovery", async () => {
  const req = {
    body: { kioskId: libraryId }, query: {},
    get: (key) => key === "cookie" ? `taptrack_kiosk_session=${token(entranceId)}` : "",
  };
  const res = response();
  await middleware()(req, res, () => assert.fail("The other device's token must never authorize this kiosk"));
  assert.equal(res.statusCode, 401);
  assert.equal(res.body.code, "KIOSK_IDENTITY_MISMATCH");
});

test("native tokens remain bound to their enrolled device identity", async () => {
  const req = {
    body: { kioskId: libraryId }, query: {},
    get: (key) => key === "authorization" ? `Kiosk ${token(entranceId)}` : "",
  };
  const res = response();
  await middleware()(req, res, () => assert.fail("Mismatched native credentials must be rejected"));
  assert.equal(res.statusCode, 401);
});
