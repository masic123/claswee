const Store=require('./store');
const Command=require('./course-command');
function splitText(value,size=2200){
 const parts=[];let rest=String(value);
 while(rest.length>size){
  let at=0;const head=rest.slice(0,size),pattern=/[\n；;。]/g;let match;
  while((match=pattern.exec(head)))if(match.index>=size/3)at=match.index+1;
  if(!at){const commas=/[，,]/g;while((match=commas.exec(head)))if(match.index>=size/2)at=match.index+1}
  if(!at)at=size;
  parts.push(rest.slice(0,at));rest=rest.slice(at);
 }
 if(rest)parts.push(rest);return parts;
}
function mergeRaw(previous,patch){
 const next=Store.clone(previous||{});next.evidence=next.evidence||{};
 for(const field of ['name','owner','location','teacher'])if(patch[field])next[field]=patch[field];
 if(patch.slots&&patch.slots.length)next.slots=Store.clone(patch.slots);
 if(patch.repeat&&patch.repeat.kind)next.repeat=Store.clone(patch.repeat);
 for(const field of ['name','owner','time','repeat'])if(patch.evidence&&patch.evidence[field])next.evidence[field]=patch.evidence[field];
 return next;
}
function byteSize(value){
 const text=typeof value==='string'?value:JSON.stringify(value);let bytes=0;
 for(let i=0;i<text.length;i++){const c=text.charCodeAt(i);if(c<128)bytes++;else if(c<2048)bytes+=2;else if(c>=0xd800&&c<=0xdbff&&i+1<text.length&&text.charCodeAt(i+1)>=0xdc00&&text.charCodeAt(i+1)<=0xdfff){bytes+=4;i++}else bytes+=3}
 return bytes;
}
// These are context windows, not limits on the number of pending courses.
// Keep global indices so a course outside the window can still be targeted.
function dialogue(entries,prepared,messages,current){
 const history=[];let historyBytes=0;
 for(const message of (messages||[]).slice().reverse()){
  if(!['user','assistant'].includes(message.role)||typeof message.content!=='string'||!message.content.trim())continue;
  const item={role:message.role,content:message.content};const size=byteSize(item);
  if(historyBytes+size>6000)break;history.unshift(item);historyBytes+=size;
 }
 const ordinals=[];const pattern=/第\s*([0-9]+|[一二两三四五六七八九十百千]+)\s*(?:门|个|条)/g;let match;
 const chinese=value=>{if(/^\d+$/.test(value))return +value;const digits={'一':1,'二':2,'两':2,'三':3,'四':4,'五':5,'六':6,'七':7,'八':8,'九':9},units={'十':10,'百':100,'千':1000};let n=0,d=0;for(const c of value){if(units[c]){n+=(d||1)*units[c];d=0}else d=digits[c]||0}return n+d};
 while((match=pattern.exec(String(current))))ordinals.push(chinese(match[1])-1);
 const priorities=entries.map((entry,index)=>{const name=String(entry.raw.name||'').replace(/课$/,'');return {index,priority:ordinals.includes(index)?0:name&&String(current).includes(name)?1:prepared&&prepared.items[index]&&!prepared.items[index].ready?2:3}}).sort((a,b)=>a.priority-b.priority||b.index-a.index);
 const drafts=[];let draftBytes=0;
 for(const item of priorities){
  const entry=entries[item.index],raw=entry.raw||{},p=prepared&&prepared.items[item.index];
  const summary={index:item.index+1,selected:entry.selected!==false,name:raw.name||null,owner:raw.owner||null,location:raw.location||'',teacher:raw.teacher||'',slots:raw.slots||[],repeat:raw.repeat||{},question:p&&p.question||''};
  const size=byteSize(summary);if(draftBytes+size>8000)continue;drafts.push(summary);draftBytes+=size;
 }
 drafts.sort((a,b)=>a.index-b.index);return {history,drafts};
}
function reply(plan,message){
 const text=typeof message==='string'?message.trim():'';
 if(!plan.items.length)return text||'说说要添加的课程、星期和节次，我会先整理成草稿。';
 const missing=plan.incomplete;
 if(missing.length){
  if(text&&/[？?]/.test(text))return text;
  const questions=missing.slice(0,3).map(item=>`第${plan.items.indexOf(item)+1}门${item.raw.name?'“'+item.raw.name+'”':''}：${item.question}`).join('\n');
  return [text,`还需要确认：\n${questions}`,missing.length>3?`其余${missing.length-3}门的待补充项见草稿。`:''].filter(Boolean).join('\n');
 }
 return text||`已整理${plan.items.length}门课程草稿。请核对下方草稿，点“确认添加”后才会保存。`;
}
function apply(entries,operations,source,makeId,data){
 const next=Store.clone(entries),questions=[];
 for(const op of operations){
  if(op.kind==='add'){next.push({id:makeId(),selected:true,raw:Store.clone(op.draft)});continue}
  const t=op.target||{};let matches;
  if(t.all)matches=next.slice();
  else if(t.index)matches=next[t.index-1]?[next[t.index-1]]:[];
  else if(t.name&&source.includes(t.name))matches=next.filter(x=>x.raw.name===t.name&&(!t.owner||Command.ownerFromEvidence(x.raw,data,source)===t.owner));
  else matches=next.length===1?next.slice():[];
  if(!matches.length||!t.all&&matches.length!==1){questions.push('请指明要补充哪门课，例如“第2门的教室是B201”，或说“全部都是1到16周”。');continue}
  if(op.kind==='remove'){const ids=new Set(matches.map(x=>x.id));for(let i=next.length-1;i>=0;i--)if(ids.has(next[i].id))next.splice(i,1)}
  else for(const item of matches){item.raw=mergeRaw(item.raw,op.draft);if(op.draft.slots&&op.draft.slots.length)item.imageReview=[]}
 }
 return {entries:next,question:questions[0]||''};
}
function prepare(entries,data,source){
 const staged=Store.clone(data),items=[];
 for(const entry of entries){
  const p=entry.imageSettings&&entry.imageSettings!==JSON.stringify(data.settings)?{ready:false,question:'学期或节次已变化，请重新上传这张课表图片。'}:Command.prepare(entry.raw,staged,source);
  items.push({id:entry.id,selected:entry.selected!==false,raw:entry.raw,...p});
  if(entry.selected!==false&&p.ready&&!p.duplicate)(p.courses||[p.course]).forEach((course,index)=>staged.courses.push({...course,id:index?`${entry.id}_part_${index+1}`:entry.id}));
 }
 const selected=items.filter(x=>x.selected&&x.ready&&!x.duplicate),incomplete=items.filter(x=>x.selected&&!x.ready);
 return {items,selected,incomplete,signature:JSON.stringify(items.map(x=>({id:x.id,selected:x.selected,ready:x.ready,signature:x.signature,duplicate:x.duplicate,conflicts:x.conflicts}))) };
}
function append(data,plan){
 if(plan.incomplete.length)throw new Error('还有课程需要补充信息，请补全或取消勾选后再添加');
 if(!plan.selected.length)throw new Error('请先选择要添加的课程');
 const next=Store.clone(data),saved=[];
 for(const p of plan.selected){
  for(const [index,value] of (p.courses||[p.course]).entries()){
   const id=index?`${p.id}_part_${index+1}`:p.id;
   if(next.courses.some(c=>c.id===id||Command.sameCourse(c,value)))throw new Error('草稿中有重复课程，请重新核对');
   const course={...Store.clone(value),id};next.courses.push(course);saved.push(course);
  }
 }
 // One write commits the full selection; storage failure cannot leave half a batch.
 Store.save(next);return saved;
}
function undo(data,saved){
 const next=Store.clone(data),ids=new Set(saved.map(c=>c.id));
 for(const course of saved){const current=next.courses.find(c=>c.id===course.id);if(!current||!Command.sameCourse(current,course))throw new Error('本批课程已有修改或删除，请到课表中核对后再操作')}
 next.courses=next.courses.filter(c=>!ids.has(c.id));
 const at=Date.now();next.deletedCourses=next.deletedCourses.concat(saved.map(c=>({id:c.id,at})));
 Store.save(next);
}
module.exports={splitText,mergeRaw,dialogue,reply,apply,prepare,append,undo};
