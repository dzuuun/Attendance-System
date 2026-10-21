const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

test("the enrollment directory lists minimal profile data and photos without a search and supports paging", async () => {
  const queries = [];
  const exports = {};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../api/maintenance/student/card-enrollment.model.js"), "utf8"), {
    exports,
    require: (name) => name === "../../../db/db"
      ? { query: async (sql, params) => { queries.push({ sql, params: Array.from(params) }); return [[]]; } }
      : name === "../../../db/schema" ? { addColumn: async () => {} }
        : { ensureSchema: async () => {} },
  });
  await exports.search();
  assert.deepEqual(queries[0].params, ["%%", "%%", "%%", "%%", "%%", "%%", 0]);
  assert.match(queries[0].sql, /LIMIT 51 OFFSET \?/);
  for (const alias of ["s", "e", "a"])
    assert.ok(queries[0].sql.includes(`${alias}.photo_url photoUrl`));
  assert.doesNotMatch(queries[0].sql, /birthday|institutional_email|contact/);
  await exports.search("", "employee", 2);
  assert.deepEqual(queries[1].params, ["%%", "%%", 50]);
  assert.match(queries[1].sql, /FROM employees/);
  assert.doesNotMatch(queries[1].sql, /FROM students|FROM alumni/);
});

test("the shared table counts filtered people and sorts before applying pagination", async () => {
  const queries = [];
  const exports = {};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../api/maintenance/student/card-enrollment.model.js"), "utf8"), {
    exports,
    require: (name) => name === "../../../db/db"
      ? { query: async (sql, params) => {
        queries.push({ sql, params: Array.from(params) });
        return sql.startsWith("SELECT COUNT") ? [[{ total: params[0] === "%%" ? 65 : 2 }]] : [[{ id: 2 }]];
      } }
      : name === "../../../db/schema" ? { addColumn: async () => {} } : { ensureSchema: async () => {} },
  });
  const result = await exports.directory({ search: "A%_!", type: "employee", start: 10, length: 10, orderBy: "idNumber", direction: "desc" });
  assert.equal(result.recordsTotal, 65);
  assert.equal(result.recordsFiltered, 2);
  assert.equal(result.data[0].id, 2);
  assert.match(queries[0].sql, /ORDER BY idNumber DESC,idNumber,type,id LIMIT \? OFFSET \?/);
  assert.deepEqual(queries[0].params, ["%A!%!_!!%", "%A!%!_!!%", 10, 10]);
  assert.ok(queries.every(({ sql }) => !sql.includes("FROM students") && !sql.includes("FROM alumni")));
  queries.length = 0;
  const unfiltered = await exports.directory({ search: "", type: "all", start: 0, length: 10, orderBy: "name;DROP", direction: "sideways" });
  assert.equal(unfiltered.recordsFiltered, 65);
  assert.equal(queries.length, 2, "Unfiltered counts should be reused");
  assert.match(queries[0].sql, /ORDER BY name ASC/);
});

test("card assignments reject reuse across groups and alumni enroll an independent physical card", async () => {
  const tables = {
    students: [{ id: 7, idNumber: "2023007", name: "Current Student", isActive: true, cardId: null }, { id: 11, idNumber: "2010011", name: "Former Student", isActive: false, cardId: "OLD" }],
    employees: [{ id: 7, idNumber: "P2023007", name: "Employee", isActive: true, cardId: null }],
    alumni: [{ id: 7, studentId: 11, idNumber: "2010011", name: "Alumni", isActive: true, cardId: null }],
  };
  let releases = 0, commits = 0, rollbacks = 0;
  const queries = [];
  const connection = {
    async query(sql, params = []) {
      queries.push(sql);
      if (sql.includes("GET_LOCK")) return [[{ acquired: 1 }]];
      if (sql.includes("RELEASE_LOCK")) return [[{ released: 1 }]];
      if (sql.includes("FOR UPDATE")) {
        const table = sql.match(/FROM (\w+) WHERE/)[1];
        return [[tables[table].find((person) => person.id === Number(params[0]))].filter(Boolean)];
      }
      if (sql.startsWith("SELECT id FROM students")) {
        const [cardId, , studentId, , , employeeId, , , alumniId] = params;
        const conflict = tables.students.some((p) => (p.cardId === cardId || p.idNumber === cardId) && p.id !== studentId)
          || tables.employees.some((p) => (p.cardId === cardId || p.idNumber === cardId) && p.id !== employeeId)
          || tables.alumni.some((p) => (p.cardId === cardId || p.idNumber === cardId) && p.id !== alumniId);
        return [conflict ? [{ id: 1 }] : []];
      }
      if (sql.startsWith("UPDATE alumni SET card_id=NULL")) {
        tables.alumni.find((p) => p.id === params[0]).cardId = null;
        return [{ affectedRows: 1 }];
      }
      if (sql.startsWith("UPDATE")) {
        const table = sql.match(/UPDATE (\w+)/)[1];
        tables[table].find((p) => p.id === params[1]).cardId = params[0];
        return [{ affectedRows: 1 }];
      }
      throw new Error(`Unexpected query: ${sql}`);
    },
    async beginTransaction() {},
    async commit() { commits++; },
    async rollback() { rollbacks++; },
    release() { releases++; },
  };
  const exports = {};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../api/maintenance/student/card-enrollment.model.js"), "utf8"), {
    exports,
    require: (name) => name === "../../../db/db" ? { getConnection: async () => connection }
      : name === "../../../db/schema" ? { addColumn: async () => {} }
        : { ensureSchema: async () => {} },
  });
  assert.equal((await exports.save("student", 7, "00012345")).status, "saved");
  assert.equal((await exports.save("employee", 7, "00012345")).status, "conflict");
  assert.equal((await exports.save("alumni", 7, "00012345")).status, "conflict");
  assert.equal((await exports.save("employee", 7, "2010011")).status, "conflict");
  assert.equal((await exports.save("employee", 7, "00098765")).status, "saved");
  assert.equal((await exports.save("alumni", 7, "OLD")).status, "conflict");
  assert.equal((await exports.save("alumni", 7, "00077777")).status, "saved");
  assert.equal(tables.students[1].cardId, "OLD");
  assert.equal(tables.alumni[0].cardId, "00077777");
  assert.equal((await exports.save("student", 11, "NEW")).status, "inactive");
  assert.equal((await exports.save("student", 999, "NEW")).status, "missing");
  assert.equal(commits, 3);
  assert.equal(rollbacks, 6);
  assert.equal(releases, 9);
  assert.equal(queries.filter((query) => query.includes("GET_LOCK")).length, 9);
  assert.equal(queries.filter((query) => query.includes("RELEASE_LOCK")).length, 9);
});

