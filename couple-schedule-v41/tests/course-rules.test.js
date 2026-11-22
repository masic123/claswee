const test=require('node:test'),assert=require('node:assert/strict');
const Store=require('../miniprogram/utils/store'),Command=require('../miniprogram/utils/course-command'),Batch=require('../miniprogram/utils/course-batch');
const Model=require('../miniprogram/cloudfunctions/scheduleCourseAssistant/batch-core'),Http=require('../miniprogram/cloudfunctions/scheduleCourseAssistant/http');
function fixture(){const d=Store.defaults();d.courses=[];return d}
const source='给小猫加数学课，周一上午前两节，前五周单周，之后每周，第八周停课，第2、4、7周，从第2周开始每3周一次，前4周周一第1节A101，5到19周周三第3节B201，第6周周三第3节停课';
const slot=(day=1,first=1,last=2)=>({day,period:'day',first,last});
const rule=(from,to,parity='all',evidence='之后每周')=>({action:'include',from,to,parity,evidence});
function draft(rules){return {name:'数学课',owner:'cat',location:'',teacher:'',slots:[slot()],repeat:{kind:'rules',rules},evidence:{name:'数学课',owner:'小猫',time:'周一上午前两节',repeat:'前五周单周，之后每周'}}}
function plan(raw){return Command.prepare(Model.parseOutput(JSON.stringify({intent:'add',complete:true,operations:[{kind:'add',draft:raw}]})).operations[0].draft,fixture(),source)}
function weeks(p){return Array.from({length:19},(_,i)=>i+1).filter(w=>p.courses.some(c=>Store.inWeek(c,w)))}
test('rules preserve phased parity and exclude a week, with exact calendar dates and no duplicate occurrences',()=>{
 const p=plan(draft([rule(1,5,'odd','前五周单周'),rule(6,19),{action:'exclude',weeks:[8],parity:'all',evidence:'第八周停课'}]));
 assert.equal(p.ready,true);assert.deepEqual(weeks(p),[1,3,5,6,7,9,10,11,12,13,14,15,16,17,18,19]);
 const dates=p.courses.flatMap(c=>Command.occurrences(fixture(),c));assert.equal(dates.length,16);assert.equal(new Set(dates).size,16);assert.match(p.repeatLabel,/停课：第八周停课/);
});
test('explicit week sets, anchored intervals and absolute parity are calculated by the compiler',()=>{
 let p=plan(draft([{action:'include',weeks:[2,4,7,7],parity:'all',evidence:'第2、4、7周'}]));assert.equal(p.ready,true);assert.deepEqual(weeks(p),[2,4,7]);
 p=plan(draft([{...rule(2,19,'all','从第2周开始每3周一次'),interval:3,anchor:2}]));assert.deepEqual(weeks(p),[2,5,8,11,14,17]);
 p=plan(draft([rule(6,19,'odd')]));assert.deepEqual(weeks(p),[7,9,11,13,15,17,19]);
});
test('per-rule times and classrooms stay within their own weeks, with a scoped cancellation',()=>{
 const a={...rule(1,4,'all','前4周周一第1节A101'),slots:[slot(1,1,1)],timeEvidence:'周一第1节',location:'A101'};
 const b={...rule(5,19,'all','5到19周周三第3节B201'),slots:[slot(3,3,3)],timeEvidence:'周三第3节',location:'B201'};
 const off={action:'exclude',weeks:[6],parity:'all',evidence:'第6周周三第3节停课',slots:[slot(3,3,3)],timeEvidence:'周三第3节'};
 const p=plan(draft([a,b,off]));assert.equal(p.ready,true);
 assert.ok(p.courses.filter(c=>c.wt<=4).every(c=>c.day===1&&c.loc==='A101'));
 assert.ok(p.courses.filter(c=>c.wf>=5).every(c=>c.day===3&&c.loc==='B201'));assert.equal(weeks(p).includes(6),false);
 assert.equal(p.courses.flatMap(c=>Command.occurrences(fixture(),c)).length,18);
});
test('overlapping includes deduplicate, partial section exceptions remove only the affected section',()=>{
 const p=plan(draft([rule(1,19),rule(1,19),{action:'exclude',weeks:[6],parity:'all',evidence:'第6周周三第3节停课',slots:[slot(1,1,1)],timeEvidence:'周一第1节'}]));
 assert.equal(p.ready,true);const sixth=p.courses.filter(c=>Store.inWeek(c,6));assert.equal(sixth.length,1);assert.equal(sixth[0].s1,2);assert.equal(sixth[0].s2,2);
 assert.equal(p.courses.flatMap(c=>Command.occurrences(fixture(),c)).length,19);
});
test('invalid weeks, missing interval anchors, ungrounded rules and all-excluded schedules cannot save',()=>{
 for(const rules of [[rule(1,40)],[{...rule(1,19),interval:2}],[{...rule(1,19),interval:'invalid',anchor:1}],[rule(1,19,'invalid')],[{...rule(1,19),evidence:'编造的安排'}],[rule(1,19),{...rule(1,19),action:'exclude'}],[{...rule(1,19),action:'run-code'}]]){
  const p=plan(draft(rules));assert.equal(p.ready,false);assert.ok(p.question);
 }
 const r=draft([rule(1,19)]);r.slots=[];assert.match(plan(r).question,/第几节/);
 const overlaps=plan(draft([{...rule(1,19),slots:[slot(1,1,2)],timeEvidence:'周一上午前两节',location:'A101'},{...rule(1,19),slots:[slot(1,2,3)],timeEvidence:'周一上午前两节',location:'B201'}]));assert.equal(overlaps.ready,false);assert.match(overlaps.question,/不同教室/);
});
test('patching common fields retains rules, batch staging sees every period and save remains atomic',()=>{
 const r=draft([rule(1,5,'odd','前五周单周'),rule(6,19)]),entries=[{id:'math',raw:r}];
 const updated=Batch.apply(entries,[{kind:'patch',target:{index:1},draft:{location:'A101'}}],source,()=>'',fixture()).entries;
 assert.deepEqual(updated[0].raw.repeat,r.repeat);
 const p=Batch.prepare([...entries,{id:'second',raw:draft([rule(8,8)])}],fixture(),source);assert.ok(p.items[1].conflicts.length);assert.equal(p.selected.length,2);
});
test('HTTPS negotiates the rule schema and older clients receive only their supported instructions',async()=>{
 let input;const token='a'.repeat(43),handler=Http.createHandler({authenticate:async()=> 'verified',run:async value=>{input=value;return {ok:true,intent:'add'}}});
 await handler({httpMethod:'POST',headers:{Authorization:'Bearer '+token},body:JSON.stringify({room:'demo',batch:true,schemaVersion:2,turns:['数学课'],context:Command.context(fixture())})});assert.equal(input.schemaVersion,2);
 for(const schemaVersion of [1,2]){
  const clean=Model.cleanInput({...input,schemaVersion});let prompt;
  await Model.extract(clean,{key:'fake',model:'deepseek-flash'},async(_,opts)=>{prompt=JSON.parse(opts.body).messages[0].content;return {ok:true,json:async()=>({choices:[{finish_reason:'stop',message:{content:JSON.stringify({intent:'add',complete:true,operations:[]})}}]})}});
  if(schemaVersion===2)assert.match(prompt,/声明式repeat.kind=rules/);else assert.match(prompt,/当前客户端只支持weekly\/range\/date/);
 }
});
test('a malformed model answer is repaired before any operations are returned, while incomplete batches still split',async()=>{
 let requests=0;
 const input=Model.cleanInput({schemaVersion:2,turns:['数学课'],context:Command.context(fixture())});
 const result=await Model.extract(input,{key:'fake',model:'deepseek-flash'},async(_,options)=>{
  requests++;const messages=JSON.parse(options.body).messages;
  if(requests===2){assert.equal(messages[2].role,'assistant');assert.match(messages[3].content,/JSON结构校验/)}
  return {ok:true,json:async()=>({choices:[{finish_reason:'stop',message:{content:requests===1?'{"intent":"add",broken':JSON.stringify({intent:'add',complete:true,operations:[],message:'请补充时间'})}}]})};
 });
 assert.equal(requests,2);assert.equal(result.message,'请补充时间');assert.equal(result.operations.length,0);
});
