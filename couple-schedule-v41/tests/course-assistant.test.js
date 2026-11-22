const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const Store=require('../miniprogram/utils/store'),Grid=require('../miniprogram/utils/schedule-grid'),Command=require('../miniprogram/utils/course-command');
const Core=require('../miniprogram/cloudfunctions/scheduleCourseAssistant/core');
const Http=require('../miniprogram/cloudfunctions/scheduleCourseAssistant/http');
const SOURCE='给小猫加高数，每周一下午第一节，1到16周，A302';
function raw(){return {name:'高数',owner:'cat',location:'A302',teacher:'',slots:[{day:1,period:'afternoon',first:1,last:1}],repeat:{kind:'range',from:1,to:16,parity:'all',date:null},evidence:{name:'高数',owner:'小猫',time:'周一下午第一节',repeat:'1到16周'}}}
function fixture(){const data=Store.defaults();data.courses=[];data.me='cat';data.settings.dogStart='2026-09-07';data.settings.dogSections=data.settings.dogSections.slice(0,3).concat([{s:'13:00',e:'13:45'},{s:'14:00',e:'14:45'}]);return data;}
test('maps relative afternoon ordinals using each owner’s actual settings and preserves explicit one-section duration',()=>{
 const data=fixture(),a=Command.prepare(raw(),data,SOURCE);assert.equal(a.ready,true);assert.equal(a.course.slots[0].s1,5);assert.equal(a.course.slots[0].s2,5);assert.match(a.timeLabels[0],/13:30—14:15/);
 const r=raw();r.owner='dog';r.evidence.owner='小狗';const b=Command.prepare(r,data,SOURCE.replace('小猫','小狗'));assert.equal(b.ready,true);assert.equal(b.course.slots[0].s1,4);assert.match(b.timeLabels[0],/13:00—13:45/);
 data.settings.catSections[0].s='25:00';assert.equal(Command.prepare(raw(),data,SOURCE).ready,false);
});
test('missing name, owner and recurrence trigger clarification instead of defaults or writes; ungrounded names are rejected',()=>{
 const r=raw();r.evidence.owner='';r.repeat.kind=null;const p=Command.prepare(r,fixture(),'周一下午第一节高数');assert.equal(p.ready,false);assert.match(p.question,/加给/);assert.match(p.question,/每周/);
 r.name='模型编造的课程';assert.equal(Command.prepare(r,fixture(),SOURCE).ready,false);
 const data=fixture();data.me='dog';const mine=raw();mine.evidence.owner='我';const p2=Command.prepare(mine,data,SOURCE.replace('小猫','我'));assert.equal(p2.course.owner,'dog');
});
test('range, parity and duplicate checks stay within configured semester',()=>{
 const data=fixture(),r=raw();r.repeat.to=41;assert.equal(Command.prepare(r,data,SOURCE).ready,false);
 r.repeat.from=r.repeat.to=2;r.repeat.parity='odd';assert.equal(Command.prepare(r,data,SOURCE).ready,false);
 const p=Command.prepare(raw(),data,SOURCE);data.courses.push({...p.course,id:'exists'});const duplicate=Command.prepare(raw(),data,SOURCE);assert.equal(duplicate.duplicate,'exists');assert.deepEqual(duplicate.conflicts,[]);
});
test('conflicts use dates, owner parity and real time; partner lessons do not block the new class',()=>{
 const data=fixture(),r=raw(),course=Command.prepare(r,data,SOURCE).course;
 data.courses=[{...Store.clone(course),id:'old',name:'已有课程'}];assert.ok(Command.prepare(r,data,SOURCE).conflicts.length);
 data.courses[0].owner='dog';assert.deepEqual(Command.prepare(r,data,SOURCE).conflicts,[]);
 data.courses[0].owner='cat';data.courses[0].customParity='even';r.repeat.parity='odd';assert.deepEqual(Command.prepare(r,data,SOURCE).conflicts,[]);
});
test('single-date lessons use owner week and reject off days or make-up duplicates',()=>{
 const data=fixture(),r=raw();r.repeat={kind:'date',date:'2026-11-09',parity:'all'};r.evidence.repeat='11月9日';const source=SOURCE+'，只加11月9日';let p=Command.prepare(r,data,source);assert.equal(p.ready,true);assert.equal(p.course.wf,11);assert.equal(p.course.wt,11);
 data.adjustments=[{date:'2026-11-09',owner:'cat',kind:'off'}];assert.equal(Command.prepare(r,data,source).ready,false);
 data.adjustments=[{date:'2026-11-10',owner:'cat',kind:'use',sourceDate:'2026-11-09'}];assert.equal(Command.prepare(r,data,source).ready,false);
});
function harness({ask,confirm=true,image,modalFail=false,session={read:()=>null,write:()=>true}}={}){
 let data=fixture(),writes=0,page;const calls=[];
 const store={...Store,get:()=>Store.clone(data),save:value=>{data=Store.normalize(value);writes++;return data}};
 let command;vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../miniprogram/utils/course-command.js'),'utf8'),{require:id=>id==='./store'?store:id==='./course-rules'?require('../miniprogram/utils/course-rules'):Grid,module:{set exports(value){command=value}},Date,Set,JSON,Math,Number,Object,Array,String});
 let batch;vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../miniprogram/utils/course-batch.js'),'utf8'),{require:id=>id==='./store'?store:command,module:{set exports(value){batch=value}},Date,Set,JSON,Math,Number,Object,Array,String});
 const wx={showModal:opts=>{calls.push(opts.title);if(modalFail||opts.confirmText&&opts.confirmText.length>4)return opts.fail({errMsg:'showModal:fail invalid confirmText'});opts.success({confirm})},showToast:opts=>calls.push(opts.title),switchTab(){}};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../miniprogram/pages/course-assistant/index.js'),'utf8'),{require:id=>id.endsWith('/store')?store:id.endsWith('/skin')?{apply(){}}:id.endsWith('/course-command')?command:id.endsWith('/course-batch')?batch:id.endsWith('/course-session')?session:id.endsWith('/course-image')?{...require('../miniprogram/utils/course-image'),...image}:{ready:()=>true,scope:me=>'test-room:'+me,ask:ask||(async()=>({intent:'add',operations:[{kind:'add',draft:raw()}]}))},Page:p=>page=p,wx,Date,Math,Set,setTimeout});
 page.setData=v=>Object.assign(page.data,v);page.entries=[];page.source='';
 return {page,calls,data:()=>data,writes:()=>writes,store,command};
}
test('AI parsing never writes until confirm, repeated taps do not duplicate, undo uses deletion tombstone',async()=>{
 const h=harness();h.page.data.draft=SOURCE;await h.page.send();assert.equal(h.writes(),0);assert.equal(h.page.data.plans.length,1);await Promise.all([h.page.confirmAdd(),h.page.confirmAdd()]);assert.equal(h.writes(),1);assert.equal(h.data().courses.length,1);const id=h.data().courses[0].id;h.page.undo();assert.equal(h.data().courses.length,0);assert.equal(h.data().deletedCourses[0].id,id);assert.equal(h.writes(),2);
});

