<script>
import { toRefs } from 'vue';
import controller from '../controllers/sync.js';
import { useMiniPage, rpxStyle } from '../runtime';
import MiniPicker from '../MiniPicker.vue';
import MiniSwitch from '../MiniSwitch.vue';
export default { name:'MiniSync', components:{MiniPicker,MiniSwitch}, props:{query:Object}, setup(props) {
  const page = useMiniPage(controller, props.query || {}, ["skin","invitedRoom","busy","invitation","connected","room","mode","passwordEditor","password","confirmPassword","oldPassword","newPassword","newPasswordConfirm","status","lastSync","fileStatus","showMessageComposer"], 'Sync');
  return { ...toRefs(page.data), fire:page.fire, rpxStyle };
}};
</script>
<template>
<div :class="&quot;app-skin skin-&quot; + (skin)">
<div class="card room-card">
  <div class="title">安全房间</div>
  <span class="hint">创建房间时自行设置密码。加入同一房间的另一台设备必须输入正确密码。</span>
  <div v-if="invitedRoom" class="invite-banner"><span>对方邀请你加入 {{invitedRoom}}</span><button @click="fire('acceptInvite', $event, {})" :disabled="busy" type="button">切换并填写密码</button></div>
  <div v-if="invitation" class="invite-banner"><span>房间码已经填好，输入对方告诉你的密码即可。</span></div>
  <div v-if="connected" class="connected"><div><span class="connected-label">当前房间</span><span class="room-code">{{room}}</span></div><span class="badge">已连接</span></div>
  <template v-else>
    <div class="modes"><button data-mode="join" @click="fire('mode', $event, {&quot;mode&quot;:(&quot;join&quot;)})" :class="mode==='join'?'on':''" type="button">加入房间</button><button data-mode="create" @click="fire('mode', $event, {&quot;mode&quot;:(&quot;create&quot;)})" :class="mode==='create'?'on':''" type="button">创建房间</button></div>
    <input maxlength="64" placeholder="房间码：例如 love2026" :value="room" data-key="room" @input="fire('input', $event, {&quot;key&quot;:(&quot;room&quot;)})" :disabled="busy" />
    <template v-if="!passwordEditor">
    <input maxlength="72" placeholder="房间密码（至少6位）" :value="password" data-key="password" @input="fire('input', $event, {&quot;key&quot;:(&quot;password&quot;)})" type="password" />
    <input v-if="mode==='create'" maxlength="72" placeholder="再次输入密码" :value="confirmPassword" data-key="confirmPassword" @input="fire('input', $event, {&quot;key&quot;:(&quot;confirmPassword&quot;)})" type="password" />
    <button class="primary" :disabled="busy" @click="fire('enterRoom', $event, {})" type="button">{{mode==='create'?'创建并上传当前课表':'验证密码并加入'}}</button>
    <span v-if="mode==='create'" class="notice">新房间码不区分大小写；已被使用或属于旧房间的房间码不能重复创建。</span>
    <span v-else class="notice">旧房间首次加入时，会提示把当前输入的密码设为该房间的新密码。</span>
    </template>
  </template>
  <button class="leave" @click="fire('togglePasswordEditor', $event, {})" :disabled="busy" type="button">{{passwordEditor?'取消修改密码':'修改房间密码'}}</button>
  <div v-if="passwordEditor">
    <span class="hint">验证旧密码后即可修改。已连接的设备继续同步，之后加入须使用新密码。</span>
    <input maxlength="72" placeholder="旧密码" :value="oldPassword" data-key="oldPassword" @input="fire('input', $event, {&quot;key&quot;:(&quot;oldPassword&quot;)})" :disabled="busy" type="password" />
    <input maxlength="72" placeholder="新密码（6–72位）" :value="newPassword" data-key="newPassword" @input="fire('input', $event, {&quot;key&quot;:(&quot;newPassword&quot;)})" :disabled="busy" type="password" />
    <input maxlength="72" placeholder="再次输入新密码" :value="newPasswordConfirm" data-key="newPasswordConfirm" @input="fire('input', $event, {&quot;key&quot;:(&quot;newPasswordConfirm&quot;)})" :disabled="busy" type="password" />
    <button class="primary" @click="fire('changePassword', $event, {})" :disabled="busy" type="button">验证旧密码并修改</button>
  </div>
  <span class="status">{{status}}</span><span v-if="connected" class="last">上次同步：{{lastSync}}</span>
  <div v-if="connected" class="actions"><button @click="fire('push', $event, {})" type="button">上传课表</button><button @click="fire('pull', $event, {})" type="button">拉取课表</button></div>
  <button v-if="connected" class="invite-button" @click="fire('invite', $event, {&quot;shareKind&quot;:(&quot;room-invite&quot;)})" data-share-kind="room-invite" type="button">邀请对方一起看课表 ↗</button>
  <span v-if="connected" class="invite-note">邀请卡片会帮对方填好房间码，密码请另行告诉对方。</span>
  <button v-if="connected" class="leave" @click="fire('leave', $event, {})" :disabled="busy" type="button">退出当前房间</button>
