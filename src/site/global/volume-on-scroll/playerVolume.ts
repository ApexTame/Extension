import { getRootVNode, getVNodeFromDOM } from "@/common/ReactHooks";

interface VolumePlayer {
	getVolume: () => number;
	isMuted: () => boolean;
	setVolume: (volume: number) => void;
	setMuted: (muted: boolean) => void;
}

interface KickPlayer extends VolumePlayer {
	getHTMLVideoElement: () => HTMLVideoElement | null;
}

interface KickVolumeControl {
	volume: number;
	isVolumeSliding: boolean;
	setVolume: (volume: number[]) => void;
}

export interface PlayerVolume {
	getVolume: () => number;
	setVolume: (volume: number) => void;
}

export function findPlayerVolume(
	platform: "TWITCH" | "KICK",
	host: HTMLElement,
	video: HTMLVideoElement,
): PlayerVolume | undefined {
	if (platform === "TWITCH") {
		let node: ReactExtended.ReactVNode | undefined;
		for (
			let element: HTMLElement | null = video;
			element && host.contains(element);
			element = element.parentElement
		) {
			node = getVNodeFromDOM(element);
			if (node) break;
		}
		for (; node; node = node.return ?? undefined) {
			const instance = node.stateNode as Twitch.VideoPlayerComponent | null;
			const player = instance?.props?.mediaPlayerInstance;
			if (player?.playerInstance?.core?.mediaSinkManager?.video === video && isVolumePlayer(player)) {
				return nativeVolume(player);
			}
		}
	} else {
		const hostNode = getVNodeFromDOM(host);
		const matchPlayer = (node: ReactExtended.ReactVNode) => {
			const { videoPlayer } = (node.memoizedProps ?? {}) as { videoPlayer?: KickPlayer };
			if (!isVolumePlayer(videoPlayer) || typeof videoPlayer.getHTMLVideoElement !== "function") return;
			try {
				if (videoPlayer.getHTMLVideoElement() === video) return videoPlayer;
			} catch {
				// This player has not attached its video yet.
			}
		};
		const player = findInTree(hostNode, matchPlayer) ?? findInTree(getCurrentRoot(hostNode), matchPlayer);
		if (player) {
			const control = findInTree(hostNode, (node) => {
				const props = (node.memoizedProps ?? {}) as Partial<KickVolumeControl>;
				if (
					typeof props.volume === "number" &&
					typeof props.isVolumeSliding === "boolean" &&
					typeof props.setVolume === "function"
				) {
					return props.setVolume;
				}
			});
			return nativeVolume(player, control);
		}
	}

	if (video.controls) {
		return {
			getVolume: () => video.volume,
			setVolume(volume: number) {
				video.volume = volume;
				video.muted = volume === 0 || (video.muted && navigator.userActivation?.hasBeenActive === false);
			},
		};
	}
}

function getCurrentRoot(node?: ReactExtended.ReactVNode) {
	// Kick can portal the video to a different React subtree than the player API.
	let root = node ?? getRootVNode();
	while (root?.return) root = root.return;
	const state = root?.stateNode as { current?: ReactExtended.ReactVNode } | null;
	return state?.current ?? root;
}

function isVolumePlayer<T extends VolumePlayer>(player?: T): player is T {
	return (
		typeof player?.getVolume === "function" &&
		typeof player.isMuted === "function" &&
		typeof player.setVolume === "function" &&
		typeof player.setMuted === "function"
	);
}

function nativeVolume(player: VolumePlayer, setControlVolume?: KickVolumeControl["setVolume"]): PlayerVolume {
	return {
		getVolume: () => player.getVolume(),
		setVolume(volume) {
			const preserveMute = player.isMuted() && navigator.userActivation?.hasBeenActive === false;
			if (player.getVolume() !== volume) {
				if (!preserveMute) setControlVolume?.([Math.round(volume * 100)]);
				if (player.getVolume() !== volume) player.setVolume(volume);
			}
			const muted = volume === 0 || preserveMute;
			if (player.isMuted() !== muted) player.setMuted(muted);
		},
	};
}

function findInTree<T>(
	root: ReactExtended.ReactVNode | undefined,
	match: (node: ReactExtended.ReactVNode) => T | undefined,
) {
	if (!root) return;
	const pending = [root];
	while (pending.length) {
		const node = pending.pop()!;
		const result = match(node);
		if (result !== undefined) return result;
		if (node !== root && node.sibling) pending.push(node.sibling);
		if (node.child) pending.push(node.child);
	}
}