test('consent dialog failure is visible for both entry buttons, leaves no busy lock, and never sends content',async()=>{
 let requests=0;const image={choose:async()=>'/tmp/timetable.png',recognize:async()=>{requests++;return {courses:[]}}};
 const text=harness({modalFail:true,ask:async()=>{requests++}});text.page.data.draft=SOURCE;await text.page.send();
 assert.match(text.page.data.error,/授权提示未能打开/);assert.equal(text.page.data.draft,SOURCE);assert.equal(text.page.pending,undefined);assert.equal(text.page.sending,false);assert.equal(text.page.data.busy,false);assert.equal(text.writes(),0);assert.equal(requests,0);
 assert.doesNotMatch(text.page.data.error,/继续整理/);
 const photo=harness({modalFail:true,image});photo.page.data.draft=SOURCE;await photo.page.uploadImage();
 assert.match(photo.page.data.error,/授权提示未能打开/);assert.equal(photo.page.data.choosingImage,false);assert.equal(photo.page.data.busy,false);assert.equal(photo.page.data.draft,SOURCE);assert.equal(requests,0);assert.equal(photo.writes(),0);
});

test('image drafts and text share one batch; missing image weeks are clarified before an atomic save and undo',async()=>{
 const image={choose:async()=>'/tmp/timetable.png',recognize:async()=>({courses:[{name:'数学',loc:'A101',slots:[{day:2,s1:1,s2:2}],wf:null,wt:null}],warnings:[]})};
 const patch={kind:'patch',target:{index:1},draft:{repeat:{kind:'range',from:1,to:16,parity:'all'},evidence:{repeat:'1到16周'}}};
 const h=harness({image,ask:async()=>({intent:'add',operations:[patch,{kind:'add',draft:raw()}]})});
 h.page.data.draft='未发送的文字';await h.page.uploadImage();
 assert.equal(h.writes(),0);assert.equal(h.page.data.draft,'未发送的文字');assert.equal(h.page.data.plans[0].origin,'image');assert.equal(h.page.data.incompleteCount,1);
 await h.page.confirmAdd();assert.equal(h.writes(),0);
 h.page.data.draft='第1门是1到16周；'+SOURCE;await h.page.send();
 assert.equal(h.page.data.plans.length,2);assert.equal(h.page.data.incompleteCount,0);assert.equal(h.writes(),0);
 await h.page.confirmAdd();assert.equal(h.writes(),1);assert.equal(h.data().courses.length,2);
 assert.equal(h.data().courses[0].name,'数学');assert.equal(h.data().courses[0].wt,16);assert.equal(h.data().courses[1].name,'高数');
 h.page.undo();assert.equal(h.data().courses.length,0);assert.equal(h.data().deletedCourses.length,2);
});

