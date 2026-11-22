const crypto=require('node:crypto');
const cloudbase=require('@cloudbase/node-sdk');
const Core=require('./core');
const Http=require('./http');
const app=cloudbase.init({env:process.env.TCB_ENV||cloudbase.SYMBOL_CURRENT_ENV});
const db=app.rdb({database:'public'});
if(process.env.CLASWEE_DB_KEY)db.headers.set('X-Claswee-Service-Key',process.env.CLASWEE_DB_KEY);
async function rpc(name,args){const result=await db.rpc(name,args);if(result.error)throw new Error('Quota unavailable');return Array.isArray(result.data)?result.data[0]:result.data}
const hash=x=>crypto.createHash('sha256').update(x).digest('hex');
exports.main=Http.createHandler({authenticate:(room,token)=>Http.authenticate(db,hash,room,token),run:(payload,identity)=>Core.createHandler({env:process.env,getOpenId:()=>identity,
 hash:x=>crypto.createHash('sha256').update(x).digest('hex'),randomId:()=>crypto.randomBytes(16).toString('hex'),
 takeQuota:(actor,request)=>rpc('claswee_course_ai_take_quota',{p_actor:actor,p_request:request}),
 releaseQuota:(actor,request)=>rpc('claswee_course_ai_release_quota',{p_actor:actor,p_request:request})})(payload)});
