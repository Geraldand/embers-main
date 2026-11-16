// src/components/StoryManager/types.ts

export type QuestStatus = "none" | "active" | "important" | "completed" | "failed";

export interface ImageCrop {
    x: number;
    y: number;
    scale: number;
}

export interface QuestCategory {
    id: string;
    name: string;
    isVisible?: boolean;
    themeId?: string;
}

export interface Quest {
    id: string;
    title: string;
    description: string;
    categoryId: string;
    isVisible: boolean;
    isCompleted: boolean;
    status?: QuestStatus;
    revealedSecrets?: string[];
    markerStyle?: "checkbox" | "none";
    createdAt: number;
}

export interface KeywordItem {
    id: string;
    keyword: string;
    subtitle?: string;
    description: string;
    imageUrl?: string;
    imageCrop?: ImageCrop;
    themeId?: string;
    isVisible?: boolean;
    revealedSecrets?: string[];
    createdAt: number;
}

export interface Recap {
    id: string;
    title: string;
    content: string;
    sessionDate?: string;
    location?: string;
    themeId?: string;
    backgroundImageUrl?: string;
    imageCrop?: ImageCrop;
    createdAt: number;
}

export interface ShopItem {
    id: string;
    name: string;
    description: string;
    imageUrl?: string;
    imageCrop?: ImageCrop;
    weight: number;
    cost: number;
    rarity: string;
    category: string;
    quantity: number;
    isVisible?: boolean;
    isAttuned?: boolean;
    // Mark item as a service
    isService?: boolean;
}

export interface Shop {
    id: string;
    name: string;
    description: string;
    scenarioKey?: string;
    customScenarios?: string[];
    themeId?: string;
    backgroundImageUrl?: string;
    imageCrop?: ImageCrop;
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

// src/components/StoryManager/types.ts

export interface LootItem extends ShopItem {
    subCategory?: string;
    isInfinite?: boolean;
    isRevealed?: boolean;
    isCurrency?: boolean;
}

export interface LootSource {
    id: string;
    name: string;
    description: string;
    scenarioKey?: string;
    customScenarios?: string[];
    themeId?: string;
    backgroundImageUrl?: string;
    imageCrop?: ImageCrop;
    subCategories?: string[];
    hiddenSubCategories?: string[];
    items: LootItem[];
    isVisible: boolean;
    createdAt: number;
}

// src/components/StoryManager/types.ts

export interface LegacyAttachment {
    url: string;
    crop?: ImageCrop;
    caption?: string;
}

export interface LegacyItem {
    id: string;
    name: string;
    description: string;
    themeId?: string;
    backgroundImageUrl?: string;
    imageCrop?: ImageCrop;
    sealType?: string;
    signer?: string;
    attachments?: Record<string, LegacyAttachment>;
    decipheredCiphers?: string[];
    partyNotes?: string;
    isVisible: boolean;
    revealedSecrets: string[];
    createdAt: number;
}