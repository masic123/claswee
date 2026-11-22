import { http } from './platform';
import { uuid, validateCourse, clone } from './timetable';
const API='https://masic-blog-d6g6d4r87bc035c0e-1324333320.ap-shanghai.app.tcloudbase.com/schedule-image-import';
export async function readImage(file,maxWidth=2000){
  if(!file.type.startsWith('image/')||file.size>20*1024*1024)throw new Error('请选择不超过 20MB 的图片');
  const bitmap=await createImageBitmap(file);
  const scale=Math.min(1,maxWidth/Math.max(bitmap.width,bitmap.height));
  const canvas=document.createElement('canvas');canvas.width=Math.round(bitmap.width*scale);canvas.height=Math.round(bitmap.height*scale);
  const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close();
  const value=canvas.toDataURL('image/jpeg',0.86);
  if(value.length>4*1024*1024)throw new Error('图片较大，请裁剪后重试');
  return value;
}
export async function recognizeImage(dataUrl,data,owner,clientId,status){
  const sections=clone(data.settings[`${owner}Sections`]);
  const context={owner,weeks:data.settings.weeks,sections,sectionCount:sections.length,lunchAfter:data.settings.lunchAfter,dinnerAfter:data.settings.dinnerAfter};
  const uploadId=uuid('img'),base64=dataUrl.split(',')[1],size=80000,count=Math.ceil(base64.length/size);
  const request=payload=>http(API,{clientId,...context,...payload},75000,{'X-Claswee-Client':clientId});
  try{
    const part=partIndex=>request({action:'upload',uploadId,partIndex,partCount:count,mime:'jpeg',content:base64.slice(partIndex*size,(partIndex+1)*size)});
    await part(0);status(`正在上传 1/${count}…`);
    for(let start=1;start<count;start+=4){const settled=await Promise.allSettled(Array.from({length:Math.min(4,count-start)},(_,i)=>part(start+i)));const failed=settled.find(item=>item.status==='rejected');if(failed)throw failed.reason;status(`正在上传 ${Math.min(start+4,count)}/${count}…`);}
    status('正在识别文字位置…');
    const prepared=await request({action:'prepare',uploadId}).catch(()=>({ocrReady:false,message:'文字定位暂不可用，请仔细核对识别结果'}));
    status('正在识别课程，请稍等…');const result=await request({action:'recognize',uploadId});
    if(!prepared.ocrReady)result.warnings=[prepared.message,...(result.warnings||[])];
    return {warnings:result.warnings||[],courses:(result.courses||[]).map(item=>({name:String(item.name||''),loc:item.loc||'',teacher:item.teacher||'',owner,slots:(item.slots||[]).map(slot=>({day:slot.day,s1:slot.s1||slot.suggestedS1||null,s2:slot.s2||slot.suggestedS2||null,sectionEstimated:!slot.s1||!slot.s2,dayUncertain:!!slot.dayUncertain})),week:item.week==='custom'?(['odd','even'].includes(item.customParity)?item.customParity:'all'):(['odd','even'].includes(item.week)?item.week:'all'),customParity:item.customParity||'all',wf:Number.isInteger(item.wf)?item.wf:1,wt:Number.isInteger(item.wt)?item.wt:data.settings.weeks,wfDefaulted:!Number.isInteger(item.wf),wtDefaulted:!Number.isInteger(item.wt),weekDefaulted:!Number.isInteger(item.wf)||!Number.isInteger(item.wt),warning:item.warning||''})).filter(item=>item.name&&item.slots.length)};
  }catch(error){request({action:'cancel',uploadId}).catch(()=>{});throw error;}
}
export function deduplicateCourses(courses,data){
  const key=course=>JSON.stringify([course.owner,course.name.trim(),course.loc||'',course.teacher||'',course.slots,course.week,course.wf,course.wt,course.customParity]);
  const known=new Set(data.courses.map(key));
  return courses.map(course=>validateCourse(course,data)).filter(course=>{const signature=key(course);if(known.has(signature))return false;known.add(signature);return true;});
}
