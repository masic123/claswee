const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {check}=require('../tools/release-preflight');
test('release source exports every room operation; the test project is never publishable',()=>{
 const production=check(path.resolve(__dirname,'../miniprogram'));assert.equal(production.joinRoom,true);assert.equal(production.source,'production');
 const isolated=path.resolve(__dirname,'../artifacts/ai-course-add-20261107/isolated-project');if(fs.existsSync(isolated))assert.throws(()=>check(isolated),/测试工程|正式 AppID/);
});
test('a missing joinRoom or a test replacement fails release even with a formal AppID',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'claswee-release-'));try{
  fs.mkdirSync(path.join(dir,'utils'));fs.writeFileSync(path.join(dir,'project.config.json'),JSON.stringify({appid:'wxc13d31ebd28f8f40',miniprogramRoot:'.'}));
  fs.writeFileSync(path.join(dir,'app.js'),"App({onLaunch(){Sync.pull()}})");
  fs.writeFileSync(path.join(dir,'utils/sync.js'),"module.exports={config(){},ready(){},pull(){}};");assert.throws(()=>check(dir),/缺少.*joinRoom/);
  fs.writeFileSync(path.join(dir,'utils/sync.js'),"module.exports={config:()=>getApp().globalData.demoConnection}");assert.throws(()=>check(dir),/测试替身/);
 }finally{fs.rmSync(dir,{recursive:true,force:true})}
});