</div>
<div class="card message-card"><div class="message-heading"><span class="message-heart">♡</span><div><div class="title">给对方留个言</div><span class="message-subtitle">下次打开，就能遇见你的心意。</span></div></div><button class="invite-button" @click="fire('openMessage', $event, {})" :disabled="!connected" type="button">写一张小纸条</button><span v-if="!connected" class="invite-note">加入同一个房间后，就可以互相留言。</span></div>
<div class="card"><div class="title">分享我们的时间</div><span class="hint">两人的昵称和整周课程，生成一张朋友圈分享图。</span><button class="invite-button" @click="fire('openSharePoster', $event, {})" type="button">生成周课表分享图</button></div>
<div class="card"><div class="title">文件同步（备用方式）</div><span class="hint">可将同步 JSON 发给对方导入，也可导出 CSV 表格。</span><div class="file-actions"><button @click="fire('exportJson', $event, {})" type="button">导出同步文件</button><button @click="fire('importFile', $event, {})" type="button">导入同步文件</button><button @click="fire('exportCsv', $event, {})" type="button">导出表格 CSV</button></div><span class="file-status">{{fileStatus}}</span></div>
</div>


</template>
<style scoped>
.title{font-size:calc(32 * var(--rpx));font-weight:800}.hint{display:block;margin:calc(16 * var(--rpx)) 0 calc(24 * var(--rpx));color:#927e89;font-size:calc(25 * var(--rpx));line-height:1.6}.room-card input{border:calc(1 * var(--rpx)) solid #efd6e1;border-radius:calc(16 * var(--rpx));padding:calc(20 * var(--rpx));margin-top:calc(14 * var(--rpx));background:#fffafd}.modes{display:flex;background:#f9edf2;border-radius:calc(18 * var(--rpx));padding:calc(6 * var(--rpx));gap:calc(6 * var(--rpx))}.modes button{flex:1;background:transparent;border-radius:calc(14 * var(--rpx));font-size:calc(26 * var(--rpx));color:#816b76}.modes .on{background:#fff;color:#c95380;box-shadow:0 calc(4 * var(--rpx)) calc(14 * var(--rpx)) rgba(207,83,128,.12)}.primary{margin-top:calc(22 * var(--rpx));background:linear-gradient(90deg,#f58ab3,#87cdf2);color:#fff;border-radius:calc(17 * var(--rpx));font-weight:700}.notice{display:block;margin-top:calc(14 * var(--rpx));color:#a08b95;font-size:calc(22 * var(--rpx));line-height:1.55}.connected{display:flex;justify-content:space-between;align-items:center;background:linear-gradient(135deg,#fff0f6,#ecf8ff);border-radius:calc(20 * var(--rpx));padding:calc(22 * var(--rpx));margin-top:calc(20 * var(--rpx))}.connected-label,.room-code{display:block}.connected-label{font-size:calc(22 * var(--rpx));color:#9a8590}.room-code{font-size:calc(34 * var(--rpx));font-weight:800;margin-top:calc(4 * var(--rpx))}.badge{padding:calc(8 * var(--rpx)) calc(16 * var(--rpx));border-radius:calc(999 * var(--rpx));background:#ddf8e8;color:#318255;font-size:calc(22 * var(--rpx))}.actions{display:flex;gap:calc(16 * var(--rpx));margin-top:calc(22 * var(--rpx))}.actions button{flex:1;background:#f889b3;color:#fff;border-radius:calc(16 * var(--rpx))}.leave{margin-top:calc(14 * var(--rpx));background:#fff2f5;color:#c9577f;border-radius:calc(16 * var(--rpx));font-size:calc(24 * var(--rpx))}.status,.last,.file-status{display:block;margin-top:calc(18 * var(--rpx));color:#39835b;font-size:calc(24 * var(--rpx));line-height:1.5}.last{color:#9b8892;margin-top:calc(8 * var(--rpx))}.row{display:flex;align-items:center;justify-content:space-between;padding:calc(22 * var(--rpx)) 0;border-bottom:calc(1 * var(--rpx)) solid #f4e8ed;font-size:calc(27 * var(--rpx))}.row:last-child{border:0}.row span,.row small{display:block}.row small{font-size:calc(22 * var(--rpx));color:#9b8892;margin-top:calc(6 * var(--rpx))}.file-actions button{margin-top:calc(14 * var(--rpx));background:#fff0f6;color:#c75580;border-radius:calc(16 * var(--rpx));font-size:calc(26 * var(--rpx))}
.invite-banner{margin:calc(20 * var(--rpx)) 0;padding:calc(20 * var(--rpx));border-radius:calc(18 * var(--rpx));background:var(--skin-cat-soft);color:var(--skin-cat-ink);font-size:calc(25 * var(--rpx));line-height:1.5}.invite-banner span{display:block}.invite-banner button{margin-top:calc(14 * var(--rpx));font-size:calc(24 * var(--rpx));background:var(--skin-card);color:var(--skin-cat)}.invite-button{margin-top:calc(18 * var(--rpx));background:var(--skin-cat);color:var(--skin-on-cat);border-radius:calc(18 * var(--rpx));font-size:calc(27 * var(--rpx));font-weight:700}.invite-note{display:block;margin-top:calc(14 * var(--rpx));color:var(--skin-muted);font-size:calc(22 * var(--rpx));line-height:1.6}
.message-heading{display:flex;align-items:center;gap:calc(20 * var(--rpx))}.message-heart{font-size:calc(62 * var(--rpx));color:var(--skin-cat);line-height:1}.message-subtitle{display:block;color:var(--skin-muted);font-size:calc(23 * var(--rpx));line-height:1.6;margin-top:calc(8 * var(--rpx))}

</style>
