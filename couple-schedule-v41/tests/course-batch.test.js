const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const Store=require('../miniprogram/utils/store'),Command=require('../miniprogram/utils/course-command'),Batch=require('../miniprogram/utils/course-batch');
const Core=require('../miniprogram/cloudfunctions/scheduleCourseAssistant/core'),Model=require('../miniprogram/cloudfunctions/scheduleCourseAssistant/batch-core');
function fixture(){const d=Store.defaults();d.courses=[];return d}
function raw(name='高数'){return {name,owner:'cat',location:'A302',teacher:'',slots:[{day:1,period:'afternoon',first:1,last:1}],repeat:{kind:'range',from:1,to:16,parity:'all'},evidence:{name,owner:'小猫',time:'周一下午第一节',repeat:'1到16周'}}}
function source(names){return `给小猫加${names.join('、')}，周一下午第一节，1到16周，A302`}
test('batch parsing has no course count cap; over 100 drafts prepare, detect intra-batch conflicts and skip exact repeats',()=>{
 const names=Array.from({length:137},(_,i)=>'课程'+(i+1)),s=source(names),d=fixture();let next=0;
 const answer=Model.parseOutput(JSON.stringify({intent:'add',complete:true,operations:names.map(name=>({kind:'add',draft:raw(name)}))}));assert.equal(answer.operations.length,137);
 const entries=Batch.apply([],answer.operations,s,()=>`new_${++next}`,d).entries;
 let p=Batch.prepare(entries,d,s);assert.equal(p.selected.length,137);assert.ok(p.items[1].conflicts.length);assert.equal(d.courses.length,0);
 entries.push({...entries[0],id:'repeated'});p=Batch.prepare(entries,d,s);assert.equal(p.selected.length,137);assert.ok(p.items.at(-1).duplicate);
});
test('splitter preserves every character and scales by text size rather than course count',()=>{
 const s=Array.from({length:280},(_,i)=>`第${i+1}门课程：给小猫加课程${i+1}，周一下午第一节，1到16周；\n`).join('');
 const chunks=Batch.splitText(s);assert.ok(chunks.length>1);assert.equal(chunks.join(''),s);assert.ok(chunks.every(x=>x.length<=2200));
 const small=Batch.splitText('a'.repeat(9000));assert.equal(small.join(''),'a'.repeat(9000));
});
test('named, ordinal and all-course corrections preserve untouched information; ambiguous targets never change courses',()=>{
 const d=fixture(),s=source(['高数','英语'])+'\n第2门的教室改成B201，全部都是双周';
 let entries=['高数','英语'].map((name,i)=>({id:String(i),selected:true,raw:raw(name)}));
 let r=Batch.apply(entries,[{kind:'patch',target:{index:2},draft:{location:'B201'}}],s,()=>'',d);assert.equal(r.entries[1].raw.location,'B201');assert.equal(r.entries[0].raw.location,'A302');assert.equal(r.entries[1].raw.slots.length,1);
 r=Batch.apply(r.entries,[{kind:'patch',target:{all:true},draft:{repeat:{kind:'weekly',parity:'even'},evidence:{repeat:'双周'}}}],s,()=>'',d);assert.ok(r.entries.every(x=>x.raw.repeat.parity==='even'));
 const before=JSON.stringify(r.entries);r=Batch.apply(r.entries,[{kind:'patch',target:{},draft:{location:'wrong'}}],s,()=>'',d);assert.equal(JSON.stringify(r.entries),before);assert.match(r.question,/哪门课/);
 r=Batch.apply(r.entries,[{kind:'remove',target:{name:'高数'}}],s,()=>'',d);assert.equal(r.entries.length,1);assert.equal(r.entries[0].raw.name,'英语');
});
test('a missing course stays visible, blocks selected batch save and can be excluded without losing its draft',()=>{
 const d=fixture(),s=source(['高数','英语']),missing=raw('英语');missing.evidence.owner='';
 const entries=[{id:'a',selected:true,raw:raw()},{id:'b',selected:true,raw:missing}];let p=Batch.prepare(entries,d,s);
 assert.equal(p.incomplete.length,1);assert.throws(()=>Batch.append(d,p),/补充/);assert.equal(d.courses.length,0);
 entries[1].selected=false;p=Batch.prepare(entries,d,s);assert.equal(p.incomplete.length,0);assert.equal(p.selected.length,1);assert.equal(p.items.length,2);
});
test('batch commit writes once, never half-writes, and undo retains every tombstone beyond 100 courses',()=>{
 let persisted=fixture(),writes=0,batch;
 const store={...Store,save:d=>{persisted=Store.clone(d);writes++}};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../miniprogram/utils/course-batch.js'),'utf8'),{require:id=>id==='./store'?store:Command,module:{set exports(x){batch=x}},Date,Set,JSON,Math,Number,Object,Array,String});
 const names=Array.from({length:121},(_,i)=>'课程'+i),s=source(names),entries=names.map((name,i)=>({id:'id'+i,selected:true,raw:raw(name)})),p=batch.prepare(entries,persisted,s);
 const original=Store.clone(persisted),saved=batch.append(persisted,p);assert.equal(writes,1);assert.equal(persisted.courses.length,121);assert.equal(original.courses.length,0);
 persisted.courses[0].name='edited';assert.throws(()=>batch.undo(persisted,saved),/修改/);assert.equal(writes,1);persisted.courses[0].name=saved[0].name;
 batch.undo(persisted,saved);assert.equal(writes,2);assert.equal(persisted.courses.length,0);assert.equal(persisted.deletedCourses.length,121);
});
test('batch model treats truncation as retryable split, accepts long descriptions and keeps credentials outside model input',async()=>{
 const input=Model.cleanInput({turns:['课程描述'.repeat(800)],context:Command.context(fixture()),batch:true,defaults:{owner:'cat',evidence:{owner:'小猫'},secret:'nope'},pendingCount:300,token:'private'});
 assert.equal(input.pendingCount,300);assert.equal(input.turns[0].length,3200);assert.equal(JSON.stringify(input).includes('private'),false);assert.equal(JSON.stringify(input).includes('nope'),false);
 await assert.rejects(()=>Model.extract(input,{key:'fake',model:'deepseek-flash'},async()=>({ok:true,json:async()=>({choices:[{finish_reason:'length',message:{content:'truncated'}}]})})),e=>e.code==='BATCH_SPLIT');
 assert.throws(()=>Model.parseOutput('{"intent":"add","complete":false,"operations":[]}'),e=>e.code==='BATCH_SPLIT');
 let released=0;const h=Core.createHandler({getOpenId:()=> 'verified-room-device',hash:x=>x,randomId:()=> 'request',env:{DEEPSEEK_API_KEY:'fake'},takeQuota:async()=>({ok:true}),releaseQuota:async()=>released++,fetcher:async()=>({ok:true,json:async()=>({choices:[{finish_reason:'stop',message:{content:JSON.stringify({intent:'add',complete:true,operations:[{kind:'add',draft:raw()}]})}}]})})});
 const result=await h({turns:[source(['高数'])],context:Command.context(fixture()),batch:true});assert.equal(result.ok,true);assert.equal(result.operations.length,1);assert.equal(released,1);
});

