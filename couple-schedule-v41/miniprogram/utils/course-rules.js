// Compile declarative AI rules to the existing range/slot course format.
// The model describes intent; only this compiler decides actual teaching weeks.
function compile(raw,data,source,prepare,Store){
 const bad=question=>({ready:false,question}),rules=raw.repeat.rules;
 if(!Array.isArray(rules)||!rules.length||!raw.evidence||!raw.evidence.repeat||!source.includes(raw.evidence.repeat))return bad('请说明要在哪些周上课，以及哪些周例外。');
 const grounded=value=>typeof value==='string'&&!!value&&source.includes(value);
 const selected=rule=>{
  if(!grounded(rule.evidence))throw new Error('请保留每条周次规则的原话，再说明具体安排。');
  let weeks;
  if(Array.isArray(rule.weeks)&&rule.weeks.length){
   if(rule.weeks.some(w=>!Number.isInteger(w)||w<1||w>data.settings.weeks))throw new Error(`指定周次须在第1—${data.settings.weeks}周内。`);
   weeks=[...new Set(rule.weeks)].sort((a,b)=>a-b);
  }else{
   if(!Number.isInteger(rule.from)||!Number.isInteger(rule.to)||rule.from<1||rule.to<rule.from||rule.to>data.settings.weeks)throw new Error(`请说明有效周次，范围是第1—${data.settings.weeks}周。`);
   weeks=Array.from({length:rule.to-rule.from+1},(_,i)=>rule.from+i);
  }
  if(!['all','odd','even'].includes(rule.parity))throw new Error('请说明规则中的每周、单周或双周。');
  weeks=weeks.filter(w=>rule.parity==='all'||w%2===(rule.parity==='odd'?1:0));
  if(rule.interval!==undefined){
   if(!Number.isInteger(rule.interval)||rule.interval<1||rule.interval>data.settings.weeks||!Number.isInteger(rule.anchor)||rule.anchor<1||rule.anchor>data.settings.weeks)throw new Error('请说明每隔几周上一次，以及从第几周开始。');
   weeks=weeks.filter(w=>w>=rule.anchor&&(w-rule.anchor)%rule.interval===0);
  }
  if(!weeks.length)throw new Error('这条周次规则没有选中任何一周，请核对起止周和间隔。');
  return weeks;
 };
 const calendar=new Map(),exclusions=[],missing=[];
 const key=slot=>`${slot.day}:${slot.s1}:${slot.s2}`;
 try{
  for(const rule of rules){
   if(!rule||!['include','exclude'].includes(rule.action))return bad('请说明每条规则是上课还是停课。');
   const weeks=selected(rule);
   if(rule.action==='exclude'&&!(rule.slots&&rule.slots.length)){exclusions.push({weeks});continue}
   const hasSlots=Array.isArray(rule.slots)&&rule.slots.length;
   if(hasSlots&&!grounded(rule.timeEvidence))return bad('请说明这段安排在星期几、第几节上课。');
   if(rule.location!==undefined&&!source.includes(rule.location)||rule.teacher!==undefined&&!source.includes(rule.teacher))return bad('请核对这段安排的教室和老师。');
   const phase={...raw,...(rule.location!==undefined?{location:rule.location}:{}),...(rule.teacher!==undefined?{teacher:rule.teacher}:{}),slots:hasSlots?rule.slots:raw.slots,repeat:{kind:'range',from:weeks[0],to:weeks.at(-1),parity:'all'},evidence:{...raw.evidence,repeat:rule.evidence,...(hasSlots?{time:rule.timeEvidence}:{})}};
   const part=prepare(phase,data,source);
   if(!part.ready){missing.push(...(part.missing||[part.question]));continue}
   if(rule.action==='exclude'){exclusions.push({weeks,slots:part.course.slots});continue}
   for(const week of weeks){
    if(!calendar.has(week))calendar.set(week,new Map());
    const slots=calendar.get(week);
    for(const slot of part.course.slots){
     const contradictory=[...slots.values()].some(previous=>previous.day===slot.day&&previous.s1<=slot.s2&&slot.s1<=previous.s2&&(previous.loc!==part.course.loc||previous.teacher!==part.course.teacher));
     if(contradictory)return bad(`第${week}周同一时段有不同教室或老师，请说明采用哪一条。`);
     slots.set(key(slot),{...part.course,slots:[slot],...slot,wf:week,wt:week});
    }
   }
  }
 }catch(error){return bad(error.message)}
 if(missing.length){const unique=[...new Set(missing)];return {ready:false,question:unique.slice(0,2).join('\n'),missing:unique}}
 for(const rule of exclusions)for(const week of rule.weeks){
  if(!rule.slots){calendar.delete(week);continue}
  const slots=calendar.get(week);if(!slots)continue;
  // A scoped exception may remove only part of a multi-section lesson.
  for(const [id,course] of [...slots]){
   const slot=course.slots[0],remaining=[];
   for(let section=slot.s1;section<=slot.s2;section++)if(!rule.slots.some(s=>s.day===slot.day&&section>=s.s1&&section<=s.s2))remaining.push(section);
   slots.delete(id);
   for(const section of remaining){const piece={day:slot.day,s1:section,s2:section};slots.set(key(piece),{...course,...piece,slots:[piece]})}
  }
 }
 const groups=new Map();
 for(const [week,items] of [...calendar].sort((a,b)=>a[0]-b[0])){
  // Combine adjacent sections and slots, then compress equal consecutive weeks.
  const variants=new Map();
  for(const course of items.values()){
   const id=JSON.stringify([course.owner,course.name,course.loc,course.teacher]);
   if(!variants.has(id))variants.set(id,{course,sections:new Set()});
   for(let section=course.s1;section<=course.s2;section++)variants.get(id).sections.add(`${course.day}:${section}`);
  }
  for(const {course,sections} of variants.values()){
   const slots=[];
   for(const value of [...sections].map(x=>x.split(':').map(Number)).sort((a,b)=>a[0]-b[0]||a[1]-b[1])){
    const last=slots.at(-1);if(last&&last.day===value[0]&&last.s2+1===value[1])last.s2=value[1];else slots.push({day:value[0],s1:value[1],s2:value[1]});
   }
   const next={...course,...slots[0],slots,wf:week,wt:week};
   const id=JSON.stringify([course.owner,course.name,course.loc,course.teacher,slots]);
   if(!groups.has(id))groups.set(id,[]);
   const list=groups.get(id),last=list.at(-1);if(last&&last.wt+1===week)last.wt=week;else list.push(next);
  }
 }
 const courses=[...groups.values()].flat();
 if(!courses.length)return bad('这些停课规则排除了全部上课时间，请核对后再添加。');
 return {courses,ruleLabels:rules.map(r=>`${r.action==='exclude'?'停课':'上课'}：${r.evidence}${r.timeEvidence&&r.timeEvidence!==r.evidence?' · '+r.timeEvidence:''}${r.location?' · '+r.location:''}`)};
}
module.exports={compile};
