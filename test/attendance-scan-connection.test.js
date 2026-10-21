const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const { EventEmitter } = require("node:events");

function load(file, dependencies, suffix = "") {
  const context = { exports: {}, require(name) { if (!(name in dependencies)) throw Error(`Unexpected dependency: ${name}`); return dependencies[name]; }, URL };
  vm.runInNewContext(fs.readFileSync(require.resolve(file), "utf8") + suffix, context);
  return context.exports;
}

test("locked attendance queries use the reserved connection without borrowing another pool slot", async () => {
  const queries = [];
  const connection = { query: async (sql) => {
    queries.push(sql);
    if (sql.includes("GET_LOCK")) return [[{ acquired: 1 }]];
    if (sql.includes("SUM(")) return [[{ timeIns: 1, timeOuts: 0 }]];
    if (sql.includes("INSERT")) return [{ insertId: 123 }];
    return [[]];
  }, release() { queries.push("released"); } };
  const pool = { getConnection: async () => connection, query() { throw Error("Borrowed a second pool slot while holding the scan lock"); } };
  const periods = { getCurrent: async (executor) => { assert.equal(executor, connection); return { id: 1 }; } };
  const model = load("../api/attendance/attendance.model", { "../../db/db": pool, "../../db/schema": {}, "../maintenance/academic_period/academic_period.model": periods }, "\nschemaReady = Promise.resolve();");
  const person = { type: "Student", id: 1, idNumber: "2011100", name: "Test" };
  const release = await model.acquireScanLock(person, null);
  await model.findLatest(person, null, release.connection);
  await model.getActionCounts(person, 2, release.connection);
  assert.equal((await model.record(person, "Time In", null, "Main Entrance", release.connection)).insertId, 123);
  await release();
  await release();
  assert.equal(queries.filter((sql) => sql === "released").length, 1);
});

test("current-period lookup uses the same scan connection", async () => {
  const connection = { query: async () => [[{ id: 7 }]] };
  const model = load("../api/maintenance/academic_period/academic_period.model", { "../../../db/db": { query() { throw Error("Borrowed another connection"); } }, "../../../db/schema": {} }, "\nready = Promise.resolve();");
  assert.equal((await model.getCurrent(connection)).id, 7);
});

test("a client disconnect does not release the scan connection until its write completes", async () => {
  let finish;
  let writing;
  let released = 0;
  const connection = {};
  const release = Object.assign(async () => { released++; }, { connection });
  const model = {
    findPerson: async () => ({ type: "Student", id: 1, idNumber: "2011100", name: "Test" }),
    acquireScanLock: async () => release,
    findLatest: async (person, eventId, executor) => { assert.equal(executor, connection); return null; },
    record: async (person, action, eventId, location, executor) => { assert.equal(executor, connection); writing = true; return new Promise((resolve) => { finish = resolve; }); },
  };
  const controller = load("../api/attendance/attendance.controller", { "./attendance.model": model, "../events/event.model": {}, "../maintenance/academic_period/academic_period.model": {}, "../../config/public-path": {} });
  const res = new EventEmitter();
  res.status = () => res;
  res.json = () => res;
  const request = controller.scan({ body: { idNumber: "2011100", action: "Auto" } }, res);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(writing, true);
  res.emit("close");
  assert.equal(released, 0);
  finish({ insertId: 1 });
  await request;
  assert.equal(released, 1);
});
