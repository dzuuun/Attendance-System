const pool = require("./db");

const identifier = (value) => {
  if (!/^[A-Za-z0-9_]+$/.test(value))
    throw new Error("Invalid SQL identifier.");
  return `\`${value}\``;
};

async function columnExists(table, column) {
  const [rows] = await pool.query(
    "SELECT COUNT(*) count FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? AND COLUMN_NAME=?",
    [table, column],
  );
  return Boolean(rows[0].count);
}

async function addColumn(table, column, definition) {
  if (await columnExists(table, column)) return;
  await pool.query(
    `ALTER TABLE ${identifier(table)} ADD COLUMN ${identifier(column)} ${definition}`,
  );
}

async function dropColumn(table, column) {
  if (!(await columnExists(table, column))) return;
  await pool.query(
    `ALTER TABLE ${identifier(table)} DROP COLUMN ${identifier(column)}`,
  );
}

async function addColumns(table, columns) {
  for (const [column, definition] of columns)
    await addColumn(table, column, definition);
}

async function dropColumns(table, columns) {
  for (const column of columns) await dropColumn(table, column);
}

async function addForeignKey(
  table,
  name,
  columns,
  referencedTable,
  referencedColumns,
  { onUpdate = "CASCADE", onDelete = "RESTRICT" } = {},
) {
  const [rows] = await pool.query(
    "SELECT COUNT(*) count FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA=DATABASE() AND TABLE_NAME=? AND CONSTRAINT_NAME=? AND CONSTRAINT_TYPE='FOREIGN KEY'",
    [table, name],
  );
  if (rows[0].count) return;
  const actions = new Set(["CASCADE", "RESTRICT", "SET NULL", "NO ACTION"]);
  if (!actions.has(onUpdate) || !actions.has(onDelete))
    throw new Error("Invalid foreign key action.");
  await pool.query(
    `ALTER TABLE ${identifier(table)} ADD CONSTRAINT ${identifier(name)} FOREIGN KEY (${columns.map(identifier).join(",")}) REFERENCES ${identifier(referencedTable)} (${referencedColumns.map(identifier).join(",")}) ON UPDATE ${onUpdate} ON DELETE ${onDelete}`,
  );
}

module.exports = {
  columnExists,
  addColumn,
  addColumns,
  dropColumn,
  dropColumns,
  addForeignKey,
};
