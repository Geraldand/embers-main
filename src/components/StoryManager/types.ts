// src/components/StoryManager/types.ts

export interface QuestCategory {
    id: string;
    name: string;
    isVisible?: boolean;
}

export interface Quest {
    id: string;
    title: string;
    description: string;
    categoryId: string;
    isVisible: boolean;
    isCompleted: boolean;
    markerStyle?: "checkbox" | "none";
    createdAt: number;
}

export interface Recap {
    id: string;
    title: string;
    content: string;
    themeId?: string;
    createdAt: number;
}

export interface ShopItem {
    id: string;
    name: string;
    description: string;
    weight: number;
    cost: number;
    rarity: string;
    category: string;
    quantity: number;
    isVisible?: boolean;
    isAttuned?: boolean;
}

export interface Shop {
    id: string;
    name: string;
    description: string;
    scenarioKey?: string;
    items: ShopItem[];
    boughtItems?: ShopItem[];
    isVisible: boolean;
    priceMultiplier: number;
    createdAt: number;
}

export interface LogEntry {
    id: string;
    time: number;
    message: string;
}

export interface LootItem extends ShopItem {
    isInfinite?: boolean;
    isRevealed?: boolean;
}

export interface LootSource {
    id: string;
    name: string;
    description: string;
    scenarioKey?: string;
    items: LootItem[];
    isVisible: boolean;
    createdAt: number;
}

export interface LegacyItem {
    id: string;
    name: string;
    description: string;
    themeId?: string;
    isVisible: boolean;
    revealedSecrets: string[];
    createdAt: number;
}