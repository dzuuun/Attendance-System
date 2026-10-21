const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

test("library and Internet Section kiosks record official IDs when either identifier is scanned", async () => {
  const people = [
    { id: 7, type: "Student", idNumber: "2023007", cardId: "00012345", name: "Student Test" },
    { id: 7, type: "Employee", idNumber: "P2023007", cardId: "00AA9876", name: "Employee Test" },
    { id: 11, alumniId: 7, type: "Alumnus", idNumber: "A2010007", cardId: "00BB7777", name: "Alumni Test" },
  ];
  const attendance = {};
  const source = fs.readFileSync(path.join(__dirname, "../api/attendance/attendance.model.js"), "utf8");
  vm.runInNewContext(source.slice(source.indexOf("exports.findPerson ="), source.indexOf("exports.findInactiveStudent =")), {
    exports: attendance, ensureSchema: async () => {},
    pool: { async query(sql, values) {
      const type = sql.includes("FROM students s") ? "Student" : sql.includes("FROM employees e") ? "Employee" : "Alumnus";
      assert.match(sql, /id_number=\? OR [a-z]+\.card_id=\?/);
      return [people.filter((person) => person.type === type && (person.idNumber === values[0] || person.cardId === values[1]))];
    } },
  });
  attendance.findInactiveStudent = async () => null;
  const writes = [];
  const lockKeys = [];
  const connection = {
    async query(sql, values) {
      if (sql.includes("GET_LOCK")) { lockKeys.push(values[0]); return [[{ acquired: 1 }]]; }
      if (sql.includes("RELEASE_LOCK")) return [[{ released: 1 }]];
      if (sql.startsWith("SELECT")) return [[]];
      writes.push({ sql, values });
      return [{ insertId: writes.length }];
    },
    release() {},
  };
  const model = {};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../api/library/library.model.js"), "utf8") + "\nready = Promise.resolve();", {
    exports: model,
    require: (name) => {
      if (name === "../../db/db") return { getConnection: async () => connection };
      if (name === "../../db/schema") return {};
      if (name === "../attendance/attendance.model") return attendance;
      if (name === "../maintenance/academic_period/academic_period.model") return { getCurrent: async () => ({ id: 3 }) };
      throw new Error(`Unexpected dependency: ${name}`);
    },
  });
  for (const location of ["library", "internet"]) {
    for (const person of people) {
      const start = lockKeys.length;
      for (const value of [person.idNumber, person.cardId]) {
        const result = await model.scan(location, value);
        assert.equal(result.idNumber, person.idNumber);
        assert.equal(result.type, person.type);
        const write = writes.at(-1);
        assert.match(write.sql, new RegExp(location === "library" ? "INSERT INTO library_entrance_logs" : "INSERT INTO internet_section_entrance_logs"));
        assert.equal(write.values[0], person.type === "Employee" ? null : person.id);
        assert.equal(write.values[1], person.type === "Employee" ? person.id : null);
        assert.equal(write.values[3], person.idNumber, "Attendance must store the official ID, not the card UID");
      }
      assert.equal(lockKeys[start], lockKeys[start + 1], "Both identifiers must share the same person's duplicate-scan lock");
    }
  }
  assert.equal(writes.length, 12);
});
