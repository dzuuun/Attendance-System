const pool = require("../../db/db");
exports.getAll = async () =>
  (
    await pool.query(
      `SELECT id,name,description,starts_at startsAt,ends_at endsAt,max_time_ins maxTimeIns,max_time_outs maxTimeOuts,target_audience targetAudience,is_active isActive,created_at createdAt FROM events ORDER BY starts_at DESC`,
    )
  )[0];
exports.getById = async (id) =>
  (
    await pool.query(
      `SELECT id,name,description,starts_at startsAt,ends_at endsAt,max_time_ins maxTimeIns,max_time_outs maxTimeOuts,target_audience targetAudience,is_active isActive FROM events WHERE id=?`,
      [id],
    )
  )[0][0];
exports.create = async (data) =>
  (
    await pool.query(
      "INSERT INTO events (name,description,starts_at,ends_at,max_time_ins,max_time_outs,target_audience,created_by) VALUES (?,?,?,?,?,?,?,?)",
      [
        data.name,
        data.description || null,
        data.startsAt,
        data.endsAt,
        data.maxTimeIns,
        data.maxTimeOuts,
        data.targetAudience,
        data.createdBy,
      ],
    )
  )[0];
exports.setActive = async (id, isActive) =>
  pool.query("UPDATE events SET is_active=? WHERE id=?", [isActive, id]);
