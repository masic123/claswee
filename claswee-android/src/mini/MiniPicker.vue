<script setup>
import { ref, watch, onBeforeUnmount } from 'vue';
import { backHandlers } from './navigation';
const props = defineProps({ mode: { type: String, default: 'selector' }, range: { type: Array, default: () => [] }, value: [Number, String, Array], start: String, end: String });
const emit = defineEmits(['change', 'columnchange', 'cancel']);
const open = ref(false), columns = ref([]);
function changed(event) { emit('change', { detail: { value: props.mode === 'selector' ? Number(event.target.value) : event.target.value } }); }
function begin() { columns.value = [...(props.value || [])]; open.value = true; }
function columnChange(column, event) { const value = Number(event.target.value); columns.value[column] = value; emit('columnchange', { detail: { column, value } }); }
watch(() => props.value, value => { if (open.value) columns.value = [...value]; }, { deep: true });
function cancel() { open.value = false; emit('cancel'); }
function confirm() { open.value = false; emit('change', { detail: { value: columns.value } }); }
const back = () => { if (!open.value) return false; cancel(); return true; }; backHandlers.add(back); onBeforeUnmount(() => backHandlers.delete(back));
</script>
<template>
  <div class="mini-picker">
    <slot />
    <button v-if="mode==='multiSelector'" class="mini-picker-hit" type="button" aria-label="选择第一周周一" @click="begin"></button>
    <select v-else-if="mode==='selector'" class="mini-picker-hit" :value="value" aria-label="选择选项" @change="changed"><option v-for="(item,index) in range" :key="index" :value="index">{{ item }}</option></select>
    <input v-else class="mini-picker-hit" :type="mode==='time'?'time':'date'" :value="value" :min="start" :max="end" :aria-label="mode==='time'?'选择时间':'选择日期'" @change="changed" />
    <Teleport to="body"><div v-if="open" class="mini-picker-mask" @click.self="cancel"><div class="mini-picker-panel"><div class="mini-picker-toolbar"><button type="button" @click="cancel">取消</button><b>选择第一周的周一</b><button type="button" @click="confirm">确定</button></div><div class="mini-picker-columns"><select v-for="(list,column) in range" :key="column" :value="columns[column]" :aria-label="['年份','月份','周一日期'][column]" size="5" @change="columnChange(column,$event)"><option v-for="(text,index) in list" :value="index" :key="index">{{ text }}</option></select></div></div></div></Teleport>
  </div>
</template>
