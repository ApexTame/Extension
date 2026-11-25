<template>
	<Teleport v-if="popupHost" :to="popupHost">
		<Transition name="seventv-volume-popup" appear @after-leave="clearPopupHost">
			<div v-if="visible" class="seventv-volume-popup" role="status">
				<span class="seventv-volume-value">{{ percentage }}%</span>
				<div class="seventv-volume-track" aria-hidden="true">
					<div class="seventv-volume-fill" :style="{ transform: `translateX(${percentage - 100}%)` }" />
				</div>
			</div>
		</Transition>
	</Teleport>
</template>

<script lang="ts">
const toggleKey = "player.volume_on_scroll";
const stepKey = "player.volume_on_scroll_step";
const defaultStep = 5;
const settingsPath: [string, string] = ["Player", ""];

export const config = [
	declareConfig(toggleKey, "TOGGLE", {
		path: settingsPath,
		label: "Volume on Scroll",
		hint: "Scroll over the video player to change its volume.",
		defaultValue: false,
	}),
	declareConfig<number>(stepKey, "SLIDER", {
		path: settingsPath,
		label: "Player Volume Step",
		hint: "Sets how much the player volume changes per wheel input.",
		defaultValue: defaultStep,
		options: { min: 1, max: 10, step: 1, unit: "%" },
	}),
];
</script>

<script setup lang="ts">
import { ref, shallowRef, watch } from "vue";
import { declareConfig, useConfig } from "@/composable/useSettings";
import { type PlayerVolume, findPlayerVolume } from "./playerVolume";

const props = defineProps<{ platform: "KICK" | "TWITCH" }>();
const enabled = useConfig<boolean>(toggleKey, false);
const step = useConfig<number>(stepKey, defaultStep);
const popupHost = shallowRef<HTMLElement>();
const percentage = ref(0);
const visible = ref(false);

function clearPopupHost() {
	if (!visible.value) popupHost.value = undefined;
}

watch(
	enabled,
	(on, _, onCleanup) => {
		if (on !== true) return;
		const hostSelector =
			props.platform === "KICK"
				? "#injected-channel-player, #injected-embedded-channel-player-video"
				: ".video-player";
		const threshold = 20;
		let active: { host: HTMLElement; video: HTMLVideoElement; player: PlayerVolume } | undefined;
		let lastWheelAt = -Infinity;
		let distance = 0;
		let pendingVolume: number | undefined;
		let frame = 0;
		let hideTimer = 0;

		function applyVolume() {
			frame = 0;
			const volume = pendingVolume;
			pendingVolume = undefined;
			if (!active?.video.isConnected || !active.host.contains(active.video) || volume === undefined) return;

			active.player.setVolume(volume);
			percentage.value = Math.round(volume * 100);
			popupHost.value = active.host;
			visible.value = true;
		}

		function onWheel(event: WheelEvent) {
			if (
				event.defaultPrevented ||
				event.ctrlKey ||
				event.metaKey ||
				event.shiftKey ||
				!Number.isFinite(event.deltaY) ||
				!event.deltaY ||
				!(event.target instanceof Element) ||
				event.target.closest("input, select, textarea, [role=slider], [role=menu], [role=dialog]")
			) {
				return;
			}

			const host = event.target.closest<HTMLElement>(hostSelector);
			const video = host?.querySelector<HTMLVideoElement>("video#video-player") ?? host?.querySelector("video");
			if (!host || !video || video.closest(hostSelector) !== host) return;

			const now = performance.now();
			if (!active || active.host !== host || active.video !== video || now - lastWheelAt > 180) {
				if (frame) {
					window.cancelAnimationFrame(frame);
					applyVolume();
				}
				const player = findPlayerVolume(props.platform, host, video);
				if (!player) return;
				active = { host, video, player };
				distance = 0;
			}
			if (event.cancelable) event.preventDefault();
			event.stopImmediatePropagation();

			const volume = pendingVolume ?? active.player.getVolume();
			if (!Number.isFinite(volume)) return;

			lastWheelAt = now;
			window.clearTimeout(hideTimer);
			hideTimer = window.setTimeout(() => {
				if (frame) {
					window.cancelAnimationFrame(frame);
					applyVolume();
				}
				visible.value = false;
				active = undefined;
			}, 900);
			const delta =
				event.deltaMode === WheelEvent.DOM_DELTA_PIXEL ? event.deltaY : Math.sign(event.deltaY) * threshold;
			if (Math.sign(delta) !== Math.sign(distance)) distance = 0;
			distance += delta;
			if (Math.abs(distance) < threshold) return;

			const stepPercent = Number.isFinite(step.value)
				? Math.max(1, Math.min(10, Math.round(step.value)))
				: defaultStep;
			const next = volume - (Math.sign(distance) * stepPercent) / 100;
			pendingVolume = Math.max(0, Math.min(1, Math.round(next * 10000) / 10000));
			distance = 0;
			if (!frame) frame = window.requestAnimationFrame(applyVolume);
		}

		window.addEventListener("wheel", onWheel, { capture: true, passive: false });
		onCleanup(() => {
			window.removeEventListener("wheel", onWheel, true);
			window.cancelAnimationFrame(frame);
			window.clearTimeout(hideTimer);
			visible.value = false;
			clearPopupHost();
		});
	},
	{ immediate: true, flush: "sync" },
);
</script>

<style scoped lang="scss">
.seventv-volume-popup {
	position: absolute;
	bottom: 68px;
	left: 50%;
	z-index: 50;
	box-sizing: border-box;
	width: 160px;
	padding: 12px;
	color: var(--seventv-text-color-normal, #f0f0f0);
	font-family: system-ui, sans-serif;
	background: color-mix(in srgb, var(--seventv-background-shade-3, #111) 92%, transparent);
	border: 1px solid var(--seventv-border-transparent-1, #ffffff1a);
	border-radius: 6px;
	box-shadow:
		0 10px 38px -10px #16171859,
		0 10px 20px -15px #16171833;
	pointer-events: none;
	transform: translateX(-50%);
}

.seventv-volume-value {
	display: block;
	margin-bottom: 8px;
	font-size: 13px;
	font-weight: 700;
	font-variant-numeric: tabular-nums;
	line-height: 1;
	text-align: center;
}

.seventv-volume-track {
	height: 4px;
	overflow: hidden;
	background: var(--seventv-input-background, #232323);
	border-radius: 999px;
}

.seventv-volume-fill {
	height: 100%;
	background: var(--seventv-primary, #29b6f6);
	border-radius: inherit;
	transition: transform 80ms linear;
}

.seventv-volume-popup-enter-active,
.seventv-volume-popup-leave-active {
	transition:
		opacity 160ms ease,
		transform 160ms ease;
}

.seventv-volume-popup-enter-from,
.seventv-volume-popup-leave-to {
	opacity: 0;
	transform: translate(-50%, 6px);
}

@media (prefers-reduced-motion: reduce) {
	.seventv-volume-fill,
	.seventv-volume-popup-enter-active,
	.seventv-volume-popup-leave-active {
		transition: none;
	}
}
</style>
