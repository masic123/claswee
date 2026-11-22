<script setup>
defineProps({ checked: Boolean, color: String });
const emit = defineEmits(['change']);
</script>
<template><label class="mini-switch"><input type="checkbox" :checked="checked" role="switch" @change="emit('change',{detail:{value:$event.target.checked}})" /><span></span></label></template>
