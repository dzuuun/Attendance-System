const test = require("node:test");
const assert = require("node:assert/strict");
const {
  requireKioskSession,
  kioskIdentityMatches,
} = require("../api/middleware/kiosk_auth");
const {
  getJwtSecret,
  requireAdmin,
  requireSuperadmin,
  requireAccess,
} = require("../auth/auth_validation");

function responseStub() {
  return {
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}

test("kiosk enrollment is bound to its device identity", () => {
  const kioskId = "12345678-1234-1234-1234-123456789012";
  assert.equal(kioskIdentityMatches(kioskId, kioskId), true);
  assert.equal(
    kioskIdentityMatches(kioskId, "different-kiosk-id-123456"),
    false,
  );
  assert.equal(kioskIdentityMatches("bad", "bad"), false);
});

test("an unverified kiosk request is rejected", async () => {
  const previous = process.env.JWT_SECRET;
  process.env.JWT_SECRET = "test-secret-that-is-at-least-32-characters";
  const response = {
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
    },
  };
  let accepted = false;
  await requireKioskSession(
    {
      get: () => "",
      body: { kioskId: "12345678-1234-1234-1234-123456789012" },
      query: {},
    },
    response,
    () => {
      accepted = true;
    },
  );
  assert.equal(accepted, false);
  assert.equal(response.statusCode, 401);
  assert.match(response.body.message, /verified by a Superadmin/);
  if (previous === undefined) delete process.env.JWT_SECRET;
  else process.env.JWT_SECRET = previous;
});

test("short or missing JWT secrets are rejected", () => {
  const previous = process.env.JWT_SECRET;
  process.env.JWT_SECRET = "short";
  assert.throws(() => getJwtSecret(), /at least 32/);
  if (previous === undefined) delete process.env.JWT_SECRET;
  else process.env.JWT_SECRET = previous;
});

test("destructive administration accepts only administrator roles", () => {
  for (const role of ["Superadmin", "Administrator"]) {
    let accepted = false;
    requireAdmin({ user: { role } }, responseStub(), () => (accepted = true));
    assert.equal(accepted, true);
  }
  const response = responseStub();
  requireAdmin({ user: { role: "Event Staff" } }, response, () => {});
  assert.equal(response.statusCode, 403);
});

test("superadmin-only actions reject administrators", () => {
  const response = responseStub();
  requireSuperadmin({ user: { role: "Administrator" } }, response, () => {});
  assert.equal(response.statusCode, 403);
});

test("module access cannot be inferred from another permission", () => {
  const response = responseStub();
  let accepted = false;
  requireAccess("maintenanceAccess")(
    { user: { role: "Event Staff", specialEventsAccess: true } },
    response,
    () => (accepted = true),
  );
  assert.equal(accepted, false);
  assert.equal(response.statusCode, 403);
});
