import { EffectInstruction, InteractionData, MessageType } from "../types/messageListener";
import { LOCAL_STORAGE_KEYS, getSettingsValue } from "../components/Settings/settings";
import OBR, { Image, InteractionManager, isImage } from "@owlbear-rodeo/sdk";
import { log_error } from "../logging";

import { AOEEffectMessage } from "../types/aoe";
import { APP_KEY } from "../config";
import { ConeMessage } from "../types/cone";
import { ProjectileMessage } from "../types/projectile";
import { actions } from "./actions";
import { getEffect } from "./effects";
import { projectile } from "./projectile";
import { cone } from "./cone";
import { aoe } from "./aoe";
import { waitMs, playSpellSound } from "../utils";

export const MESSAGE_CHANNEL = `${APP_KEY}/effects`;
export const BLUEPRINTS_CHANNEL = `${APP_KEY}/blueprints`;

export type InteractionUpdateFunc = (items: Image[], elapsed: number) => boolean;

export interface Interaction {
    manager: InteractionManager<Image[]>;
    registerUpdates: (items: Image[], onUpdate: InteractionUpdateFunc) => Promise<Image[]>;
    trackedIDs: string[];
    getLastKnownState: (items: string[]) => Image[];
    active: () => boolean;
}

const effectRegister = new Map<string, number>();

async function createItemInteractions({ ids, count }: InteractionData, localOnly: boolean): Promise<Interaction> {
    const originalItems = await OBR.scene.items.getItems(ids);
    const localItems = originalItems.map(item => ({...item, id: `embers-copy-${item.id}`, visible: true })).filter(item => isImage(item));
    const localItemIDs = localItems.map(item => item.id);
    const originalItemIDs = originalItems.map(item => item.id);

    const setupPromises = [
        OBR.scene.local.addItems(localItems),
    ];
    if (!localOnly) {
        setupPromises.push(
            OBR.scene.items.updateItems(originalItems, items => {
                for (const item of items) {
                    item.visible = false;
                }
            }
        ));
    }
    await Promise.all(setupPromises);

    const [update, stop] = await OBR.interaction.startItemInteraction(localItems);
    const ongoingUpdaters: { start: number, onUpdate: InteractionUpdateFunc, items: Image[], resolve: (items: Image[]) => void, resolved: boolean }[] = [];

    const updateDelay = 1000 / getSettingsValue(LOCAL_STORAGE_KEYS.ANIMATION_UPDATE_RATE);

    // Register a callback every "updateDelay" milliseconds
    let latestItems: Image[] = [];

    let animationFrameId: number;
    let lastUpdateTime = 0;
    
    const afterDelay = (timestamp: number) => {
        if (timestamp - lastUpdateTime >= updateDelay) {
            lastUpdateTime = timestamp;
            const now = Date.now();
            latestItems = update(itemsToUpdate => {
                for (const updater of ongoingUpdaters) {
                    const elapsed = now - updater.start;
                    const updaterItemIDs = updater.items.map(item => item.id.startsWith("embers-copy-") ? item.id : `embers-copy-${item.id}`);
                    const keepGoing = updater.onUpdate(
                        itemsToUpdate.filter(itemToUpdate => updaterItemIDs.includes(itemToUpdate.id.toString())),
                        elapsed
                    );
                    if (!keepGoing) {
                        count--;
                        updater.resolve(updater.items);
                        updater.resolved = true;
                    }
                }
            });

            for (let i = ongoingUpdaters.length - 1; i >= 0; i--) {
                if (ongoingUpdaters[i].resolved === true) {
                    ongoingUpdaters.splice(i, 1);
                }
            }
        }

        if (count > 0) {
            animationFrameId = requestAnimationFrame(afterDelay);
        } else {
            stop();
            if (!localOnly) {
                OBR.scene.items.updateItems(originalItemIDs, items => {
                    for (const item of items) {
                        const localItem = latestItems.find(latestItem => latestItem.id === `embers-copy-${item.id}`);
                        if (!localItem) continue;
                        item.visible = localItem.visible ?? true;
                        item.position = localItem.position;
                        item.scale = localItem.scale;
                        item.rotation = localItem.rotation;
                        item.locked = localItem.locked;
                    }
                });
            }
            OBR.scene.local.deleteItems(localItemIDs);
        }
    };
    
    animationFrameId = requestAnimationFrame(afterDelay);

    const registerUpdates = async (items: Image[], onUpdate: InteractionUpdateFunc) => {
        return new Promise<Image[]>(resolve => {
            ongoingUpdaters.push({
                start: (new Date()).getTime(),
                items,
                onUpdate,
                resolve,
                resolved: false
            });
        });
    }

    const getLastKnownState = (items: string[]) => {
        if (count > 0) {
            return latestItems.filter(item => items.includes(item.id));
        }
        return [];
    }

    const onUserCalledStop = () => {
    }

    return {
        manager: [
            update,
            onUserCalledStop
        ],
        registerUpdates,
        trackedIDs: ids,
        getLastKnownState,
        active: () => count > 0
    };
}

