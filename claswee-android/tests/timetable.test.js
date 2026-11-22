import test from 'node:test';
import assert from 'node:assert/strict';
import { defaults, clone, mergeSchedules, coursesOnDate, validateCourse, validateBackup, sharedFree, weekDates } from '../src/lib/timetable.js';
import { makeConnection, afterFailure, sameConnection } from '../src/lib/connection.js';

test('two partners retain their own semester weeks across a common calendar',()=>{
  const data=defaults();data.settings.catStart='2026-08-31';data.settings.dogStart='2026-09-07';
  data.courses=[{...data.courses[0],id:'cat',owner:'cat',slots:[{day:1,s1:1,s2:2}],week:'odd',wf:1,wt:19},{...data.courses[0],id:'dog',owner:'dog',slots:[{day:1,s1:3,s2:4}],week:'odd',wf:1,wt:19}];
  assert.deepEqual(coursesOnDate(data,new Date(2026,8,7)).map(x=>x.id),['dog']);
  assert.equal(weekDates(data,2)[0].getDate(),7);
});
test('shared free time combines different school section times',()=>{
  const data=defaults();data.settings.catStart=data.settings.dogStart='2026-08-31';
  data.courses=[{...data.courses[0],id:'cat',owner:'cat',slots:[{day:1,s1:1,s2:2}],week:'all',wf:1,wt:19}];
  const free=sharedFree(data,new Date(2026,7,31));
  assert.equal(free[0].start,'08:00');assert.equal(free[0].end,'08:30');assert.equal(free[1].start,'10:05');
});
test('sync merges simultaneous edits without discarding the other partner courses or settings',()=>{
  const base=defaults(),local=clone(base),remote=clone(base);
  local.courses[0].name='本机修改的数学';local.settings.catStart='2026-09-07';local.me='dog';
  remote.courses[3].name='对方修改的数据结构';remote.settings.dogStart='2026-09-14';remote.users.dog.name='阿屿';
  const merged=mergeSchedules(remote,local,base);
  assert.equal(merged.courses[0].name,'本机修改的数学');assert.equal(merged.courses[3].name,'对方修改的数据结构');
  assert.equal(merged.settings.catStart,'2026-09-07');assert.equal(merged.settings.dogStart,'2026-09-14');assert.equal(merged.users.dog.name,'阿屿');assert.equal(merged.me,'dog');
});
test('course deletion tombstones win over an offline update',()=>{
  const base=defaults(),local=clone(base),remote=clone(base),id=base.courses[0].id;
  local.courses[0].name='离线修改';remote.courses.shift();remote.deletedCourses.push({id,at:Date.now()});
  assert.ok(!mergeSchedules(remote,local,base).courses.some(c=>c.id===id));
});
test('remotely deleted unchanged courses do not reappear',()=>{
  const base=defaults(),remote=clone(base);remote.courses.shift();
  assert.equal(mergeSchedules(remote,clone(base),base).courses.length,base.courses.length-1);
});
test('room credentials survive network errors, timeouts, and expired-session responses',()=>{
  const connection={room:'ourroom',token:'test-credential',clientId:'android_device_123456'};
  for(const code of ['NETWORK_ERROR','SERVER_ERROR','TIMEOUT','UNAUTHORIZED']){
    const next=afterFailure(connection,{code});assert.ok(sameConnection(connection,next));assert.equal(next.needsAuth,code==='UNAUTHORIZED'?true:undefined);
  }
  assert.equal(makeConnection(connection,()=>{throw new Error('must not regenerate');}).clientId,connection.clientId);
  assert.throws(()=>makeConnection({room:'room'},()=>''),/不完整/);
});
test('course and backup validation reject broken periods and unrelated files',()=>{
  const data=defaults(),course=clone(data.courses[0]);course.slots[0].s2=99;
  assert.throws(()=>validateCourse(course,data),/节次/);assert.throws(()=>validateBackup({courses:[]}),/备份/);
  assert.equal(validateBackup({format:'claswee-android-backup',data}).courses.length,data.courses.length);
});