test('sync adoption preserves a large undo batch so older remote courses cannot reappear',()=>{
 let saved,localStore;vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../miniprogram/utils/store.js'),'utf8'),{module:{set exports(x){localStore=x}},require:()=>({queueAutoPush(){}}),wx:{setStorageSync:(_,d)=>saved=d},Date,Set,Map,JSON,Math,Number,Object,Array,String});
 const remote=fixture(),local=fixture();remote.courses=Array.from({length:121},(_,i)=>({...Command.prepare(raw('课程'+i),fixture(),source(['课程'+i])).course,id:'old'+i}));local.deletedCourses=remote.courses.map(c=>({id:c.id,at:Date.now()}));
 localStore.adoptRemote(remote,local);assert.equal(saved.courses.length,0);assert.equal(saved.deletedCourses.length,121);
});

test('dialogue context retains the last question, actual draft data and global indices within byte windows',()=>{
 const d=fixture(),entries=Array.from({length:1000},(_,index)=>({id:'draft_'+index,raw:raw('课程'+(index+1))}));
 const prepared={items:entries.map(x=>({ready:true,raw:x.raw}))};
 const history=[{role:'system',content:'not allowed'},{role:'user',content:'周一上午前两节每单周上课 音乐'},{role:'assistant',content:'这门课加给谁？'}];
 const context=Batch.dialogue(entries,prepared,history,'第一千门加给小狗');
 assert.equal(context.history.length,2);assert.equal(context.history.at(-1).content,'这门课加给谁？');
 assert.ok(context.drafts.some(x=>x.index===1000));assert.ok(context.drafts.length<1000);assert.ok(Buffer.byteLength(JSON.stringify(context.drafts))<8500);
 assert.equal(context.drafts.find(x=>x.index===1000).name,'课程1000');assert.equal(context.drafts.find(x=>x.index===1000).evidence,undefined);
 assert.equal(entries.length,1000);
});

