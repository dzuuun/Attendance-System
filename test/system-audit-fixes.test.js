const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const express = require("express");
const jwt = require("jsonwebtoken");
const authorization = require("../auth/auth_validation");

function load(file, dependencies, suffix = "", globals = {}) {
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "..", file), "utf8") + suffix, {
    module, exports: module.exports, process: { env: {} }, ...globals,
    require(name) {
      if (!(name in dependencies)) throw Error(`Unexpected dependency: ${name}`);
      return dependencies[name];
    },
  });
  return module.exports;
}
const response = () => ({ statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } });

test("person logs require the requested directory permission for every log source", async () => {
  let reads = 0;
  const controller = load("api/person_logs/person_logs.controller.js", {
    "./person_logs.model": {
      getPerson: async (type) => { reads++; return { id: 7, type }; },
      getAcademicPeriod: async () => ({ id: 1 }), getLogs: async () => [],
    },
    "../../auth/auth_validation": authorization,
  });
  const types = { student: "students", employee: "employees", alumnus: "alumni" };
  for (const module of Object.values(types)) {
    for (const [type, required] of Object.entries(types)) {
      for (const source of ["university", "events", "library", "internet"]) {
        const before = reads, res = response();
        await controller.get({ user: { role: "Operator", maintenanceAccess: true, maintenanceModules: [module] },
          params: { type, id: "7" }, query: { academicPeriodId: "1", source, dateFrom: "2026-01-01", dateTo: "2026-12-31" } }, res);
        assert.equal(res.statusCode, module === required ? 200 : 403, `${module}: ${type}/${source}`);
        assert.equal(reads - before, module === required ? 1 : 0, "Denied requests must not read personal data");
      }
    }
  }
  for (const type of Object.keys(types)) {
    const res = response();
    await controller.get({ user: { role: "Superadmin" }, params: { type, id: "7" }, query: { academicPeriodId: "1", source: "library" } }, res);
    assert.equal(res.statusCode, 200);
  }
});

function periodFixture() {
  const rows = [{ id: 1, isCurrent: true }, { id: 2, isCurrent: false }];
  const events = [];
  let locked = false;
  const waiters = [];
  const pool = { getConnection: async () => {
    let snapshot, ownsLock = false;
    const unlock = () => { if (!ownsLock) return; ownsLock = false; const next = waiters.shift(); if (next) next(); else locked = false; };
    return {
      beginTransaction: async () => {},
      commit: async () => { events.push("commit"); unlock(); },
      rollback: async () => { if (snapshot) rows.splice(0, rows.length, ...snapshot); events.push("rollback"); unlock(); },
      release: () => { events.push("released"); unlock(); },
      query: async (sql, params) => {
        events.push(sql);
        if (sql.includes("FOR UPDATE")) {
          if (locked) await new Promise((resolve) => waiters.push(resolve)); else locked = true;
          ownsLock = true; snapshot = structuredClone(rows);
          return [structuredClone(rows)];
        }
        if (sql === "UPDATE academic_periods SET is_current=FALSE") { rows.forEach((row) => { row.isCurrent = false; }); return [{ affectedRows: rows.length }]; }
        if (sql.startsWith("UPDATE academic_periods SET school_year")) {
          if (params[0] === "FAIL") throw Object.assign(Error("fixture write failed"), { code: "ER_DUP_ENTRY" });
          const row = rows.find((row) => row.id === Number(params[3]));
          if (row) row.isCurrent = params[2];
          return [{ affectedRows: row ? 1 : 0 }];
        }
        if (sql.startsWith("INSERT INTO academic_periods")) { rows.push({ id: 3, isCurrent: params[2] }); return [{ insertId: 3, affectedRows: 1 }]; }
        throw Error(sql);
      },
    };
  } };
  const model = load("api/maintenance/academic_period/academic_period.model.js", {
    "../../../db/db": pool, "../../../db/schema": {},
  }, "\nready = Promise.resolve();");
  return { model, rows, events };
}

test("a missing or failed period update preserves the current period", async () => {
  const f = periodFixture();
  const data = { schoolYear: "2026-2027", term: "First Semester", isCurrent: true };
  const result = await f.model.save(999999, data);
  assert.equal(result.affectedRows, 0);
  assert.equal(f.rows[0].isCurrent, true);
  assert.ok(!f.events.includes("UPDATE academic_periods SET is_current=FALSE"));
  await assert.rejects(f.model.save(2, { ...data, schoolYear: "FAIL" }), { code: "ER_DUP_ENTRY" });
  assert.equal(f.rows[0].isCurrent, true);
  assert.equal(f.rows[1].isCurrent, false);
  await assert.rejects(f.model.save(1, { ...data, isCurrent: false }), { code: "CURRENT_REQUIRED" });
  assert.equal(f.rows.filter((row) => row.isCurrent).length, 1);
});

test("concurrent current-period selections leave exactly one current period", async () => {
  const f = periodFixture();
  const data = { schoolYear: "2026-2027", term: "First Semester", isCurrent: true };
  await Promise.all([f.model.save(2, data), f.model.save(null, data)]);
  assert.equal(f.rows.filter((row) => row.isCurrent).length, 1);
  assert.equal(f.events.filter((event) => event === "commit").length, 2);
});