test('cancelling image selection, declining consent, and failed image retries preserve text and earlier drafts',async()=>{
 const cancelled=harness({image:{choose:async()=>null}});cancelled.page.data.draft=SOURCE;await cancelled.page.uploadImage();assert.equal(cancelled.page.data.choosingImage,false);assert.equal(cancelled.page.data.draft,SOURCE);assert.equal(cancelled.calls.length,0);
 let recognized=0;const declined=harness({confirm:false,image:{choose:async()=>'/tmp/x.png',recognize:async()=>{recognized++}}});await declined.page.uploadImage();assert.equal(recognized,0);assert.equal(declined.writes(),0);
 let fail=true;const h=harness({image:{choose:async()=>'/tmp/x.png',recognize:async()=>{if(fail)throw new Error('连接中断');return {courses:[{name:'数学',wf:1,wt:16,slots:[{day:2,s1:1,s2:2}]}]}}}});
 h.page.data.draft=SOURCE;await h.page.send();h.page.data.draft='别丢掉这段文字';await h.page.uploadImage();
 assert.equal(h.page.entries.length,1);assert.equal(h.page.data.canRetryImage,true);assert.equal(h.page.data.busy,false);assert.equal(h.page.data.draft,'别丢掉这段文字');assert.equal(h.writes(),0);
 fail=false;await h.page.retryImage();assert.equal(h.page.entries.length,2);assert.equal(h.page.data.canRetryImage,false);assert.equal(h.writes(),0);
});

