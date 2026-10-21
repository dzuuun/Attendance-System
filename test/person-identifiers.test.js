const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function load(file, dependencies, suffix = "") {
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "..", file), "utf8") + suffix, {
    module, exports: module.exports, process: { env: {} },
    require(name) {
      if (!(name in dependencies)) throw Error(`Unexpected dependency: ${name}`);
      return dependencies[name];
    },
  });
  return module.exports;
}

function fixture(initial = []) {
  const records = initial.map((row) => ({ isActive: true, cardId: null, ...row }));
  const events = [];
  const waiters = [];
  let locked = false;
  const tables = { students: "student", employees: "employee", alumni: "alumni" };
  const pool = {
    async getConnection() {
      let backup;
      return {
        async beginTransaction() { backup = structuredClone(records); events.push("begin"); },
        async commit() { backup = null; events.push("commit"); },
        async rollback() { if (backup) records.splice(0, records.length, ...backup); events.push("rollback"); },
        release() { events.push("connection-released"); },
        async query(sql, params = []) {
          events.push(sql);
          if (sql.includes("GET_LOCK")) {
            assert.equal(params[0] || "taptrack:card-enrollment", "taptrack:card-enrollment");
            if (locked) await new Promise((resolve) => waiters.push(resolve));
            else locked = true;
            return [[{ acquired: 1 }]];
          }
          if (sql.includes("RELEASE_LOCK")) {
            const next = waiters.shift();
            if (next) next(); else locked = false;
            return [[{ released: 1 }]];
          }
          if (sql.startsWith("SELECT id,id_number idNumber,card_id cardId,id studentId"))
            return [records.filter((row) => row.idNumber === params[0] || row.cardId === params[0])
              .map((row) => ({ ...row, studentId: row.type === "student" ? row.id : row.studentId }))];
          if (sql.startsWith("SELECT id FROM students WHERE (card_id")) {
            const excluded = { student: params[2], employee: params[5], alumni: params[8] };
            return [records.filter((row) => row.id !== excluded[row.type] && (row.idNumber === params[0] || row.cardId === params[0]))];
          }
          const person = sql.match(/FROM (students|employees|alumni) WHERE id=\? FOR UPDATE/);
          if (person) return [records.filter((row) => row.type === tables[person[1]] && row.id === Number(params[0]))];
          if (sql.startsWith("SELECT id FROM students WHERE id_number"))
            return [records.filter((row) => row.type === "student" && row.idNumber === params[0])];
          if (sql.startsWith("SELECT student_id studentId FROM alumni"))
            return [records.filter((row) => row.type === "alumni" && row.id === Number(params[0]))];
          if (sql.startsWith("SELECT * FROM students"))
            return [records.filter((row) => row.type === "student" && (sql.includes("id_number IN") ? params.includes(row.idNumber) : row.id === Number(params[0])))
              .map((row) => ({ ...row, id_number: row.idNumber }))];
          if (sql.startsWith("SELECT id,student_id studentId FROM alumni"))
            return [records.filter((row) => row.type === "alumni" && (sql.includes(" IN ") ? params.includes(row.studentId) : row.studentId === Number(params[0]) || row.idNumber === params[1]))];
          if (sql.includes("FROM employee_departments")) return [[{ id: 1, name: "Test", isActive: true }]];
          const insert = sql.match(/^INSERT INTO (students|employees|alumni) /);
          if (insert) {
            const columns = sql.slice(sql.indexOf("(") + 1, sql.indexOf(")")).split(",");
            const id = Math.max(100, ...records.map((row) => row.id)) + 1;
            records.push({ type: tables[insert[1]], id, idNumber: params[columns.indexOf("id_number")], cardId: null,
              studentId: columns.includes("student_id") ? params[columns.indexOf("student_id")] : null, isActive: !/FALSE\)\s*$/.test(sql) });
            return [{ insertId: id, affectedRows: 1 }];
          }
          const update = sql.match(/^UPDATE (students|employees|alumni) SET (id_number|card_id)=/);
          if (update) {
            const row = records.find((row) => row.type === tables[update[1]] && row.id === Number(params.at(-1)));
            if (row) row[update[2] === "card_id" ? "cardId" : "idNumber"] = params[0];
            return [{ affectedRows: row ? 1 : 0 }];
          }
          if (sql.startsWith("INSERT IGNORE INTO alumni_degrees")) return [{ affectedRows: 1 }];
          if (sql.startsWith("UPDATE students s INNER JOIN alumni")) {
            const alumnus = records.find((row) => row.type === "alumni" && row.id === Number(params.at(-1)));
            const student = records.find((row) => row.type === "student" && row.id === alumnus?.studentId && !row.isActive);
            if (student) student.idNumber = params[0];
            return [{ affectedRows: student ? 1 : 0 }];
          }
          if (sql.startsWith("UPDATE students SET is_active=FALSE WHERE id=?")) {
            const row = records.find((row) => row.type === "student" && row.id === Number(params[0]));
            if (row) row.isActive = false;
            return [{ affectedRows: row ? 1 : 0 }];
          }
          throw Error(`Unexpected query: ${sql}`);
        },
      };
    },
  };
  const schemaModel = { ensureSchema: async () => {} };
  const identifiers = load("api/maintenance/person-identifiers.js", {
    "../../db/db": pool,
    "./student/student.model": schemaModel, "./employee/employee.model": schemaModel, "./alumni/alumni.model": schemaModel,
  });
  const models = {};
  for (const type of ["student", "employee", "alumni"])
    models[type] = load(`api/maintenance/${type}/${type}.model.js`, {
      "../../../db/db": pool, "../../../db/schema": {}, "../person-identifiers": identifiers,
    }, type === "alumni" ? "\nready = Promise.resolve();" : "\nschemaReady = Promise.resolve();");
  return { records, events, pool, identifiers, models, schemaModel };
}

