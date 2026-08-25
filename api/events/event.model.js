const pool = require("../../db/db");
const periods = require("../maintenance/academic_period/academic_period.model");
exports.getAll = async () => {
  await periods.ensureSchema();
  return (
    await pool.query(
      `SELECT e.id,e.name,e.description,e.starts_at startsAt,e.ends_at endsAt,e.max_time_ins maxTimeIns,e.max_time_outs maxTimeOuts,e.target_audience targetAudience,e.is_active isActive,e.created_at createdAt FROM events e INNER JOIN academic_periods ap ON ap.id=e.academic_period_id AND ap.is_current=TRUE ORDER BY e.starts_at DESC`,
    )
  )[0];
};
exports.getById = async (id) => {
  await periods.ensureSchema();
  return (
    await pool.query(
      `SELECT e.id,e.name,e.description,e.starts_at startsAt,e.ends_at endsAt,e.max_time_ins maxTimeIns,e.max_time_outs maxTimeOuts,e.target_audience targetAudience,e.is_active isActive FROM events e INNER JOIN academic_periods ap ON ap.id=e.academic_period_id AND ap.is_current=TRUE WHERE e.id=?`,
      [id],
    )
  )[0][0];
};
exports.create = async (data) => {
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
exports.update = async (id, data) =>
  (
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
exports.getByPeriod = async (periodId) => {
  await periods.ensureSchema();
  return (
    await pool.query(
      `SELECT e.id,e.name,e.description,e.starts_at startsAt,e.ends_at endsAt,e.max_time_ins maxTimeIns,e.max_time_outs maxTimeOuts,e.target_audience targetAudience,e.is_active isActive,e.academic_period_id academicPeriodId FROM events e WHERE e.academic_period_id=? ORDER BY e.starts_at DESC`,
      [periodId],
    )
  )[0];
};
exports.getByIdAnyPeriod = async (id) => {
  await periods.ensureSchema();
  return (
    await pool.query(
      `SELECT id,name,description,starts_at startsAt,ends_at endsAt,max_time_ins maxTimeIns,max_time_outs maxTimeOuts,target_audience targetAudience,is_active isActive,academic_period_id academicPeriodId FROM events WHERE id=?`,
      [id],
    )
  )[0][0];
};
