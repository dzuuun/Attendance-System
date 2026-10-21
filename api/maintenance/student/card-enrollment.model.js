const pool = require("../../../db/db");
const schema = require("../../../db/schema");
const TYPES = { student: "students", employee: "employees", alumni: "alumni" };
let ready;
async function ensureSchema() {
  return (ready ||= (async () => {
    await require("./student.model").ensureSchema();
    await require("../employee/employee.model").ensureSchema();
    await require("../alumni/alumni.model").ensureSchema();
    await schema.addColumn("employees", "card_id", "VARCHAR(128) NULL UNIQUE");
    await schema.addColumn("alumni", "card_id", "VARCHAR(128) NULL UNIQUE");
  })());
}

exports.ensureSchema = ensureSchema;
exports.TYPES = TYPES;
function peopleQuery(search, type) {
  const term = `%${search.replace(/[!%_]/g, "!$&")}%`;
  const queries = {
    student: "SELECT s.id,s.id_number idNumber,TRIM(CONCAT_WS(' ',s.first_name,NULLIF(s.middle_name,''),s.last_name)) name,s.card_id cardId,s.photo_url photoUrl,'student' type FROM students s WHERE s.is_active=TRUE AND (s.id_number LIKE ? ESCAPE '!' OR CONCAT_WS(' ',s.first_name,s.middle_name,s.last_name) LIKE ? ESCAPE '!')",
    employee: "SELECT e.id,e.id_number idNumber,TRIM(CONCAT_WS(' ',e.first_name,NULLIF(e.middle_name,''),e.last_name)) name,e.card_id cardId,e.photo_url photoUrl,'employee' type FROM employees e WHERE e.is_active=TRUE AND (e.id_number LIKE ? ESCAPE '!' OR CONCAT_WS(' ',e.first_name,e.middle_name,e.last_name) LIKE ? ESCAPE '!')",
    alumni: "SELECT a.id,a.id_number idNumber,TRIM(CONCAT_WS(' ',a.first_name,NULLIF(a.middle_name,''),a.last_name)) name,a.card_id cardId,a.photo_url photoUrl,'alumni' type FROM alumni a WHERE a.is_active=TRUE AND (a.id_number LIKE ? ESCAPE '!' OR CONCAT_WS(' ',a.first_name,a.middle_name,a.last_name) LIKE ? ESCAPE '!')",
  };
  const selected = type === "all" ? Object.keys(queries) : [type];
  return {
    sql: selected.map((key) => queries[key]).join(" UNION ALL "),
    params: selected.flatMap(() => [term, term]),
  };
}

exports.search = async (search = "", type = "all", page = 1) => {
  await ensureSchema();
  const query = peopleQuery(search, type);
  const [rows] = await pool.query(
    query.sql + " ORDER BY name,idNumber,type,id LIMIT 51 OFFSET ?",
    [...query.params, (page - 1) * 50],
  );
  return rows;
};

exports.directory = async ({ search, type, start, length, orderBy, direction }) => {
  await ensureSchema();
  const filtered = peopleQuery(search, type);
  const all = peopleQuery("", type);
  const column = ["idNumber", "name", "type", "cardId"].includes(orderBy) ? orderBy : "name";
  const sortDirection = direction === "desc" ? "DESC" : "ASC";
  const count = async (query) => {
    const [[row]] = await pool.query(`SELECT COUNT(*) total FROM (${query.sql}) people`, query.params);
    return Number(row.total);
  };
  const [[data], recordsTotal, filteredCount] = await Promise.all([
    pool.query(`${filtered.sql} ORDER BY ${column} ${sortDirection},idNumber,type,id LIMIT ? OFFSET ?`, [...filtered.params, length, start]),
    count(all),
    search ? count(filtered) : Promise.resolve(null),
  ]);
  return { data, recordsTotal, recordsFiltered: filteredCount ?? recordsTotal };
};

async function conflict(connection, cardId, type, id) {
  const excludedStudent = type === "student" ? id : 0;
  const excludedEmployee = type === "employee" ? id : 0;
  const excludedAlumnus = type === "alumni" ? id : 0;
  const [rows] = await connection.query(
    "SELECT id FROM students WHERE (card_id=? OR id_number=?) AND id<>? UNION ALL SELECT id FROM employees WHERE (card_id=? OR id_number=?) AND id<>? UNION ALL SELECT id FROM alumni WHERE (card_id=? OR id_number=?) AND id<>? LIMIT 1",
    [cardId, cardId, excludedStudent, cardId, cardId, excludedEmployee, cardId, cardId, excludedAlumnus],
  );
  return rows.length > 0;
}
exports.conflict = async (cardId, type, id = 0) => {
  if (!cardId) return false;
  await ensureSchema();
  return conflict(pool, cardId, type, id);
};

exports.save = async (type, id, cardId) => {
  await ensureSchema();
  if (!Object.hasOwn(TYPES, type)) return { status: "invalid" };
  const connection = await pool.getConnection();
  let locked = false;
  try {
    // Shared with person-identifiers: ID-number changes and card assignments
    // must not race across the separate people tables.
    const [[lock]] = await connection.query("SELECT GET_LOCK('taptrack:card-enrollment',10) acquired");
    if (!lock?.acquired) return { status: "busy" };
    locked = true;
    await connection.beginTransaction();
    const [[person]] = await connection.query(
      `SELECT id,id_number idNumber,TRIM(CONCAT_WS(' ',first_name,NULLIF(middle_name,''),last_name)) name,is_active isActive FROM ${TYPES[type]} WHERE id=? FOR UPDATE`, [id],
    );
    if (!person || !person.isActive) {
      await connection.rollback();
      return { status: person ? "inactive" : "missing" };
    }
    if (await conflict(connection, cardId, type, person.id)) {
      await connection.rollback();
      return { status: "conflict" };
    }
    await connection.query(`UPDATE ${TYPES[type]} SET card_id=? WHERE id=?`, [cardId, person.id]);
    await connection.commit();
    return { status: "saved", person };
  } catch (error) {
    await connection.rollback();
    if (error.code === "ER_DUP_ENTRY") return { status: "conflict" };
    throw error;
  } finally {
    try {
      if (locked) await connection.query("SELECT RELEASE_LOCK('taptrack:card-enrollment')");
    } finally { connection.release(); }
  }
};
