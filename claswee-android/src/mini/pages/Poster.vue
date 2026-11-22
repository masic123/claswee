<script>
import { toRefs } from 'vue';
import controller from '../controllers/share-poster.js';
import { useMiniPage, rpxStyle } from '../runtime';
import MiniPicker from '../MiniPicker.vue';
import MiniSwitch from '../MiniSwitch.vue';
export default { name:'MiniPoster', components:{MiniPicker,MiniSwitch}, props:{query:Object}, setup(props) {
  const page = useMiniPage(controller, props.query || {}, ["skin","weekOptions","weekIndex","week","weekRange","includeWeekend","maskCourses","busy","error","posterPath","canvasHeight"], 'Poster');
  return { ...toRefs(page.data), fire:page.fire, rpxStyle };
}};
</script>
<template>
<div :class="&quot;app-skin skin-&quot; + (skin) + &quot; poster-page&quot;">
  <div class="card poster-controls">
    <div class="title">claswee</div>
    <span class="hint">沿用手机课表页的样式，保存这一周的完整课表。</span>
    <div class="poster-row"><span>分享哪一周</span><MiniPicker mode="selector" :range="weekOptions" :value="weekIndex" @change="fire('setWeek', $event, {})"><div>第 {{week}} 周 · {{weekRange}} ›</div></MiniPicker></div>
    <div class="poster-row"><div><span>包含周末</span><span class="poster-note">显示周六、周日及当天课程，仅影响分享图</span></div><MiniSwitch :checked="includeWeekend" color="#e88eaf" @change="fire('setWeekend', $event, {})" /></div>
    <div class="poster-row"><div><span>柔光打码</span><span class="poster-note">藏起课程名称、教室和老师，保留时间</span></div><MiniSwitch :checked="maskCourses" color="#e88eaf" @change="fire('setMask', $event, {})" /></div>
  </div>
  <div v-if="busy" class="poster-status">正在生成完整课表…</div>
  <div v-if="error" class="poster-status"><span>{{error}}</span><button @click="fire('generate', $event, {})" type="button">重新生成</button></div>
  <img v-if="posterPath" class="poster-preview" :src="posterPath" @click="fire('preview', $event, {})" alt="" />
  <div class="poster-actions"><button @click="fire('saveImage', $event, {})" :disabled="busy || !posterPath" type="button">保存到相册</button><button class="primary" @click="fire('shareImage', $event, {})" :disabled="busy || !posterPath" type="button">分享图片</button></div>
  <span class="poster-help">可以保存后发朋友圈，也可以长按预览图分享。</span>
  <canvas type="2d" id="shareCanvas" class="poster-canvas" :style="rpxStyle(&quot;height:&quot; + (canvasHeight) + &quot;px&quot;)" />
</div>


</template>
<style scoped>
.poster-page{padding:calc(1 * var(--rpx)) 0 calc(50 * var(--rpx))}.title{font-size:calc(34 * var(--rpx));font-weight:800}.hint{display:block;font-size:calc(24 * var(--rpx));line-height:1.6;color:var(--skin-muted);margin:calc(14 * var(--rpx)) 0 calc(8 * var(--rpx))}.poster-row{display:flex;align-items:center;justify-content:space-between;gap:calc(16 * var(--rpx));padding:calc(22 * var(--rpx)) 0;border-top:calc(1 * var(--rpx)) solid var(--skin-line);font-size:calc(26 * var(--rpx))}.poster-row span{display:block}.poster-note{font-size:calc(21 * var(--rpx));color:var(--skin-muted);margin-top:calc(7 * var(--rpx))}.poster-row .mini-picker{color:var(--skin-cat);white-space:nowrap}.poster-preview{display:block;width:calc(100% - calc(36 * var(--rpx)));margin:calc(20 * var(--rpx)) calc(18 * var(--rpx));border-radius:calc(22 * var(--rpx));box-shadow:var(--skin-shadow)}.poster-status{padding:calc(50 * var(--rpx)) calc(30 * var(--rpx));text-align:center;color:var(--skin-muted);font-size:calc(25 * var(--rpx))}.poster-status span{display:block}.poster-status button{margin-top:calc(16 * var(--rpx));background:var(--skin-card);color:var(--skin-cat)}.poster-actions{display:flex;gap:calc(16 * var(--rpx));margin:calc(24 * var(--rpx)) calc(18 * var(--rpx)) calc(12 * var(--rpx))}.poster-actions button{flex:1;background:var(--skin-card);color:var(--skin-cat);border:calc(1 * var(--rpx)) solid var(--skin-line);border-radius:calc(18 * var(--rpx));font-size:calc(27 * var(--rpx))}.poster-actions .primary{background:var(--skin-cat);color:var(--skin-on-cat);border-color:var(--skin-cat)}.poster-help{display:block;text-align:center;font-size:calc(22 * var(--rpx));line-height:1.5;color:var(--skin-muted);padding:0 calc(24 * var(--rpx))}.poster-canvas{position:fixed;left:-10000px;top:0;width:450px;pointer-events:none}

</style>
