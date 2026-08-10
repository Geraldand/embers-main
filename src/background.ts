import OBR from "@owlbear-rodeo/sdk";
import { setupDefaultCasterMenuOption, setupEffectsTool } from "./effectsTool";
import { sendSpellsUpdate, setupGMLocalSpells, setupPlayerLocalSpells } from "./effects/localSpells";
import { constants } from "./constants";
import { setupMessageListener } from "./effects/messageListener";
import spellsRecord from "./assets/spells_record.json";
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
        // 👇 2. 記得在擴充功能卸載時清除監聽器
        unsubSpellsRequest();
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
