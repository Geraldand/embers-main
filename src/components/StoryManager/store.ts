// src/components/StoryManager/store.ts
import OBR from "@owlbear-rodeo/sdk";
import { useState, useEffect } from "react";
import { Quest, QuestCategory, Recap, Shop, LootSource, LegacyItem, LogEntry } from "./types";

const LOCAL_STORAGE_KEY = "eu.armindo.embers/story-data";
const META_VERSION_KEY = "eu.armindo.embers/story-version";
const SYNC_CHANNEL = "eu.armindo.embers/story-sync";
const SHOP_EVENT_CHANNEL = "com.yourname.character-sheet-extension/shop-events";

interface StoryData {
    questCategories: QuestCategory[];
    quests: Quest[];
    recaps: Recap[];
    shops: Shop[];
    loots: LootSource[];
    legacies: LegacyItem[];
    logs: LogEntry[];
}

const defaultData: StoryData = {
    questCategories: [
        { id: "main", name: "主線任務", isVisible: true },
        { id: "side", name: "支線任務", isVisible: true },
        { id: "rumor", name: "傳聞與趣事", isVisible: true }
    ],
    quests: [], recaps: [], shops: [], loots: [], legacies: [], logs: []
};

class StoryStore {
    data: StoryData = { ...defaultData };
    isGM = false;
    listeners: (() => void)[] = [];
    currentVersion = 0;
    unread: Record<number, boolean> = { 0: false, 1: false, 2: false, 3: false };

