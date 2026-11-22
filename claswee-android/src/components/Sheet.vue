<script setup>
import { onMounted, onUnmounted, ref } from 'vue';
import { PhX } from '@phosphor-icons/vue';
const props = defineProps({ title: String, wide: Boolean });
const emit = defineEmits(['close']);
const panel = ref(null);
let previousFocus;
function keyboard(event) {
  if (event.key === 'Escape') emit('close');
  if (event.key !== 'Tab') return;
  const elements = [...panel.value.querySelectorAll('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex="0"]')];
  if (!elements.length) return;
  if (event.shiftKey && document.activeElement === elements[0]) { event.preventDefault(); elements.at(-1).focus(); }
  else if (!event.shiftKey && document.activeElement === elements.at(-1)) { event.preventDefault(); elements[0].focus(); }
}
onMounted(() => { previousFocus = document.activeElement; panel.value.focus(); document.addEventListener('keydown', keyboard); document.body.style.overflow = 'hidden'; });
onUnmounted(() => { document.removeEventListener('keydown', keyboard); document.body.style.overflow = ''; previousFocus?.focus(); });
</script>

<template>
  <div class="sheet-backdrop" @click.self="emit('close')">
    <section ref="panel" class="sheet" :class="{ wide }" role="dialog" aria-modal="true" :aria-label="props.title" tabindex="-1">
      <div class="sheet-handle" aria-hidden="true"></div>
      <header class="sheet-heading"><h2>{{ title }}</h2><button class="icon-button" :aria-label="`关闭${title}`" @click="emit('close')"><PhX :size="22" /></button></header>
      <div class="sheet-body"><slot /></div>
    </section>
  </div>
</template>