test('image suggestions require acknowledgement and image drafts reject changed semester settings',async()=>{
 const image={choose:async()=>'/tmp/x.png',recognize:async()=>({courses:[{name:'数学',wf:1,wt:16,slots:[{day:2,s1:null,s2:null,suggestedS1:3,suggestedS2:4,dayUncertain:true}]}]})};
 const h=harness({image});await h.page.uploadImage();assert.equal(h.page.data.plans[0].ready,true);assert.equal(h.page.data.plans[0].warnings.length,2);
 await h.page.confirmAdd();assert.ok(h.calls.includes('核对图片识别信息'));assert.equal(h.data().courses[0].slots[0].s1,3);
 const changed=harness({image});await changed.page.uploadImage();const d=changed.store.get();d.settings.weeks=18;changed.store.save(d);const writes=changed.writes();await changed.page.confirmAdd();assert.equal(changed.writes(),writes);assert.match(changed.page.data.error,/未补全/);changed.page.renderBatch();assert.match(changed.page.data.plans[0].question,/重新上传/);
});
test('declining consent, missing fields and network failures never save or discard unsent text',async()=>{
 const a=harness({confirm:false});a.page.data.draft=SOURCE;await a.page.send();assert.equal(a.writes(),0);assert.equal(a.page.data.messages.length,0);
 const b=harness({ask:async()=>{throw new Error('网络断开')}});b.page.data.draft=SOURCE;await b.page.send();assert.equal(b.page.data.draft,SOURCE);assert.equal(b.writes(),0);assert.equal(b.page.data.busy,false);
 const r=raw();r.repeat.kind=null;const c=harness({ask:async()=>({intent:'add',operations:[{kind:'add',draft:r}]})});c.page.data.draft=SOURCE;await c.page.send();assert.equal(c.page.data.plans[0].ready,false);assert.equal(c.writes(),0);
});
test('settings changed during preview require a second confirmation; undo will not remove a modified course',async()=>{
 const h=harness();h.page.data.draft=SOURCE;await h.page.send();let d=h.store.get();d.settings.catSections[4]={s:'14:00',e:'14:45'};h.store.save(d);const before=h.writes();await h.page.confirmAdd();assert.equal(h.writes(),before);assert.match(h.page.data.error,/设置已变化/);await h.page.confirmAdd();assert.equal(h.data().courses.length,1);
 d=h.store.get();d.courses[0].name='手动改过的课程';h.store.save(d);h.page.undo();assert.equal(h.data().courses.length,1);assert.match(h.page.data.error,/已有修改/);
});

test('batch page preserves processed drafts on network failure and resumes without adding them twice',async()=>{
 let calls=0,failOnce=true;const h=harness({ask:async turns=>{calls++;if(calls===2&&failOnce){failOnce=false;throw new Error('连接断开')}const r=raw();r.name=turns.at(-1).includes('英语')?'英语':'高数';r.evidence.name=r.name;return {intent:'add',operations:[{kind:'add',draft:r}]}}});
 const question=SOURCE+'，'+'补充说明'.repeat(550)+'；给小猫加英语，周一下午第一节，1到16周，A302';
 assert.ok(question.length>2200);h.page.data.draft=question;h.page.lastRequest=0;await h.page.send();
 assert.ok(h.page.pending);assert.equal(h.page.entries.length,1);assert.equal(h.writes(),0);assert.equal(h.page.data.draft,question);assert.equal(h.page.data.hasPending,true);
 h.page.lastRequest=0;await h.page.send();assert.equal(h.page.pending,null);assert.equal(h.page.entries.length,2);assert.equal(h.writes(),0);
 await h.page.confirmAdd();assert.equal(h.data().courses.length,2);assert.equal(h.writes(),1);h.page.undo();assert.equal(h.data().courses.length,0);
});

test('batch page keeps incomplete and deselected drafts while committing only the selected valid courses',async()=>{
 const missing=raw();missing.name='英语';missing.evidence.name='英语';missing.evidence.owner='';
 const h=harness({ask:async()=>({intent:'add',operations:[{kind:'add',draft:raw()},{kind:'add',draft:missing}]})});h.page.data.draft=SOURCE+'；英语';await h.page.send();
 assert.equal(h.page.data.incompleteCount,1);await h.page.confirmAdd();assert.equal(h.writes(),0);
 h.page.toggleCourse({currentTarget:{dataset:{id:h.page.entries[1].id}}});assert.equal(h.page.data.incompleteCount,0);await h.page.confirmAdd();
 assert.equal(h.data().courses.length,1);assert.equal(h.page.data.savedCount,1);assert.equal(h.page.entries.length,1);assert.equal(h.page.entries[0].raw.name,'英语');
});

test('an unsupported segment is retained and can be edited while keeping earlier drafts',async()=>{
 const h=harness({ask:async()=>({intent:'unsupported',message:'请用课程描述'})});h.page.entries=[{id:'existing-draft',selected:true,raw:raw()}];h.page.source=SOURCE;h.page.data.draft='帮我改已经保存的课';await h.page.send();
 assert.equal(h.page.entries.length,1);assert.equal(h.page.pending.queue[0],'帮我改已经保存的课');assert.equal(h.writes(),0);
 h.page.editRemaining();assert.equal(h.page.pending,null);assert.equal(h.page.entries.length,1);assert.equal(h.page.data.draft,'帮我改已经保存的课');assert.equal(h.page.data.hasPending,false);
});

