import OBR, { Item } from "@owlbear-rodeo/sdk";
import LZString from "lz-string";
import { setupDefaultCasterMenuOption, setupEffectsTool } from "./effectsTool";
import { sendSpellsUpdate, setupGMLocalSpells, setupPlayerLocalSpells } from "./effects/localSpells";
import { constants } from "./constants";
import { setupMessageListener } from "./effects/messageListener";
import spellsRecord from "./assets/spells_record.json";
import { APP_KEY, ASSET_LOCATION } from "./config";
import { effects, getEffect, prefetchAssets } from "./effects/effects";
import { getSpell } from "./effects/spells";
import { preloadSound, safeJsonParse } from "./utils";

const preloadedSpellIds = new Set<string>();

function extractEffectPrefixes(idValue: any): string[] {
    if (!idValue) return [];
    if (typeof idValue === "string" && !idValue.startsWith("$")) {
        return [idValue];
    }
    if (typeof idValue === "object" && Array.isArray(idValue.arguments)) {
        const results: string[] = [];
        for (const arg of idValue.arguments) {
            if (typeof arg === "string" && !arg.startsWith("$") && arg.length > 1) {
                results.push(arg.endsWith(".") ? arg.slice(0, -1) : arg);
            } else if (typeof arg === "object") {
                results.push(...extractEffectPrefixes(arg));
            }
        }
        return results;
    }
    return [];
}

function addEffectNodeVideos(node: any, videoUrls: Set<string>) {
    if (!node || typeof node !== "object") return;
    if (node.basename && node.variants) {
        for (const variant of Object.values(node.variants) as any[]) {
            if (variant && Array.isArray(variant.name)) {
                for (const name of variant.name) {
                    videoUrls.add(`${ASSET_LOCATION}/${node.basename}_${name}.webm`);
                }
            }
        }
        return;
    }
    for (const child of Object.values(node)) {
        addEffectNodeVideos(child, videoUrls);
    }
}

function getEffectNode(path: string): any {
    const direct = getEffect(path);
    if (direct) return direct;
    let current: any = effects;
    for (const key of path.split(".")) {
        if (!current || typeof current !== "object") return undefined;
        current = current[key];
    }
    return current;
}

function collectBlueprintAssets(blueprints: any[] | undefined, videoUrls: Set<string>, soundUrls: Set<string>) {
    if (!Array.isArray(blueprints)) return;
    for (const bp of blueprints) {
        if (!bp) continue;
        if (bp.sound && typeof bp.sound === "string" && bp.sound !== "none") {
            soundUrls.add(bp.sound);
        }
        const prefixes = extractEffectPrefixes(bp.id);
        for (const prefix of prefixes) {
            const node = getEffectNode(prefix);
            if (node) {
                addEffectNodeVideos(node, videoUrls);
            }
        }
        if (Array.isArray(bp.blueprints)) {
            collectBlueprintAssets(bp.blueprints, videoUrls, soundUrls);
        }
        if (Array.isArray(bp.instructions)) {
            collectBlueprintAssets(bp.instructions, videoUrls, soundUrls);
        }
    }
}

function collectSpellIdsFromItems(items: Item[], targetSet: Set<string>) {
    const extractEntry = (entry: any) => {
        if (!entry) return;
        const id = entry.embersId || (typeof entry === "string" ? entry : null);
        if (id && typeof id === "string") {
            targetSet.add(id.trim());
        }
    };

    for (const item of items) {
        for (const [key, rawValue] of Object.entries(item.metadata || {})) {
            if (!rawValue) continue;
            let val: any = rawValue;
            if (typeof val === "string") {
                if (val.startsWith("{") || val.startsWith("[")) {
                    val = safeJsonParse<any>(val, null);
                } else if (key.includes("equipped-spell") || key.includes("spell")) {
                    extractEntry(val);
                    continue;
                }
            }
            if (Array.isArray(val)) {
                val.forEach(extractEntry);
            } else if (val && typeof val === "object") {
                if (Array.isArray(val.actions)) val.actions.forEach(extractEntry);
                else if (val.actions && typeof val.actions === "object") Object.values(val.actions).forEach(extractEntry);

                if (Array.isArray(val.spells)) val.spells.forEach(extractEntry);
                else if (val.spells && typeof val.spells === "object") Object.values(val.spells).forEach(extractEntry);

                if (val["equipped-spell"]) {
                    const eq = val["equipped-spell"];
                    if (Array.isArray(eq)) eq.forEach(extractEntry);
                    else extractEntry(eq);
                }
                if (val.embersId) extractEntry(val);
            }
        }
    }
}

