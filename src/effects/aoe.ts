import { Layer, Metadata } from "@owlbear-rodeo/sdk";
import { buildEffectImage, getEffect, getVariantName, registerEffect } from "./effects";

import { AOEEffectProperties } from "../types/aoe";
import { log_error } from "../logging";

export async function aoe(
    aoeEffectProperties: AOEEffectProperties,
    duration?: number,
    loops?: number,
    metadata?: Metadata,
    layer?: Layer,
    zIndex?: number,
    variant?: number,
    forcedVariant?: number,
    spellName?: string,
    spellCaster?: string
) {
    const effect = getEffect(aoeEffectProperties.name);
    if (effect == undefined) {
        log_error(`Could not find effect "${aoeEffectProperties.name}"`);
        return;
    }

    // 引擎傳進來的 size 已經是格子數，直接使用即可
    let sizeInSquares = aoeEffectProperties.size;
    if (!sizeInSquares || sizeInSquares <= 0) {
        sizeInSquares = 1; 
    }

    const effectVariantName = getVariantName(aoeEffectProperties.name, sizeInSquares * effect.dpi);
    if (effectVariantName == undefined) {
        log_error(`Could not find adequate variant for effect "${aoeEffectProperties.name}"`);
        return undefined;
    }

    const result = buildEffectImage(
        aoeEffectProperties.name,
        effect,
        sizeInSquares,
        { x: 0.5, y: 0.5 },
        aoeEffectProperties.source,
        aoeEffectProperties.rotation ?? 0,
        variant,
        forcedVariant,
        aoeEffectProperties.disableHit,
        aoeEffectProperties.attachedTo,
        duration,
        loops,
        metadata,
        layer || "ATTACHMENT", 
        zIndex ?? 100, 
        spellName,
        spellCaster
    );

    if (result == undefined) {
        return;
    }
    
    const { image, effectDuration } = result;
    await registerEffect([image.build()], effectDuration, spellCaster);
}