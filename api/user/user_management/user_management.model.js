const pool=require('../../../db/db');
exports.getAll=async()=> (await pool.query('SELECT id,full_name fullName,username,role,is_active isActive,created_at createdAt FROM users ORDER BY full_name'))[0];
exports.create=async data=>(await pool.query('INSERT INTO users (full_name,username,password_hash,role) VALUES (?,?,?,?)',[data.fullName,data.username,data.passwordHash,data.role]))[0];
exports.setStatus=async(id,isActive)=>pool.query('UPDATE users SET is_active=? WHERE id=?',[isActive,id]);
