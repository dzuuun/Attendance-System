const model=require('./employee.model');
exports.getAll=async(_req,res)=>res.json(await model.getAll());
exports.create=async(req,res)=>{const data={...req.body,idNumber:String(req.body.idNumber||'').trim().toUpperCase()};if(!data.name?.trim()||!data.idNumber||!data.groupName?.trim())return res.status(400).json({message:'Name, ID number, and department are required.'});if(await model.findId(data.idNumber))return res.status(409).json({message:'That ID number is already registered.'});const result=await model.create(data);res.status(201).json({id:result.insertId,...data,type:'Employee'});};
exports.remove=async(req,res)=>{const result=await model.remove(req.params.id);if(!result.affectedRows)return res.status(404).json({message:'Employee not found.'});res.status(204).end();};