async function preloadSpellsByIds(spellIds: Iterable<string>, isGM: boolean, customSpells: Record<string, any> = {}) {
    const videoUrls = new Set<string>();
    const soundUrls = new Set<string>();

    for (const spellId of spellIds) {
        if (!spellId || preloadedSpellIds.has(spellId)) continue;
        const spell = getSpell(spellId, isGM) || customSpells[spellId];
        if (!spell) continue;

        preloadedSpellIds.add(spellId);
        if (spell.thumbnail) {
            videoUrls.add(`${ASSET_LOCATION}/${spell.thumbnail}`);
        }
        collectBlueprintAssets(spell.blueprints, videoUrls, soundUrls);
        collectBlueprintAssets(spell.onDestroyBlueprints, videoUrls, soundUrls);
    }

    if (videoUrls.size > 0) {
        prefetchAssets(Array.from(videoUrls)).catch(() => {});
    }
    soundUrls.forEach(sound => {
        preloadSound(sound).catch(() => {});
    });
}

async function targetedPreloadAssets() {
    preloadSound("/click.mp3").catch(() => {});

    try {
        const [roomMeta, role, items] = await Promise.all([
            OBR.room.getMetadata(),
            OBR.player.getRole(),
            OBR.scene.items.getItems()
        ]);
        const isGM = role === "GM";
        const customSpells = (roomMeta["embers-custom/spells"] || {}) as Record<string, any>;
        const spellIdsToPreload = new Set<string>();

        // Scan custom spell list
        const customList = safeJsonParse<any>(
            localStorage.getItem(`${constants.SPELL_LIST_METADATA_KEY}/${OBR.room.id}`) ||
            localStorage.getItem(constants.SPELL_LIST_METADATA_KEY),
            []
        );
        if (Array.isArray(customList)) {
            customList.forEach((entry: any) => {
                const id = Array.isArray(entry) ? entry[0] : entry;
                if (typeof id === "string") {
                    spellIdsToPreload.add(id.startsWith("$.") ? id : `$.${id}`);
                }
            });
        }

        // Scan user spellbook groups
        const spellbookGroups = safeJsonParse<Record<string, any[]>>(
            localStorage.getItem(`${APP_KEY}/spellbook/${OBR.room.id}`),
            {}
        );
        for (const group of Object.values(spellbookGroups)) {
            if (Array.isArray(group)) {
                group.forEach((inst: any) => {
                    if (typeof inst === "string") spellIdsToPreload.add(inst);
                    else if (inst?.baseSpellId) spellIdsToPreload.add(inst.baseSpellId);
                });
            }
        }

        // Scan tokens currently on the scene
        collectSpellIdsFromItems(items, spellIdsToPreload);

        await preloadSpellsByIds(spellIdsToPreload, isGM, customSpells);
    } catch (e) {
        console.warn("[Embers Background] Targeted preload failed:", e);
    }
}

function loadSpellListFromLocalStorage() {
    // Update scene metadata
    const spellListJSON = localStorage.getItem(constants.SPELL_LIST_METADATA_KEY);
    if (spellListJSON == undefined) {
        return;
    }
    const spellList = JSON.parse(spellListJSON);
    OBR.scene.setMetadata({[constants.SPELL_LIST_METADATA_KEY]: spellList});
}

function setupLocalSpells(role: "GM" | "PLAYER") {
    if (role === "PLAYER") {
        return setupPlayerLocalSpells();
    }
    else if (role === "GM") {
        return setupGMLocalSpells();
    }
    return null;
}