test("ordinary student saves cannot assign, replace, or clear an enrolled card", async () => {
  const writes = [];
  const studentModel = {};
  const fixturePool = { query: async (sql, params = []) => {
    if (/^(INSERT INTO students|UPDATE students SET id_number)/.test(sql)) {
      writes.push({ sql, params: Array.from(params) });
      return [{ affectedRows: 1, insertId: 7 }];
    }
    return [[]];
  } };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../api/maintenance/student/student.model.js"), "utf8"), {
    exports: studentModel,
    require: (name) => name === "../../../db/db" ? fixturePool
      : name === "../../../db/schema" ? { addColumns: async () => {} }
        : name === "../person-identifiers" ? { withTransaction: (work) => work(fixturePool), assertAvailable: async () => {} }
          : { ensureSchema: async () => {} },
  });
  const controller = {};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../api/maintenance/student/student.controller.js"), "utf8"), {
    exports: controller,
    require: (name) => name === "./student.model" ? studentModel : { saveFor: () => () => {} },
  });
  const body = {
    idNumber: "2023007", firstName: "Student", lastName: "Test", programId: 1,
    programName: "Test program", yearLevel: "1st Year", birthday: "2005-01-01", gender: "Male",
  };
  const response = () => ({ statusCode: 200, status(code) { this.statusCode = code; return this; }, json(data) { this.data = data; return this; } });
  const created = response();
  await controller.create({ body: { ...body, cardId: "UNAUTHORIZED-CARD" } }, created);
  assert.equal(created.statusCode, 201);
  assert.equal(Object.hasOwn(created.data, "cardId"), false);
  for (const cardFields of [{ cardId: "UNAUTHORIZED-CARD" }, { cardId: "" }, {}]) {
    const updated = response();
    await controller.update({ body: { ...body, ...cardFields }, params: { id: "7" } }, updated);
    assert.equal(updated.statusCode, 200);
    assert.equal(Object.hasOwn(updated.data, "cardId"), false);
  }
  // Protect the persistence boundary too, even if called without the controller.
  await studentModel.update(7, { ...body, cardId: "UNAUTHORIZED-CARD" });
  assert.equal(writes.length, 5);
  for (const { sql, params } of writes) {
    assert.doesNotMatch(sql, /card_id/, "Only the enrollment flow may write the card column");
    assert.ok(!params.includes("UNAUTHORIZED-CARD"));
    assert.equal((sql.match(/\?/g) || []).length, params.length);
  }
});

test("attendance resolves student, employee, and alumni card IDs while honoring the audience", async () => {
  const source = fs.readFileSync(path.join(__dirname, "../api/attendance/attendance.model.js"), "utf8");
  const exports = {};
  const expected = {
    student: { id: 7, idNumber: "2023007", type: "Student", cardId: "00012345" },
    employee: { id: 7, idNumber: "P2023007", type: "Employee", cardId: "00098765" },
    alumni: { id: 11, alumniId: 7, idNumber: "2010011", type: "Alumnus", cardId: "00077777" },
  };
  vm.runInNewContext(source.slice(source.indexOf("exports.findPerson ="), source.indexOf("exports.findInactiveStudent =")), {
    exports, ensureSchema: async () => {},
    pool: { async query(sql, params) {
      assert.equal(params.length, 2, "Each lookup must accept an ID number and a card ID");
      const type = sql.includes("FROM students s") ? "student" : sql.includes("FROM employees e") ? "employee" : "alumni";
      assert.match(sql, /card_id/);
      if (type === "alumni") {
        assert.match(sql, /a\.card_id=\?/);
        assert.doesNotMatch(sql, /linked_student|COALESCE\([^)]*card_id/);
      }
      const person = expected[type];
      return [[person.idNumber, person.cardId].includes(params[0]) ? [person] : []];
    } },
  });
  for (const person of Object.values(expected)) {
    assert.equal((await exports.findPerson(person.cardId)).type, person.type);
    assert.equal((await exports.findPerson(person.idNumber)).type, person.type);
  }
  assert.equal(await exports.findPerson(expected.employee.cardId, "Students"), undefined);
  assert.equal(await exports.findPerson(expected.student.cardId, "Employees"), undefined);
});