test("all person saves reject IDs matching another person's card, including inactive cards", async () => {
  for (const type of ["student", "employee", "alumni"]) {
    const f = fixture([{ type: "employee", id: 9, idNumber: "P009", cardId: "CARD009", isActive: false },
      { type, id: 7, idNumber: "ORIGINAL", studentId: type === "alumni" ? 70 : null }]);
    const data = { idNumber: "CARD009", departmentId: 1 };
    await assert.rejects(f.models[type].create(data), { code: "IDENTIFIER_CONFLICT", status: 409 });
    await assert.rejects(f.models[type].update(7, data), { code: "IDENTIFIER_CONFLICT", status: 409 });
    assert.equal(f.records.length, 2);
    assert.equal(f.records[1].idNumber, "ORIGINAL");
    assert.equal(f.events.filter((event) => event === "rollback").length, 2);
    assert.equal(f.events.filter((event) => event === "connection-released").length, 2);
  }
});

test("linked student and alumni IDs remain valid but unrelated IDs and cards are rejected", async () => {
  const f = fixture([{ type: "student", id: 7, idNumber: "SHARED", cardId: "STUDENT-CARD" },
    { type: "alumni", id: 17, studentId: 7, idNumber: "SHARED", cardId: "ALUMNI-CARD" }]);
  await f.identifiers.withTransaction(async (connection) => {
    await f.identifiers.assertAvailable(connection, { type: "student", id: 7, idNumber: "SHARED" });
    await f.identifiers.assertAvailable(connection, { type: "alumni", id: 17, studentId: 7, idNumber: "SHARED" });
    for (const value of ["SHARED", "STUDENT-CARD", "ALUMNI-CARD"])
      await assert.rejects(f.identifiers.assertAvailable(connection, { type: "employee", idNumber: value }), { status: 409 });
    await assert.rejects(f.identifiers.assertAvailable(connection, { type: "alumni", studentId: 8, idNumber: "SHARED" }), { status: 409 });
  });
});

test("valid person creation and editing preserve enrolled cards and linked alumni IDs", async () => {
  for (const type of ["student", "employee", "alumni"]) {
    const f = fixture();
    const result = await f.models[type].create({ idNumber: "ORIGINAL", departmentId: 1 });
    const person = f.records.find((row) => row.type === type && row.id === result.insertId);
    assert.ok(person);
    person.cardId = "ENROLLED-CARD";
    await f.models[type].update(person.id, { idNumber: "UPDATED", departmentId: 1, cardId: "UNWANTED-CARD" });
    assert.equal(person.idNumber, "UPDATED");
    assert.equal(person.cardId, "ENROLLED-CARD");
    if (type === "alumni") {
      const linked = f.records.find((row) => row.type === "student" && row.id === person.studentId);
      assert.equal(linked.idNumber, "UPDATED");
      assert.equal(linked.isActive, false);
      assert.equal(linked.cardId, null);
    }
  }
});

test("valid graduation retains the student's card and leaves the separate alumni card unenrolled", async () => {
  const f = fixture([{ type: "student", id: 7, idNumber: "ID007", cardId: "STUDENT-CARD" }]);
  const result = await f.models.alumni.transferStudent(7, 2026);
  assert.equal(result.status, "created");
  const alumnus = f.records.find((row) => row.type === "alumni");
  assert.equal(alumnus.studentId, 7);
  assert.equal(alumnus.idNumber, "ID007");
  assert.equal(alumnus.cardId, null);
  assert.equal(f.records[0].cardId, "STUDENT-CARD");
  assert.equal(f.records[0].isActive, false);
});

