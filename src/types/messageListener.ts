import { Layer, Metadata } from "@owlbear-rodeo/sdk";

import { AOEEffectMessage } from "./aoe";
import { ConeMessage } from "./cone";
import { PossibleTarget } from "./blueprint";
import { ProjectileMessage } from "./projectile";

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
    
    sound?: string; 
    volume?: number;
    forceVariant?: number;
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
