<script>
import { toRefs } from 'vue';
import controller from '../controllers/image-import.js';
import { useMiniPage, rpxStyle } from '../runtime';
import MiniPicker from '../MiniPicker.vue';
import MiniSwitch from '../MiniSwitch.vue';
export default { name:'MiniImageImport', components:{MiniPicker,MiniSwitch}, props:{query:Object}, setup(props) {
  const page = useMiniPage(controller, props.query || {}, ["skin","owner","catName","dogName","imagePath","busy","status","warnings","courses","days","sections","weekLabels"], 'ImageImport');
  return { ...toRefs(page.data), fire:page.fire, rpxStyle };
}};
</script>
<template>
<div :class="&quot;page app-skin skin-&quot; + (skin)">
  <div class="card">
    <div class="title">课表截图导入</div>
    <span class="hint">选择清晰、完整的课表截图或照片。图片将发送至云端识别；请上传完整周次、星期和节次。截图未显示的课程周次将按当前学期预填，请在导入前核对。</span>
    <div class="label">导入给谁</div>
    <div class="owners"><button data-owner="cat" @click="fire('chooseOwner', $event, {&quot;owner&quot;:(&quot;cat&quot;)})" :class="owner==='cat'?'on cat':''" type="button"><span class="nick-cat">{{catName}}</span></button><button data-owner="dog" @click="fire('chooseOwner', $event, {&quot;owner&quot;:(&quot;dog&quot;)})" :class="owner==='dog'?'on dog':''" type="button"><span class="nick-dog">{{dogName}}</span></button></div>
    <button class="image-picker" @click="fire('chooseImage', $event, {})" type="button">{{imagePath ? '重新选择图片' : '选择课表图片'}}</button>
    <img v-if="imagePath" :src="imagePath" class="preview" alt="" />
    <button v-if="imagePath" class="recognize" :disabled="busy" @click="fire('recognize', $event, {})" type="button">识别图片</button>
    <span v-if="status" class="status">{{status}}</span>
  </div>
  <div v-if="warnings.length" class="card warnings"><template v-for="(item, index) in warnings" :key="item"><span>· {{item}}</span></template></div>
  <div v-if="courses.length" class="card">
    <div class="title">确认识别结果</div><span class="hint">可修改主要字段或移除课程；确认后才会写入课表。所有时段均可修改。缺失周次默认第 1 周至学期末，单双周按学期周数计算。请先在设置中核对开学日期和节次时间。</span>
    <template v-for="(item, index) in courses" :key="index"><div class="course-review">
      <div class="review-head"><span>课程 {{index + 1}}</span><button :data-index="index" @click="fire('remove', $event, {&quot;index&quot;:(index)})" type="button">移除</button></div>
      <input :value="item.name" placeholder="课程名称" :data-index="index" data-key="name" @input="fire('input', $event, {&quot;index&quot;:(index),&quot;key&quot;:(&quot;name&quot;)})" />
      <input :value="item.loc" placeholder="地点（可选）" :data-index="index" data-key="loc" @input="fire('input', $event, {&quot;index&quot;:(index),&quot;key&quot;:(&quot;loc&quot;)})" />
      <input :value="item.teacher" placeholder="老师（可选）" :data-index="index" data-key="teacher" @input="fire('input', $event, {&quot;index&quot;:(index),&quot;key&quot;:(&quot;teacher&quot;)})" />
      <template v-for="(slot, slotIndex) in item.slots" :key="slotIndex"><div class="slot-review">
        <div class="review-field">
          <span class="field-label">星期几</span>
          <MiniPicker :range="days" :value="slot.day-1" :data-index="index" :data-slot="slotIndex" data-key="day" @change="fire('pick', $event, {&quot;index&quot;:(index),&quot;slot&quot;:(slotIndex),&quot;key&quot;:(&quot;day&quot;)})"><div>{{days[slot.day-1]}}</div></MiniPicker>
        </div>
        <div class="pick-row">
          <div class="review-field">
            <span class="field-label">起始节数</span>
            <MiniPicker :range="sections" :value="slot.s1 ? slot.s1-1 : 0" :data-index="index" :data-slot="slotIndex" data-key="s1" @change="fire('pick', $event, {&quot;index&quot;:(index),&quot;slot&quot;:(slotIndex),&quot;key&quot;:(&quot;s1&quot;)})"><div>{{slot.s1 ? sections[slot.s1-1] : '选择开始节'}}</div></MiniPicker>
          </div>
          <div class="review-field">
            <span class="field-label">结束节数</span>
            <MiniPicker :range="sections" :value="slot.s2 ? slot.s2-1 : 0" :data-index="index" :data-slot="slotIndex" data-key="s2" @change="fire('pick', $event, {&quot;index&quot;:(index),&quot;slot&quot;:(slotIndex),&quot;key&quot;:(&quot;s2&quot;)})"><div>{{slot.s2 ? sections[slot.s2-1] : '选择结束节'}}</div></MiniPicker>
          </div>
        </div>
        <span v-if="slot.sectionEstimated" class="suggestion">AI 推测节次：第{{slot.s1}}–{{slot.s2}}节，请对照原图核对；可直接修改上方节次</span>
        <span v-if="slot.dayUncertain" class="suggestion">星期位置尚未核实，请对照原图确认</span>
      </div></template>
      <div class="review-field frequency-field">
        <span class="field-label">上课频率</span>
        <MiniPicker :range="weekLabels" :value="item.week==='odd'?1:item.week==='even'?2:0" :data-index="index" data-key="week" @change="fire('pick', $event, {&quot;index&quot;:(index),&quot;key&quot;:(&quot;week&quot;)})"><div>{{item.week==='odd'?'单周':item.week==='even'?'双周':'每周'}}</div></MiniPicker>
      </div>
      <div class="pick-row">
        <div class="review-field"><span class="field-label">起始周</span><input type="number" :value="item.wf" placeholder="起始周" :data-index="index" data-key="wf" @input="fire('input', $event, {&quot;index&quot;:(index),&quot;key&quot;:(&quot;wf&quot;)})" /></div>
        <div class="review-field"><span class="field-label">结束周</span><input type="number" :value="item.wt" placeholder="结束周" :data-index="index" data-key="wt" @input="fire('input', $event, {&quot;index&quot;:(index),&quot;key&quot;:(&quot;wt&quot;)})" /></div>
      </div>
      <span v-if="item.weekDefaulted" class="week-default-note">截图未写明的课程周次已按当前学期预填；请核对上方起止周</span>
      <span v-if="item.slots.length>1" class="extra">本课程共 {{item.slots.length}} 个上课时段，请逐一核对。</span><span v-if="item.warning" class="warning">{{item.warning}}</span>
    </div></template>
    <button class="confirm" @click="fire('confirm', $event, {})" type="button">确认导入 {{courses.length}} 门课</button>
  </div>