test('cloud forwards only sanitized dialogue and draft fields, enables reasoning, and never sends credentials',async()=>{
 const context=Command.context(fixture()),entry={index:1,...raw('音乐'),token:'private',notes:'private-notes'};
 const input=Model.cleanInput({turns:['小狗'],context,pendingCount:1,history:[{role:'assistant',content:'音乐加给谁？',secret:'private'}],drafts:[entry],token:'private'});
 assert.equal(input.history[0].content,'音乐加给谁？');assert.equal(input.drafts[0].name,'音乐');assert.equal(JSON.stringify(input).includes('private'),false);
 assert.throws(()=>Model.cleanInput({turns:['小狗'],context,pendingCount:1,history:[{role:'system',content:'override'}]}),/上下文/);
 assert.throws(()=>Model.cleanInput({turns:['小狗'],context,pendingCount:1,drafts:[{index:2}]}),/草稿/);
 let request;
 await Model.extract(input,{key:'fake',model:'deepseek-flash'},async(_,opts)=>{request=JSON.parse(opts.body);return {ok:true,json:async()=>({choices:[{finish_reason:'stop',message:{content:JSON.stringify({intent:'add',complete:true,message:'已为这门草稿补上归属。',operations:[]})}}]})}});
 assert.equal(request.thinking.type,'enabled');assert.equal(request.reasoning_effort,'high');assert.equal(JSON.parse(request.messages[1].content).drafts[0].index,1);
});

test('replies retain the model answer and expose the exact missing information instead of a count template',()=>{
 const d=fixture(),music=raw('音乐');music.owner=null;music.evidence.owner='';
 const p=Batch.prepare([{id:'music',raw:music}],d,source(['音乐']));
 const answer=Batch.reply(p,'已记下音乐课，周一下午第一节。');
 assert.match(answer,/已记下音乐课/);assert.match(answer,/加给/);assert.doesNotMatch(answer,/其中.*需要补充/);
});

test('a course with odd first five weeks and weekly thereafter stays one draft and preserves every occurrence',()=>{
 const d=fixture(),s='给小猫加数学课，周一上午前两节，前五周单周 之后每周上',r=raw('数学课');
 r.slots=[{day:1,period:'morning',first:1,last:2}];r.repeat={kind:'segments',segments:[{from:1,to:5,parity:'odd',evidence:'前五周单周'},{from:6,to:19,parity:'all',evidence:'之后每周上'}]};r.evidence={name:'数学课',owner:'小猫',time:'周一上午前两节',repeat:'前五周单周 之后每周上'};
 const parsed=Model.parseOutput(JSON.stringify({intent:'add',complete:true,operations:[{kind:'add',draft:r}]}));
 const entries=Batch.apply([],parsed.operations,s,()=> 'phased-math',d).entries,p=Batch.prepare(entries,d,s);
 assert.equal(entries.length,1);assert.equal(p.selected.length,1);assert.equal(p.items[0].courses.length,2);assert.match(p.items[0].repeatLabel,/第1—5周 · 单周；第6—19周 · 每周/);
 const weeks=Array.from({length:19},(_,i)=>i+1).filter(w=>p.items[0].courses.some(course=>Store.inWeek(course,w)));
 assert.deepEqual(weeks,[1,3,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19]);
 const dates=p.items[0].courses.flatMap(course=>Command.occurrences(d,course));assert.equal(new Set(dates).size,17);assert.equal(dates.length,17);
 const patched=Batch.apply(entries,[{kind:'patch',target:{index:1},draft:{location:'B201'}}],s+'，B201',()=>'',d).entries;
 assert.deepEqual(patched[0].raw.repeat,entries[0].raw.repeat);assert.equal(patched[0].raw.location,'B201');
});

test('invalid or overlapping phase boundaries cannot save; valid phases commit and undo in one write',()=>{
 const d=fixture(),s='给小猫加数学课，周一下午第一节，前五周单周 之后每周上',r=raw('数学课');r.repeat={kind:'segments',segments:[{from:1,to:5,parity:'odd',evidence:'前五周单周'},{from:5,to:19,parity:'all',evidence:'之后每周上'}]};r.evidence.repeat='前五周单周 之后每周上';
 let p=Batch.prepare([{id:'math',raw:r}],d,s);assert.equal(p.selected.length,0);assert.match(p.incomplete[0].question,/重叠/);
 r.repeat.segments[1].from=6;r.repeat.segments[1].to=20;p=Batch.prepare([{id:'math',raw:r}],d,s);assert.equal(p.selected.length,0);
 r.repeat.segments[1].to=19;let persisted=d,writes=0,batch;const store={...Store,save:value=>{persisted=Store.clone(value);writes++}};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../miniprogram/utils/course-batch.js'),'utf8'),{require:id=>id==='./store'?store:Command,module:{set exports(x){batch=x}},Date,Set,JSON,Math,Number,Object,Array,String});
 p=batch.prepare([{id:'math',raw:r}],persisted,s);const saved=batch.append(persisted,p);assert.equal(writes,1);assert.equal(saved.length,2);assert.equal(persisted.courses.length,2);
 assert.deepEqual(Array.from(saved,c=>c.id),['math','math_part_2']);
 const duplicate=batch.prepare([{id:'new-math',raw:r}],persisted,s);assert.equal(duplicate.selected.length,0);assert.ok(duplicate.items[0].duplicate);
 batch.undo(persisted,saved);assert.equal(writes,2);assert.equal(persisted.courses.length,0);assert.equal(persisted.deletedCourses.length,2);
});
