<script>
import {toRefs} from 'vue';
import controller from './controllers/tabbar.js';
import {useMiniPage,rpxStyle} from './runtime';
export default {name:'MiniTabBar',setup(){const page=useMiniPage(controller,{},["skin","selected","tabs"],'TabBar');return {...toRefs(page.data),fire:page.fire,rpxStyle};}};
</script>
<template>
<div :class="&quot;tabbar skin-&quot; + (skin)" :style="rpxStyle(&quot;padding-bottom:constant(safe-area-inset-bottom);padding-bottom:env(safe-area-inset-bottom);&quot;)">
  <div class="tabbar-inner">
    <template v-for="(item, index) in tabs" :key="item.pagePath"><div :class="&quot;tab tab-&quot; + (item.icon) + &quot; &quot; + (item.primary?'primary':'') + &quot; &quot; + (selected===index?'active':'')" :data-index="index" @click="fire('switchTab', $event, {&quot;index&quot;:(index)})">
      <div :class="&quot;icon-shell icon-&quot; + (item.icon)">
        <div class="shine"></div>
        <div v-if="item.icon==='schedule'" class="calendar">
          <div class="calendar-top"></div><div class="calendar-ring ring-left"></div><div class="calendar-ring ring-right"></div>
          <div class="calendar-grid"><div></div><div></div><div></div><div></div><div></div><div></div></div><span class="calendar-heart">♥</span>
        </div>
        <div v-else-if="item.icon==='settings'" class="gear"><span>⚙︎</span></div>
        <div v-else class="cloud"><span>☁︎</span></div>
      </div>
      <span class="tab-label">{{item.text}}</span>
    </div></template>
  </div>
</div>