// 在 src/effects/messageListener.ts 中尋找 processInstruction
async function processInstruction(instruction: EffectInstruction, dpi: number, spellName?: string, spellCaster?: string, interaction?: Interaction) {
    const doMoreWork = async (instructions?: EffectInstruction[]) => {
        if (instructions == undefined) return;
        if (!Array.isArray(instructions)) return;
        await Promise.allSettled(instructions.map(instruction => processInstruction(instruction, dpi)));
    }

    const [playerId, playerRole] = await Promise.all([OBR.player.getId(), OBR.player.getRole()]);
    
    // 👇 新增這段追蹤日誌 👇
    console.log(`[Embers] 收到指令 ID: ${instruction.id || '無'}, 包含音效: ${instruction.sound || '無'}`);

    if (instruction.delay) {
        if (typeof instruction.delay !== "number") return;
        if (instruction.delay < 0) return;
        await waitMs(instruction.delay);
    }

    if (instruction.sound) {
        console.log(`[Embers] 觸發音效邏輯 ->`, instruction.sound);
        playSpellSound(instruction.sound, instruction.duration, 1.0, instruction.volume); // 👈 加上 instruction.volume
    }
    // 👆 新增這段追蹤日誌 👆

    if (instruction.id != undefined) {
        if (typeof instruction.id !== "string") {
            log_error(`Instruction id must be a string, not a "${typeof instruction.id}"`);
            return;
        }
        if (instruction.type === "effect") {
            if ((instruction.for === "GM" && playerRole !== "GM") || (instruction.for === "CASTER" && spellCaster !== playerId)) {
                // This won't be played for this player
                return;
            }
            const effect = getEffect(instruction.id);
            if (effect == undefined) {
                log_error(`Couldn't find effect "${instruction.id}"`);
                return;
            }
            const variant = effectRegister.get(instruction.id) ?? 1;
            if (instruction.duration != undefined && typeof instruction.duration !== "number") {
                log_error("Effect duration must be a number");
                return;
            }
            if (instruction.loops != undefined && typeof instruction.loops !== "number") {
                log_error("Effect loops must be a number");
                return;
            }
            if (effect.type === "TARGET" || effect.type === "WALL") {
                const projectileMessage = instruction.effectProperties as ProjectileMessage;
                if (projectileMessage.copies == undefined) {
                    projectileMessage.copies = 1;
                }
                if (typeof projectileMessage.copies !== "number" || projectileMessage.copies <= 0) {
                    log_error("The number of projectile copies must be an number and be >=0, not", projectileMessage.copies);
                    return;
                }
                if (
                    typeof projectileMessage.destination !== "object" ||
                    typeof projectileMessage.destination.x !== "number" ||
                    typeof projectileMessage.destination.y !== "number"
                ) {
                    log_error("The destination of a projectile must be a Vector2, not", projectileMessage.destination);
                    return;
                }
                if (
                    typeof projectileMessage.source !== "object" ||
                    typeof projectileMessage.source.x !== "number" ||
                    typeof projectileMessage.source.y !== "number"
                ) {
                    log_error("The source of a projectile must be a Vector2, not", projectileMessage.source);
                    return;
                }

                effectRegister.set(instruction.id!, (effectRegister.get(instruction.id!) ?? 0) + 1)
                await projectile(
                    {
                        name: instruction.id,
                        dpi,
                        ...projectileMessage
                    },
                    instruction.duration,
                    instruction.loops,
                    instruction.metadata,
                    instruction.layer,
                    instruction.zIndex,
                    variant,
                    spellName,
                    spellCaster
                );
                effectRegister.set(instruction.id!, (effectRegister.get(instruction.id!) ?? 1) - 1);
                await doMoreWork(instruction.instructions);
            }
            else if (effect.type === "CONE") {
                const coneMessage = instruction.effectProperties as ConeMessage;
                if (
                    typeof coneMessage.size !== "number"
                ) {
                    log_error("The size of a cone must be a number, not", coneMessage.size);
                    return;
                }
                if (
                    typeof coneMessage.rotation !== "number"
                ) {
                    log_error("The rotation of a cone must be a number, not", coneMessage.rotation);
                    return;
                }
                if (
                    typeof coneMessage.source !== "object" ||
                    typeof coneMessage.source.x !== "number" ||
                    typeof coneMessage.source.y !== "number"
                ) {
                    log_error("The source of a cone must be a number, not", coneMessage.source);
                    return;
                }

                effectRegister.set(instruction.id!, (effectRegister.get(instruction.id!) ?? 0) + 1)
                await cone(
                    {
                        name: instruction.id,
                        dpi,
                        ...coneMessage
                    },
                    instruction.duration,
                    instruction.loops,
                    instruction.metadata,
                    instruction.layer,
                    instruction.zIndex,
                    variant,
                    spellName,
                    spellCaster
                );
                effectRegister.set(instruction.id!, (effectRegister.get(instruction.id!) ?? 1) - 1)
                await doMoreWork(instruction.instructions);
            }
            else if (effect.type === "CIRCLE") {
                const aoeEffectMessage = instruction.effectProperties as AOEEffectMessage;
                if (typeof aoeEffectMessage.size !== "number") {
                    log_error(`The size of an AOE effect must be a number, not a ${typeof aoeEffectMessage.size}`);
                    return;
                }
                if (aoeEffectMessage.rotation != undefined && typeof aoeEffectMessage.rotation !== "number") {
                    log_error(`The rotation of an AOE effect must be a number, not a ${typeof aoeEffectMessage.rotation}`);
                    return;
                }
                if (
                    typeof aoeEffectMessage.source !== "object" ||
                    typeof aoeEffectMessage.source.x !== "number" ||
                    typeof aoeEffectMessage.source.y !== "number"
                ) {
                    log_error("The source of an AOE effect must be a Vector2, not", aoeEffectMessage.source);
                    return;
                }

                effectRegister.set(instruction.id!, (effectRegister.get(instruction.id!) ?? 0) + 1)
                await aoe(
                    {
                        name: instruction.id,
                        dpi,
                        ...aoeEffectMessage
                    },
                    instruction.duration,
                    instruction.loops,
                    instruction.metadata,
                    instruction.layer,
                    instruction.zIndex,
                    variant,
                    instruction.forceVariant,
                    spellName,
                    spellCaster
                );
                effectRegister.set(instruction.id!, (effectRegister.get(instruction.id!) ?? 1) - 1)
                await doMoreWork(instruction.instructions);
            }
        }
        else if (instruction.type === "action") {
            const localOnly = (instruction.for === "GM" && playerRole !== "GM") || (instruction.for === "CASTER" && spellCaster !== playerId);
            const actionObject = actions[instruction.id];
            const action = actionObject.action;
            if (action == undefined) {
                log_error(`Invalid blueprint: undefined action "${instruction.id}"`);
                return;
            }
            await action(interaction, localOnly, ...(instruction.arguments ?? []));
        }
        else {
            log_error(`Invalid instruction type "${instruction.type}"`);
            return;
        }
    }
}