    init = async () => {
        if (!OBR.isReady) return;
        const role = await OBR.player.getRole();
        this.isGM = role === "GM";

        if (this.isGM) {
            const saved = localStorage.getItem(`${LOCAL_STORAGE_KEY}/${OBR.room.id}`);
            if (saved) {
                try {
                    const parsed = JSON.parse(saved);
                    this.data = { ...defaultData, ...parsed };
                    if (!this.data.questCategories || this.data.questCategories.length === 0) {
                        this.data.questCategories = defaultData.questCategories;
                    }
                    this.data.questCategories = this.data.questCategories.map(c => ({
                        ...c,
                        isVisible: c.isVisible ?? true
                    }));
                } catch (e) { console.error("Failed to parse story data", e); }
            }
            this.publishData();
        } else {
            OBR.broadcast.sendMessage(SYNC_CHANNEL, { type: "REQUEST_SYNC" }, { destination: "ALL" });
        }

        OBR.room.onMetadataChange((meta) => {
            const newVersion = meta[META_VERSION_KEY] as number;
            if (!this.isGM && newVersion && newVersion > this.currentVersion) {
                OBR.broadcast.sendMessage(SYNC_CHANNEL, { type: "REQUEST_SYNC" }, { destination: "ALL" });
            }
        });

        OBR.broadcast.onMessage(SYNC_CHANNEL, async (msg) => {
            const payload = msg.data as any;
            if (payload.type === "REQUEST_SYNC" && this.isGM) {
                OBR.broadcast.sendMessage(SYNC_CHANNEL, {
                    type: "SYNC_FULL_STATE", version: this.currentVersion, data: this.data, targetConnectionId: msg.connectionId
                }, { destination: "REMOTE" });
            } else if (payload.type === "SYNC_FULL_STATE" && !this.isGM) {
                const myConnectionId = await OBR.player.getConnectionId();
                if (payload.targetConnectionId && payload.targetConnectionId !== "ALL" && payload.targetConnectionId !== myConnectionId) return;
                
                if (this.currentVersion !== 0) {
                    const checkUnread = (oldArr: any[], newArr: any[]) => {
                        const oldMap = new Map(oldArr.map(i => [i.id, i]));
                        for (const newItem of newArr) {
                            if (newItem.isVisible === false) continue;
                            const oldItem = oldMap.get(newItem.id);
                            if (!oldItem || JSON.stringify(oldItem) !== JSON.stringify(newItem)) return true;
                        }
                        return false;
                    };
                    if (checkUnread(this.data.quests, payload.data.quests)) this.unread[0] = true;
                    if (checkUnread(this.data.shops, payload.data.shops)) this.unread[1] = true;
                    if (checkUnread(this.data.loots, payload.data.loots)) this.unread[2] = true;
                    if (checkUnread(this.data.legacies, payload.data.legacies)) this.unread[3] = true;
                }
                this.data = payload.data;
                this.currentVersion = payload.version;
                this.notify();
            } else if (payload.type === "FORCE_OPEN_LEGACY") {
                window.dispatchEvent(new CustomEvent("force-open-legacy", { detail: payload.legacyId }));
            } else if (payload.type === "TOGGLE_QUEST" && this.isGM) {
                this.saveQuests(this.data.quests.map(q => q.id === payload.questId ? { ...q, isCompleted: !q.isCompleted } : q));
            }
        });

        OBR.broadcast.onMessage(SHOP_EVENT_CHANNEL, async (msg) => {
            const data = msg.data as any;
            if (!data || !this.isGM) return;
            const sender = (await OBR.party.getPlayers()).find(p => p.connectionId === msg.connectionId);
            const playerName = sender ? sender.name : "某人";
            
            if (data.type === "PURCHASE_REQUEST") {
                const shop = this.data.shops.find(s => s.id === data.shopId);
                let isBoughtItem = false;
                let item = shop?.items.find(i => i.id === data.item.id);

                if (!item && shop?.boughtItems) {
                    item = shop.boughtItems.find(i => i.id === data.item.id);
                    if (item) isBoughtItem = true;
                }

                if (shop && item && item.quantity >= data.quantity) {
                    let newShop: Shop;
                    if (isBoughtItem) {
                        const newQuantity = item.quantity - data.quantity;
                        const newBoughtItems = newQuantity > 0 
                            ? shop.boughtItems!.map(i => i.id === item!.id ? { ...i, quantity: newQuantity } : i)
                            : shop.boughtItems!.filter(i => i.id !== item!.id);
                        newShop = { ...shop, boughtItems: newBoughtItems };
                    } else {
                        newShop = { ...shop, items: shop.items.map(i => i.id === item!.id ? { ...i, quantity: i.quantity - data.quantity } : i) };
                    }

                    this.saveShops(this.data.shops.map(s => s.id === shop.id ? newShop : s));
                    this.addLog(`${playerName} 購買了 ${data.quantity} 個 ${item.name} (花費 ${data.cost * data.quantity} GP)`);
                    this.unread[1] = true;

                    OBR.broadcast.sendMessage(SHOP_EVENT_CHANNEL, {
                        type: "PURCHASE_RESPONSE", success: true, transactionId: data.transactionId,
                        targetConnectionId: msg.connectionId, message: "購買成功！",
                        item: item, quantity: data.quantity, cost: data.cost
                    }, { destination: "ALL" });
                } else {
                    OBR.broadcast.sendMessage(SHOP_EVENT_CHANNEL, {
                        type: "PURCHASE_RESPONSE", success: false, transactionId: data.transactionId,
                        targetConnectionId: msg.connectionId, message: "庫存不足或商店不存在！"
                    }, { destination: "ALL" });
                }
            }
            else if (data.type === "LOOT_REQUEST") {
                const source = this.data.loots.find(s => s.id === data.sourceId);
                const item = source?.items.find(i => i.id === data.item.id);
                if (source && item && (item.isInfinite || item.quantity >= data.quantity)) {
                    const newSource = { ...source, items: source.items.map(i => i.id === item.id && !i.isInfinite ? { ...i, quantity: i.quantity - data.quantity } : i) };
                    this.saveLoots(this.data.loots.map(s => s.id === source.id ? newSource : s));
                    this.addLog(`${playerName} 拾取了 ${data.quantity} 個 ${item.name}`);
                    this.unread[2] = true;

                    OBR.broadcast.sendMessage(SHOP_EVENT_CHANNEL, {
                        type: "LOOT_RESPONSE", success: true, transactionId: data.transactionId,
                        targetConnectionId: msg.connectionId, message: "拾取成功！",
                        item: item, quantity: data.quantity
                    }, { destination: "ALL" });
                } else {
                    OBR.broadcast.sendMessage(SHOP_EVENT_CHANNEL, {
                        type: "LOOT_RESPONSE", success: false, transactionId: data.transactionId,
                        targetConnectionId: msg.connectionId, message: "戰利品已被拿完或不存在！"
                    }, { destination: "ALL" });
                }
            }
            else if (data.type === "SELL_REQUEST") {
                const shop = this.data.shops.find(s => s.id === data.shopId);
                if (shop) {
                    const bought = shop.boughtItems ? [...shop.boughtItems] : [];
                    const existingIndex = bought.findIndex(i => i.name === data.item.name);
                    if (existingIndex !== -1) bought[existingIndex].quantity += data.quantity;
                    else bought.push({ ...data.item, quantity: data.quantity, id: data.item.id || Math.random().toString(36).substring(2, 9) });

                    const newShop = { ...shop, boughtItems: bought };
                    this.saveShops(this.data.shops.map(s => s.id === shop.id ? newShop : s));
                    this.addLog(`${playerName} 販售了 ${data.quantity} 個 ${data.item.name} 給 ${shop.name} (獲得 ${data.price * data.quantity} GP)`);
                    this.unread[1] = true;

                    OBR.broadcast.sendMessage(SHOP_EVENT_CHANNEL, {
                        type: "SELL_RESPONSE", success: true, transactionId: data.transactionId,
                        targetConnectionId: msg.connectionId, targetTokenId: data.targetTokenId,
                        itemId: data.item.id, quantity: data.quantity, revenue: data.price
                    }, { destination: "ALL" });
                }
            }
        });
    };

    publishData = async () => {
        if (!this.isGM) return;
        this.currentVersion = Date.now();
        localStorage.setItem(`${LOCAL_STORAGE_KEY}/${OBR.room.id}`, JSON.stringify(this.data));
        await OBR.room.setMetadata({ [META_VERSION_KEY]: this.currentVersion });
        OBR.broadcast.sendMessage(SYNC_CHANNEL, {
            type: "SYNC_FULL_STATE", version: this.currentVersion, data: this.data, targetConnectionId: "ALL"
        }, { destination: "ALL" });
        this.notify();
    }

