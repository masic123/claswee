const Store=require('../../utils/store');
const Skin=require('../../utils/skin');
const Command=require('../../utils/course-command');
const Batch=require('../../utils/course-batch');
const Assistant=require('../../utils/course-assistant');
const ImageCourse=require('../../utils/course-image');
const Session=require('../../utils/course-session');
const EXAMPLES=['给我加数学课：周一上午前两节，前五周单周，之后每周，第八周停课。','给我加高数：周一下午第一节；英语：周三第3到4节。以上都为1到16周，地点A302。'];
function id(){return `ai_${Date.now()}_${Math.random().toString(36).slice(2,10)}`}
Page({
 data:{skin:'blush',connected:false,draft:'',busy:false,choosingImage:false,imageOwner:'cat',imageOwners:['小猫','小狗'],imageOwnerIndex:0,canRetryImage:false,error:'',messages:[],plans:[],selectedCount:0,incompleteCount:0,progress:'',hasPending:false,saved:false,savedCount:0,canUndo:false,toView:'',examples:EXAMPLES},
 onShow(){
  Skin.apply(this);const data=Store.get(),scope=Assistant.scope(data.me);
  if(this.sessionScope!==scope){
   this.sessionScope=scope;const saved=Session.read(scope);
   this.entries=[];this.source='';this.pending=null;this.savedCourses=null;this.lastSave=null;this.resumeDefaults=null;this.clarification='';this.failedImage=null;this.sending=false;this.committing=false;this.ownerInitialized=false;
   this.setData({messages:[],draft:'',plans:[],selectedCount:0,incompleteCount:0,saved:false,savedCount:0,canUndo:false,error:'',busy:false,choosingImage:false,progress:'',canRetryImage:false,hasPending:false});
   if(saved){
    Object.assign(this,{entries:saved.entries,source:saved.source,pending:saved.pending,resumeDefaults:saved.resumeDefaults,clarification:saved.clarification,savedCourses:saved.savedCourses,lastSave:saved.lastSave});
    this.setData(saved.data);this.ownerInitialized=['cat','dog'].includes(saved.data.imageOwner);
    this.setData({hasPending:!!this.pending,error:this.pending?'上次还有内容未处理，点“继续整理”即可。':''});
   }
  }
  if(!this.ownerInitialized){this.data.imageOwner=data.me==='dog'?'dog':'cat';this.ownerInitialized=true}
  this.setData({connected:Assistant.ready(),imageOwner:this.data.imageOwner,imageOwnerIndex:this.data.imageOwner==='dog'?1:0,imageOwners:[data.users.cat.name,data.users.dog.name]});
  this.entries=this.entries||[];this.source=this.source||'';if(this.entries.length)this.renderBatch();
 },
 remember(){if(!Session.write(this.sessionScope,this))this.setData({error:'本地会话暂存失败，请不要关闭此页，并检查存储空间。'})},
 current(scope){return !this.destroyed&&(!this.sessionScope||this.sessionScope===scope)&&Assistant.scope(Store.get().me)===scope},
 onHide(){this.remember()},
 onUnload(){this.remember();this.destroyed=true},
 input(event){if(!this.pending){this.setData({draft:event.detail.value,error:''});this.remember()}},
 example(event){if(!this.data.busy&&!this.pending){this.setData({draft:EXAMPLES[+event.currentTarget.dataset.index]||'',error:''});this.remember()}},
 async consent(){if(this.consented)return true;return new Promise((resolve,reject)=>wx.showModal({title:'用AI整理课程',content:'本页课程对话、待确认草稿和课表图片会由云端 OCR / DeepSeek 整理，并使用必要的昵称、身份、学期与节次设置。已有课表、小纸条和房间凭证不会交给 AI。核对确认后才保存。',confirmText:'同意继续',success:r=>{this.consented=!!r.confirm;resolve(this.consented)},fail:()=>reject(new Error('AI授权提示未能打开，请重试'))}))},
 chooseImageOwner(event){if(!this.data.busy&&!this.data.choosingImage){this.setData({imageOwner:+event.detail.value===1?'dog':'cat',imageOwnerIndex:+event.detail.value===1?1:0});this.remember()}},
 async uploadImage(){
  if(this.data.busy||this.data.choosingImage||this.sending||this.committing||this.pending||this.destroyed)return;
  this.setData({choosingImage:true,error:''});
  try{const imagePath=await ImageCourse.choose();if(!imagePath||this.destroyed)return;if(!await this.consent()||this.destroyed)return;await this.recognizeImage(imagePath,this.data.imageOwner)}
  catch(error){if(!this.destroyed)this.setData({error:error.message||'图片选择失败，请重试'})}
  finally{if(!this.destroyed)this.setData({choosingImage:false})}
 },
 async retryImage(){if(this.failedImage&&!this.data.busy&&!this.data.choosingImage&&!this.sending&&!this.committing&&!this.pending)await this.recognizeImage(this.failedImage.path,this.failedImage.owner)},
 async recognizeImage(imagePath,owner){
  if(this.destroyed)return;
  const data=Store.get(),scope=Assistant.scope(data.me),key=id();this.setData({busy:true,error:'',progress:'正在读取课表图片…',saved:false,canRetryImage:false,messages:this.data.messages.concat([{id:key+'u',role:'user',content:`课表图片 · 加给${data.users[owner].name}`,imagePath}]).slice(-20),toView:key+'u'});
  try{
   const result=await ImageCourse.recognize(imagePath,data,owner,{progress:value=>{if(this.current(scope))this.setData({progress:value})},cancelled:()=>!this.current(scope)});
   if(!this.current(scope))return;
   if(JSON.stringify(Store.get().settings)!==JSON.stringify(data.settings))throw new Error('学期或节次已变化，请重试识图');
   const incoming=ImageCourse.drafts(result,owner,id);
   if(!incoming.entries.length)throw new Error('没有识别到课程，请换一张清晰、完整的课表图');
   incoming.entries.forEach(entry=>entry.imageSettings=JSON.stringify(data.settings));
   this.entries=(this.entries||[]).concat(incoming.entries);this.source=[this.source,incoming.source].filter(Boolean).join('\n');this.failedImage=null;
   const plan=this.renderBatch(),warnings=(result.warnings||[]).join('\n');
   const content=`从图片整理了 ${incoming.entries.length} 门课，已合入本批草稿。${plan.incomplete.length?'有信息未写清，可以继续说“全部是1到16周”或“第2门是周三第3到4节”。':'请核对后确认添加，也可以继续说话修改草稿或上传下一张图。'}${warnings?'\n'+warnings:''}`;
   this.setData({messages:this.data.messages.concat([{id:key+'a',role:'assistant',content}]).slice(-20),toView:'batch-summary'});
  }catch(error){if(this.current(scope)){this.failedImage={path:imagePath,owner};this.setData({canRetryImage:true,error:`${error.message||'图片识别失败'}。已有草稿和未发送文字已保留。`})}}
  finally{if(this.current(scope)){this.setData({busy:false,progress:''});this.remember()}}
 },
 previewImage(event){const imagePath=event.currentTarget.dataset.path;if(imagePath)wx.previewImage({current:imagePath,urls:[imagePath]})},
 renderBatch(){
  const p=Batch.prepare(this.entries||[],Store.get(),this.source||'');this.prepared=p;
  const plans=p.items.map((x,index)=>{const entry=this.entries[index];return {id:x.id,index:index+1,name:x.raw.name||'待补充课程名',origin:entry.origin||'text',ready:x.ready,selected:x.selected,question:x.question||'',duplicate:!!x.duplicate,owner:x.ownerName||'',location:x.ready?x.course.loc||'未填写':'',teacher:x.ready?x.course.teacher:'',timeLabels:x.timeLabels||[],repeatLabel:x.repeatLabel||'',warnings:(x.warnings||[]).concat(entry.imageReview||[],entry.imageWarning?[entry.imageWarning]:[]),conflicts:x.conflicts||[],conflictText:(x.conflicts||[]).join('、')}});
  this.setData({plans,selectedCount:p.selected.length,incompleteCount:p.incomplete.length,hasPending:!!this.pending});this.remember();return p;
 },
 async send(){
  if(this.sending||this.data.busy||this.data.choosingImage||this.destroyed)return;
  const question=this.pending?this.pending.question:this.data.draft.trim();if(!question)return;
  const scope=Assistant.scope(Store.get().me);
  this.sending=true;
  try{
   if(!await this.consent()||!this.current(scope))return;
   if(!this.pending){
    this.source=(this.source?this.source+'\n':'')+question;
    this.pending={question,queue:Batch.splitText(question),defaults:this.resumeDefaults||{},done:0,clarification:this.clarification||''};this.clarification='';this.resumeDefaults=null;this.remember();
   }
   const work=this.pending;this.setData({busy:true,error:'',saved:false,hasPending:true});let reply='';
   while(work.queue.length){
    if(!this.current(scope))return;
    const chunk=work.queue[0],wait=Math.max(0,3100-(Date.now()-(this.lastRequest||0)));
    if(wait)await new Promise(resolve=>setTimeout(resolve,wait));
    if(!this.current(scope))return;
    this.setData({progress:`已整理 ${this.entries.length} 门，正在处理第 ${work.done+1} 段…`});this.lastRequest=Date.now();
    let response;
    try{response=await Assistant.ask([chunk],Command.context(Store.get()),{batch:true,defaults:work.defaults,pendingCount:this.entries.length,lastSave:this.lastSave,...Batch.dialogue(this.entries,this.prepared,this.data.messages,chunk)})}
    catch(error){
     if(error.code==='BATCH_SPLIT'&&chunk.length>150){const parts=Batch.splitText(chunk,Math.floor(chunk.length/2));if(parts.length>1){work.queue.splice(0,1,...parts);continue}}
     throw error;
    }finally{this.lastRequest=Date.now()}
    if(!this.current(scope))return;
    if(response.intent==='cancel'){this.entries=[];work.queue=[];reply='这批待确认草稿已取消。';break}
    if(response.intent==='unsupported')throw new Error(response.message||'这段尚未处理，请用课程描述重试');
    if(!Array.isArray(response.operations))throw new Error('草稿格式未更新，请稍后重试');
    const applied=Batch.apply(this.entries,response.operations,this.source,id,Store.get());this.entries=applied.entries;
    reply=applied.question||response.message||'';
    work.defaults=response.defaults||work.defaults;work.clarification='';work.queue.shift();work.done++;
    this.renderBatch();
   }
   this.pending=null;const p=this.renderBatch();
   reply=Batch.reply(p,reply);
   const key=id();this.setData({messages:this.data.messages.concat([{id:key+'u',role:'user',content:question},{id:key+'a',role:'assistant',content:reply}]).slice(-20),busy:false,draft:'',progress:'',hasPending:false,toView:'batch-summary'});this.remember();
  }catch(error){if(this.current(scope)){this.renderBatch();this.setData({busy:false,error:this.pending?`${error.message||'整理失败'}。已整理的 ${this.entries.length} 门草稿已保留，点“继续整理”处理剩余内容。`:error.message||'发送失败，请重试',progress:'',hasPending:!!this.pending})}}finally{if(this.current(scope)){this.sending=false;this.remember()}}
 },
 toggleCourse(event){if(this.data.busy||this.committing)return;const entry=this.entries.find(x=>x.id===event.currentTarget.dataset.id);if(entry){entry.selected=entry.selected===false;this.renderBatch()}},
 selectAll(){if(this.data.busy||this.committing)return;const select=this.entries.some(x=>x.selected===false);this.entries.forEach(x=>x.selected=select);this.renderBatch()},
 editRemaining(){if(this.data.busy||!this.pending)return;const work=this.pending;this.resumeDefaults=work.defaults;this.pending=null;this.renderBatch();this.setData({draft:work.queue.join(''),error:'已保留已有草稿，可编辑剩余描述后重新发送。',hasPending:false});this.remember()},
 reset(){if(this.data.busy||this.data.choosingImage||this.committing)return;this.entries=[];this.pending=null;this.resumeDefaults=null;this.source='';this.clarification='';this.prepared=null;this.failedImage=null;this.setData({messages:[],plans:[],selectedCount:0,incompleteCount:0,hasPending:false,error:'',draft:'',saved:false,progress:'',toView:'',canRetryImage:false});this.remember()},
 async confirmAdd(){
  if(this.committing||this.data.busy||this.data.choosingImage||this.pending||!this.entries.length)return;
  this.committing=true;
  try{
   const initial=Batch.prepare(this.entries,Store.get(),this.source);
   if(initial.incomplete.length)throw new Error('选中的课程还有信息未补全，请补充或取消勾选');
   if(!initial.selected.length)throw new Error('请先选择有效课程，重复课不会再次添加');
   if(!this.prepared||initial.signature!==this.prepared.signature){this.renderBatch();this.setData({error:'课表设置已变化，草稿已更新，请重新核对后确认'});return}
   const conflicts=initial.selected.filter(x=>x.conflicts.length),selectedIds=new Set(initial.selected.map(x=>x.id)),imageReviews=this.entries.filter(x=>selectedIds.has(x.id)&&x.imageReview&&x.imageReview.length);
   if(conflicts.length||imageReviews.length){const content=conflicts.slice(0,4).map(x=>`${x.course.name}：${x.conflicts.join('、')}`).join('\n')+(conflicts.length>4?'\n其余冲突请查看各门草稿。':'')+(imageReviews.length?`\n有${imageReviews.length}门图片课程含推测节次或待核对星期，请对照原图核对。`:'')+'\n确认添加所有已选课程吗？';const confirmed=await new Promise(resolve=>wx.showModal({title:conflicts.length?`有${conflicts.length}门课程时间重叠`:'核对图片识别信息',content,confirmText:'确认添加',success:r=>resolve(!!r.confirm),fail:()=>resolve(false)}));if(!confirmed||this.destroyed)return}
   const data=Store.get(),fresh=Batch.prepare(this.entries,data,this.source);
   if(fresh.signature!==initial.signature){this.renderBatch();this.setData({error:'课表刚有更新，请核对最新草稿后再确认'});return}
   const saved=Batch.append(data,fresh);this.savedCourses=Store.clone(saved);this.lastSave={status:'saved',count:fresh.selected.length};const savedIds=new Set(saved.map(c=>c.id));this.entries=this.entries.filter(x=>!savedIds.has(x.id));
   this.renderBatch();this.setData({saved:true,savedCount:fresh.selected.length,canUndo:true,error:'',toView:'saved-result'});this.remember();wx.showToast({title:`已添加${fresh.selected.length}门课`,icon:'success'});
  }catch(e){if(!this.destroyed)this.setData({error:e.message||'保存失败，请重试'})}finally{this.committing=false}
 },
 undo(){if(this.data.busy||this.committing||!this.savedCourses)return;try{Batch.undo(Store.get(),this.savedCourses);this.lastSave={status:'undone',count:this.lastSave&&this.lastSave.count||this.savedCourses.length};this.savedCourses=null;this.renderBatch();this.setData({canUndo:false,saved:false,error:''});this.remember();wx.showToast({title:'已撤销本批添加',icon:'success'})}catch(e){this.setData({error:e.message})}},
 openSync(){wx.switchTab({url:'/pages/sync/index'})},
 backToSchedule(){wx.switchTab({url:'/pages/schedule/index'})}
});