</div>


</template>
<style scoped>
.page{padding:calc(24 * var(--rpx)) calc(24 * var(--rpx)) calc(120 * var(--rpx))}.card{background:#fff;border-radius:calc(26 * var(--rpx));padding:calc(26 * var(--rpx));margin-bottom:calc(20 * var(--rpx));box-shadow:0 calc(7 * var(--rpx)) calc(22 * var(--rpx)) rgba(190,105,137,.09)}.title{font-size:calc(32 * var(--rpx));font-weight:800}.hint{display:block;color:#9f8a94;font-size:calc(24 * var(--rpx));line-height:1.6;margin:calc(12 * var(--rpx)) 0 calc(18 * var(--rpx))}.label{font-size:calc(25 * var(--rpx));font-weight:700;margin-bottom:calc(10 * var(--rpx))}.owners{display:flex;gap:calc(14 * var(--rpx))}.owners button{flex:1;background:#fff3f7;border-radius:calc(999 * var(--rpx));font-size:calc(25 * var(--rpx))}.owners .on.cat{background:#f68daf;color:#fff}.owners .on.dog{background:#72bee9;color:#fff}.image-picker,.recognize,.confirm{margin-top:calc(20 * var(--rpx));background:#fff2f7;color:#b54f77;border-radius:calc(18 * var(--rpx));font-weight:700}.recognize,.confirm{background:linear-gradient(100deg,#f484ad,#85caee);color:#fff}.preview{width:100%;max-height:calc(720 * var(--rpx));margin-top:calc(20 * var(--rpx));border-radius:calc(18 * var(--rpx));background:#f8f2f5}.status{display:block;color:#846e79;font-size:calc(24 * var(--rpx));margin-top:calc(14 * var(--rpx));line-height:1.5}.warnings{background:#fff9e8;color:#8e6a25;font-size:calc(23 * var(--rpx))}.warnings span{display:block;margin:calc(5 * var(--rpx)) 0}.course-review{padding:calc(18 * var(--rpx)) 0;border-bottom:calc(1 * var(--rpx)) solid #f2e5eb}.course-review:last-of-type{border-bottom:0}.review-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:calc(10 * var(--rpx));font-weight:700}.review-head button{margin:0;padding:calc(4 * var(--rpx)) calc(13 * var(--rpx));background:#fff1f3;color:#c55b73;font-size:calc(22 * var(--rpx))}.course-review input,.pick-row .mini-picker{background:#fff8fb;border-radius:calc(12 * var(--rpx));padding:calc(13 * var(--rpx)) calc(15 * var(--rpx));margin:calc(8 * var(--rpx)) 0;font-size:calc(24 * var(--rpx));box-sizing:border-box}.pick-row{display:grid;grid-template-columns:repeat(2,1fr);gap:calc(10 * var(--rpx))}.pick-row .mini-picker{margin:0}.extra,.warning{display:block;font-size:calc(22 * var(--rpx));margin-top:calc(9 * var(--rpx))}.extra{color:#8e7a84}.warning{color:#bf7a31}.confirm{width:100%;margin-top:calc(24 * var(--rpx))}
.slot-review{margin:calc(8 * var(--rpx)) 0}.slot-review .suggestion{display:block;box-sizing:border-box;width:100%;margin:calc(7 * var(--rpx)) 0 calc(12 * var(--rpx));padding:calc(12 * var(--rpx)) calc(16 * var(--rpx));background:#fff4df;color:#94631d;border:calc(1 * var(--rpx)) solid #f1d4a0;border-radius:calc(12 * var(--rpx));font-size:calc(22 * var(--rpx));line-height:1.5;white-space:normal}
.review-field{min-width:0;margin:calc(8 * var(--rpx)) 0}.field-label{display:block;color:#8e7a84;font-size:calc(22 * var(--rpx));margin:0 0 calc(5 * var(--rpx))}.review-field .mini-picker{box-sizing:border-box;width:100%;margin:0;padding:calc(13 * var(--rpx)) calc(15 * var(--rpx));background:#fff8fb;border-radius:calc(12 * var(--rpx));font-size:calc(24 * var(--rpx))}.review-field .mini-picker div{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.frequency-field{margin-top:calc(15 * var(--rpx))}.week-default-note{display:block;margin:calc(8 * var(--rpx)) 0 calc(10 * var(--rpx));padding:calc(10 * var(--rpx)) calc(14 * var(--rpx));border-radius:calc(12 * var(--rpx));background:#fff4df;color:#94631d;font-size:calc(22 * var(--rpx));line-height:1.5}

</style>