export function setupMessageListener() {
    // 效能優化：將 playerId, dpi, party 快取在監聽器外部，避免施法瞬間觸發網路請求阻塞動畫
    let cachedPlayerId: string | undefined;
    let cachedDpi: number | undefined;
    let cachedParty: any[] = [];

    OBR.player.getId().then(id => cachedPlayerId = id);
    OBR.scene.grid.getDpi().then(dpi => cachedDpi = dpi);
    OBR.party.getPlayers().then(players => cachedParty = players);

    const unsubGrid = OBR.scene.grid.onChange(grid => cachedDpi = grid.dpi);
    const unsubParty = OBR.party.onChange(players => cachedParty = players);

    const unsubMessage = OBR.broadcast.onMessage(MESSAGE_CHANNEL, async message => {
        const messageData = message.data as MessageType;
        if (!Array.isArray(messageData.instructions)) {
            log_error("Malformatted message: message.instructions is not an array");
        }
        
        let spellName = messageData.spellData ? messageData.spellData.name : undefined;
        let spellCaster = messageData.spellData ? messageData.spellData.caster : undefined;
        
        const playerId = cachedPlayerId ?? await OBR.player.getId();
        const dpi = cachedDpi ?? await OBR.scene.grid.getDpi();

        // 🌟 強制捕獲施法者 ID：使用快取的 party 資料，移除 await OBR.party.getPlayers() 的延遲
        if (!spellCaster) {
            if (message.connectionId === OBR.player.connectionId) {
                spellCaster = playerId;
            } else {
                const sender = cachedParty.find(p => p.connectionId === message.connectionId);
                if (sender) spellCaster = sender.id;
            }
        }
        
        // 🌟 強制賦予法術名稱：確保能被 Active Effects 列表抓到
        if (!spellName && messageData.instructions && messageData.instructions.length > 0) {
            spellName = messageData.instructions[0].id;
        }

        try {
            const interactions = messageData.interactions;
            const interaction = await ((interactions === undefined || interactions.ids.length === 0) ?
                (new Promise<undefined>(resolve => resolve(undefined))) :
                createItemInteractions(interactions, spellCaster != undefined && playerId !== spellCaster));

            await Promise.allSettled(messageData.instructions.map(async instruction => {
                await processInstruction(instruction, dpi, spellName, spellCaster, interaction);
            }));
        }
        catch(error) {
            log_error(error);
        }
    });

    return () => {
        unsubGrid();
        unsubParty();
        unsubMessage();
    };
}
