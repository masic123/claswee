const KEY='claswee_ai_session_v1';
const FIELDS=['draft','messages','imageOwner','saved','savedCount','canUndo'];
function copy(value){return JSON.parse(JSON.stringify(value))}
function snapshot(page){
 const data={};for(const key of FIELDS)if(page.data[key]!==undefined)data[key]=copy(page.data[key]);
 return {data,entries:copy(page.entries||[]),source:String(page.source||''),pending:page.pending?copy(page.pending):null,resumeDefaults:page.resumeDefaults?copy(page.resumeDefaults):null,clarification:String(page.clarification||''),savedCourses:page.savedCourses?copy(page.savedCourses):null,lastSave:page.lastSave?copy(page.lastSave):null};
}
function read(scope){
 if(!scope)return null;
 try{const saved=wx.getStorageSync(KEY);if(!saved||saved.version!==1||saved.scope!==scope||!saved.state||!Array.isArray(saved.state.entries)||!Array.isArray(saved.state.data.messages)||typeof saved.state.source!=='string')return null;return copy(saved.state)}catch(_){return null}
}
function write(scope,page){
 if(!scope)return true;
 try{wx.setStorageSync(KEY,{version:1,scope,at:Date.now(),state:snapshot(page)});return true}catch(_){return false}
}
module.exports={read,write,snapshot};
