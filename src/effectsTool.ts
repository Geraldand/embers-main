import { GLOBAL_STORAGE_KEYS, LOCAL_STORAGE_KEYS, SETTINGS_CHANNEL, getGlobalSettingsValue, getSettingsValue, setSettingsValue } from "./components/Settings/settings";
import OBR, { Image, Item, Vector2, buildImage, isImage } from "@owlbear-rodeo/sdk";
import { APP_KEY, ASSET_LOCATION } from "./config";
import { doSpell, getSpell } from "./effects/spells";
import { prefetchAssets, getEffect } from "./effects/effects";
import { getItemSize } from "./utils";
import { log_error } from "./logging";
import { spellPopoverId } from "./views/SpellSelectionPopover";

export const toolID = `${APP_KEY}/effect-tool`;
export const toolMetadataSelectedSpell = `${APP_KEY}/selected-spell`;
export const effectsToolModeID = `${APP_KEY}/effects-tool-mode`;
export const removeTargetToolModeID = `${APP_KEY}/remove-effects-tool-mode`;
export const effectsToolActionID = `${APP_KEY}/effects-tool-action`;
export const settingsToolActionID = `${APP_KEY}/settings-tool-action`;
export const selectSpellToolActionID = `${APP_KEY}/select-spell-tool-action`;
export const clearTargetSelectionToolActionID = `${APP_KEY}/clear-target-selection-tool-action`;
export const targetHighlightMetadataKey = `${APP_KEY}/target-highlight`;
export const previousToolMetadataKey = `${APP_KEY}/previous-tool`;
export const playerSelectedTargetsMetadataKey = `${APP_KEY}/selected-targets`;
export const defaultCasterMenuId = `${APP_KEY}/default-caster-menu`;

export interface TargetHighlightMetadata {
    id: number;
    count: number;
}

function deactivateTool() {
    OBR.scene.local.getItems().then(items => {
        const targets = items.filter(item => item.metadata[targetHighlightMetadataKey] != undefined);
        OBR.scene.local.deleteItems(targets.map(item => item.id));
        OBR.player.setMetadata({
            [playerSelectedTargetsMetadataKey]: targets.map(target => ({
                item: target,
                count: getTargetCount(target),
                id: getTargetID(target)
            }))
        });
    });
}

function buildTarget(id: number, scale: number, position: Vector2, isFirst: boolean, attachedTo?: string, count?: number) {
    const target = buildImage(
        {
            url: `${window.location.origin}/${isFirst ? "first-" : ""}target.webm`,
            width: 1000,
            height: 1000,
            mime: "video/webm"
        },
        {
            dpi: 1000,
            offset: { x: 500, y: 500 }
        }
    ).scale(
        { x: scale, y: scale },
    ).position(
        position
    ).locked(
        true
    ).disableHit(
        attachedTo != undefined
    ).metadata({
        [targetHighlightMetadataKey]: {
            id,
            count: count ?? 1
        }
    });
    if (attachedTo != undefined) {
        target.attachedTo(attachedTo);
    }
    if (count != undefined && count != 1) {
        target.plainText(count.toString());
    }
    return target.build();
}

async function incrementTargetCount(target: Image) {
    await OBR.scene.local.updateItems<Image>([target.id], items => {
        for (const item of items) {
            const newCount = (getTargetCount(item) ?? 0) + 1;
            item.metadata[targetHighlightMetadataKey] = {
                count: newCount,
                id: getTargetID(item)
            };
            if (newCount > 1) {
                item.text.plainText = newCount.toString();
            }
        }
    });
}

async function removeTarget(target: Image, targets: Image[]) {
    if (targets.length >= 2 && getTargetID(target) == getTargetID(targets[0])) {
        OBR.scene.local.updateItems<Image>([targets[1].id], items => {
            if (items[0]) {
                items[0].image.url = `${window.location.origin}/first-target.webm`;
            }
        });
    }
    OBR.scene.local.deleteItems([target.id]);
}

export function setSelectedSpell(spellName: string) {
    OBR.player.setMetadata(
        { [toolMetadataSelectedSpell]: spellName }
    );
    OBR.tool.setMetadata(
        toolID,
        { [toolMetadataSelectedSpell]: spellName }
    );

    OBR.player.getRole().then(role => {
        const spell = getSpell(spellName, role === "GM");
        if (spell) {
            const urls = new Set<string>();
            const spellStr = JSON.stringify(spell);
            const regex = /"id":"([^"]+)"/g;
            let match;
            while ((match = regex.exec(spellStr)) !== null) {
                const effectName = match[1];
                const effect = getEffect(effectName);
                if (effect) {
                    for (const variant of Object.values(effect.variants)) {
                        for (const name of variant.name) {
                            urls.add(`${ASSET_LOCATION}/${effect.basename}_${name}.webm?1`);
                        }
                    }
                }
            }
            prefetchAssets(Array.from(urls)).catch(e => log_error("Prefetch spell assets failed", e));
        }
    });
}

