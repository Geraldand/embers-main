import { APP_KEY, ASSET_LOCATION } from "../config";
import { Effect, Effects } from "../types/effects";
import { GLOBAL_STORAGE_KEYS, getGlobalSettingsValue } from "../components/Settings/settings";
import OBR, { Image, Layer, Metadata, Vector2, buildImage } from "@owlbear-rodeo/sdk";
import { getSortedTargets, getTargetCount } from "../effectsTool";

import { MESSAGE_CHANNEL } from "./messageListener";
import effectsJSON from "../assets/effect_record.json";
import { getItemSize, waitMs } from "../utils";
import { log_error } from "../logging";

export const effects = effectsJSON as unknown as Effects;
export const effectNames = gatherEffectNames();
export const effectMetadataKey = `${APP_KEY}/effect-id`;
export const spellMetadataKey = `${APP_KEY}/spell-id`;
const renderedUrls = new Set<string>();
function isEffect(obj: unknown): obj is Effect {
    const effectObject = obj as Effect;
    return effectObject.basename != undefined && effectObject.type != undefined && effectObject.variants != undefined;
}

function getKeysFromEffectName(name: string) {
    return name.split(".");
}

function gatherEffectNames() {
    const names: string[] = [];
    function gatherNames(effects: Effects|Effect, prefix: string) {
        if (isEffect(effects)) {
            names.push(prefix);
            return;
        }
        for (const key of Object.keys(effects)) {
            if (isEffect(effects[key])) {
                names.push(`${prefix}${key}`);
            }
            else if (effects[key] != undefined) {
                gatherNames(effects[key], `${prefix}${key}.`);
            }
        }
    }
    gatherNames(effects, "");
    return names;
}

const effectCache = new Map<string, Effect | undefined>();

export function getEffect(name: string): Effect | undefined {
    if (effectCache.has(name)) {
        return effectCache.get(name);
    }
    const keys = getKeysFromEffectName(name);
    let effect: Effects|Effect = effects;
    for (const key of keys) {
        if ((effect as Effects)[key] == undefined || isEffect(effect)) {
            effectCache.set(name, undefined);
            return undefined;
        }
        effect = effect[key];
    }
    if (isEffect(effect)) {
        effectCache.set(name, effect);
        return effect;
    }
    effectCache.set(name, undefined);
    return undefined;
}

export function getEffectURL(name: string, variantName: string, variantIndex?: number) {
    // This function finds the appropriate effect and variant, and returns a URL to its video file
    const effect =  getEffect(name);
    if (effect == undefined) {
        return undefined;
    }
    const variant = effect.variants[variantName];
    if (variant == undefined) {
        return undefined;
    }
    const variantPath = variant.name[variantIndex ?? 0];
    if (variantPath == undefined) {
        return undefined;
    }

    return `${ASSET_LOCATION}/${effect.basename}_${variantPath}.webm`;
}

export function urlVariant(url: string, _variant?: number) {
    // 移除 ?variant 參數，徹底杜絕 Cache Miss 導致的載入延遲
    // OBR 在建立新 Item 時，只要 URL 相同就能瞬間從記憶體渲染並自動從頭播放
    return url;
}

export function getVariantName(effectName: string, distance: number) {
    // Given the name of an effect and the distance to the target, this function returns
    // the key of the variant whose resolution is best suited.
    const effect =  getEffect(effectName);
    if (effect == undefined) {
        return undefined;
    }
    const closest: { name: string|undefined, distance: number } = { name: undefined, distance: 0 };

    for (const key of Object.keys(effect.variants)) {
        const variantLength = parseInt(key);
        if (variantLength < 0 || isNaN(variantLength)) {
            continue;
        }
        const newDistance = Math.abs(distance - variantLength);
        if (closest.name == undefined || newDistance < closest.distance) {
            closest.name = key;
            closest.distance = newDistance;
        }
    }
    return closest.name;
}

export function getRotation(source: Vector2, destination: Vector2) {
    const deltaX = destination.x - source.x;
    const deltaY = destination.y - source.y;
    const angleRadians = Math.atan2(deltaY, deltaX);
    const angleDegrees = angleRadians * (180 / Math.PI);
    return angleDegrees;
}

