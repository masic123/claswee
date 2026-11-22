const HEADERS={'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'};
function failure(code,message){return Object.assign(new Error(message),{code})}
async function authenticate(db,hash,room,token,now=Date.now()){
 if(typeof room!=='string'||!room||room.length>64||typeof token!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(token))throw failure('AUTH_REQUIRED','请先到“同步”创建或加入房间，再使用AI加课');
 const result=await db.from('claswee_room_sessions').select('room_code,client_hash,expires_at').eq('token_hash',hash(token)).limit(1);
 if(result.error)throw failure('ASSISTANT_FAILED','AI暂时不可用，请稍后再试');
 const session=Array.isArray(result.data)?result.data[0]:null;
 if(!session||!Number.isFinite(Date.parse(session.expires_at))||Date.parse(session.expires_at)<=now||session.room_code!==room&&session.room_code!==room.toLowerCase())throw failure('AUTH_REQUIRED','房间凭证已失效，请到“同步”重新加入房间');
 return `room:${session.room_code}:${session.client_hash}`;
}
function createHandler({authenticate:authorize,run}){return async event=>{
 const http=!!(event&&(event.httpMethod||event.headers||event.requestContext));
 let result;
 try{
  if(http&&event.httpMethod!=='POST')return {statusCode:405,headers:HEADERS,body:JSON.stringify({ok:false,code:'METHOD_NOT_ALLOWED',message:'请使用POST请求'})};
  const body=http?event.body:event;
  if(typeof body==='string'&&Buffer.byteLength(body)>30000)throw failure('INVALID_INPUT','内容过长，请分开添加课程');
  let payload;try{payload=typeof body==='string'?JSON.parse(body):body}catch(_){throw failure('INVALID_INPUT','请重新描述这门课')}
  if(!payload||typeof payload!=='object'||Buffer.byteLength(JSON.stringify(payload))>30000)throw failure('INVALID_INPUT','请重新描述这门课');
  const key=Object.keys(event.headers||{}).find(k=>k.toLowerCase()==='authorization');
  const auth=String(key?event.headers[key]:'');const token=/^Bearer ([A-Za-z0-9_-]{43})$/.exec(auth);
  const identity=await authorize(payload.room,token?token[1]:'');
  const input={turns:payload.turns,context:payload.context};
  if(payload.batch===true)Object.assign(input,{batch:true,schemaVersion:payload.schemaVersion===2?2:1,defaults:payload.defaults,pendingCount:payload.pendingCount,history:payload.history,drafts:payload.drafts,lastSave:payload.lastSave});
  result=await run(input,identity);
 }catch(e){const safe=['AUTH_REQUIRED','INVALID_INPUT','ASSISTANT_FAILED'].includes(e.code);result={ok:false,code:safe?e.code:'ASSISTANT_FAILED',message:safe?e.message:'AI暂时不可用，请稍后再试'}}
 if(!http)return result;
 return {statusCode:result.ok?200:result.code==='AUTH_REQUIRED'?401:result.code==='RATE_LIMIT'?429:400,headers:HEADERS,body:JSON.stringify(result)};
}}
module.exports={authenticate,createHandler};
