import OBR, { Item, Metadata } from "@owlbear-rodeo/sdk";
import { APP_KEY } from "../config";

export const PLUGIN_METADATA_ID = `${APP_KEY}/metadata`;

// Read a specific flat key from item metadata with a legacy fallback
export function readFlatMetadata<T>(itemMetadata: Metadata, key: string, fallback: T): T {
    const flatKey = `${APP_KEY}/${key}`;
    if (itemMetadata[flatKey] !== undefined) {
        return itemMetadata[flatKey] as T;
    }
    const legacyData = itemMetadata[PLUGIN_METADATA_ID] as Record<string, unknown> | undefined;
    if (legacyData && legacyData[key] !== undefined) {
        return legacyData[key] as T;
    }
    return fallback;
}

// Safely read properties from an unknown object
export function safeObjectRead(object: unknown, key: string): unknown {
    if (typeof object !== "object" || object === null) {
        return undefined;
    }
    return (object as Record<string, unknown>)[key];
}

// Merge array items stored as isolated flat keys into a single array
export function getMergedArray<T extends { id: string }>(item: Item, baseKey: string, fallbackKey?: string): T[] {
    const fullBaseKey = `${APP_KEY}/${baseKey}`;
    const baseData = (item.metadata[fullBaseKey] || (fallbackKey ? (item.metadata[PLUGIN_METADATA_ID] as Record<string, unknown>)?.[fallbackKey] : [])) || [];
    
    // Initialize map with base data
    const mergedMap = new Map<string, T>((baseData as T[]).map(x => [x.id, x]));

    // Overwrite with any specific flat keys found in the metadata
    for (const key in item.metadata) {
        if (key.startsWith(`${fullBaseKey}_`)) {
            const data = item.metadata[key] as Partial<T>;
            if (data && data.id) {
                mergedMap.set(data.id, { ...(mergedMap.get(data.id) || {}), ...data } as T);
            }
        }
    }
    return Array.from(mergedMap.values());
}

// Merge object properties stored as isolated flat keys into a single object
export function getMergedObject(item: Item, baseKey: string, fallbackKey?: string): Record<string, any> {
    const fullBaseKey = `${APP_KEY}/${baseKey}`;
    const baseData = (item.metadata[fullBaseKey] || (fallbackKey ? (item.metadata[PLUGIN_METADATA_ID] as Record<string, unknown>)?.[fallbackKey] : {})) || {};
    
    const mergedObj = { ...(baseData as Record<string, any>) };

    for (const key in item.metadata) {
        if (key.startsWith(`${fullBaseKey}_`)) {
            const suffix = key.split("_").pop();
            if (suffix) {
                mergedObj[suffix] = { ...mergedObj[suffix], ...(item.metadata[key] as any) };
            }
        }
    }
    return mergedObj;
}
// 讀取 Room 中所有符合扁平化前綴的陣列資料
export async function getMergedRoomArray<T extends { id: string }>(baseKey: string): Promise<T[]> {
    const fullBaseKey = `${APP_KEY}/${baseKey}`;
    const metadata = await OBR.room.getMetadata();
    const mergedMap = new Map<string, T>();
    
    for (const key in metadata) {
        if (key.startsWith(`${fullBaseKey}_`)) {
            mergedMap.set(key, metadata[key] as T);
        }
    }
    return Array.from(mergedMap.values());
}

// 新增或更新 Room 中的單一扁平化項目
export async function updateRoomMetadataItem<T extends { id: string }>(baseKey: string, item: T) {
    const fullKey = `${APP_KEY}/${baseKey}_${item.id}`;
    await OBR.room.setMetadata({ [fullKey]: item });
}

// 刪除 Room 中的單一扁平化項目
export async function deleteRoomMetadataItem(baseKey: string, itemId: string) {
    const fullKey = `${APP_KEY}/${baseKey}_${itemId}`;
    await OBR.room.setMetadata({ [fullKey]: undefined });
}