export function getDistance(source: Vector2, destination: Vector2) {
    return Math.sqrt(Math.pow(source.x - destination.x, 2) + Math.pow(source.y - destination.y, 2));
}

export async function registerEffect(images: Image[], duration: number, spellCaster?: string) {
    if (duration > 0) {
        // 判斷是否為初次載入未解碼過的 WebM
        let isFirstLoad = false;
        for (const img of images) {
            if (!renderedUrls.has(img.image.url)) {
                isFirstLoad = true;
                renderedUrls.add(img.image.url);
            }
        }

        // 核心解法：
        // 1. 初次載入給予 400ms 緩衝，抵銷瀏覽器抓取與解碼的時間。
        // 2. 後續快取載入固定給予 150ms 緩衝，確保動畫最後幾幀絕對不被切掉。
        const loadBuffer = isFirstLoad ? 400 : 150;

        await OBR.scene.local.addItems(images);

        // 移除原本提早刪除的 -80 或 -10，改為加上緩衝時間
        const waitTime = Math.max(0, duration + loadBuffer);
        await waitMs(waitTime);
        await OBR.scene.local.deleteItems(images.map(image => image.id));
    } 
    else {
        try {
            const summonRuleSetting = await getGlobalSettingsValue(GLOBAL_STORAGE_KEYS.SUMMONED_ENTITIES_RULE);
            const summonRule = summonRuleSetting || "caster"; 
            const [id, role] = await Promise.all([OBR.player.getId(), OBR.player.getRole()]);
            
            if ((summonRule === "caster" && id === spellCaster) || (summonRule === "gm-only" && role === "GM") || summonRule === "all" || !spellCaster) {
                await OBR.scene.items.addItems(images);
            }
        } catch (e) {
            await OBR.scene.items.addItems(images);
        }
    }
}

export function buildEffectImage(
    effectName: string,
    effect: Effect,
    size: number,
    offset: Vector2,
    position: Vector2,
    rotation: number,
    variant?: number,
    variantIndex?: number,
    disableHit?: boolean,
    attachedTo?: string,
    duration?: number,
    loops?: number,
    metadata?: Metadata,
    layer?: Layer,
    zIndex?: number,
    spellName?: string,
    spellCaster?: string
) {
    const effectVariantName = getVariantName(effectName, size * effect.dpi);
    if (effectVariantName == undefined) {
        log_error(`Could not find adequate variant for effect "${effectName}"`);
        return undefined;
    }
    const variantDistance = parseInt(effectVariantName);
    const scale = size / (variantDistance / effect.dpi);
    const scaleVector = {
        x: scale,
        y: scale
    };
    const effectDurationArray = effect.variants[effectVariantName].duration;
    let baseDuration = effectDurationArray[0];
    if (variantIndex !== undefined && effectDurationArray.length > variantIndex) {
        baseDuration = effectDurationArray[variantIndex];
    }

    let actualLoops = (loops !== undefined && loops > 0) ? loops : 1;
    let effectDuration = -1;

    // 只要 duration, baseDuration 或 loops 為 0 或負數，一律判定為持續型法術 (-1)
    if ((duration !== undefined && duration <= 0) || baseDuration <= 0 || loops === 0) {
        effectDuration = -1;
    } else if (duration !== undefined && duration > 0) {
        // 🌟 對策：優先使用 Blueprint 傳進來 (已加 300ms 緩衝) 的 duration
        effectDuration = duration;
    } else {
        effectDuration = baseDuration * actualLoops;
    }

    const url = getEffectURL(effectName, effectVariantName, variantIndex ? variantIndex % (effect.variants[effectVariantName].name.length) : undefined);
    if (url == undefined) {
        log_error(`Could not find URL for effect "${effectName}" (selected variant: ${effectVariantName})`);
        return undefined;
    }

    const gatheredMetadata: Metadata = { ...metadata, [effectMetadataKey]: effectName };
    if (spellName != undefined) {
        gatheredMetadata[spellMetadataKey] = { name: spellName, caster: spellCaster };
    }

    const isCompanion = effectDuration < 0 && attachedTo == undefined && disableHit != true;

    const image = buildImage(
        {
            width: effect.variants[effectVariantName].size[0],
            height: effect.variants[effectVariantName].size[1],
            url: urlVariant(url, variant),
            mime: "video/webm",
        },
        {
            dpi: effect.dpi,
            offset: { x: effect.variants[effectVariantName].size[1] * offset.x, y: effect.variants[effectVariantName].size[1] * offset.y }
        }
    ).scale(
        scaleVector
    ).position(
        position
    ).rotation(
        rotation
    ).disableHit(
        disableHit != undefined ? disableHit : effectDuration >= 0
    ).locked(
        effectDuration >= 0
    ).metadata(
        gatheredMetadata
    ).layer(
        layer ?? (isCompanion ? "CHARACTER" : "ATTACHMENT")
    );
    if (attachedTo != undefined) {
        // Maybe change the item this attaches to's metadata
        // to enable a context menu?
        image.attachedTo(attachedTo);
    }
    if (zIndex != undefined) {
        image.zIndex(zIndex);
    }
    return { image, effectDuration };
}

