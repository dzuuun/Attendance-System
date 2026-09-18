require("dotenv").config();
const mysql = require("mysql2/promise");

const pool = mysql.createPool({
  host: process.env.DB_HOST || "localhost",
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "",
  database: process.env.DB_NAME || "attendance_system",
  waitForConnections: true,
  connectionLimit: 10,
  dateStrings: ["DATE"],
});

const query = pool.query.bind(pool);
let ddlNoticeShown = false;
pool.query = (statement, ...parameters) => {
  const sql = typeof statement === "string" ? statement : statement?.sql || "";
  const runtimeDdlDisabled =
    process.env.NODE_ENV === "production" &&
    process.env.ALLOW_RUNTIME_DDL !== "true";
  if (runtimeDdlDisabled && /^\s*(?:CREATE|ALTER|DROP|TRUNCATE)\b/i.test(sql)) {
    if (!ddlNoticeShown) {
      ddlNoticeShown = true;
      console.info(
        "Runtime schema changes are disabled. Apply database.sql before starting production.",
      );
    }
    return Promise.resolve([{ affectedRows: 0, warningStatus: 0 }, []]);
  }
  return query(statement, ...parameters);
};

module.exports = pool;