</template>
<style scoped>
.tabbar{position:fixed;left:0;right:0;bottom:0;z-index:999;background:rgba(255,255,255,.96);border-top:calc(1 * var(--rpx)) solid #f1dfe7;padding-bottom:var(--safe-bottom);box-shadow:0 calc(-8 * var(--rpx)) calc(28 * var(--rpx)) rgba(111,72,91,.07)}
.tabbar-inner{height:calc(116 * var(--rpx));display:flex;align-items:center;justify-content:space-around}
.tab{width:33.333%;height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;color:#8d7b85;font-size:calc(21 * var(--rpx));font-weight:700;gap:calc(5 * var(--rpx));box-sizing:border-box}
.icon-shell{position:relative;width:calc(72 * var(--rpx));height:calc(60 * var(--rpx));border-radius:calc(23 * var(--rpx));display:flex;align-items:center;justify-content:center;border:calc(2 * var(--rpx)) solid rgba(255,255,255,.95);box-shadow:inset 0 calc(2 * var(--rpx)) 0 rgba(255,255,255,.98),0 calc(5 * var(--rpx)) calc(12 * var(--rpx)) rgba(132,93,111,.10);transform:scale(.92);transition:transform .18s ease,box-shadow .18s ease}
.shine{position:absolute;left:calc(12 * var(--rpx));right:calc(12 * var(--rpx));top:calc(6 * var(--rpx));height:calc(14 * var(--rpx));border-radius:calc(999 * var(--rpx));background:linear-gradient(180deg,rgba(255,255,255,.9),rgba(255,255,255,0))}
.icon-schedule{background:linear-gradient(145deg,#fffefd,#fff0f5);border-color:#ffe2ec}.icon-settings{background:linear-gradient(145deg,#fffefd,#f3eeff);border-color:#eae1ff}.icon-sync{background:linear-gradient(145deg,#fff,#eaf6ff);border-color:#dceffd}
.active .icon-shell{transform:translateY(calc(-2 * var(--rpx))) scale(1)}.tab-schedule{color:#a95776}.tab-settings.active{color:#7661a8}.tab-schedule.active{color:#bd4f78}.tab-sync.active{color:#2874a2}
.tab-settings.active .icon-shell{background:linear-gradient(145deg,#fcfaff,#eee8fc);box-shadow:inset 0 calc(2 * var(--rpx)) 0 #fff,0 calc(8 * var(--rpx)) calc(18 * var(--rpx)) rgba(180,157,231,.26)}.tab-schedule.active .icon-shell{background:linear-gradient(145deg,#fff9fc,#ffe7f0);box-shadow:inset 0 calc(2 * var(--rpx)) 0 #fff,0 calc(9 * var(--rpx)) calc(21 * var(--rpx)) rgba(255,143,177,.27)}.tab-sync.active .icon-shell{background:linear-gradient(145deg,#f9fdff,#e0f2fd);box-shadow:inset 0 calc(2 * var(--rpx)) 0 #fff,0 calc(8 * var(--rpx)) calc(18 * var(--rpx)) rgba(95,174,227,.25)}
.tab.primary .icon-shell{width:calc(84 * var(--rpx));height:calc(70 * var(--rpx));transform:translateY(calc(-8 * var(--rpx))) scale(1);border-radius:calc(26 * var(--rpx));box-shadow:inset 0 calc(2 * var(--rpx)) 0 #fff,0 calc(9 * var(--rpx)) calc(20 * var(--rpx)) rgba(255,143,177,.22)}.tab.primary.active .icon-shell{transform:translateY(calc(-11 * var(--rpx))) scale(1.06)}.tab.primary .tab-label{margin-top:calc(-8 * var(--rpx));font-size:calc(23 * var(--rpx));font-weight:800}
.tab-pressed .icon-shell{transform:scale(.86)}
.calendar{position:relative;width:calc(42 * var(--rpx));height:calc(36 * var(--rpx));border-radius:calc(9 * var(--rpx));background:#fff9fc;border:calc(2 * var(--rpx)) solid rgba(255,119,160,.35);box-shadow:0 calc(4 * var(--rpx)) calc(9 * var(--rpx)) rgba(255,105,151,.28);overflow:visible}
.calendar-top{height:calc(13 * var(--rpx));border-radius:calc(7 * var(--rpx)) calc(7 * var(--rpx)) calc(1 * var(--rpx)) calc(1 * var(--rpx));background:linear-gradient(180deg,#ff8cb0,#ff6f9c)}
.calendar-ring{position:absolute;top:calc(-8 * var(--rpx));width:calc(6 * var(--rpx));height:calc(13 * var(--rpx));border-radius:calc(6 * var(--rpx));background:#fff8fb;border:calc(2 * var(--rpx)) solid #f6aec5;box-shadow:0 calc(2 * var(--rpx)) calc(4 * var(--rpx)) rgba(229,96,139,.18)}.ring-left{left:calc(8 * var(--rpx))}.ring-right{right:calc(8 * var(--rpx))}
.calendar-grid{display:grid;grid-template-columns:repeat(3,calc(6 * var(--rpx)));gap:calc(5 * var(--rpx));margin:calc(7 * var(--rpx)) 0 0 calc(8 * var(--rpx))}.calendar-grid div{width:calc(6 * var(--rpx));height:calc(6 * var(--rpx));border-radius:calc(2 * var(--rpx));background:#ffc4d6}.calendar-heart{position:absolute;right:calc(-11 * var(--rpx));bottom:calc(-12 * var(--rpx));color:#ff5f91;font-size:calc(23 * var(--rpx));line-height:1;text-shadow:0 calc(4 * var(--rpx)) calc(7 * var(--rpx)) rgba(255,95,145,.34)}
.gear,.cloud{width:calc(50 * var(--rpx));height:calc(50 * var(--rpx));display:flex;align-items:center;justify-content:center}.gear span,.cloud span{font-family:"Segoe UI Symbol","Arial Unicode MS",sans-serif;line-height:1}.gear span{color:#a88af2;font-size:calc(50 * var(--rpx));text-shadow:0 calc(2 * var(--rpx)) 0 #fff,0 calc(5 * var(--rpx)) calc(10 * var(--rpx)) rgba(139,111,223,.34)}.cloud span{color:#82b8f5;font-size:calc(50 * var(--rpx));text-shadow:0 calc(2 * var(--rpx)) 0 #fff,0 calc(6 * var(--rpx)) calc(10 * var(--rpx)) rgba(77,145,226,.28)}.tab-label{line-height:1.1}

/* 自定义 tabBar 是独立组件，单独接收本机皮肤。 */
.tabbar.skin-blush{--tab-bg:#fff;--tab-card:#fff;--tab-muted:#8d7b85;--tab-line:#f1dfe7;--tab-cat:#bd4f78;--tab-cat-soft:#fff0f6;--tab-dog:#2874a2;--tab-dog-soft:#eaf6ff;--tab-setting:#a88af2;--tab-setting-soft:#f3eeff}
.tabbar.skin-mint{--tab-bg:#fff;--tab-card:#fff;--tab-muted:#627a73;--tab-line:#dceae3;--tab-cat:#b9533f;--tab-cat-soft:#fcebe5;--tab-dog:#2e8177;--tab-dog-soft:#e2f4ed;--tab-setting:#b9533f;--tab-setting-soft:#fcebe5}
.tabbar.skin-sun{--tab-bg:#fffdf8;--tab-card:#fffdf8;--tab-muted:#806f56;--tab-line:#ede1c8;--tab-cat:#9e651e;--tab-cat-soft:#fff0cf;--tab-dog:#526d98;--tab-dog-soft:#eaf0fa;--tab-setting:#9e651e;--tab-setting-soft:#fff0cf}
.tabbar.skin-night{--tab-bg:#17243d;--tab-card:#1b2b47;--tab-muted:#acbbd2;--tab-line:#2b3a57;--tab-cat:#c29bf8;--tab-cat-soft:#3b2f58;--tab-dog:#6cd5cc;--tab-dog-soft:#24484f;--tab-setting:#c29bf8;--tab-setting-soft:#3b2f58}
.tabbar{background:var(--tab-bg);border-color:var(--tab-line)}
.tab{color:var(--tab-muted)}
.tab-schedule,.tab-schedule.active{color:var(--tab-cat)}
.tab-settings.active{color:var(--tab-setting)}
.tab-sync.active{color:var(--tab-dog)}
.icon-shell{box-shadow:0 calc(5 * var(--rpx)) calc(12 * var(--rpx)) rgba(0,0,0,.1);border-color:var(--tab-line)}
.icon-schedule,.tab-schedule.active .icon-shell{background:var(--tab-cat-soft);border-color:var(--tab-line);box-shadow:0 calc(7 * var(--rpx)) calc(16 * var(--rpx)) rgba(0,0,0,.1)}
.icon-settings,.tab-settings.active .icon-shell{background:var(--tab-setting-soft);border-color:var(--tab-line);box-shadow:0 calc(7 * var(--rpx)) calc(16 * var(--rpx)) rgba(0,0,0,.1)}
.icon-sync,.tab-sync.active .icon-shell{background:var(--tab-dog-soft);border-color:var(--tab-line);box-shadow:0 calc(7 * var(--rpx)) calc(16 * var(--rpx)) rgba(0,0,0,.1)}
.tab.primary .icon-shell{box-shadow:0 calc(7 * var(--rpx)) calc(18 * var(--rpx)) rgba(0,0,0,.12)}
.calendar{background:var(--tab-card);border-color:var(--tab-cat);box-shadow:none}
.calendar-top{background:var(--tab-cat)}
.calendar-ring{background:var(--tab-card);border-color:var(--tab-cat);box-shadow:none}
.calendar-grid div{background:var(--tab-cat-soft)}
.calendar-heart{color:var(--tab-cat);text-shadow:none}
.gear span{color:var(--tab-setting);text-shadow:none}
.cloud span{color:var(--tab-dog);text-shadow:none}
.tabbar.skin-night .shine{opacity:.22}

</style>
