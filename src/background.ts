import OBR from "@owlbear-rodeo/sdk";
import { setupDefaultCasterMenuOption, setupEffectsTool } from "./effectsTool";
import { sendSpellsUpdate, setupGMLocalSpells, setupPlayerLocalSpells } from "./effects/localSpells";
import { constants } from "./constants";
import { setupMessageListener } from "./effects/messageListener";
import spellsRecord from "./assets/spells_record.json";
import effectRecord from "./assets/effect_record.json"; // 🌟 新增：引入 effectRecord 以便讀取 WebM 檔名

// 🌟 新增：自動收集並預載所有素材的函數
async function backgroundPreloadAssets() {
    const urlsToPreload = new Set<string>();

    urlsToPreload.add("/click.mp3");

    try {
        Object.values(spellsRecord as Record<string, any>).forEach((spell) => {
            if (spell.thumbnail) urlsToPreload.add(`/Library/${spell.thumbnail}`);
            if (Array.isArray(spell.blueprints)) {
                spell.blueprints.forEach((bp: any) => {
                    if (bp.sound) urlsToPreload.add(`/sounds/${bp.sound}`);
                    if (bp.id && (effectRecord as Record<string, any>)[bp.id]) {
                        const effect = (effectRecord as Record<string, any>)[bp.id];
                        if (effect.basename) urlsToPreload.add(`/Library/${effect.basename}.webm`);
                    }
                });
            }
        });

        const metadata = await OBR.room.getMetadata();
        const customSpells = metadata["embers-custom/spells"] as Record<string, any>;
        if (customSpells) {
            Object.values(customSpells).forEach((spell) => {
                if (spell.thumbnail) urlsToPreload.add(`/Library/${spell.thumbnail}`);
                if (Array.isArray(spell.blueprints)) {
                    spell.blueprints.forEach((bp: any) => {
                        if (bp.sound) urlsToPreload.add(`/sounds/${bp.sound}`);
                    });
                }
            });
        }
    } catch (e) {
        console.warn("[Embers Background] 預載掃描失敗:", e);
    }

    urlsToPreload.forEach((url) => {
        fetch(url).catch(() => {});
    });
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

    // 👇 1. 將清單精簡後，寫入 Scene Metadata
    const embersIndex = Object.entries(spellsRecord).map(([id, data]: [string, any]) => ({
        id,
        name: data.name,
        parameters: data.parameters || []
    }));
    
    OBR.scene.getMetadata().then(meta => {
        // 先檢查是否已經存在，避免無限迴圈寫入
        if (JSON.stringify(meta["com.battle-system.smoke/spell-index"]) !== JSON.stringify(embersIndex)) {
            OBR.scene.setMetadata({ "com.battle-system.smoke/spell-index": embersIndex });
        }
    });

    // 🌟 新增：場景準備好時，啟動背景全自動預載
    backgroundPreloadAssets();

    // 🌟 新增：監聽地圖上的 Token 變動 (換地圖或拖入新怪物時觸發預載)
    const unsubscribeItems = OBR.scene.items.onChange((items) => {
        items.forEach((item) => {
            const equippedSpell = item.metadata["embers-custom/equipped-spell"] as string;
            if (equippedSpell && (spellsRecord as Record<string, any>)[equippedSpell]) {
                const spell = (spellsRecord as Record<string, any>)[equippedSpell];
                if (spell.thumbnail) fetch(`/Library/${spell.thumbnail}`).catch(() => {});
                if (Array.isArray(spell.blueprints)) {
                    spell.blueprints.forEach((bp: any) => {
                        if (bp.sound) fetch(`/sounds/${bp.sound}`).catch(() => {});
                    });
                }
            }
        });
    });

    let interval: number | null = null;
    let lastRole: string, lastId: string;
    let unsubscribeTool: (() => void) | null = null;
    let unsubscribeLocalSpells: (() => void) | null = null;

    Promise.all([
        OBR.player.getRole(),
        OBR.player.getId(),
    ]).then(([role, id]) => {
        unsubscribeTool = setupEffectsTool(role, id);
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

        unsubscribeTool = setupEffectsTool(player.role, player.id);
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

function setup() {
    if (window.interactionRecord) {
        window.interactionRecord.clear();
    }
    else {
        window.interactionRecord = new Map();
    }

    setupMessageListener();

    let unsubscribe: (() => void) | null = null;
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