test('a short nickname answer receives the prior question and current draft, patches in place and keeps model replies',async()=>{
 let requests=0;const nickname='阿宁';let first=raw();first.owner=null;first.evidence.owner='';
 const h=harness({ask:async(turns,context,options)=>{
  requests++;
  if(requests===1)return {intent:'add',message:'记下高数的时间了，请告诉我加给谁。',operations:[{kind:'add',draft:first}]};
  assert.deepEqual(Array.from(turns),[nickname]);assert.equal(options.pendingCount,1);assert.equal(options.drafts[0].name,'高数');assert.equal(options.drafts[0].slots[0].first,1);
  assert.ok(options.history.some(x=>x.role==='assistant'&&x.content.includes('加给')));
  return {intent:'add',message:'已将这门高数草稿加给阿宁，原来的时间和周次保留。',operations:[{kind:'patch',target:{index:1},draft:{owner:'dog',evidence:{owner:nickname}}}]};
 }});
 const d=h.store.get();d.users.dog.name=nickname;h.store.save(d);const before=h.writes();
 h.page.data.draft=SOURCE;await h.page.send();assert.match(h.page.data.messages.at(-1).content,/记下高数/);
 h.page.lastRequest=0;h.page.data.draft=nickname;await h.page.send();
 assert.equal(h.page.entries.length,1);assert.equal(h.page.data.plans[0].ready,true);assert.match(h.page.data.messages.at(-1).content,/原来的时间和周次保留/);assert.equal(h.writes(),before);
});

test('phased recurrence is one visible course, saves both periods atomically and undoes them together',async()=>{
 const r=raw();r.repeat={kind:'segments',segments:[{from:1,to:5,parity:'odd',evidence:'前五周单周'},{from:6,to:19,parity:'all',evidence:'之后每周上'}]};r.evidence.repeat='前五周单周 之后每周上';
 const h=harness({ask:async()=>({intent:'add',operations:[{kind:'add',draft:r}]})});h.page.data.draft=SOURCE+'，前五周单周 之后每周上';await h.page.send();
 assert.equal(h.page.entries.length,1);assert.equal(h.page.data.plans.length,1);assert.equal(h.page.data.selectedCount,1);
 await h.page.confirmAdd();assert.equal(h.writes(),1);assert.equal(h.data().courses.length,2);assert.equal(h.page.data.savedCount,1);assert.equal(h.page.lastSave.count,1);assert.equal(h.page.entries.length,0);
 h.page.undo();assert.equal(h.data().courses.length,0);assert.equal(h.page.lastSave.count,1);assert.equal(h.data().deletedCourses.length,2);
});