function setupScene() {
    setupDefaultCasterMenuOption();
    loadSpellListFromLocalStorage();

    const embersIndex = Object.entries(spellsRecord).map(([id, data]: [string, any]) => ({
        id,
        name: data.name,
        parameters: data.parameters || []
    }));
    
    OBR.scene.getMetadata().then(meta => {
        if (JSON.stringify(meta["com.battle-system.smoke/spell-index"]) !== JSON.stringify(embersIndex)) {
            OBR.scene.setMetadata({ "com.battle-system.smoke/spell-index": embersIndex });
        }
    });

    // 👇 1. 啟動精準預載 (只載入法術書與地圖 Token 的素材) 👇
    targetedPreloadAssets();

    // Automatically preload assets when new tokens with spells are added to the scene
    let preloadTimeoutId: number;
    const unsubscribeItems = OBR.scene.items.onChange((items) => {
        clearTimeout(preloadTimeoutId);
        preloadTimeoutId = window.setTimeout(async () => {
            const role = await OBR.player.getRole();
            const newSpellIds = new Set<string>();
            collectSpellIdsFromItems(items, newSpellIds);
            await preloadSpellsByIds(newSpellIds, role === "GM");
        }, 500);
    });

    let interval: number | null = null;
    let lastRole: string, lastId: string;
    let unsubscribeTool: (() => void) | null = null;
    let unsubscribeLocalSpells: (() => void) | null = null;

    Promise.all([
        OBR.player.getRole(),
        OBR.player.getId(),
    ]).then(([role, id]) => {
        unsubscribeTool = setupEffectsTool(role, id) ?? null;
        unsubscribeLocalSpells = setupLocalSpells(role);

        if (role === "GM") {
            interval = window.setInterval(() => {
                sendSpellsUpdate("all");
            }, 30000);
        }

        lastRole = role;
        lastId = id;
    });

    const unsubscribePlayer = OBR.player.onChange(player => {
        if (player.role === lastRole && player.id === lastId) return;

        if (unsubscribeTool) unsubscribeTool();
        if (unsubscribeLocalSpells) unsubscribeLocalSpells();
        if (interval !== null) clearInterval(interval);

        unsubscribeTool = setupEffectsTool(player.role, player.id) ?? null;
        unsubscribeLocalSpells = setupLocalSpells(player.role);
        interval = window.setInterval(() => {
            sendSpellsUpdate("all");
        }, 30000);
    });

    return () => {
        if (interval !== null) clearInterval(interval);
        unsubscribePlayer();
        unsubscribeTool?.();
        unsubscribeItems(); // 🌟 新增：卸載時清除 Token 監聽器
        
        // 依照你原本的程式碼，如果有這行則保留
        // unsubSpellsRequest();
    };
}

let unsubscribeMessageListener: (() => void) | null = null;

function setup() {
    if (window.interactionRecord) {
        window.interactionRecord.clear();
    }
    else {
        window.interactionRecord = new Map();
    }

    if (unsubscribeMessageListener) {
        unsubscribeMessageListener();
    }
    unsubscribeMessageListener = setupMessageListener() as unknown as (() => void);

    let unsubscribe: (() => void) | null = null;
    OBR.broadcast.onMessage("eu.armindo.embers/story-sync", async (msg) => {
        let payload = msg.data as any;
        
        // Decompress data if it is a compressed string
        if (typeof payload === "string") {
            try {
                payload = JSON.parse(LZString.decompressFromUTF16(payload));
            } catch (e) {
                console.warn("Failed to decompress broadcast message", e);
            }
        }

        if (payload.type === "FORCE_OPEN_LEGACY") {
            const role = await OBR.player.getRole();
            const myId = await OBR.player.getId();
            
            // Check player targeting and exclude DM
            if (role === "GM") return;
            
            const targets = payload.targets || ["ALL"];
            if (targets.includes("ALL") || targets.includes(myId)) {
                localStorage.setItem(`eu.armindo.embers/current-broadcast-legacy`, JSON.stringify(payload.legacy));
                OBR.modal.open({
                    id: "eu.armindo.embers/legacy-reader",
                    url: `/?view=legacy-reader`,
                    width: 500,
                    height: 650,
                });
            }
        }
    });
    OBR.scene.isReady().then(ready => {
        if (ready) {
            unsubscribe = setupScene();
        }
    });
    OBR.scene.onReadyChange(ready => {
        if (unsubscribe) {
            unsubscribe();
            unsubscribe = null;
        }
        if (ready) {
            unsubscribe = setupScene();
        }
    });
}

OBR.onReady(setup);