export function prefetchAssets(assets: string[]) {
    const fetches = assets.map(async asset => {
        try {
            const response = await fetch(
                asset,
                { mode: "cors", cache: "force-cache" }
            );
            await response.blob(); // Make sure all data is received
        } catch (e) {
            console.warn(`[Embers] Prefetch failed for ${asset}`, e);
        }
    });
    return Promise.all(fetches);
}

export function doEffect(effectName: string, effect?: Effect) {
    if (effect == undefined) {
        effect = getEffect(effectName);
    }
    if (effect == undefined) {
        log_error(`Unknown effect "${effectName}"`);
        return;
    }
    getSortedTargets().then(targets => {
        OBR.scene.local.deleteItems(targets.map(item => item.id));

        if (effect.type === "TARGET" || effect.type === "WALL") {
            if (targets.length < 2) {
                OBR.notification.show(`Embers: The effect "${effectName}" requires at least 2 targets`, "ERROR");
                return;
            }

            OBR.broadcast.sendMessage(
                MESSAGE_CHANNEL,
                {
                    instructions: targets.slice(1).map(target => ({
                        id: effectName,
                        effectProperties: {
                            copies: getTargetCount(target),
                            source: targets[0].position,
                            destination: target.position
                        }
                    }))
                },
                { destination: "ALL" }
            );
        }
        else if (effect.type === "CIRCLE") {
            if (targets.length < 1) {
                OBR.notification.show(`Embers: The effect "${effectName}" requires at least 1 target`, "ERROR");
                return;
            }

            // 效能優化：批次取得所有 attachedTo 的 Items
            const attachmentIds = targets.map(t => t.attachedTo).filter((id): id is string => id != undefined);
            OBR.scene.items.getItems(attachmentIds).then(items => {
                const itemMap = new Map(items.map(i => [i.id, i]));
                
                OBR.broadcast.sendMessage(
                    MESSAGE_CHANNEL,
                    {
                        instructions: targets.map((target) => {
                            const attachment = target.attachedTo ? itemMap.get(target.attachedTo) : undefined;
                            return {
                                id: effectName,
                                effectProperties: {
                                    position: target.position,
                                    size: attachment ? getItemSize(attachment) : 5,
                                }
                            };
                        })
                    },
                    { destination: "ALL" }
                );
            });
        }
        else if (effect.type === "CONE") {
            if (targets.length != 2) {
                OBR.notification.show(`Embers: The effect "${effectName}" requires exactly 2 targets`, "ERROR");
                return;
            }

            OBR.broadcast.sendMessage(
                MESSAGE_CHANNEL,
                {
                    instructions: [{
                        id: effectName,
                        effectProperties: {
                            source: targets[0].position,
                            destination: targets[1].position
                        }
                    }]
                },
                { destination: "ALL" }
            );
        }
    });
}