export function getTargetHighlightMetadata(item: Item): TargetHighlightMetadata|undefined {
    const highlightMetadata = item.metadata[targetHighlightMetadataKey];
    if (highlightMetadata == undefined) {
        return undefined;
    }
    const thmHighlightMetadata = highlightMetadata as TargetHighlightMetadata;
    if (typeof thmHighlightMetadata.id !== "number" || typeof thmHighlightMetadata.count !== "number") {
        return undefined;
    }
    return thmHighlightMetadata;
}

export function getTargetID(item: Item) {
    return getTargetHighlightMetadata(item)?.id;
}

export function getTargetCount(item: Item) {
    return getTargetHighlightMetadata(item)?.count;
}

export async function getSortedTargets() {
    const items = await OBR.scene.local.getItems();
    return items.filter(
        item => isImage(item) && getTargetHighlightMetadata(item) != undefined
    ).sort(
        (a, b) => (a.metadata[targetHighlightMetadataKey] as number) - (b.metadata[targetHighlightMetadataKey] as number)
    ) as Image[];
}

async function getPointerPosition(position: Vector2, snapToGrid: boolean) {
    if (snapToGrid) {
        return OBR.scene.grid.snapPosition(position);
    }
    return position;
}

export function setupEffectsTool(playerRole: "GM" | "PLAYER", playerID: string) {
    getGlobalSettingsValue(GLOBAL_STORAGE_KEYS.PLAYERS_CAN_CAST_SPELLS).then(canCastSpells => {
        if (!canCastSpells && playerRole !== "GM") {
            return;
        }
        OBR.tool.create({
            id: toolID,
            defaultMode: effectsToolModeID,
            defaultMetadata: {
                [toolMetadataSelectedSpell]: undefined,
            },
            icons: [{
                icon: `${window.location.origin}/embers.svg`,
                label: "施放法術"
            }],
            shortcut: "Shift+C",
            onClick(context) {
                if (context.activeTool === toolID) {
                    OBR.player.getMetadata().then(metadata => {
                        const previousTool = metadata?.[previousToolMetadataKey] as string | undefined;
                        if (previousTool != undefined) {
                            OBR.tool.activateTool(previousTool);
                        }
                    })
                    return false;
                }
                OBR.player.setMetadata({ [previousToolMetadataKey]: context.activeTool });
                return true;
            }
        });
        setupToolActions(playerRole, playerID);
        setupTargetToolModes();
    });
    return OBR.tool.onToolChange(tool => {
        if (tool == toolID) {
            prefetchAssets([
                `${window.location.origin}/target.webm`,
                `${window.location.origin}/first-target.webm`
            ]).catch(e => log_error("Prefetch targets failed", e));

            if (getSettingsValue(LOCAL_STORAGE_KEYS.KEEP_SELECTED_TARGETS)) {
                OBR.player.getMetadata().then(metadata => {
                    const oldTargets = metadata[playerSelectedTargetsMetadataKey] as { item: Item, count: number, id: number }[];
                    if (oldTargets == undefined) {
                        return;
                    }
                    const minTargetId = Math.min(...oldTargets.map(target => target.id));
                    for (const target of oldTargets) {
                        const targetHighlight = buildTarget(
                            target.id,
                            target.item.scale.x,
                            target.item.position,
                            target.id === minTargetId,
                            target.item.attachedTo,
                            target.count
                        );
                        OBR.scene.local.addItems([targetHighlight]);
                    }
                });
            }
        }
    });
}

async function setupToolActions(playerRole: "GM" | "PLAYER", playerID: string) {
    await OBR.tool.createAction({
        id: effectsToolActionID,
        icons: [{
            icon: `${window.location.origin}/cast.svg`,
            label: "施放已選法術",
            filter: {
                activeTools: [toolID],
            },
        }],
        disabled: {
            metadata: [{
                key: toolMetadataSelectedSpell,
                value: undefined,
            }]
        },
        shortcut: "Enter",
        onClick() {
            Promise.all([OBR.player.getMetadata(), getGlobalSettingsValue(GLOBAL_STORAGE_KEYS.PLAYERS_CAN_CAST_SPELLS)]).then(([metadata, canCastSpells]) => {
                if (!canCastSpells && playerRole !== "GM") {
                    OBR.notification.show("Embers: 你沒有權限施放法術", "ERROR");
                    return;
                }
                if (typeof metadata[toolMetadataSelectedSpell] != "string") {
                    log_error(`Invalid spell selected ("${metadata?.[toolMetadataSelectedSpell]}")`);
                    OBR.notification.show(`Embers: 選擇的法術無效 ("${metadata?.[toolMetadataSelectedSpell]}")`, "ERROR");
                    return;
                }
                doSpell(metadata[toolMetadataSelectedSpell], playerID, playerRole === "GM");
            });
        }
    });

    await OBR.tool.createAction({
        id: selectSpellToolActionID,
        icons: [{
            icon: `${window.location.origin}/pick-spell.svg`,
            label: "選擇法術",
            filter: {
                activeTools: [toolID]
            }
        }],
        shortcut: ".",
        onClick() {
            OBR.popover.open({
                id: spellPopoverId,
                width: 500,
                height: 300,
                url: `${window.location.origin}/spell-selection-popover`,
                hidePaper: true
            });
        }
    });

    await OBR.tool.createAction({
        id: clearTargetSelectionToolActionID,
        icons: [{
            icon: `${window.location.origin}/remove-selection.svg`,
            label: "清除目標選擇",
            filter: {
                activeTools: [toolID]
            }
        }],
        shortcut: "x",
        onClick() {
            OBR.scene.local.getItems().then(items => {
                const targets = items.filter(item => item.metadata[targetHighlightMetadataKey] != undefined);
                OBR.scene.local.deleteItems(targets.map(item => item.id));
            });
        }
    });
}

