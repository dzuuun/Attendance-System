const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const { EventEmitter } = require("node:events");
const uidTools = require("../api/attendance/card-uid");

function load(file, dependencies, suffix = "") {
  const context = { exports: {}, require(name) {
    if (!(name in dependencies)) throw Error(`Unexpected dependency: ${name}`);
    return dependencies[name];
  }, URL };
  vm.runInNewContext(fs.readFileSync(require.resolve(file), "utf8") + suffix, context);
  return context.exports;
}

function fixture(people = []) {
  const queries = [], writes = [];
  let releases = 0;
  const model = load("../api/attendance/attendance.model", {
    "../../db/db": { async query(sql, values) {
      queries.push({ sql, values });
      if (sql.includes("card_id IN (?)")) {
        assert.equal((sql.match(/card_id IN \(\?\) AND is_active=TRUE/g) || []).length, 3);
        assert.ok(!sql.includes("id_number"), "UID candidates must match enrolled cards only");
        return [people.filter((person) => person.active !== false && values[0].includes(person.cardId))
          .map((person) => ({ cardId: person.cardId, type: person.type,
            personId: person.type === "Alumnus" ? person.alumniId : person.id })).slice(0, 2)];
      }
      const type = sql.includes("FROM students s") ? "Student" : sql.includes("FROM employees e") ? "Employee" : "Alumnus";
      return [people.filter((person) => person.type === type && person.active !== false
        && (person.idNumber === values[0] || person.cardId === values[1]))];
    } },
    "../../db/schema": {},
    "../maintenance/academic_period/academic_period.model": {},
    "./card-uid": uidTools,
  }, "\nschemaReady = Promise.resolve();");
  model.acquireScanLock = async () => Object.assign(async () => { releases++; }, { connection: {} });
  model.findLatest = async () => null;
  model.record = async (person, action) => { writes.push({ person, action }); return { insertId: 77 }; };
  model.findInactiveStudent = async () => null;
  const controller = load("../api/attendance/attendance.controller", {
    "./attendance.model": model,
    "../events/event.model": {},
    "../maintenance/academic_period/academic_period.model": {},
    "../../config/public-path": { publicPath: (value) => value },
  });
  const res = new EventEmitter();
  res.status = (status) => { res.statusCode = status; return res; };
  res.json = (body) => { res.body = body; res.emit("finish"); return res; };
  return { model, controller, queries, writes, res, get releases() { return releases; } };
}

test("UID conversion includes unsigned HID decimals, leading zeroes, and both byte orders", () => {
  const candidates = uidTools.cardNumberCandidates("43868b32");
  assert.ok(candidates.includes("0848004675"));
  assert.ok(candidates.includes("848004675"));
  assert.ok(candidates.includes("1132890930"));
  assert.ok(uidTools.cardNumberCandidates("FFFFFFFF").includes("4294967295"));
  assert.equal(new Set(candidates).size, candidates.length);
  assert.ok(candidates.every((value) => /^\d{1,128}$/.test(value)));
});

test("seven-byte UIDs check full UID and first/last four bytes without overflow", () => {
  const candidates = uidTools.cardNumberCandidates("01020304050607");
  for (const decimal of ["0067305985", "0016909060", "0117835012", "0067438087"])
    assert.ok(candidates.includes(decimal));
  assert.ok(uidTools.cardNumberCandidates("FFFFFFFFFFFFFFFFFFFF").includes("1208925819614629174706175"));
});

test("invalid raw UIDs are rejected before querying the database", async () => {
  for (const value of [null, undefined, {}, [], "", "1", "XYZ1", "00 11", "00".repeat(33)])
    assert.throws(() => uidTools.cardNumberCandidates(value), { status: 400 });
  const f = fixture();
  await assert.rejects(f.model.findPersonByCardUid("invalid"), { status: 400 });
  assert.equal(f.queries.length, 0);
});

for (const person of [
  { id: 1, type: "Student", idNumber: "2023620", cardId: "0848004675", uid: "43868B32" },
  { id: 1, type: "Employee", idNumber: "P2023001", cardId: "0067438087", uid: "01020304050607" },
  { id: 1, alumniId: 9, type: "Alumnus", idNumber: "A2023001", cardId: "4294967295", uid: "FFFFFFFF" },
]) {
  test(`a ${person.type} tap finds the enrolled HID number and records the official ID without manual input`, async () => {
    const f = fixture([{ ...person, name: "Test Person" }]);
    await f.controller.scan({ body: { cardUid: person.uid, action: "Auto" } }, f.res);
    assert.equal(f.res.statusCode, 201);
    assert.equal(f.res.body.cardNumber, person.cardId);
    assert.equal(f.res.body.idNumber, person.idNumber);
    assert.equal(f.res.body.type, person.type);
    assert.equal(f.writes[0].person.idNumber, person.idNumber);
    assert.equal(f.writes[0].action, "Time In");
    assert.equal(f.releases, 1);
  });
}

test("unregistered UIDs cannot match an official ID or an inactive person's card", async () => {
  const f = fixture([
    { id: 1, type: "Student", idNumber: "0067305985", cardId: "unrelated" },
    { id: 2, type: "Employee", idNumber: "P123", cardId: "0067305985", active: false },
  ]);
  await f.controller.scan({ body: { cardUid: "01020304", idNumber: "0067305985", action: "Auto" } }, f.res);
  assert.equal(f.res.statusCode, 404);
  assert.match(f.res.body.message, /not enrolled/);
  assert.equal(f.queries.length, 1, "An unknown UID must never fall back to a typed identifier");
  assert.equal(f.writes.length, 0);
});

for (const otherCard of ["67305985", "0016909060"]) {
  test(`multiple enrolled matches (${otherCard}) are rejected instead of choosing a person`, async () => {
    const f = fixture([
      { id: 1, type: "Student", idNumber: "S1", cardId: "0067305985" },
      { id: 2, type: "Employee", idNumber: "E2", cardId: otherCard },
    ]);
    await assert.rejects(f.model.findPersonByCardUid("01020304"), { code: "AMBIGUOUS_CARD_UID", status: 409 });
    assert.equal(f.writes.length, 0);
  });
}

test("an alumni card cannot resolve to the linked student's shared official ID", async () => {
  const f = fixture([
    { id: 1, type: "Student", idNumber: "0067305985", cardId: "other" },
    { id: 1, alumniId: 9, type: "Alumnus", idNumber: "0067305985", cardId: "0067305985" },
  ]);
  await assert.rejects(f.model.findPersonByCardUid("01020304"), { code: "AMBIGUOUS_CARD_UID", status: 409 });
});

test("malformed UID requests return 400 without falling back to a valid manual ID", async () => {
  for (const cardUid of [null, {}, "", "123"]) {
    const f = fixture();
    await f.controller.scan({ body: { cardUid, idNumber: "2023001", action: "Auto" } }, f.res);
    assert.equal(f.res.statusCode, 400);
    assert.equal(f.queries.length, 0);
    assert.equal(f.writes.length, 0);
  }
});

test("manual IDs still use the existing exact ID/card lookup", async () => {
  const f = fixture([{ id: 1, type: "Student", idNumber: "2023001", cardId: "0067305985" }]);
  await f.controller.scan({ body: { idNumber: "2023001", action: "Auto" } }, f.res);
  assert.equal(f.res.statusCode, 201);
  assert.equal(f.res.body.idNumber, "2023001");
  assert.equal(f.res.body.cardNumber, undefined);
  assert.ok(f.queries.every(({ sql }) => !sql.includes("card_id IN (?)")));
});