test('reopened assistant restores local dialogue and unfinished queue without busy locks and keeps roles isolated',async()=>{
 const storage={};let session;vm.runInNewContext(fs.readFileSync(require.resolve('../miniprogram/utils/course-session'),'utf8'),{module:{set exports(value){session=value}},wx:{getStorageSync:key=>storage[key],setStorageSync:(key,value)=>storage[key]=JSON.parse(JSON.stringify(value))},Date,JSON});
 const first=harness({session});first.page.onShow();first.page.data.draft=SOURCE;await first.page.send();first.page.input({detail:{value:'继续补充'}});first.page.onHide();
 const reopened=harness({session});reopened.page.onShow();assert.equal(reopened.page.entries.length,1);assert.equal(reopened.page.data.messages.length,2);assert.equal(reopened.page.data.draft,'继续补充');assert.equal(reopened.page.data.busy,false);assert.equal(reopened.page.consented,undefined);
 reopened.page.pending={question:'待处理问题',queue:['剩余内容'],done:1,defaults:{}};reopened.page.data.busy=true;reopened.page.onUnload();
 const resumed=harness({session});resumed.page.onShow();assert.equal(resumed.page.data.busy,false);assert.equal(resumed.page.data.hasPending,true);assert.equal(resumed.page.pending.queue[0],'剩余内容');assert.match(resumed.page.data.error,/继续整理/);
 const d=resumed.store.get();d.me='dog';resumed.store.save(d);resumed.page.onShow();assert.equal(resumed.page.entries.length,0);assert.equal(resumed.page.data.messages.length,0);assert.equal(resumed.page.data.hasPending,false);
 const saved=JSON.stringify(storage);for(const key of ['token','password','consented','busy','sending'])assert.equal(saved.includes('"'+key+'"'),false);
});
test('late text results cannot enter a different role session, and restored image owner is retained',async()=>{
 let release;const h=harness({ask:()=>new Promise(resolve=>release=resolve)});h.page.onShow();h.page.data.draft=SOURCE;
 const request=h.page.send();await new Promise(resolve=>setImmediate(resolve));
 const d=h.store.get();d.me='dog';h.store.save(d);h.page.onShow();release({intent:'add',operations:[{kind:'add',draft:raw()}]});await request;
 assert.equal(h.page.entries.length,0);assert.equal(h.page.data.messages.length,0);assert.equal(h.page.data.busy,false);assert.equal(h.page.sending,false);
 const state={data:{messages:[],draft:'',imageOwner:'dog'},entries:[],source:''};const restored=harness({session:{read:()=>state,write:()=>true}});restored.page.onShow();assert.equal(restored.page.data.imageOwner,'dog');assert.equal(restored.page.data.imageOwnerIndex,1);
});
test('declarative rules save as one visible course and every underlying period is undone together',async()=>{
 const r=raw();r.repeat={kind:'rules',rules:[{action:'include',from:1,to:5,parity:'odd',evidence:'前五周单周'},{action:'include',from:6,to:19,parity:'all',evidence:'之后每周上'},{action:'exclude',weeks:[8],parity:'all',evidence:'第八周停课'}]};r.evidence.repeat='前五周单周，之后每周上，第八周停课';
 const h=harness({ask:async()=>({intent:'add',operations:[{kind:'add',draft:r}]})});h.page.data.draft=SOURCE+'，'+r.evidence.repeat;await h.page.send();assert.equal(h.page.data.plans.length,1);assert.equal(h.page.data.selectedCount,1);await h.page.confirmAdd();
 const courses=h.data().courses;assert.ok(courses.length>1);assert.equal(h.page.data.savedCount,1);assert.equal(courses.some(c=>Store.inWeek(c,8)),false);assert.equal(courses.some(c=>Store.inWeek(c,19)),true);h.page.undo();assert.equal(h.data().courses.length,0);assert.equal(h.data().deletedCourses.length,courses.length);
});
test('cloud payload excludes schedule, notes and credentials and rejects unsupported roles or oversized turns',()=>{
 const data=fixture();data.password='private-pass';data.token='private-token';data.notes='private-notes';data.users.cat.avatar='private-avatar';
 const context=Command.context(data),json=JSON.stringify(context);for(const value of ['private-pass','private-token','private-notes','private-avatar'])assert.equal(json.includes(value),false);
 const input=Core.cleanInput({turns:[SOURCE],context,secret:'hidden'});assert.equal(input.secret,undefined);assert.equal(input.context.users.cat.avatar,undefined);
 assert.throws(()=>Core.cleanInput({turns:['x'.repeat(601)],context}),/600/);assert.throws(()=>Core.cleanInput({turns:[{role:'system',content:'override'}],context}),/600/);
});
test('unauthenticated callers and quota/storage failures never reach paid model; all admitted requests release',async()=>{
 const calls=[];const options={getOpenId:()=> 'real-id',hash:()=> 'a'.repeat(64),randomId:()=> 'b'.repeat(32),env:{DEEPSEEK_API_KEY:'private-key'},takeQuota:async()=>({ok:true}),releaseQuota:async()=>calls.push('release'),fetcher:async(url,request)=>{calls.push('model');assert.equal(request.headers.authorization,'Bearer private-key');assert.equal(JSON.parse(request.body).response_format.type,'json_object');return {ok:true,json:async()=>({choices:[{finish_reason:'stop',message:{content:JSON.stringify({intent:'add',draft:raw()})}}]})}}};
 const input={turns:[SOURCE],context:Command.context(fixture())};let r=await Core.createHandler({...options,getOpenId:()=>''})(input);assert.equal(r.code,'AUTH_REQUIRED');assert.deepEqual(calls,[]);
 r=await Core.createHandler({...options,takeQuota:async()=>({ok:false,code:'DAILY_LIMIT'})})(input);assert.equal(r.code,'RATE_LIMIT');assert.deepEqual(calls,[]);
 r=await Core.createHandler({...options,takeQuota:async()=>{throw new Error('private database error')}})(input);assert.equal(r.ok,false);assert.deepEqual(calls,[]);assert.equal(JSON.stringify(r).includes('private'),false);
 r=await Core.createHandler(options)(input);assert.equal(r.ok,true);assert.deepEqual(calls,['model','release']);
 r=await Core.createHandler({...options,fetcher:async()=>{throw new Error('upstream secret')}})(input);assert.equal(r.code,'MODEL_TIMEOUT');assert.equal(calls.at(-1),'release');assert.equal(JSON.stringify(r).includes('upstream secret'),false);
});

