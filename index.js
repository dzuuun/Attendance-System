require('dotenv').config();
const express=require('express'),session=require('express-session'),path=require('path');
const {checkSession,requireAdmin}=require('./auth/auth_validation');
const {asyncHandler,apiNotFound,apiErrorHandler}=require('./api/middleware/api_standards');
const app=express(),port=Number(process.env.PORT)||3000,client=path.join(__dirname,'client');
app.use(express.json({limit:'1mb'}));
app.use(session({secret:process.env.SESSION_SECRET||'change-me-in-production',resave:false,saveUninitialized:false,cookie:{httpOnly:true,sameSite:'lax',secure:process.env.NODE_ENV==='production',maxAge:28800000}}));
app.use((_req,res,next)=>{res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('X-Frame-Options','DENY');res.setHeader('Referrer-Policy','same-origin');next();});

const loginRouter=require('./api/login/login.router');
const attendanceRouter=require('./api/attendance/attendance.router');
const studentRouter=require('./api/maintenance/student/student.router');
const employeeRouter=require('./api/maintenance/employee/employee.router');
const settingsRouter=require('./api/maintenance/settings/settings.router');
const userRouter=require('./api/user/user_management/user_management.router');
app.use('/api/auth',asyncHandler(loginRouter));
app.use('/api',checkSession);
app.use('/api/attendance',wrapRouter(attendanceRouter));
app.use('/api/student',wrapRouter(studentRouter));
app.use('/api/employee',wrapRouter(employeeRouter));
app.use('/api/settings',requireAdmin,wrapRouter(settingsRouter));
app.use('/api/user',requireAdmin,wrapRouter(userRouter));
app.get('/api/people',asyncHandler(async(_req,res)=>{const [students,employees]=await Promise.all([require('./api/maintenance/student/student.model').getAll(),require('./api/maintenance/employee/employee.model').getAll()]);res.json([...students,...employees]);}));
app.post('/api/people',asyncHandler((req,res)=>req.body.type==='Student'?require('./api/maintenance/student/student.controller').create(req,res):require('./api/maintenance/employee/employee.controller').create(req,res)));
app.delete('/api/people/:type/:id',asyncHandler((req,res)=>req.params.type==='Student'?require('./api/maintenance/student/student.controller').remove(req,res):require('./api/maintenance/employee/employee.controller').remove(req,res)));
app.get('/api/users',(req,res)=>res.redirect(307,'/api/user'));app.post('/api/users',(req,res)=>res.redirect(307,'/api/user'));app.patch('/api/users/:id/status',(req,res)=>res.redirect(307,`/api/user/${req.params.id}/status`));
app.use('/api',apiNotFound);

app.use('/client',express.static(client));
app.get('/',(_req,res)=>res.sendFile(path.join(client,'index.html')));
app.get('/login',(_req,res)=>res.sendFile(path.join(client,'login','index.html')));
app.get('/setup',(_req,res)=>res.sendFile(path.join(client,'login','setup.html')));
app.get('/app',(req,res)=>req.session.user?res.sendFile(path.join(client,'dashboard','index.html')):res.redirect('/login'));
app.get('/portal.css',(_req,res)=>res.sendFile(path.join(client,'login','style.css')));app.get('/auth.js',(_req,res)=>res.sendFile(path.join(client,'login','script.js')));app.get('/styles.css',(_req,res)=>res.sendFile(path.join(client,'dashboard','style.css')));app.get('/app.js',(_req,res)=>res.sendFile(path.join(client,'dashboard','script.js')));
app.use(apiErrorHandler);
app.listen(port,()=>console.log(`TapTrack running at http://localhost:${port}`));

function wrapRouter(router){router.stack.forEach(layer=>{if(layer.route)layer.route.stack.forEach(handler=>{handler.handle=asyncHandler(handler.handle);});});return router;}
