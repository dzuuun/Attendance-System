const pool=require('../../../db/db');
exports.getAll=async()=>{const [rows]=await pool.query('SELECT setting_key settingKey,setting_value settingValue FROM system_settings');return Object.fromEntries(rows.map(r=>[r.settingKey,r.settingValue]));};
exports.update=async settings=>{for(const [key,value] of Object.entries(settings))await pool.query('INSERT INTO system_settings (setting_key,setting_value) VALUES (?,?) ON DUPLICATE KEY UPDATE setting_value=VALUES(setting_value)',[key,String(value)]);};
