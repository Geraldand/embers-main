import OBR from "@owlbear-rodeo/sdk";
import { log_error } from "./logging";

// Add safe JSON parsing utility
export function safeJsonParse<T>(jsonString: string | null, fallback: T): T {
    if (!jsonString) return fallback;
    try {
        return JSON.parse(jsonString) as T;
    } catch (e) {
        return fallback;
    }
}

// Add global audio unlocker and cached UI click sound
let isAudioUnlocked = false;
let clickAudio: HTMLAudioElement | null = null;

function getClickAudio(): HTMLAudioElement {
    if (!clickAudio) {
        clickAudio = new Audio("/click.mp3");
        clickAudio.preload = "auto";
        clickAudio.volume = 0.15;
    }
    return clickAudio;
}

export function playClickSound() {
    try {
        const audio = getClickAudio();
        audio.currentTime = 0;
        audio.play().catch(() => {});
    } catch (e) {}
}

export function unlockAudio() {
    if (isAudioUnlocked) return;
    getClickAudio().load();
    const audio = new Audio("data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA");
    audio.volume = 0;
    audio.play().then(() => {
        isAudioUnlocked = true;
    }).catch(() => {});
    document.removeEventListener("pointerdown", unlockAudio);
}

export function setupAudioUnlock() {
    document.addEventListener("pointerdown", unlockAudio);
}

export interface SizedItem {
    image?: {
        width: number;
        height: number;
    }
    scale: {
        x: number;
        y: number;
    }
    grid?: {
        dpi: number;
    }
}

export type EasingFunction = "LINEAR" | "EASE_IN" | "EASE_OUT" | "EASE_IN_OUT" | "EASE_IN_QUAD";

export function getItemSize(item: SizedItem) {
    const gridFactor = (item.image && item.grid) ? Math.max(item.image.width, item.image.height) / item.grid.dpi : 1;
    const scale = Math.max(item.scale.x, item.scale.y) * gridFactor;
    return scale;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function loadJSONFile(event: React.ChangeEvent<HTMLInputElement>, onComplete: (json: any) => void) {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();

    reader.onload = (e) => {
        try {
            const content = e.target?.result as string;
            const json = JSON.parse(content);
            onComplete(json);

        } catch (error) {
            OBR.notification.show("Error parsing file", "ERROR");
            log_error("Error parsing JSON:", error);
        } finally {
            if (event.target) {
                event.target.value = "";
            }
        }
    };

    reader.onerror = () => {
        OBR.notification.show("Error parsing file", "ERROR");
        log_error("Error loading file");
    };

    reader.readAsText(file);
}

export function downloadFileFromString(content: string, filename: string, MIMEType: string = "text/plain") {
    const blob = new Blob([content], { type: MIMEType });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
}

export function setDifference<T>(a: Set<T>, b: Set<T>): Set<T> {
    return new Set([...a].filter(x => !b.has(x)));
}

function linear(t: number): number {
    return t;
}

function inQuad(t: number): number {
    return t * t;
}

function outQuad(t: number): number {
    return 1 - (1 - t) * (1 - t);
}

function inOutQuad(t: number): number {
    return t < 0.5
        ? 2 * t * t
        : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

export function getEasingFunction(name: EasingFunction) {
    let easingFunc = easingFunctions.linear;
    switch (name) {
        case "EASE_IN":
            easingFunc = easingFunctions.inQuad;
            break;
        case "EASE_OUT":
            easingFunc = easingFunctions.outQuad;
            break;
        case "EASE_IN_OUT":
            easingFunc = easingFunctions.inOutQuad;
            break;
    }
    return easingFunc;
}

export function waitMs(ms: number): Promise<void> {
    return new Promise(resolve => {
        setTimeout(resolve, ms);
    });
}

export const easingFunctions = {
    linear,
    inQuad,
    outQuad,
    inOutQuad
};
// Record last play time for each sound to prevent audio clipping on multiple targets
const soundLastPlayMap = new Map<string, number>();
const preloadedAudioMap = new Map<string, Promise<string>>();
const soundQueue: (() => Promise<void>)[] = [];
let activeSoundDownloads = 0;
const MAX_CONCURRENT_SOUNDS = 2;

function processSoundQueue() {
    while (activeSoundDownloads < MAX_CONCURRENT_SOUNDS && soundQueue.length > 0) {
        const nextTask = soundQueue.shift();
        if (nextTask) {
            activeSoundDownloads++;
            nextTask().finally(() => {
                activeSoundDownloads--;
                processSoundQueue();
            });
        }
    }
}

export function preloadSound(soundUrl: string, isBackground: boolean = false): Promise<string> {
    if (!soundUrl || soundUrl === "none") {
        return Promise.resolve("");
    }
    const fullUrl = soundUrl.startsWith("http") || soundUrl.startsWith("/")
        ? (soundUrl.startsWith("http") ? soundUrl : `${window.location.origin}${soundUrl}`)
        : `${window.location.origin}/sounds/${soundUrl}`;

    const existing = preloadedAudioMap.get(fullUrl);
    if (existing) {
        return existing;
    }

    const runFetch = async () => {
        try {
            const response = await fetch(fullUrl, { mode: "cors", cache: "force-cache" });
            await response.blob();
        } catch (e) {
            console.warn("[Embers] Audio preload failed:", fullUrl, e);
        }
        return fullUrl;
    };

    const promise = isBackground
        ? new Promise<string>((resolve) => {
            soundQueue.push(async () => {
                const res = await runFetch();
                resolve(res);
            });
            processSoundQueue();
        })
        : runFetch();

    preloadedAudioMap.set(fullUrl, promise);
    return promise;
}

export async function prepareSpellSound(
    soundUrl: string,
    durationMs?: number,
    playbackRate: number = 1.0,
    volume?: number
): Promise<(() => void) | null> {
    if (!soundUrl || soundUrl === "none") return null;

    const fullUrl = await preloadSound(soundUrl, false);
    if (!fullUrl) return null;

    const audio = new Audio(fullUrl);
    audio.preload = "auto";
    audio.playbackRate = playbackRate;
    audio.volume = volume !== undefined ? Math.max(0, Math.min(1, volume)) : 0.04;

    if (audio.readyState < 3) {
        await new Promise<void>((resolve) => {
            const cleanup = () => {
                audio.removeEventListener("canplaythrough", onReady);
                audio.removeEventListener("loadeddata", onReady);
                audio.removeEventListener("error", onReady);
            };
            const onReady = () => {
                cleanup();
                resolve();
            };
            audio.addEventListener("canplaythrough", onReady, { once: true });
            audio.addEventListener("loadeddata", onReady, { once: true });
            audio.addEventListener("error", onReady, { once: true });
            window.setTimeout(onReady, 1200);
            audio.load();
        });
    }

    return () => {
        const now = Date.now();
        const lastPlay = soundLastPlayMap.get(soundUrl) ?? 0;
        if (now - lastPlay < 100) {
            return;
        }
        soundLastPlayMap.set(soundUrl, now);

        audio.play().catch((e) => {
            console.warn("[Embers] Audio playback blocked:", e);
        });

        if (durationMs && durationMs > 0) {
            window.setTimeout(() => {
                audio.pause();
                audio.currentTime = 0;
            }, durationMs);
        }
    };
}

export function playSpellSound(soundUrl: string, durationMs?: number, playbackRate: number = 1.0, volume?: number) {
    prepareSpellSound(soundUrl, durationMs, playbackRate, volume).then((play) => {
        if (play) play();
    });
}
