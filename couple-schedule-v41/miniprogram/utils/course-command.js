const Store = require('./store');
const Grid = require('./schedule-grid');
const DAYS = ['周一','周二','周三','周四','周五','周六','周日'];
function today(now = Date.now()) { return new Date(Number(now)+28800000).toISOString().slice(0,10); }
function minutes(value) { const m=/^(\d{2}):(\d{2})$/.exec(String(value||''));return m&&+m[1]<24&&+m[2]<60?+m[1]*60+ +m[2]:null; }
function dateValue(key) { if(!/^\d{4}-\d{2}-\d{2}$/.test(String(key)))return null;const [y,m,d]=key.split('-').map(Number),date=new Date(y,m-1,d);return Store.dateKey(date)===key?date:null; }
function context(data) {
  const users={};for(const owner of ['cat','dog'])users[owner]={name:String(data.users[owner].name).slice(0,30),start:Store.ownerStart(data,owner),sections:(owner==='dog'?data.settings.dogSections:data.settings.catSections).map(x=>({s:x.s,e:x.e}))};
  return {today:today(),me:data.me,weeks:data.settings.weeks,users};
}
function sameCourse(a,b) {
  const normalize=c=>({owner:c.owner,name:String(c.name).trim(),loc:c.loc||'',teacher:c.teacher||'',weeks:Array.from({length:40},(_,i)=>i+1).filter(w=>Store.inWeek(c,w)),slots:(c.slots||[{day:c.day,s1:c.s1,s2:c.s2}]).map(s=>({day:+s.day,s1:+s.s1,s2:+s.s2})).sort((x,y)=>x.day-y.day||x.s1-y.s1||x.s2-y.s2)});
  return JSON.stringify(normalize(a))===JSON.stringify(normalize(b));
}
function occurrences(data,course) {
  const first=dateValue(Store.calendarStart(data));const count=Store.calendarWeeks(data)*7;const dates=[];
  for(let i=0;i<count;i++){const date=new Date(first);date.setDate(date.getDate()+i);if(Grid.activeSlots(data,[course],date).length)dates.push(Store.dateKey(date))}
  return dates;
}
function findConflicts(data,course) {
  const sections=course.owner==='dog'?data.settings.dogSections:data.settings.catSections;
  const others=data.courses.filter(x=>x.owner===course.owner),found=[];const seen=new Set();
  for(const key of occurrences(data,course)){
    const date=dateValue(key),newSlots=Grid.activeSlots(data,[course],date),oldSlots=Grid.activeSlots(data,others,date);
    for(const a of newSlots)for(const b of oldSlots){
      const as=minutes(sections[a.slot.s1-1].s),ae=minutes(sections[a.slot.s2-1].e),bs=minutes((sections[b.slot.s1-1]||{}).s),be=minutes((sections[b.slot.s2-1]||{}).e);
      if(bs!==null&&be!==null&&as<be&&bs<ae&&!seen.has(b.course.id)){seen.add(b.course.id);found.push(`${key} ${b.course.name}`)}
    }
    if(found.length>=3)break;
  }
  return found.slice(0,3);
}
function ownerFromEvidence(raw,data,source) {
  const evidence=raw.evidence&&raw.evidence.owner;
  if(typeof evidence!=='string'||!evidence||!source.includes(evidence))return null;
  if(/^(我|本人|自己|给我|我的)$/.test(evidence))return data.me;
  if(/^(对方|对象|TA|ta|另一半|给对方|给对象)$/.test(evidence))return data.me==='cat'?'dog':'cat';
  const cat=evidence.includes('小猫')||evidence.includes(data.users.cat.name),dog=evidence.includes('小狗')||evidence.includes(data.users.dog.name);
  return cat&&!dog?'cat':dog&&!cat?'dog':null;
}
function prepare(raw,data,source) {
  if(raw&&raw.repeat&&raw.repeat.kind==='rules')return prepareRules(raw,data,String(source||''));
  if(raw&&raw.repeat&&raw.repeat.kind==='segments')return prepareSegments(raw,data,String(source||''));
  source=String(source||'');const missing=[],warnings=[];
  const ask=text=>{if(!missing.includes(text))missing.push(text)};
  if(!raw||typeof raw!=='object')return {ready:false,question:'请说说想加什么课，例如“给小猫加高数，每周一下午第一节，1到16周”。'};
  const name=typeof raw.name==='string'?raw.name.trim():'';
  if(!name||name.length>80||!source.includes(name))ask('这门课叫什么名字？');
  const owner=ownerFromEvidence(raw,data,source);if(!owner)ask(`这门课加给${data.users.cat.name}，还是${data.users.dog.name}？`);
  const sections=owner==='dog'?data.settings.dogSections:data.settings.catSections;
  const timeEvidence=raw.evidence&&raw.evidence.time;
  const slots=[];
  if(!Array.isArray(raw.slots)||!raw.slots.length||typeof timeEvidence!=='string'||!timeEvidence||!source.includes(timeEvidence))ask('星期几、第几节上课？');
  else for(const slot of raw.slots){
    if(!slot||!Number.isInteger(slot.day)||slot.day<1||slot.day>7){ask('星期几上课？');continue}
    if(!Number.isInteger(slot.first)||!Number.isInteger(slot.last)||slot.first<1||slot.last<slot.first){ask('从第几节到第几节？只上一节也可以。');continue}
    if(!['day','morning','afternoon','evening'].includes(slot.period)){ask('请说明是上午、下午的第几节，还是全天的第几节。');continue}
    if(!owner)continue;
    if(sections.some(s=>minutes(s.s)===null||minutes(s.e)===null||minutes(s.e)<=minutes(s.s))){ask('作息表有未设置完整的时间，请先到设置中核对。');continue}
    const indexes=sections.map((s,i)=>({i:i+1,start:minutes(s.s),end:minutes(s.e)})).filter(s=>s.start!==null&&s.end!==null&&s.end>s.start&&(
      slot.period==='day'||slot.period==='morning'&&s.start<750||slot.period==='afternoon'&&s.start>=750&&s.start<1080||slot.period==='evening'&&s.start>=1080));
    const a=indexes[slot.first-1],b=indexes[slot.last-1];
    if(!a||!b||b.i-a.i!==slot.last-slot.first||b.end<=a.start){ask('这段节次不在已设置的作息表中，请核对节次或先修改设置。');continue}
    slots.push({day:slot.day,s1:a.i,s2:b.i});
  }
  const repeat=raw.repeat||{},repeatEvidence=raw.evidence&&raw.evidence.repeat;
  let wf,wt,date=null;
  if(!['weekly','range','date'].includes(repeat.kind)||typeof repeatEvidence!=='string'||!repeatEvidence||!source.includes(repeatEvidence))ask('只加某一天，还是每周上课？可说“每周，第1到16周”。');
  else if(repeat.kind==='weekly'){wf=1;wt=data.settings.weeks;warnings.push(`按整个学期第1—${wt}周添加。`)}
  else if(repeat.kind==='range'){
    wf=repeat.from;wt=repeat.to;
    if(!Number.isInteger(wf)||!Number.isInteger(wt)||wf<1||wt<wf||wt>data.settings.weeks)ask(`请说明有效周次，范围是第1—${data.settings.weeks}周。`);
  }else{
    date=dateValue(repeat.date);
    if(!date)ask('请说明具体上课日期，例如“2026年11月9日”。');
    else if(owner){
      wf=wt=Store.weekForDate(data,owner,date);
      if(wf<1||wf>data.settings.weeks)ask('这个日期不在所选人的学期内，请核对日期或开学设置。');
      if(slots.some(s=>s.day!==(date.getDay()||7)))ask('日期和星期没有对上，请核对具体日期。');
    }
  }
  const parity=repeat.parity||'all';if(!['all','odd','even'].includes(parity))ask('请说明每周、单周还是双周上课。');
  if(missing.length)return {ready:false,question:missing.slice(0,2).join('\n'),missing};
  const optional=key=>typeof raw[key]==='string'&&source.includes(raw[key])?raw[key].trim().slice(0,100):'';
  const unique=slots.filter((s,i,list)=>list.findIndex(x=>JSON.stringify(x)===JSON.stringify(s))===i);
  const course={owner,name,loc:optional('location'),teacher:optional('teacher'),week:'custom',wf,wt,customParity:parity,slots:unique};
  if(!unique.length)return {ready:false,question:'请核对上课时间。'};
  Object.assign(course,unique[0]);
  if(!Array.from({length:wt-wf+1},(_,i)=>wf+i).some(w=>Store.inWeek(course,w)))return {ready:false,question:'周次范围与单双周不匹配，请重新说明。'};
  const dates=occurrences(data,course);
  if(date&&(dates.length!==1||dates[0]!==Store.dateKey(date)))return {ready:false,question:'这天涉及调休或补课，不能直接表示为一次课程。请先在设置中核对这天的安排，再手动加课。'};
  if(!dates.length)return {ready:false,question:'这门课在所选周次没有实际上课日期，请核对调休与周次。'};
  const timeLabels=unique.map(s=>`${DAYS[s.day-1]} · 第${s.s1}${s.s2===s.s1?'':`—${s.s2}`}节 · ${sections[s.s1-1].s}—${sections[s.s2-1].e}`);
  const repeatLabel=date?Store.dateKey(date):`第${wf}—${wt}周 · ${parity==='odd'?'单周':parity==='even'?'双周':'每周'}`;
  const duplicate=data.courses.find(c=>sameCourse(c,course));
  return {ready:true,course,ownerName:data.users[owner].name,timeLabels,repeatLabel,warnings,duplicate:duplicate&&duplicate.id||'',conflicts:duplicate?[]:findConflicts(data,course),
    signature:JSON.stringify({course,ownerStart:Store.ownerStart(data,owner),times:unique.map(s=>[sections[s.s1-1],sections[s.s2-1]])})};
}
function prepareRules(raw,data,source){
 const result=require('./course-rules').compile(raw,data,source,prepare,Store);
 if(!result.courses)return result;
 const parts=result.courses.filter(course=>occurrences(data,course).length);
 if(!parts.length)return {ready:false,question:'这些安排没有实际上课日期，请核对调休和周次。'};
 const existing=parts.map(course=>data.courses.find(c=>sameCourse(c,course)));
 if(existing.some(Boolean)&&!existing.every(Boolean))return {ready:false,question:'其中一段已经在课表里，请先核对已有课程，再添加剩余周次。'};
 const owner=parts[0].owner,sections=owner==='dog'?data.settings.dogSections:data.settings.catSections;
 const labels=parts.flatMap(course=>course.slots.map(s=>`${DAYS[s.day-1]} · 第${s.s1}${s.s2===s.s1?'':`—${s.s2}`}节 · ${sections[s.s1-1].s}—${sections[s.s2-1].e}`));
 return {ready:true,course:parts[0],courses:parts,ownerName:data.users[owner].name,timeLabels:[...new Set(labels)],repeatLabel:result.ruleLabels.join('；'),warnings:[],conflicts:existing.every(Boolean)?[]:[...new Set(parts.flatMap(course=>findConflicts(data,course)))],duplicate:existing.every(Boolean)?existing.map(c=>c.id).join(','):'',signature:JSON.stringify({parts,settings:data.settings,ownerStart:Store.ownerStart(data,owner)})};
}
function prepareSegments(raw,data,source){
 const repeat=raw.repeat,segments=repeat.segments,evidence=raw.evidence&&raw.evidence.repeat;
 if(!Array.isArray(segments)||!segments.length||segments.length>data.settings.weeks||!evidence||!source.includes(evidence))return {ready:false,question:'请说清每一段的周次和单双周安排。'};
 const occupied=new Set(),parts=[];
 for(const segment of segments){
  if(!segment||!Number.isInteger(segment.from)||!Number.isInteger(segment.to)||segment.from<1||segment.to<segment.from||segment.to>data.settings.weeks||!['all','odd','even'].includes(segment.parity)||!segment.evidence||!source.includes(segment.evidence))return {ready:false,question:`请说明有效的分段周次，范围是第1—${data.settings.weeks}周。`};
  for(let week=segment.from;week<=segment.to;week++){if(occupied.has(week))return {ready:false,question:'分段周次有重叠，请说明分界周属于哪一段。'};occupied.add(week)}
  const phase={...raw,repeat:{kind:'range',from:segment.from,to:segment.to,parity:segment.parity},evidence:{...raw.evidence,repeat:segment.evidence}};
  parts.push(prepare(phase,data,source));
 }
 const incomplete=parts.filter(part=>!part.ready);
 if(incomplete.length){const missing=[...new Set(incomplete.flatMap(part=>part.missing||[part.question]))];return {ready:false,question:missing.slice(0,2).join('\n'),missing}}
 const courses=parts.map(part=>part.course),existing=parts.filter(part=>part.duplicate);
 if(existing.length&&existing.length!==parts.length)return {ready:false,question:'其中一段已经在课表里，请先核对已有课程，再添加剩余周次。'};
 return {...parts[0],courses,repeatLabel:parts.map(part=>part.repeatLabel).join('；'),warnings:[...new Set(parts.flatMap(part=>part.warnings||[]))],conflicts:[...new Set(parts.flatMap(part=>part.conflicts||[]))],duplicate:existing.length?existing.map(part=>part.duplicate).join(','):'',signature:JSON.stringify(parts.map(part=>part.signature))};
}
function append(data,plan,id) {
  if(data.courses.some(c=>c.id===id||sameCourse(c,plan.course)))throw new Error('这门课已经存在，不会重复添加');
  const course=Object.assign({id},Store.clone(plan.course));data.courses.push(course);Store.save(data);return course;
}
function undo(data,saved) {
  const current=data.courses.find(x=>x.id===saved.id);
  if(!current)throw new Error('这门课已不在课表中');
  if(!sameCourse(current,saved))throw new Error('课程已有修改，请到课表中核对后再删除');
  data.courses=data.courses.filter(x=>x.id!==saved.id);data.deletedCourses.push({id:saved.id,at:Date.now()});Store.save(data);
}
module.exports={today,context,prepare,append,undo,sameCourse,occurrences,ownerFromEvidence};
