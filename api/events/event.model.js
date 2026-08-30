const pool = require("../../db/db");
const periods = require("../maintenance/academic_period/academic_period.model");
let ownershipSchemaReady;
async function ensureOwnershipSchema() {
  if (!ownershipSchemaReady)
    ownershipSchemaReady = (async () => {
      await pool.query(
        "ALTER TABLE events ADD COLUMN IF NOT EXISTS created_by INT UNSIGNED NULL AFTER is_active",
      );
      const [indexes] = await pool.query(
        "SELECT COUNT(*) count FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='events' AND INDEX_NAME='idx_events_creator_period'",
      );
      if (!indexes[0].count)
        await pool.query(
          "ALTER TABLE events ADD INDEX idx_events_creator_period (created_by,academic_period_id,starts_at)",
        );
      await pool.query(
        "UPDATE events e LEFT JOIN users u ON u.id=e.created_by SET e.created_by=NULL WHERE e.created_by IS NOT NULL AND u.id IS NULL",
      );
      const [constraints] = await pool.query(
        "SELECT COUNT(*) count FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA=DATABASE() AND TABLE_NAME='events' AND CONSTRAINT_NAME='fk_events_creator' AND CONSTRAINT_TYPE='FOREIGN KEY'",
      );
      if (!constraints[0].count)
        await pool.query(
          "ALTER TABLE events ADD CONSTRAINT fk_events_creator FOREIGN KEY (created_by) REFERENCES users(id) ON UPDATE CASCADE ON DELETE SET NULL",
        );
    })();
  return ownershipSchemaReady;
}
const eventSelect = `e.id,e.name,e.description,e.starts_at startsAt,e.ends_at endsAt,e.max_time_ins maxTimeIns,e.max_time_outs maxTimeOuts,e.target_audience targetAudience,e.is_active isActive,e.created_by createdBy,TRIM(CONCAT_WS(' ',u.first_name,NULLIF(u.middle_name,''),u.last_name)) creatorName,e.academic_period_id academicPeriodId,e.created_at createdAt`;
const creatorJoin = "LEFT JOIN users u ON u.id=e.created_by";
const canSeeAllCreators = (user) =>
  ["Superadmin", "Administrator"].includes(user?.role);
exports.getAll = async (user) => {
  await periods.ensureSchema();
  await ensureOwnershipSchema();
  return (
    await pool.query(
      `SELECT ${eventSelect} FROM events e INNER JOIN academic_periods ap ON ap.id=e.academic_period_id AND ap.is_current=TRUE ${creatorJoin} WHERE e.created_by=? ORDER BY e.starts_at DESC`,
      [user?.id],
    )
  )[0];
};
exports.getById = async (id) => {
  await periods.ensureSchema();
  await ensureOwnershipSchema();
  return (
    await pool.query(
      `SELECT ${eventSelect} FROM events e INNER JOIN academic_periods ap ON ap.id=e.academic_period_id AND ap.is_current=TRUE ${creatorJoin} WHERE e.id=?`,
      [id],
    )
  )[0][0];
};
exports.create = async (data) => {
  await ensureOwnershipSchema();
  const current = await periods.getCurrent();
  if (!current) throw new Error("No current academic period is configured.");
  return (
    await pool.query(
      "INSERT INTO events (name,description,starts_at,ends_at,max_time_ins,max_time_outs,target_audience,created_by,academic_period_id) VALUES (?,?,?,?,?,?,?,?,?)",
      [
        data.name,
        data.description || null,
        data.startsAt,
        data.endsAt,
        data.maxTimeIns,
        data.maxTimeOuts,
        data.targetAudience,
        data.createdBy,
        current.id,
      ],
    )
  )[0];
};
exports.setActive = async (id, isActive) =>
  pool.query("UPDATE events SET is_active=? WHERE id=?", [isActive, id]);
exports.update = async (id, data) => {
  await ensureOwnershipSchema();
  return (
    await pool.query(
      "UPDATE events SET name=?,description=?,starts_at=?,ends_at=?,max_time_ins=?,max_time_outs=?,target_audience=? WHERE id=?",
      [
        data.name,
        data.description || null,
        data.startsAt,
        data.endsAt,
        data.maxTimeIns,
        data.maxTimeOuts,
        data.targetAudience,
        id,
      ],
    )
  )[0];
};
exports.getByPeriod = async (periodId, user) => {
  await periods.ensureSchema();
  await ensureOwnershipSchema();
  const ownerClause = canSeeAllCreators(user) ? "" : "AND e.created_by=?";
  const params = canSeeAllCreators(user) ? [periodId] : [periodId, user?.id];
  return (
    await pool.query(
      `SELECT ${eventSelect} FROM events e ${creatorJoin} WHERE e.academic_period_id=? AND e.ends_at<NOW() ${ownerClause} ORDER BY e.starts_at DESC`,
      params,
    )
  )[0];
};
exports.getByIdAnyPeriod = async (id) => {
  await periods.ensureSchema();
  await ensureOwnershipSchema();
  return (
    await pool.query(
      `SELECT ${eventSelect} FROM events e ${creatorJoin} WHERE e.id=?`,
      [id],
    )
  )[0][0];
};
exports.ensureOwnershipSchema = ensureOwnershipSchema;
