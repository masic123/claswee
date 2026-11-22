const Sync=require('./sync');
const URL='https://masic-blog-d6g6d4r87bc035c0e-1324333320.ap-shanghai.app.tcloudbase.com/schedule-course-assistant';
function ready(){const c=Sync.config();return !!(c.room&&c.token)}
function scope(owner){const c=Sync.config();return JSON.stringify([c.room||'',c.clientId||'',owner||'cat'])}
function ask(turns,context,options){
 const cfg=Sync.config();
 if(!cfg.room||!cfg.token)return Promise.reject(new Error('请先到“同步”创建或加入房间，再使用AI加课'));
 return new Promise((resolve,reject)=>{
  wx.request({url:URL,method:'POST',timeout:65000,header:{'Content-Type':'application/json',Authorization:`Bearer ${cfg.token}`},data:Object.assign({room:cfg.room,turns,context},options||{},{schemaVersion:2}),
   success:response=>{
    let r=response.data;try{if(typeof r==='string')r=JSON.parse(r)}catch(_){r=null}
    const current=Sync.config();if(current.room!==cfg.room||current.token!==cfg.token)return reject(new Error('房间连接已变化，请重新整理这门课'));
    if(r&&r.ok&&['add','cancel','unsupported'].includes(r.intent))resolve(r);
    else reject(Object.assign(new Error(r&&r.message||'AI加课暂时不可用，请稍后重试'),{code:r&&r.code}));
   },fail:error=>reject(new Error(/timeout/i.test(error&&error.errMsg||'')?'整理超时，请稍后重试':'AI暂时连接不上，请检查网络后重试'))});
 });
}
module.exports={ask,ready,scope};