async function setupTargetToolModes() {
    await OBR.tool.createMode({
        id: effectsToolModeID,
        icons: [{
            icon: `${window.location.origin}/target.svg`,
            label: "新增目標",
            filter: {
                activeTools: [toolID]
            }
        }],
        cursors: [{
            cursor: "pointer",
            filter: {
                target: [
                    {
                        key: "layer", value: "CHARACTER", coordinator: "||"
                    },
                    {
                        key: "layer", value: "DRAWING"
                    },
                ]
            }
        }],
        shortcut: "A",
        onToolClick(_context, event) {
            if (!event.shiftKey && event.target && (event.target.layer == "CHARACTER" || event.target.layer == "DRAWING")) {
                getSortedTargets().then(targets => {
                    const selected: Image|undefined = targets.filter(image => image.attachedTo === event.target!.id)[0];

                    if (!selected) {
                        const targetHighlight = buildTarget(
                            ((targets.length > 0 ? getTargetID(targets[targets.length-1]) : undefined) ?? 0) + 1,
                            getItemSize(event.target!) * 1.31,
                            event.target!.position,
                            targets.length == 0,
                            event.target!.id
                        );
                        OBR.scene.local.addItems([targetHighlight]);
                    }
                    else {
                        incrementTargetCount(selected);
                    }
                });
            }
            else if (!event.shiftKey && event.target && getTargetHighlightMetadata(event.target) != undefined) {
                incrementTargetCount(event.target! as Image);
            }
            else {
                Promise.all([
                    getSortedTargets(),
                    getPointerPosition(event.pointerPosition, !event.shiftKey)
                ]).then(([targets, position]) => {
                    const targetHighlight = buildTarget(
                        ((targets.length > 0 ? getTargetID(targets[targets.length-1]) : undefined) ?? 0) + 1,
                        2 / 3,
                        position,
                        targets.length == 0
                    );
                    OBR.scene.local.addItems([targetHighlight]);
                });
            }
        },
        onDeactivate(context) {
            if (context.activeTool != toolID || context.activeMode != removeTargetToolModeID) {
                deactivateTool();
            }
        }
    });
    await OBR.tool.createMode({
        id: removeTargetToolModeID,
        icons: [{
            icon: `${window.location.origin}/remove-target.svg`,
            label: "移除目標",
            filter: {
                activeTools: [toolID]
            }
        }],
        cursors: [{
            cursor: "pointer",
            filter: {
                target: [
                    {
                        key: "layer", value: "CHARACTER", coordinator: "||"
                    },
                    {
                        key: "layer", value: "DRAWING"
                    },
                ]
            }
        }],
        shortcut: "R",
        onToolClick(_context, event) {
            if (event.target && (event.target.layer == "CHARACTER" || event.target.layer == "DRAWING")) {
                getSortedTargets().then(targets => {
                    const selected: Image|undefined = targets.filter(image => image.attachedTo === event.target!.id)[0];
                    if (selected != undefined) {
                        removeTarget(selected, targets);
                    }
                });
            }
            else if (event.target && getTargetHighlightMetadata(event.target) != undefined) {
                getSortedTargets().then(targets => {
                    removeTarget(event.target! as Image, targets);
                });
            }
        },
        onDeactivate(context) {
            if (context.activeTool != toolID || context.activeMode != effectsToolModeID) {
                deactivateTool();
            }
        }
    });
}

export async function setupDefaultCasterMenuOption() {
    const role = await OBR.player.getRole();
    if (role !== "GM") return;
    await OBR.contextMenu.remove(defaultCasterMenuId);
    await OBR.contextMenu.create({
            id: defaultCasterMenuId,
            icons: [{
                icon: `${window.location.origin}/embers.svg`,
                label: "設為預設施法者",
            }],
            onClick: async () => {
                const selection = await OBR.player.getSelection();
                if (selection == undefined) return;

                const items = await OBR.scene.items.getItems(selection);
                setSettingsValue(LOCAL_STORAGE_KEYS.DEFAULT_CASTER, items);
                OBR.broadcast.sendMessage(SETTINGS_CHANNEL, {}, { destination: "LOCAL" });
            },
    });
}