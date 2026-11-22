const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const Store=require('../miniprogram/utils/store');
function client({file,respond,cancelled=()=>false}){
 let exported;const calls=[];
 const wx={getFileSystemManager:()=>({readFile:o=>o.success({data:file})}),request:o=>{calls.push(o.data);const response=respond?respond(o.data):{ok:true,ocrReady:true,courses:[]};if(response instanceof Error)o.fail({errMsg:response.message});else o.success({data:response,statusCode:200})}};
 vm.runInNewContext(fs.readFileSync(require.resolve('../miniprogram/utils/course-image'),'utf8'),{module:{set exports(v){exported=v}},require:()=>({config:()=>({clientId:'test-image-client',room:'private-room',token:'private-token'})}),wx,Date,Math,Promise,Error,JSON,Set});
 return {calls,run:()=>exported.recognize('/tmp/x.png',Store.defaults(),'dog',{cancelled})};
}
test('photo uploads all bounded chunks before recognition and sends only required image context',async()=>{
 const file='/9j/'+ 'A'.repeat(210000),h=client({file});await h.run();
 const chunks=h.calls.filter(c=>c.action==='upload');assert.equal(chunks.length,3);assert.equal(chunks.map(x=>x.content).join(''),file);assert.ok(chunks.every(x=>x.content.length<=80000));
 assert.equal(h.calls.at(-1).action,'recognize');assert.equal(h.calls.at(-1).owner,'dog');
 assert.equal(JSON.stringify(h.calls).includes('private-token'),false);assert.equal(JSON.stringify(h.calls).includes('private-room'),false);assert.ok(h.calls.every(x=>!('courses' in x)&&!('notes' in x)));
});
test('OCR failure falls back to image recognition and failed recognition cleans temporary chunks',async()=>{
 const fallback=client({file:'iVBORabc',respond:p=>p.action==='prepare'?new Error('OCR timeout'):{ok:true,courses:[]}});const r=await fallback.run();assert.ok(r.warnings.length);assert.equal(fallback.calls.at(-1).action,'recognize');
 const failed=client({file:'iVBORabc',respond:p=>p.action==='recognize'?new Error('network timeout'):{ok:true,ocrReady:true}});await assert.rejects(failed.run(),/超时/);assert.equal(failed.calls.at(-1).action,'cancel');
});
test('oversized, unsupported and abandoned images do not reach the service',async()=>{
 for(const [file,cancelled] of [['iVBOR'+'x'.repeat(4*1024*1024),false],['not-a-photo',false],['iVBORabc',true]]){const h=client({file,cancelled:()=>cancelled});await assert.rejects(h.run());assert.equal(h.calls.length,0)}
});
function picker(wx){let exported;vm.runInNewContext(fs.readFileSync(require.resolve('../miniprogram/utils/course-image'),'utf8'),{module:{set exports(v){exported=v}},require:()=>({}),wx,Date,Math,Promise,Error,JSON,Set});return exported}
test('modern image picker preserves small originals and compresses oversized files before upload',async()=>{
 let compressions=0;const modern=picker({chooseMedia:o=>o.success({tempFiles:[{tempFilePath:'/tmp/original.jpg',size:10000}]}),compressImage(){compressions++}});
 assert.equal(await modern.choose(),'/tmp/original.jpg');assert.equal(compressions,0);
 const large=picker({chooseMedia:o=>o.success({tempFiles:[{tempFilePath:'/tmp/large.jpg',size:4*1024*1024}]}),compressImage:o=>{assert.equal(o.src,'/tmp/large.jpg');o.success({tempFilePath:'/tmp/smaller.jpg'})}});
 assert.equal(await large.choose(),'/tmp/smaller.jpg');
});
test('legacy picker fallback works without chooseMedia, and cancelling it does not become an error',async()=>{
 const legacy=picker({chooseImage:o=>o.success({tempFilePaths:['/tmp/legacy.png'],tempFiles:[{path:'/tmp/legacy.png',size:9000}]})});assert.equal(await legacy.choose(),'/tmp/legacy.png');
 const cancelled=picker({chooseImage:o=>o.fail({errMsg:'chooseImage:fail cancel'})});assert.equal(await cancelled.choose(),null);
});
