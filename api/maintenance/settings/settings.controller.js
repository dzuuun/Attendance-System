const model=require('./settings.model');exports.getAll=async(_req,res)=>res.json(await model.getAll());exports.update=async(req,res)=>{await model.update(req.body);res.json(req.body);};
