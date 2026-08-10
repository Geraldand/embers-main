import { Layer, Metadata } from "@owlbear-rodeo/sdk";

import { AOEEffectMessage } from "./aoe";
import { ConeMessage } from "./cone";
import { PossibleTarget } from "./blueprint";
import { ProjectileMessage } from "./projectile";

// src/types/messageListener.ts (尋找 EffectInstruction 並修改)

export interface EffectInstruction {
    type: "effect" | "action";
    id?: string;
    delay?: number;
    duration?: number;
    loops?: number;
    layer?: Layer;
    zIndex?: number;
    metadata?: Record<string, unknown>;
    effectProperties?: AOEEffectMessage | ConeMessage | ProjectileMessage;
    arguments?: unknown[];
    for?: "ALL" | "CASTER" | "GM";
    instructions?: EffectInstruction[];
    
    // 👇 新增這行：用來指定音效的檔名 (例如 "ice_hit.mp3")
    sound?: string; 
}

export interface InteractionData {
    count: number,
    ids: string[];
};

export interface MessageType {
    instructions: EffectInstruction[];
    interactions?: InteractionData;
    spellData?: {
        name: string;
        caster: string;
    };
}
