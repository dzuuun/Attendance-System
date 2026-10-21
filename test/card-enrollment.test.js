const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const model = require("../api/maintenance/student/card-enrollment.model");
const { requireMaintenance } = require("../auth/auth_validation");
const permissionModel = require("../api/user/permission/permission.model");
const router = require("../api/maintenance/student/card-enrollment.router");

test("enrollment-only API supports all three person types without record editing", async () => {
  const originals = { search: model.search, directory: model.directory, save: model.save };
  let searches = 0;
  const writes = [];
  const lookups = [];
  const tableLookups = [];
  const people = ["student", "employee", "alumni"].map((type) => ({
    id: 7, idNumber: `${type}-7`, name: `${type} Test`, cardId: null, photoUrl: `/uploads/profile-photos/${type}.jpg`, type,
  }));
  model.search = async (term, type, page) => {
    searches++;
    lookups.push({ term, type, page });
    if (term === "Many") return Array.from({ length: page === 1 ? 51 : 3 }, (_, index) => ({ ...people[0], id: (page - 1) * 50 + index + 1 }));
    return type === "all" ? people : people.filter((person) => person.type === type);
  };
  model.directory = async (options) => {
    tableLookups.push(options);
    return { data: people, recordsTotal: 65, recordsFiltered: 3 };
  };
  model.save = async (type, id, cardId) => {
    if (cardId === "TAKEN") return { status: "conflict" };
    if (id === 8) return { status: "inactive" };
    writes.push({ type, id, cardId });
    return { status: "saved", person: people.find((person) => person.type === type) };
  };
  const app = express();
  let modules = ["cardEnrollment"];
  app.use(express.json());
  app.use((req, _res, next) => {
    req.user = { role: "Card Enrollment", maintenanceAccess: true, maintenanceModules: modules };
    next();
  });
  app.use("/api/card-enrollment", requireMaintenance("cardEnrollment"), router);
  app.use("/api/employee", requireMaintenance("employees"), require("../api/maintenance/employee/employee.router"));
  app.use("/api/alumni", requireMaintenance("alumni"), require("../api/maintenance/alumni/alumni.router"));
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const url = `http://127.0.0.1:${server.address().port}/api/card-enrollment`;
  const save = (type, id, cardId) => fetch(`${url}/${type}/${id}/card`, {
    method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ cardId, firstName: "Unwanted edit" }),
  });
  try {
    assert.deepEqual(permissionModel.normalizeMaintenanceModules('["cardEnrollment"]'), ["cardEnrollment"]);
    const firstPage = { people, page: 1, pageSize: 50, hasMore: false };
    assert.deepEqual(await (await fetch(`${url}/people`)).json(), firstPage);
    assert.equal(searches, 1, "People must be listed without requiring a search");
    assert.deepEqual(lookups[0], { term: "", type: "all", page: 1 });
    assert.deepEqual(await (await fetch(`${url}/people?search=a`)).json(), firstPage);
    assert.deepEqual(await (await fetch(`${url}/people?search=Test`)).json(), firstPage);
    const many = await (await fetch(`${url}/people?search=Many`)).json();
    assert.equal(many.people.length, 50);
    assert.equal(many.hasMore, true);
    const next = await (await fetch(`${url}/people?search=Many&page=2`)).json();
    assert.equal(next.page, 2);
    assert.equal(next.people[0].id, 51);
    assert.equal(next.hasMore, false);
    for (const page of ["0", "-1", "NaN", "1.5"])
      assert.equal((await fetch(`${url}/people?page=${page}`)).status, 400);
    assert.equal((await fetch(`${url}/people?search=${"a".repeat(129)}`)).status, 400);
    assert.equal((await fetch(`${url}/people?search=Test&type=users`)).status, 400);
    const tableQuery = "mode=table&draw=4&start=10&length=10&orderBy=idNumber&direction=desc&search=Test&type=employee";
    assert.deepEqual(await (await fetch(`${url}/people?${tableQuery}`)).json(), {
      draw: 4, data: people, recordsTotal: 65, recordsFiltered: 3,
    });
    assert.deepEqual(tableLookups, [{ search: "Test", type: "employee", start: 10, length: 10, orderBy: "idNumber", direction: "desc" }]);
    for (const [key, value] of [["start", "-1"], ["draw", "NaN"], ["length", "10000"], ["orderBy", "name;DROP"], ["direction", "sideways"]]) {
      const params = new URLSearchParams(tableQuery);
      params.set(key, value);
      assert.equal((await fetch(`${url}/people?${params}`)).status, 400);
    }
    assert.equal((await save("users", 7, "NEW")).status, 400);
    assert.equal((await save("student", 7, "")).status, 400);
    assert.equal((await save("employee", 7, "TAKEN")).status, 409);
    assert.equal((await save("alumni", 8, "NEW")).status, 400);
    assert.equal((await fetch(`${url}/student/7`, { method: "PUT" })).status, 404);
    assert.equal((await fetch(`${url}/employee/7`, { method: "DELETE" })).status, 404);
    for (const type of ["student", "employee", "alumni"]) {
      assert.deepEqual((await (await fetch(`${url}/people?search=Test&type=${type}`)).json()).people, people.filter((p) => p.type === type));
      const saved = await save(type, 7, ` 000123${type} `);
      assert.equal(saved.status, 200);
      assert.deepEqual(await saved.json(), { cardId: `000123${type.toUpperCase()}` });
    }
    assert.deepEqual(writes, ["student", "employee", "alumni"].map((type) => ({ type, id: 7, cardId: `000123${type.toUpperCase()}` })));
    for (const [resource, module] of [["employee", "employees"], ["alumni", "alumni"]]) {
      const directoryUrl = url.replace("/card-enrollment", `/${resource}/7/card`);
      const enroll = () => fetch(directoryUrl, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ cardId: " 00098765 " }),
      });
      modules = ["cardEnrollment"];
      assert.equal((await enroll()).status, 403, "Enrollment-only operators must not gain directory access");
      modules = [module];
      const response = await enroll();
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), { cardId: "00098765" });
      assert.deepEqual(writes.at(-1), { type: resource, id: 7, cardId: "00098765" });
    }
  } finally {
    Object.assign(model, originals);
    await new Promise((resolve) => server.close(resolve));
  }
});
