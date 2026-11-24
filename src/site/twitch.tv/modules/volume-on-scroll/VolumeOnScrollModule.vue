<template>
	<VolumeOnScroll platform="TWITCH" />
</template>

<script lang="ts">
export { config } from "@/site/global/volume-on-scroll/VolumeOnScroll.vue";
</script>

<script setup lang="ts">
import { declareModule } from "@/composable/useModule";
import VolumeOnScroll from "@/site/global/volume-on-scroll/VolumeOnScroll.vue";

declareModule<"TWITCH">("volume-on-scroll", { name: "Volume on Scroll", depends_on: [] }).markAsReady();
</script>
