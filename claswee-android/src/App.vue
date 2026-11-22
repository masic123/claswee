<script setup>
import { computed, onMounted, onUnmounted, watch } from 'vue';
import { App as NativeApp } from '@capacitor/app';
import { SystemBars } from '@capacitor/core';
import { state, init, setForeground } from './lib/state';
import { native } from './lib/platform';
import { ui, handleBack, navigateBack, notify } from './mini/navigation';
import './mini/runtime';
import MiniSchedule from './mini/pages/Schedule.vue';
import MiniSettings from './mini/pages/Settings.vue';
import MiniSync from './mini/pages/Sync.vue';
import MiniAdd from './mini/pages/Add.vue';
import MiniImageImport from './mini/pages/ImageImport.vue';
import MiniPoster from './mini/pages/Poster.vue';
import MiniTabBar from './mini/TabBar.vue';
import MiniNote from './mini/Note.vue';
import Privacy from './components/Privacy.vue';
const views = { schedule: MiniSchedule, settings: MiniSettings, sync: MiniSync, add: MiniAdd, 'image-import': MiniImageImport, 'share-poster': MiniPoster };
const current = computed(() => ui.stack.at(-1) || { id: ui.tab, key: ui.tab, query: {} });
const listeners = [];
watch(() => state.skin, skin => {
  document.documentElement.dataset.skin = skin;
  if (native) SystemBars.setStyle({ style: skin === 'night' ? 'DARK' : 'LIGHT' }).catch(() => {});
}, { immediate: true });
function visibility() { setForeground(!document.hidden); }
function keydown(event) { if (event.key === 'Escape') handleBack(); }
onMounted(async () => {
  await init(); if (state.consent === 'unknown') ui.legal = 'privacy';
  document.addEventListener('visibilitychange', visibility); document.addEventListener('keydown', keydown);
  if (native) {
    listeners.push(await NativeApp.addListener('appStateChange', ({ isActive }) => setForeground(isActive)));
    listeners.push(await NativeApp.addListener('backButton', () => { if (!handleBack()) NativeApp.minimizeApp(); }));
  }
});
onUnmounted(() => { setForeground(false); document.removeEventListener('visibilitychange', visibility); document.removeEventListener('keydown', keydown); listeners.forEach(listener => listener.remove()); });
</script>
<template>
  <div v-if="!state.loaded" class="launch-screen"><img src="/icon.png" alt="claswee" /><p>claswee</p></div>
  <div v-else-if="state.fatal" class="launch-screen"><h2>本机数据暂时无法读取</h2><p>{{ state.fatal }}</p><p>请关闭应用后重试，数据仍保留在本机。</p></div>
  <div v-else class="mini-app" :class="`skin-${state.skin}`">
    <header class="native-navigation"><button v-if="ui.stack.length" class="navigation-back" type="button" aria-label="返回" @click="navigateBack">‹</button><span>{{ ui.title }}</span></header>
    <main class="mini-page" id="main-content"><KeepAlive include="MiniSchedule,MiniSettings,MiniSync"><component :is="views[current.id]" :key="current.key" :query="current.query" /></KeepAlive></main>
    <MiniTabBar v-if="!ui.stack.length" />
    <MiniNote />
    <Privacy v-if="ui.legal" :terms="ui.legal==='terms'" :first="state.consent==='unknown'" @close="ui.legal=''" @notice="notify" />
    <div v-if="ui.dialog" class="native-modal-mask" role="presentation"><section class="native-modal" role="dialog" aria-modal="true" :aria-label="ui.dialog.title"><h3>{{ ui.dialog.title }}</h3><p>{{ ui.dialog.content }}</p><div class="native-modal-actions"><button v-if="ui.dialog.showCancel!==false" type="button" @click="ui.dialog.resolve({confirm:false,cancel:true})">{{ ui.dialog.cancelText||'取消' }}</button><button type="button" @click="ui.dialog.resolve({confirm:true,cancel:false})">{{ ui.dialog.confirmText||'确定' }}</button></div></section></div>
    <div v-if="ui.loading" class="native-loading" role="status"><i></i>{{ ui.loading }}</div>
    <div v-if="ui.toast" class="toast" role="status">{{ ui.toast }}</div>
  </div>
</template>
