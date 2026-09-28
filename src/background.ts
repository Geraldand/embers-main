import OBR, { Item } from "@owlbear-rodeo/sdk";
import LZString from "lz-string";
import { setupDefaultCasterMenuOption, setupEffectsTool } from "./effectsTool";
import { sendSpellsUpdate, setupGMLocalSpells, setupPlayerLocalSpells } from "./effects/localSpells";
import { constants } from "./constants";
import { setupMessageListener } from "./effects/messageListener";
import spellsRecord from "./assets/spells_record.json";
import { APP_KEY, ASSET_LOCATION } from "./config";
import { getEffect, prefetchAssets } from "./effects/effects";
import { resolveSimpleValue } from "./effects/blueprint";
import { getSpell } from "./effects/spells";
import { Variables } from "./types/blueprint";
import { preloadSound, safeJsonParse } from "./utils";

interface SpellPreloadTask {
    spellId: string;
    params?: Record<string, unknown>;
}

const preloadedTaskKeys = new Set<string>();

function buildSpellVariables(spell: any, spellId: string, customParams?: Record<string, unknown>): Variables {
    const variables: Variables = {};

    if (Array.isArray(spell.parameters)) {
        for (const param of spell.parameters) {
            if (param && param.id && param.defaultValue !== undefined) {
                variables[param.id] = param.defaultValue;
            }
        }
    }

    const savedParams = safeJsonParse<Record<string, unknown>>(
        localStorage.getItem(`${APP_KEY}/spell-parameters/${spellId}`),
        {}
    );
    Object.assign(variables, savedParams);

    if (customParams && typeof customParams === "object") {
        Object.assign(variables, customParams);
    }

    return variables;
}

function collectBlueprintAssets(
    blueprints: any[] | undefined,
    variables: Variables,
    videoUrls: Set<string>,
    soundUrls: Set<string>
) {
    if (!Array.isArray(blueprints)) return;

    for (const bp of blueprints) {
        if (!bp) continue;

        // Evaluate parameter conditions to skip unused weapon or sound branches
        if (bp.disabled !== undefined) {
            const disabledStr = JSON.stringify(bp.disabled);
            if (!disabledStr.includes("target")) {
                const disabledRes = resolveSimpleValue<boolean>(bp.disabled, "disabled", "boolean", variables);
                if (!disabledRes.error && disabledRes.value === true) {
                    continue;
                }
            }
        }

        if (bp.sound !== undefined) {
            const soundRes = resolveSimpleValue<string>(bp.sound, "sound", "string", variables);
            if (!soundRes.error && soundRes.value && soundRes.value !== "none") {
                soundUrls.add(soundRes.value);
            }
        }

        if (bp.id !== undefined) {
            const idRes = resolveSimpleValue<string>(bp.id, "ID", "string", variables);
            if (!idRes.error && idRes.value && idRes.value !== "none") {
                const effect = getEffect(idRes.value);
                if (effect && effect.basename && effect.variants) {
                    for (const variant of Object.values(effect.variants)) {
                        for (const name of variant.name) {
                            videoUrls.add(`${ASSET_LOCATION}/${effect.basename}_${name}.webm`);
                        }
                    }
                }
            }
        }

        if (Array.isArray(bp.blueprints)) {
            collectBlueprintAssets(bp.blueprints, variables, videoUrls, soundUrls);
        }
        if (Array.isArray(bp.instructions)) {
            collectBlueprintAssets(bp.instructions, variables, videoUrls, soundUrls);
        }
    }
}

function collectTasksFromItems(items: Item[], tasks: SpellPreloadTask[]) {
    const extractEntry = (entry: any) => {
        if (!entry) return;
        const id = entry.embersId || (typeof entry === "string" ? entry : null);
        if (id && typeof id === "string" && id.trim() !== "") {
            const params = entry.embersVariants || entry.variants || undefined;
            tasks.push({ spellId: id.trim(), params });
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

async function preloadSpellTasks(tasks: SpellPreloadTask[], isGM: boolean, customSpells: Record<string, any> = {}) {
    const videoUrls = new Set<string>();
    const soundUrls = new Set<string>();

    for (const task of tasks) {
        if (!task.spellId) continue;
        const taskKey = `${task.spellId}:${JSON.stringify(task.params || {})}`;
        if (preloadedTaskKeys.has(taskKey)) continue;

        const spell = getSpell(task.spellId, isGM) || customSpells[task.spellId];
        if (!spell) continue;

        preloadedTaskKeys.add(taskKey);
        if (spell.thumbnail) {
            videoUrls.add(`${ASSET_LOCATION}/${spell.thumbnail}`);
        }

        const variables = buildSpellVariables(spell, task.spellId, task.params);
        collectBlueprintAssets(spell.blueprints, variables, videoUrls, soundUrls);
        collectBlueprintAssets(spell.onDestroyBlueprints, variables, videoUrls, soundUrls);
    }

    // Preload small audio assets first so sound effects are ready immediately
    await Promise.all(
        Array.from(soundUrls).map(sound => preloadSound(sound, true).catch(() => {}))
    );

    // Preload video assets in a rate-limited background queue
    if (videoUrls.size > 0) {
        prefetchAssets(Array.from(videoUrls), true).catch(() => {});
    }
}

async function targetedPreloadAssets() {
    preloadSound("/click.mp3", false).catch(() => {});

    try {
        const [roomMeta, role, items] = await Promise.all([
            OBR.room.getMetadata(),
            OBR.player.getRole(),
            OBR.scene.items.getItems()
        ]);
        const isGM = role === "GM";
        const customSpells = (roomMeta["embers-custom/spells"] || {}) as Record<string, any>;
        const tasks: SpellPreloadTask[] = [];

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
                    tasks.push({ spellId: id.startsWith("$.") ? id : `$.${id}` });
                }
            });
        }

        // Scan user spellbook groups with their bound parameters
        const spellbookGroups = safeJsonParse<Record<string, any[]>>(
            localStorage.getItem(`${APP_KEY}/spellbook/${OBR.room.id}`),
            {}
        );
        for (const group of Object.values(spellbookGroups)) {
            if (Array.isArray(group)) {
                group.forEach((inst: any) => {
                    if (typeof inst === "string") {
                        tasks.push({ spellId: inst });
                    } else if (inst?.baseSpellId) {
                        tasks.push({ spellId: inst.baseSpellId, params: inst.parameters });
                    }
                });
            }
        }

        // Scan tokens currently on the scene with their bound parameters
        collectTasksFromItems(items, tasks);

        await preloadSpellTasks(tasks, isGM, customSpells);
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

    // Automatically preload bound assets when new tokens are added to the scene
    let preloadTimeoutId: number;
    const unsubscribeItems = OBR.scene.items.onChange((items) => {
        clearTimeout(preloadTimeoutId);
        preloadTimeoutId = window.setTimeout(async () => {
            const role = await OBR.player.getRole();
            const newTasks: SpellPreloadTask[] = [];
            collectTasksFromItems(items, newTasks);
            await preloadSpellTasks(newTasks, role === "GM");
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