test("ID changes and card enrollment share a lock so only one concurrent assignment succeeds", async () => {
  for (const cardFirst of [false, true]) {
    const f = fixture([{ type: "employee", id: 9, idNumber: "P009" }]);
    const cards = load("api/maintenance/student/card-enrollment.model.js", {
      "../../../db/db": f.pool, "../../../db/schema": { addColumn: async () => {} },
      "./student.model": f.schemaModel, "../employee/employee.model": f.schemaModel, "../alumni/alumni.model": f.schemaModel,
    });
    const createId = () => f.models.student.create({ idNumber: "COMPETING" });
    const enroll = () => cards.save("employee", 9, "COMPETING");
    const results = await Promise.allSettled(cardFirst ? [enroll(), createId()] : [createId(), enroll()]);
    const occupants = f.records.filter((row) => row.idNumber === "COMPETING" || row.cardId === "COMPETING");
    assert.equal(occupants.length, 1);
    assert.ok(results.some((result) => result.status === "rejected" && result.reason.status === 409)
      || results.some((result) => result.status === "fulfilled" && result.value.status === "conflict"));
    assert.equal(f.events.filter((event) => event === "commit").length, 1);
  }
});

test("graduation and bulk graduation cannot copy an ID that conflicts with someone else's card", async () => {
  for (const bulk of [false, true]) {
    const f = fixture([{ type: "student", id: 7, idNumber: "CONFLICT" },
      { type: "employee", id: 9, idNumber: "P009", cardId: "CONFLICT" }]);
    await assert.rejects(bulk ? f.models.alumni.transferStudentsByIdNumbers(["CONFLICT"], 2026)
      : f.models.alumni.transferStudent(7, 2026), { status: 409 });
    assert.equal(f.records.filter((row) => row.type === "alumni").length, 0);
    assert.equal(f.records[0].isActive, true);
  }
});

test("SQL Server imports roll back IDs conflicting with enrolled cards", async () => {
  const f = fixture([{ type: "employee", id: 9, idNumber: "P009", cardId: "CONFLICT" }]);
  const controller = load("api/maintenance/student/mssql-import.controller.js", {
    mssql: {}, "../../../db/db": f.pool, "./student.model": {}, "../person-identifiers": f.identifiers,
    "../profile-photo": {}, "../academic_period/academic_period.model": {},
  }, `
    currentPeriod = async () => ({id:1,schoolYear:'2026-2027',semester:1,term:'First Semester'});
    review = async () => ({items:[{idNumber:'CONFLICT'}],sourceIds:['CONFLICT']});
    deactivationCount = async () => 0;
  `);
  await assert.rejects(controller.import({ body: { id: 1, schoolYear: "2026-2027", semester: 1, term: "First Semester" } }, {}), { status: 409 });
  assert.equal(f.records.length, 1);
  assert.ok(f.events.includes("rollback"));
  assert.ok(f.events.includes("SELECT RELEASE_LOCK(?)"));
});

test("attendance refuses ambiguous identifiers even for a restricted audience and preserves linked IDs", async () => {
  const source = fs.readFileSync(path.join(__dirname, "../api/attendance/attendance.model.js"), "utf8");
  const exports = {};
  let students = [{ id: 7, type: "Student", idNumber: "ID007" }];
  let alumni = [];
  let employees = [{ id: 9, type: "Employee", idNumber: "P009" }];
  vm.runInNewContext(source.slice(source.indexOf("exports.findPerson ="), source.indexOf("exports.findInactiveStudent =")), {
    exports, ensureSchema: async () => {}, pool: { query: async (sql) => [sql.includes("FROM students s") ? students : sql.includes("FROM alumni a") ? alumni : employees] },
  });
  for (const audience of ["Both", "Students", "Employees"])
    await assert.rejects(exports.findPerson("CARD", audience), { code: "AMBIGUOUS_IDENTIFIER", status: 409 });
  employees = [];
  alumni = [{ id: 7, alumniId: 17, type: "Alumnus", idNumber: "ID007" }];
  assert.equal((await exports.findPerson("ID007")).type, "Student");
  assert.equal(await exports.findPerson("ID007", "Employees"), undefined);
  students = [];
  assert.equal((await exports.findPerson("ALUMNI-CARD")).type, "Alumnus");
});
