const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const databaseSql = fs.readFileSync(
  path.join(__dirname, "..", "database.sql"),
  "utf8",
);

test("production permission schema contains granular maintenance modules", () => {
  const permissionsTable = databaseSql.match(
    /CREATE TABLE IF NOT EXISTS permissions[\s\S]*?\n\);/i,
  )?.[0];
  assert.ok(permissionsTable, "permissions table definition should exist");
  assert.match(permissionsTable, /maintenance_modules\s+TEXT\s+NULL/i);
});

test("built-in maintenance roles receive explicit module selections", () => {
  assert.match(
    databaseSql,
    /'Administrator'[\s\S]*?'\["students","alumni","employees"/,
  );
  assert.match(
    databaseSql,
    /'Superadmin'[\s\S]*?'\["students","alumni","employees"/,
  );
});