test("user managers receive only assignable permission options while permission administration stays protected", async () => {
  const controller = load("api/user/user_management/user_management.controller.js", {
    bcryptjs: {}, "./user_management.model": {}, "../../../auth/auth_validation": {},
    "../permission/permission.model": { getAll: async () => ["Superadmin", "Administrator", "Staff", "Card Enrollment"].map((name, id) => ({ id, name, isActive: true, usersAccess: true })) },
  });
  const router = load("api/user/user_management/user_management.router.js", { express, "./user_management.controller": new Proxy(controller, { get: (target, key) => target[key] || ((_req, res) => res.json([])) }) });
  let user = { role: "Administrator", usersAccess: true };
  const app = express();
  app.use((req, _res, next) => { req.user = user; next(); });
  app.use("/api/user", authorization.requireAccess("usersAccess"), router);
  app.use("/api/permissions", authorization.requireSuperadmin, (_req, res) => res.json({ allowed: true }));
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const options = await (await fetch(`${base}/api/user/permission-options`)).json();
    assert.deepEqual(options.map((option) => option.name), ["Staff", "Card Enrollment"]);
    assert.ok(options.every((option) => !Object.hasOwn(option, "usersAccess")), "Options should expose only selection fields");
    for (const method of ["GET", "POST", "PUT"])
      assert.equal((await fetch(`${base}/api/permissions`, { method })).status, 403);
    user = { role: "Staff", usersAccess: false };
    assert.equal((await fetch(`${base}/api/user/permission-options`)).status, 403);
    user = { role: "Superadmin" };
    assert.equal((await (await fetch(`${base}/api/user/permission-options`)).json()).length, 4);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("administrative password resets invalidate the old session without revoking other users", async () => {
  const secret = "fixture-secret-with-at-least-thirty-two-characters";
  const sessions = new Map([[7, false], [8, false]]);
  const pool = { query: async (sql, params = []) => {
    if (sql.startsWith("CREATE TABLE")) return [{ affectedRows: 0 }];
    if (sql.startsWith("UPDATE auth_sessions SET revoked_at")) { sessions.set(Number(params[0]), true); return [{ affectedRows: 1 }]; }
    if (sql.startsWith("UPDATE auth_sessions SET last_seen_at")) return [{ affectedRows: 1 }];
    if (sql.includes("FROM auth_sessions a")) {
      const id = Number(params[1]);
      return [sessions.get(id) === false ? [{ id, username: `fixture${id}`, role: "Staff", isActive: true, permissionActive: true }] : []];
    }
    throw Error(sql);
  } };
  const auth = load("auth/auth_validation.js", {
    jsonwebtoken: jwt, crypto: require("node:crypto"), "../db/db": pool,
    "../api/user/permission/permission.model": { ensureSchema: async () => {}, normalizeMaintenanceModules: () => [] },
    "../config/public-path": { cookiePath: "/", publicPath: (value) => value },
  }, "", { process: { env: { JWT_SECRET: secret } } });
  const tokens = new Map([7, 8].map((id) => [id, jwt.sign({ sub: String(id), type: "session", jti: `fixture-${id}` }, secret, { expiresIn: "1h", issuer: "taptrack", audience: "taptrack-web" })]));
  const authenticate = async (id) => {
    const res = response();
    let allowed = false;
    await auth.checkSession({ get: (name) => name === "authorization" ? `Bearer ${tokens.get(id)}` : "" }, res, (error) => { if (error) throw error; allowed = true; });
    return { allowed, status: res.statusCode };
  };
  const writes = [];
  const controller = load("api/user/user_management/user_management.controller.js", {
    bcryptjs: { hash: async () => "new-fixture-hash" }, "../../../auth/auth_validation": auth,
    "./user_management.model": { getById: async () => ({ id: 7, role: "Staff" }), update: async (_id, data) => { writes.push(data); return { affectedRows: 1 }; } },
    "../permission/permission.model": { findById: async () => ({ id: 3, name: "Staff", isActive: true }) },
  });
  assert.equal((await authenticate(7)).allowed, true);
  const body = { firstName: "Fixture", lastName: "User", username: "fixture7", permissionId: 3, isActive: true };
  const req = { params: { id: "7" }, user: { id: 1, role: "Administrator" }, body: { ...body, password: "new-fixture-password" } };
  const invalid = response();
  await controller.update({ ...req, params: { id: "7invalid" } }, invalid);
  assert.equal(invalid.statusCode, 400);
  assert.equal(writes.length, 0);
  assert.equal((await authenticate(7)).allowed, true);
  const res = response();
  await controller.update(req, res);
  assert.equal(res.statusCode, 200);
  assert.equal(writes[0].passwordHash, "new-fixture-hash");
  assert.deepEqual(await authenticate(7), { allowed: false, status: 401 });
  assert.equal((await authenticate(8)).allowed, true);
  await controller.update({ ...req, params: { id: "8" }, body }, response());
  assert.equal((await authenticate(8)).allowed, true, "Profile-only changes should preserve sessions");
});