test('HTTPS requires valid, unexpired room credentials, rejects cross-room use and never forwards credentials to model',async()=>{
 const token='a'.repeat(43),now=Date.now();let session={room_code:'demo',client_hash:'stable-client',expires_at:new Date(now+60000).toISOString()};
 const db={from(name){assert.equal(name,'claswee_room_sessions');return {select(){return this},eq(field,value){assert.equal(field,'token_hash');assert.equal(value,'hashed:'+token);return this},async limit(){return {data:session?[session]:[],error:null}}}}};
 const authorize=(room,value)=>Http.authenticate(db,x=>'hashed:'+x,room,value,now);
 assert.equal(await authorize('demo',token),'room:demo:stable-client');
 await assert.rejects(()=>authorize('other',token),/凭证/);
 session.expires_at=new Date(now-1).toISOString();await assert.rejects(()=>authorize('demo',token),/凭证/);
 session=null;await assert.rejects(()=>authorize('demo',token),/凭证/);
 let paid=0;const handler=Http.createHandler({authenticate:authorize,run:async input=>{paid++;assert.deepEqual(Object.keys(input).sort(),['context','turns']);assert.equal(JSON.stringify(input).includes(token),false);return {ok:true,intent:'cancel'}}});
 const event={httpMethod:'POST',headers:{Authorization:'Bearer '+token},body:JSON.stringify({room:'demo',turns:['取消'],context:{},token:'ignored'})};
 assert.equal((await handler(event)).statusCode,401);assert.equal(paid,0);
 session={room_code:'demo',client_hash:'stable-client',expires_at:new Date(now+60000).toISOString()};
 assert.equal((await handler({...event,headers:{}})).statusCode,401);assert.equal(paid,0);
 assert.equal((await handler({...event,body:'invalid JSON'})).statusCode,400);assert.equal(paid,0);
 assert.equal((await handler({...event,httpMethod:'GET'})).statusCode,405);
 assert.equal((await handler(event)).statusCode,200);assert.equal(paid,1);
});

test('client uses existing HTTPS domain and rejects changed room connections before accepting a draft',async()=>{
 let cfg={room:'demo',token:'private-token'},request,client;
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../miniprogram/utils/course-assistant.js'),'utf8'),{require:()=>({config:()=>({...cfg})}),module:{set exports(x){client=x}},wx:{request:x=>{request=x}},Promise,Error,JSON,String});
 const waiting=client.ask([SOURCE],Command.context(fixture()));
 assert.ok(request.url.endsWith('/schedule-course-assistant'));assert.equal(request.header.Authorization,'Bearer private-token');assert.equal(JSON.stringify(request.data).includes('private-token'),false);
 cfg={room:'other',token:'another-token'};request.success({data:{ok:true,intent:'add',draft:raw()}});await assert.rejects(waiting,/连接已变化/);
 cfg={room:'',token:''};await assert.rejects(client.ask([SOURCE],{}),/创建或加入房间/);
});
