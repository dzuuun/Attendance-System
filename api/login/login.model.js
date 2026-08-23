const pool = require('../../db/db');
const findByUsername = async username => (await pool.query('SELECT id,full_name fullName,username,password_hash passwordHash,role,is_active isActive FROM users WHERE username=?', [username]))[0][0];
const countUsers = async () => (await pool.query('SELECT COUNT(*) count FROM users'))[0][0].count;
const createSuperadmin = async ({ fullName, username, passwordHash }) => (await pool.query("INSERT INTO users (full_name,username,password_hash,role) VALUES (?,?,?,'Superadmin')", [fullName, username, passwordHash]))[0];
module.exports = { findByUsername, countUsers, createSuperadmin };
