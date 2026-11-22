'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const APPID='wxc13d31ebd28f8f40';
const REQUIRED=['config','setConfig','ready','createRoom','joinRoom','claimLegacy','changePassword','leaveRoom','push','pull','queueAutoPush','lastSyncText','writeText','readFile','errorMessage','message'];
function check(project){
 const root=fs.realpathSync(project),config=JSON.parse(fs.readFileSync(path.join(root,'project.config.json'),'utf8'));
 if(config.appid!==APPID)throw new Error('发布检查失败：不是正式 AppID');
 if(/(?:^|[\\/])(?:artifacts|capture-project|isolated-project)(?:[\\/]|$)/i.test(root)||fs.existsSync(path.join(root,'claswee.test-only.json')))throw new Error('发布检查失败：这是测试工程');
 const program=path.resolve(root,config.miniprogramRoot||'.');
 const syncSource=fs.readFileSync(path.join(program,'utils/sync.js'),'utf8');
 const appSource=fs.readFileSync(path.join(program,'app.js'),'utf8');
 if(/demoConnection|ai-isolated-check/.test(syncSource+appSource))throw new Error('发布检查失败：含测试替身');
 const module={exports:{}};
 vm.runInNewContext(syncSource,{module,require(){throw new Error('同步模块启动时出现未声明依赖')},setTimeout,clearTimeout,wx:{}},{timeout:1000});
 const missing=REQUIRED.filter(name=>typeof module.exports[name]!=='function');
 if(missing.length)throw new Error('发布检查失败：同步模块缺少 '+missing.join(', '));
 if(!appSource.includes('Sync.autoPull')&&!appSource.includes('Sync.pull('))throw new Error('发布检查失败：缺少正式同步启动逻辑');
 return {project:root,appid:APPID,syncMethods:REQUIRED.length,joinRoom:true,source:'production'};
}
if(require.main===module){try{console.log(JSON.stringify(check(process.argv[2]||path.resolve(__dirname,'../miniprogram'))))}catch(e){console.error(e.message);process.exitCode=1}}
module.exports={check,REQUIRED};
