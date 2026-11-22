<script>
import {toRefs} from 'vue';
import controller from './controllers/note.js';
import {useMiniPage,rpxStyle} from './runtime';
export default {name:'MiniNote',setup(){const page=useMiniPage(controller,{},["skin","showNote","showEditor","sender","fromName","sentTime","note","remaining","error","collecting","toName","draft","sending","length"],'Note');return {...toRefs(page.data),fire:page.fire,rpxStyle};}};
</script>
<template>
<div :class="&quot;skin-&quot; + (skin)">
  <div v-if="showNote || showEditor" class="note-backdrop" @touchmove.stop="fire('swallow', $event, {})">
    <div v-if="showNote" :class="&quot;note-paper from-&quot; + (sender)" @click.stop="fire('swallow', $event, {})">
      <div class="note-tape"></div>
      <div class="note-eyebrow">把心意，留在这里</div>
      <div class="note-heading"><span class="note-heart">♡</span><span>{{fromName}}给你的留言</span></div>
      <span class="note-date">{{sentTime}}</span>
      <div class="note-body mini-scroll mini-scroll-y"><span selectable>{{note.content}}</span></div>
      <div class="note-footer"><span class="note-signature">来自 {{fromName}}</span><span v-if="remaining > 1" class="note-count">还有 {{remaining - 1}} 张小纸条</span></div>
      <span v-if="error" class="note-error">{{error}}</span>
      <button class="note-primary" @click="fire('collect', $event, {})" :disabled="collecting" type="button">{{remaining > 1 ? '收下这张，看看下一张' : '收下留言 ♡'}}</button>
      <button class="note-secondary" @click="fire('later', $event, {})" :disabled="collecting" type="button">稍后再看</button>
    </div>
    <div v-if="showEditor" :class="&quot;note-paper note-editor from-&quot; + (sender)" @click.stop="fire('swallow', $event, {})">
      <div class="note-tape"></div>
      <div class="note-eyebrow">写给 {{toName}} 的小纸条</div>
      <div class="note-heading"><span class="note-heart">♡</span><span>有些话，想留给你</span></div>
      <span class="note-description">下次打开 claswee，就能看到你的心意。</span>
      <textarea class="note-input" maxlength="300" placeholder="比如：下课等我，一起去吃你喜欢的那家。" :value="draft" @input="fire('input', $event, {})" :disabled="sending" />
      <span class="note-length">{{length}} / 300</span>
      <span v-if="error" class="note-error">{{error}}</span>
      <button class="note-primary" @click="fire('send', $event, {})" :disabled="sending || !length" type="button">把心意送给 {{toName}}</button>
      <button class="note-secondary" @click="fire('closeComposer', $event, {})" :disabled="sending" type="button">先放一放</button>
    </div>
  </div>
</div>

</template>
<style scoped>

.note-backdrop{position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;padding:calc(38 * var(--rpx));box-sizing:border-box;background:rgba(55,35,48,.35)}
.note-paper{position:relative;width:100%;max-width:calc(640 * var(--rpx));box-sizing:border-box;padding:calc(46 * var(--rpx)) calc(34 * var(--rpx)) calc(20 * var(--rpx));border-radius:calc(30 * var(--rpx));background:var(--skin-card);color:var(--skin-text);box-shadow:0 calc(24 * var(--rpx)) calc(80 * var(--rpx)) rgba(58,33,49,.22);border:calc(1 * var(--rpx)) solid var(--skin-line);animation:note-in .24s ease-out}
.note-tape{position:absolute;top:calc(-15 * var(--rpx));left:50%;width:calc(124 * var(--rpx));height:calc(35 * var(--rpx));transform:translateX(-50%) rotate(-4deg);border-radius:calc(7 * var(--rpx));background:var(--skin-cat-soft);border:calc(1 * var(--rpx)) solid var(--skin-line);opacity:.95}.from-dog .note-tape{background:var(--skin-dog-soft);transform:translateX(-50%) rotate(4deg)}
.note-eyebrow{font-size:calc(21 * var(--rpx));letter-spacing:calc(3 * var(--rpx));color:var(--skin-muted)}.note-heading{display:flex;align-items:center;gap:calc(12 * var(--rpx));margin:calc(14 * var(--rpx)) 0 calc(10 * var(--rpx));font-size:calc(33 * var(--rpx));font-weight:800;line-height:1.5}.note-heart{font-size:calc(43 * var(--rpx));font-weight:400;color:var(--skin-cat)}.from-dog .note-heart{color:var(--skin-dog)}.note-date,.note-description{display:block;font-size:calc(22 * var(--rpx));color:var(--skin-muted);line-height:1.7}
.note-body{height:calc(300 * var(--rpx));max-height:calc(420 * var(--rpx));margin:calc(28 * var(--rpx)) 0 calc(22 * var(--rpx));border-top:calc(1 * var(--rpx)) dashed var(--skin-line);padding-top:calc(20 * var(--rpx));line-height:1.9;white-space:pre-wrap;word-break:break-all;font-size:calc(29 * var(--rpx))}.note-body span{display:block}.note-footer{display:flex;align-items:center;justify-content:space-between;gap:calc(12 * var(--rpx));margin:0 0 calc(26 * var(--rpx));font-size:calc(22 * var(--rpx))}.note-signature{color:var(--skin-cat)}.from-dog .note-signature{color:var(--skin-dog)}.note-count{color:var(--skin-muted);font-size:calc(20 * var(--rpx))}
.note-primary{margin:calc(18 * var(--rpx)) 0 0;padding:calc(8 * var(--rpx)) calc(18 * var(--rpx));font-size:calc(26 * var(--rpx));font-weight:700;border-radius:calc(18 * var(--rpx));color:var(--skin-on-cat);background:var(--skin-cat)}.from-dog .note-primary{color:var(--skin-on-dog);background:var(--skin-dog)}.note-primary[disabled]{opacity:.55}.note-secondary{margin:calc(6 * var(--rpx)) 0 0;padding:calc(4 * var(--rpx)) calc(18 * var(--rpx));font-size:calc(23 * var(--rpx));color:var(--skin-muted);background:transparent}.note-primary::after,.note-secondary::after{border:0}
.note-input{width:100%;height:calc(310 * var(--rpx));box-sizing:border-box;margin-top:calc(24 * var(--rpx));padding:calc(24 * var(--rpx));border:calc(1 * var(--rpx)) solid var(--skin-line);border-radius:calc(20 * var(--rpx));background:var(--skin-input);color:var(--skin-text);font-size:calc(28 * var(--rpx));line-height:1.8}.note-length{display:block;text-align:right;color:var(--skin-muted);font-size:calc(21 * var(--rpx));margin-top:calc(8 * var(--rpx))}.note-error{display:block;color:var(--skin-cat-ink);font-size:calc(23 * var(--rpx));line-height:1.6;margin-top:calc(12 * var(--rpx))}
@keyframes note-in{from{opacity:0;transform:translateY(calc(18 * var(--rpx))) scale(.98)}to{opacity:1;transform:translateY(0) scale(1)}}

</style>
