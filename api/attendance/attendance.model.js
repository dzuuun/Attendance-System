const pool=require('../../db/db');
exports.getAll=async()=> (await pool.query('SELECT id,person_type type,person_id personId,id_number idNumber,full_name name,checked_in_at timestamp FROM attendance ORDER BY checked_in_at DESC LIMIT 1000'))[0];
exports.findPerson=async idNumber=>{const [[students],[employees]]=await Promise.all([pool.query("SELECT id,id_number idNumber,full_name name,'Student' type FROM students WHERE id_number=?",[idNumber]),pool.query("SELECT id,id_number idNumber,full_name name,'Employee' type FROM employees WHERE id_number=?",[idNumber])]);return students[0]||employees[0];};
exports.findToday=async person=>(await pool.query('SELECT checked_in_at timestamp FROM attendance WHERE person_type=? AND person_id=? AND DATE(checked_in_at)=CURDATE() LIMIT 1',[person.type,person.id]))[0][0];
exports.record=async person=>(await pool.query('INSERT INTO attendance (person_type,person_id,id_number,full_name) VALUES (?,?,?,?)',[person.type,person.id,person.idNumber,person.name]))[0];
exports.clear=async()=>pool.query('DELETE FROM attendance');