    broadcastLegacy = (legacyId: string, targetPlayerIds: string[] = ["ALL"]) => {
        if (!this.isGM) return;
        const legacy = this.data.legacies.find(l => l.id === legacyId);
        if (legacy) {
            OBR.broadcast.sendMessage(SYNC_CHANNEL, { 
                type: "FORCE_OPEN_LEGACY", 
                legacy: legacy,
                targets: targetPlayerIds 
            }, { destination: "ALL" });
        }
    }

    updateLegacyLive = (legacy: LegacyItem) => {
        if (!this.isGM) return;
        this.saveLegacies(this.data.legacies.map(l => l.id === legacy.id ? legacy : l));
        OBR.broadcast.sendMessage(SYNC_CHANNEL, { type: "UPDATE_LEGACY_CONTENT", legacy }, { destination: "ALL" });
    }

    toggleQuestCompletion = (questId: string) => {
        if (this.isGM) {
            this.saveQuests(this.data.quests.map(q => q.id === questId ? { ...q, isCompleted: !q.isCompleted } : q));
        } else {
            OBR.broadcast.sendMessage(SYNC_CHANNEL, { type: "TOGGLE_QUEST", questId }, { destination: "ALL" });
        }
    };

    saveQuestCategories = (newCats: QuestCategory[]) => { if (!this.isGM) return; this.data.questCategories = newCats; this.publishData(); };
    saveQuests = (newQuests: Quest[]) => { if (!this.isGM) return; this.data.quests = newQuests; this.publishData(); };
    saveRecaps = (newRecaps: Recap[]) => { if (!this.isGM) return; this.data.recaps = newRecaps; this.publishData(); };
    saveShops = (newShops: Shop[]) => { if (!this.isGM) return; this.data.shops = newShops; this.publishData(); };
    saveLoots = (newLoots: LootSource[]) => { if (!this.isGM) return; this.data.loots = newLoots; this.publishData(); };
    saveLegacies = (newLegacies: LegacyItem[]) => { if (!this.isGM) return; this.data.legacies = newLegacies; this.publishData(); };
    
    importData = (jsonData: any) => {
        if (!this.isGM || !jsonData) return;
        if (jsonData.quests && jsonData.recaps && jsonData.shops) {
            this.data = {
                questCategories: jsonData.questCategories || defaultData.questCategories,
                quests: jsonData.quests || [], recaps: jsonData.recaps || [],
                shops: jsonData.shops || [], loots: jsonData.loots || [],
                legacies: jsonData.legacies || [], logs: jsonData.logs || []
            };
            this.publishData();
        }
    };

    addLog = (message: string) => {
        if (!this.isGM) return;
        const newLog: LogEntry = { id: Math.random().toString(), time: Date.now(), message };
        this.data.logs = [newLog, ...this.data.logs].slice(0, 100);
        this.publishData();
    };

    clearUnread = (idx: number) => { this.unread[idx] = false; this.notify(); };
    subscribe = (fn: () => void) => { this.listeners.push(fn); return () => { this.listeners = this.listeners.filter(l => l !== fn); }; };
    notify = () => this.listeners.forEach(fn => fn());
}

export const storyStore = new StoryStore();
OBR.onReady(() => storyStore.init());

export function useStoryData() {
    const [categories, setCategories] = useState(storyStore.data.questCategories);
    const [quests, setQuests] = useState(storyStore.data.quests);
    const [recaps, setRecaps] = useState(storyStore.data.recaps);
    const [shops, setShops] = useState(storyStore.data.shops);
    const [loots, setLoots] = useState(storyStore.data.loots);
    const [legacies, setLegacies] = useState(storyStore.data.legacies);
    const [logs, setLogs] = useState(storyStore.data.logs);
    const [isGM, setIsGM] = useState(storyStore.isGM);
    const [unread, setUnread] = useState(storyStore.unread);

    useEffect(() => {
        const updateState = () => {
            setCategories(storyStore.data.questCategories);
            setQuests(storyStore.data.quests);
            setRecaps(storyStore.data.recaps);
            setShops(storyStore.data.shops);
            setLoots(storyStore.data.loots);
            setLegacies(storyStore.data.legacies);
            setLogs(storyStore.data.logs);
            setIsGM(storyStore.isGM);
            setUnread({ ...storyStore.unread });
        };
        updateState();
        return storyStore.subscribe(updateState);
    }, []);

    return { 
        categories, quests, recaps, shops, loots, legacies, logs, isGM, unread,
        saveQuestCategories: storyStore.saveQuestCategories,
        saveQuests: storyStore.saveQuests, saveRecaps: storyStore.saveRecaps,
        saveShops: storyStore.saveShops, saveLoots: storyStore.saveLoots,
        saveLegacies: storyStore.saveLegacies,
        importData: storyStore.importData,
        broadcastLegacy: storyStore.broadcastLegacy,
        updateLegacyLive: storyStore.updateLegacyLive,
        toggleQuestCompletion: storyStore.toggleQuestCompletion,
        getFullData: () => storyStore.data,
        clearUnread: storyStore.clearUnread
    };
}