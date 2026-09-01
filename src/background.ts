import OBR from "@owlbear-rodeo/sdk";
import { setupDefaultCasterMenuOption, setupEffectsTool } from "./effectsTool";
import { sendSpellsUpdate, setupGMLocalSpells, setupPlayerLocalSpells } from "./effects/localSpells";
import { constants } from "./constants";
import { setupMessageListener } from "./effects/messageListener";
import spellsRecord from "./assets/spells_record.json";
import effectRecord from "./assets/effect_record.json"; // 🌟 新增：引入 effectRecord 以便讀取 WebM 檔名

// 🌟 替換原本的 backgroundPreloadAssets，改為「精準預載」
async function targetedPreloadAssets() {
    const urlsToPreload = new Set<string>();

    // 必載的基礎音效
    urlsToPreload.add("/click.mp3");

    try {
        // 1. 取得房間內的自訂法術字典
        const roomMeta = await OBR.room.getMetadata();
        const customSpells = (roomMeta["embers-custom/spells"] || {}) as Record<string, any>;

        // 輔助函數：用 ID 找出法術的詳細資料
        const getSpellData = (spellId: string) => {
            return (spellsRecord as Record<string, any>)[spellId] || customSpells[spellId];
        };

        // 輔助函數：將單一法術的動畫與音效網址加入預載清單
        const addSpellAssets = (spell: any) => {
            if (!spell) return;
            if (spell.thumbnail) urlsToPreload.add(`/Library/${spell.thumbnail}`);
            if (Array.isArray(spell.blueprints)) {
                spell.blueprints.forEach((bp: any) => {
                    // 加入音效
                    if (bp.sound && typeof bp.sound === "string") {
                        urlsToPreload.add(`/sounds/${bp.sound}`);
                    }
                    // 加入 WebM 動畫
                    if (bp.id && (effectRecord as Record<string, any>)[bp.id]) {
                        const effect = (effectRecord as Record<string, any>)[bp.id];
                        if (effect.basename && effect.variants) {
                            const variantKey = Object.keys(effect.variants)[0];
                            if (variantKey) {
                                const variantName = effect.variants[variantKey].name[0];
                                urlsToPreload.add(`/Library/${effect.basename}_${variantName}.webm`);
                            }
                        }
                    }
                });
            }
        };

        // 🌟 核心目標 A：掃描使用者的「法術書」
        const spellListJSON = localStorage.getItem(`${constants.SPELL_LIST_METADATA_KEY}/${OBR.room.id}`);
        if (spellListJSON) {
            const spellList = JSON.parse(spellListJSON);
            // 假設 spellList 是陣列或物件，將裡面的法術 ID 抽出來預載
            if (Array.isArray(spellList)) {
                spellList.forEach((id: string) => addSpellAssets(getSpellData(id)));
            } else if (typeof spellList === "object") {
                Object.keys(spellList).forEach((id: string) => addSpellAssets(getSpellData(id)));
            }
        }

        // 🌟 核心目標 B：掃描「目前場景地圖上」的所有 Token
        const items = await OBR.scene.items.getItems();
        items.forEach((item) => {
            const equippedSpell = item.metadata["embers-custom/equipped-spell"];
            // 處理 Token 身上綁定的是單一法術或多個法術的情況
            if (typeof equippedSpell === "string") {
                addSpellAssets(getSpellData(equippedSpell));
            } else if (Array.isArray(equippedSpell)) {
                equippedSpell.forEach(id => addSpellAssets(getSpellData(id)));
            }
        });

    } catch (e) {
        console.warn("[Embers Background] 精準預載掃描失敗:", e);
    }

    // 🌟 執行溫和預載：只下載清單上的這幾招！
    urlsToPreload.forEach((url) => {
        const fullUrl = url.startsWith("http") ? url : window.location.origin + url;
        fetch(fullUrl, { mode: 'cors', cache: 'force-cache' }).catch(() => {});
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

    // 👇 2. 依然保留這個監聽器 👇
    // 當 DM 在戰鬥中途拉了一隻「新怪物 Token」上場時，自動瞬間幫大家下載那隻怪物的專屬招式
    const preloadedSpells = new Set<string>(); // 快取已預載的法術ID，避免拖曳時頻繁觸發
    let preloadTimeoutId: number;
    const unsubscribeItems = OBR.scene.items.onChange((items) => {
        clearTimeout(preloadTimeoutId);
        preloadTimeoutId = window.setTimeout(() => {
            items.forEach((item) => {
                const equipped = item.metadata["embers-custom/equipped-spell"];
                if (!equipped) return;

                // 兼容單一法術字串或多法術陣列
                const spellIds = Array.isArray(equipped) ? equipped : [equipped];

                spellIds.forEach((spellId) => {
                    if (typeof spellId !== "string" || preloadedSpells.has(spellId)) return;

                    const spell = (spellsRecord as Record<string, any>)[spellId];
                    if (spell) {
                        preloadedSpells.add(spellId);
                        if (spell.thumbnail) fetch(window.location.origin + `/Library/${spell.thumbnail}`, { mode: 'cors', cache: 'force-cache' }).catch(() => {});
                        if (Array.isArray(spell.blueprints)) {
                            spell.blueprints.forEach((bp: any) => {
                                if (bp.sound && typeof bp.sound === "string") {
                                    fetch(window.location.origin + `/sounds/${bp.sound}`, { mode: 'cors', cache: 'force-cache' }).catch(() => {});
                                }
                            });
                        }
                    }
                });
            });
        }, 500); // 效能優化：加入 500ms 防抖，避免移動 Token 造成背景狂掃描
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

let unsubscribeMessageListener: (() => void) | null = null;

function setup() {
    if (window.interactionRecord) {
        window.interactionRecord.clear();
    }
    else {
        window.interactionRecord = new Map();
    }

    // 解決動畫播放兩次的問題：清除舊的廣播監聽器，避免重複註冊
    if (unsubscribeMessageListener) {
        unsubscribeMessageListener();
    }
    unsubscribeMessageListener = setupMessageListener() as unknown as (() => void);

    let unsubscribe: (() => void) | null = null;
    OBR.broadcast.onMessage("eu.armindo.embers/story-sync", async (msg) => {
        const payload = msg.data as any;
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