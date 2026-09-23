const test = require("node:test");
const assert = require("node:assert/strict");
const { basePath, cookiePath, publicPath } = require("../config/public-path");

test("public application URLs stay under the configured IIS path", () => {
  assert.match(basePath, /^\/[A-Za-z0-9/_-]+$/);
  assert.equal(cookiePath, basePath);
  assert.equal(publicPath("/login"), `${basePath}/login`);
  assert.equal(publicPath("/api/auth/me"), `${basePath}/api/auth/me`);
  assert.equal(publicPath(`${basePath}/overview`), `${basePath}/overview`);
});
