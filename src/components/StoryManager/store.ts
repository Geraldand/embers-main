import OBR from "@owlbear-rodeo/sdk";
import { useState, useEffect } from "react";
import LZString from "lz-string";
import { Quest, QuestCategory, Recap, Shop, LootSource, LegacyItem, LogEntry, KeywordItem } from "./types";

const GM_STORAGE_KEY = "eu.armindo.embers/story-data";
const PLAYER_STORAGE_KEY = "eu.armindo.embers/story-data-player";
const TX_LOCK_KEY = "eu.armindo.embers/story-last-tx";
const META_VERSION_KEY = "eu.armindo.embers/story-version";
const SYNC_CHANNEL = "eu.armindo.embers/story-sync";
const SHOP_EVENT_CHANNEL = "com.yourname.character-sheet-extension/shop-events";
const CHUNK_SIZE = 5000;
const MAX_LOGS = 20;

interface ChunkBuffer {
    chunks: string[];
    received: number;
    total: number;
    createdAt: number;
}

const incomingChunks: Record<string, ChunkBuffer> = {};
const processedTransactions = new Set<string>();

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Compress and split large payloads into smaller chunks
const sendCompressedSync = async (payload: any, options: { destination: "ALL" | "REMOTE" | "LOCAL" }) => {
    const compressed = LZString.compressToUTF16(JSON.stringify(payload));
    if (compressed.length <= CHUNK_SIZE) {
        await OBR.broadcast.sendMessage(SYNC_CHANNEL, compressed, options);
        return;
    }

    const messageId = `${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
    const total = Math.ceil(compressed.length / CHUNK_SIZE);

    for (let index = 0; index < total; index++) {
        const chunk = compressed.slice(index * CHUNK_SIZE, (index + 1) * CHUNK_SIZE);
        await OBR.broadcast.sendMessage(
            SYNC_CHANNEL,
            {
                __isChunk: true,
                messageId,
                index,
                total,
                chunk
            },
            options
        );
        if (index < total - 1) {
            await wait(15);
        }
    }
};

interface StoryData {
    questCategories: QuestCategory[];
    quests: Quest[];
    keywords: KeywordItem[];
    recaps: Recap[];
    shops: Shop[];
    loots: LootSource[];
    legacies: LegacyItem[];
    logs: LogEntry[];
}

const defaultData: StoryData = {
    questCategories: [
        { id: "main", name: "主線任務", isVisible: true, themeId: "panel" },
        { id: "side", name: "支線任務", isVisible: true, themeId: "panel" },
        { id: "rumor", name: "傳聞與趣事", isVisible: true, themeId: "panel" }
    ],
    quests: [],
    keywords: [],
    recaps: [],
    shops: [],
    loots: [],
    legacies: [],
    logs: []
};

class StoryStore {
    data: StoryData = { ...defaultData };
    isGM = false;
    listeners: (() => void)[] = [];
    currentVersion = 0;
    unread: Record<number, boolean> = { 0: false, 1: false, 2: false, 3: false };
    private publishTimer: number | null = null;
    private syncCheckTimer: number | null = null;

    // Reload latest GM state from localStorage to keep multiple tabs or iframes synchronized
    private reloadGMDataFromStorage = () => {
        if (!this.isGM) return;
        const saved = localStorage.getItem(`${GM_STORAGE_KEY}/${OBR.room.id}`);
        if (!saved) return;
        try {
            const parsed = JSON.parse(saved);
            this.data = { ...defaultData, ...parsed };
            if (!this.data.questCategories || this.data.questCategories.length === 0) {
                this.data.questCategories = defaultData.questCategories;
            }
            this.data.questCategories = this.data.questCategories.map(c => ({
                ...c,
                isVisible: c.isVisible ?? true,
                themeId: c.themeId || "panel"
            }));
            this.data.keywords = this.data.keywords || [];
            this.data.logs = (this.data.logs || []).slice(0, MAX_LOGS);
        } catch (e) {
            console.error("Failed to reload GM story data", e);
        }
    };

    // Prevent duplicate transaction handling across multiple GM tabs or iframes
    private claimTransaction = (txId?: string): boolean => {
        if (!txId) return true;
        if (processedTransactions.has(txId)) return false;
        const lastTx = localStorage.getItem(`${TX_LOCK_KEY}/${OBR.room.id}`);
        if (lastTx === txId) return false;
        processedTransactions.add(txId);
        localStorage.setItem(`${TX_LOCK_KEY}/${OBR.room.id}`, txId);
        return true;
    };

    // Filter out hidden items and limit logs before syncing to players
    getPlayerSyncData = (): StoryData => {
        return {
            questCategories: this.data.questCategories,
            quests: this.data.quests.filter(q => q.isVisible !== false),
            keywords: this.data.keywords || [],
            recaps: this.data.recaps,
            shops: this.data.shops
                .filter(s => s.isVisible !== false)
                .map(s => ({
                    ...s,
                    items: s.items.filter(i => i.isVisible !== false),
                    boughtItems: (s.boughtItems || []).filter(i => i.isVisible !== false)
                })),
            loots: this.data.loots.filter(l => l.isVisible !== false),
            legacies: this.data.legacies.filter(l => l.isVisible !== false),
            logs: (this.data.logs || []).slice(0, MAX_LOGS)
        };
    };

    saveSingleQuest = (quest: Quest) => {
        if (this.isGM) {
            this.reloadGMDataFromStorage();
            const exists = this.data.quests.find(q => q.id === quest.id);
            this.saveQuests(exists ? this.data.quests.map(q => q.id === quest.id ? quest : q) : [...this.data.quests, quest]);
        } else {
            sendCompressedSync({ type: "PLAYER_SAVE_QUEST", quest }, { destination: "ALL" });
        }
    };

    deleteSingleQuest = (questId: string) => {
        if (this.isGM) {
            this.reloadGMDataFromStorage();
            this.saveQuests(this.data.quests.filter(q => q.id !== questId));
        } else {
            sendCompressedSync({ type: "PLAYER_DELETE_QUEST", questId }, { destination: "ALL" });
        }
    };

    reorderQuests = (newQuests: Quest[]) => {
        if (this.isGM) {
            this.reloadGMDataFromStorage();
            this.saveQuests(newQuests);
        } else {
            sendCompressedSync({ type: "PLAYER_REORDER_QUESTS", quests: newQuests }, { destination: "ALL" });
        }
    };

    saveCategoriesProxy = (cats: QuestCategory[]) => {
        if (this.isGM) {
            this.reloadGMDataFromStorage();
            this.saveQuestCategories(cats);
        } else {
            sendCompressedSync({ type: "PLAYER_SAVE_CATEGORIES", cats }, { destination: "ALL" });
        }
    };

    init = async () => {
        if (!OBR.isReady) return;
        const role = await OBR.player.getRole();
        this.isGM = role === "GM";

        const storageKey = this.isGM
            ? `${GM_STORAGE_KEY}/${OBR.room.id}`
            : `${PLAYER_STORAGE_KEY}/${OBR.room.id}`;

        const saved = localStorage.getItem(storageKey);
        if (saved) {
            try {
                const parsed = JSON.parse(saved);
                this.data = { ...defaultData, ...parsed };
                if (!this.data.questCategories || this.data.questCategories.length === 0) {
                    this.data.questCategories = defaultData.questCategories;
                }
                this.data.questCategories = this.data.questCategories.map(c => ({
                    ...c,
                    isVisible: c.isVisible ?? true,
                    themeId: c.themeId || "panel"
                }));
                this.data.keywords = this.data.keywords || [];
                this.data.logs = (this.data.logs || []).slice(0, MAX_LOGS);
                this.notify();
            } catch (e) {
                console.error("Failed to parse story data", e);
            }
        }

        // Sync state across browser tabs when localStorage changes
        window.addEventListener("storage", (event) => {
            if (this.isGM && event.key === `${GM_STORAGE_KEY}/${OBR.room.id}` && event.newValue) {
                this.reloadGMDataFromStorage();
                this.notify();
            }
        });

        OBR.room.onMetadataChange((meta) => {
            const newVersion = meta[META_VERSION_KEY] as number;
            if (!this.isGM && newVersion && newVersion > this.currentVersion) {
                if (this.syncCheckTimer) window.clearTimeout(this.syncCheckTimer);
                this.syncCheckTimer = window.setTimeout(() => {
                    if (newVersion > this.currentVersion) {
                        sendCompressedSync({ type: "REQUEST_SYNC" }, { destination: "ALL" });
                    }
                }, 1500);
            }
        });

        OBR.broadcast.onMessage(SYNC_CHANNEL, async (msg) => {
            let rawData = msg.data as any;

            if (rawData && typeof rawData === "object" && rawData.__isChunk) {
                const now = Date.now();
                for (const key of Object.keys(incomingChunks)) {
                    if (now - incomingChunks[key].createdAt > 30000) {
                        delete incomingChunks[key];
                    }
                }

                const { messageId, index, total, chunk } = rawData;
                if (!incomingChunks[messageId]) {
                    incomingChunks[messageId] = {
                        chunks: new Array(total),
                        received: 0,
                        total,
                        createdAt: now
                    };
                }
                const entry = incomingChunks[messageId];
                if (entry.chunks[index] === undefined) {
                    entry.chunks[index] = chunk;
                    entry.received++;
                }
                if (entry.received < entry.total) {
                    return;
                }
                rawData = entry.chunks.join("");
                delete incomingChunks[messageId];
            }

            let payload = rawData;
            if (typeof payload === "string") {
                try {
                    payload = JSON.parse(LZString.decompressFromUTF16(payload));
                } catch (e) {
                    console.warn("Failed to decompress broadcast message", e);
                    return;
                }
            }
            if (!payload) return;

            if (payload.type === "REQUEST_SHOPS") {
                if (this.isGM) this.reloadGMDataFromStorage();
                const visibleShops = this.isGM
                    ? this.data.shops.filter(s => s.isVisible !== false)
                    : this.data.shops;
                sendCompressedSync({
                    type: "SYNC_SHOPS",
                    shops: visibleShops
                }, { destination: "REMOTE" });
                return;
            }
            if (payload.type === "REQUEST_SYNC" && this.isGM) {
                this.reloadGMDataFromStorage();
                if (!this.currentVersion) this.currentVersion = Date.now();
                sendCompressedSync({
                    type: "SYNC_FULL_STATE",
                    version: this.currentVersion,
                    data: this.getPlayerSyncData(),
                    targetConnectionId: msg.connectionId
                }, { destination: "REMOTE" });
            } else if (payload.type === "SYNC_FULL_STATE" && !this.isGM) {
                const myConnectionId = await OBR.player.getConnectionId();
                if (payload.targetConnectionId && payload.targetConnectionId !== "ALL" && payload.targetConnectionId !== myConnectionId) return;

                if (payload.version && payload.version < this.currentVersion) return;

                if (this.currentVersion !== 0) {
                    const checkUnread = (oldArr: any[], newArr: any[]) => {
                        const oldMap = new Map((oldArr || []).map(i => [i.id, i]));
                        for (const newItem of (newArr || [])) {
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
                this.data = { ...defaultData, ...payload.data, keywords: payload.data.keywords || [] };
                this.currentVersion = payload.version || Date.now();
                localStorage.setItem(`${PLAYER_STORAGE_KEY}/${OBR.room.id}`, JSON.stringify(this.data));
                this.notify();
            } else if (payload.type === "FORCE_OPEN_LEGACY") {
                window.dispatchEvent(new CustomEvent("force-open-legacy", { detail: payload.legacyId }));
            } else if (payload.type === "TOGGLE_QUEST" && this.isGM) {
                this.reloadGMDataFromStorage();
                this.saveQuests(this.data.quests.map(q => q.id === payload.questId ? { ...q, isCompleted: !q.isCompleted } : q));
            } else if (payload.type === "PLAYER_SAVE_QUEST" && this.isGM) {
                this.reloadGMDataFromStorage();
                const incomingQuest = payload.quest;
                const exists = this.data.quests.find(q => q.id === incomingQuest.id);
                this.saveQuests(exists ? this.data.quests.map(q => q.id === incomingQuest.id ? incomingQuest : q) : [...this.data.quests, incomingQuest]);
            } else if (payload.type === "PLAYER_DELETE_QUEST" && this.isGM) {
                this.reloadGMDataFromStorage();
                this.saveQuests(this.data.quests.filter(q => q.id !== payload.questId));
            } else if (payload.type === "PLAYER_REORDER_QUESTS" && this.isGM) {
                this.reloadGMDataFromStorage();
                if (Array.isArray(payload.quests)) {
                    const hiddenQuests = this.data.quests.filter(q => q.isVisible === false);
                    const reorderedIds = new Set(payload.quests.map((q: Quest) => q.id));
                    const remainingHidden = hiddenQuests.filter(q => !reorderedIds.has(q.id));
                    this.saveQuests([...payload.quests, ...remainingHidden]);
                }
            } else if (payload.type === "PLAYER_SAVE_CATEGORIES" && this.isGM) {
                this.reloadGMDataFromStorage();
                this.saveQuestCategories(payload.cats);
            }
        });

        OBR.broadcast.onMessage(SHOP_EVENT_CHANNEL, async (msg) => {
            const data = msg.data as any;
            if (!data) return;

            if (!this.isGM) return;

            if (data.type === "PURCHASE_REQUEST" || data.type === "LOOT_REQUEST" || data.type === "SELL_REQUEST") {
                if (!this.claimTransaction(data.transactionId)) return;
                this.reloadGMDataFromStorage();
            } else {
                return;
            }

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

                    await OBR.broadcast.sendMessage(SHOP_EVENT_CHANNEL, {
                        type: "PURCHASE_RESPONSE", success: true, transactionId: data.transactionId,
                        targetConnectionId: msg.connectionId, message: "購買成功！",
                        item: item.isService ? undefined : { ...item, quantity: data.quantity },
                        serviceItem: item.isService ? { ...item, quantity: data.quantity } : undefined,
                        quantity: data.quantity, cost: data.cost,
                        targetTokenId: data.targetTokenId
                    }, { destination: "ALL" });

                    this.data.shops = this.data.shops.map(s => s.id === shop.id ? newShop : s);
                    this.recordLogInternal(`${playerName} 購買了 ${data.quantity} 個 ${item.name}`);
                    this.unread[1] = true;
                    this.publishData();
                } else {
                    await OBR.broadcast.sendMessage(SHOP_EVENT_CHANNEL, {
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

                    await OBR.broadcast.sendMessage(SHOP_EVENT_CHANNEL, {
                        type: "LOOT_RESPONSE", success: true, transactionId: data.transactionId,
                        targetConnectionId: msg.connectionId, message: "拾取成功！",
                        item: item.isCurrency ? undefined : item,
                        currencyItem: item.isCurrency ? item : undefined,
                        quantity: data.quantity,
                        targetTokenId: data.targetTokenId,
                        sourceId: data.sourceId
                    }, { destination: "ALL" });

                    this.data.loots = this.data.loots.map(s => s.id === source.id ? newSource : s);
                    this.recordLogInternal(`${playerName} 拾取了 ${data.quantity} 個 ${item.name}`);
                    this.unread[2] = true;
                    this.publishData();
                } else {
                    await OBR.broadcast.sendMessage(SHOP_EVENT_CHANNEL, {
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
                    else bought.push({ ...data.item, quantity: data.quantity, id: data.item.id || Math.random().toString(36).substring(2, 9), isVisible: true });

                    const newShop = { ...shop, boughtItems: bought };

                    await OBR.broadcast.sendMessage(SHOP_EVENT_CHANNEL, {
                        type: "SELL_RESPONSE", success: true, transactionId: data.transactionId,
                        targetConnectionId: msg.connectionId, targetTokenId: data.targetTokenId,
                        itemId: data.item.id, quantity: data.quantity, revenue: data.price
                    }, { destination: "ALL" });

                    this.data.shops = this.data.shops.map(s => s.id === shop.id ? newShop : s);
                    this.recordLogInternal(`${playerName} 販售了 ${data.quantity} 個 ${data.item.name} 給 ${shop.name}`);
                    this.unread[1] = true;
                    this.publishData();
                }
            }
        });

        if (this.isGM) {
            this.publishData();
        } else {
            await sendCompressedSync({ type: "REQUEST_SYNC" }, { destination: "ALL" });
        }
    };

    private recordLogInternal = (message: string) => {
        const newLog: LogEntry = { id: Math.random().toString(), time: Date.now(), message };
        this.data.logs = [newLog, ...(this.data.logs || [])].slice(0, MAX_LOGS);
    };

    publishData = () => {
        if (!this.isGM) return;
        this.currentVersion = Date.now();
        localStorage.setItem(`${GM_STORAGE_KEY}/${OBR.room.id}`, JSON.stringify(this.data));
        this.notify();

        if (this.publishTimer) {
            window.clearTimeout(this.publishTimer);
        }

        this.publishTimer = window.setTimeout(async () => {
            this.publishTimer = null;
            this.reloadGMDataFromStorage();
            await OBR.room.setMetadata({ [META_VERSION_KEY]: this.currentVersion });
            await sendCompressedSync({
                type: "SYNC_FULL_STATE",
                version: this.currentVersion,
                data: this.getPlayerSyncData(),
                targetConnectionId: "ALL"
            }, { destination: "ALL" });
        }, 250);
    };

    broadcastLegacy = (legacyId: string, targetPlayerIds: string[] = ["ALL"]) => {
        if (!this.isGM) return;
        const legacy = this.data.legacies.find(l => l.id === legacyId);
        if (legacy) {
            sendCompressedSync({
                type: "FORCE_OPEN_LEGACY",
                legacy: legacy,
                targets: targetPlayerIds
            }, { destination: "ALL" });
        }
    };

    updateLegacyLive = (legacy: LegacyItem) => {
        if (!this.isGM) return;
        this.saveLegacies(this.data.legacies.map(l => l.id === legacy.id ? legacy : l));
        sendCompressedSync({ type: "UPDATE_LEGACY_CONTENT", legacy }, { destination: "ALL" });
    };

    toggleQuestCompletion = (questId: string) => {
        if (this.isGM) {
            this.reloadGMDataFromStorage();
            this.saveQuests(this.data.quests.map(q => q.id === questId ? { ...q, isCompleted: !q.isCompleted } : q));
        } else {
            sendCompressedSync({ type: "TOGGLE_QUEST", questId }, { destination: "ALL" });
        }
    };

    saveQuestCategories = (newCats: QuestCategory[]) => { if (!this.isGM) return; this.data.questCategories = newCats; this.publishData(); };
    saveQuests = (newQuests: Quest[]) => { if (!this.isGM) return; this.data.quests = newQuests; this.publishData(); };
    saveKeywords = (newKeywords: KeywordItem[]) => { if (!this.isGM) return; this.data.keywords = newKeywords; this.publishData(); };
    saveRecaps = (newRecaps: Recap[]) => { if (!this.isGM) return; this.data.recaps = newRecaps; this.publishData(); };
    saveShops = (newShops: Shop[]) => { if (!this.isGM) return; this.data.shops = newShops; this.publishData(); };
    saveLoots = (newLoots: LootSource[]) => { if (!this.isGM) return; this.data.loots = newLoots; this.publishData(); };
    saveLegacies = (newLegacies: LegacyItem[]) => { if (!this.isGM) return; this.data.legacies = newLegacies; this.publishData(); };

    importData = (jsonData: any) => {
        if (!this.isGM || !jsonData) return;
        if (jsonData.quests && jsonData.recaps && jsonData.shops) {
            this.data = {
                questCategories: jsonData.questCategories || defaultData.questCategories,
                quests: jsonData.quests || [],
                keywords: jsonData.keywords || [],
                recaps: jsonData.recaps || [],
                shops: jsonData.shops || [],
                loots: jsonData.loots || [],
                legacies: jsonData.legacies || [],
                logs: (jsonData.logs || []).slice(0, MAX_LOGS)
            };
            this.publishData();
        }
    };

    addLog = (message: string) => {
        if (!this.isGM) return;
        this.reloadGMDataFromStorage();
        this.recordLogInternal(message);
        this.publishData();
    };

    clearUnread = (idx: number) => { this.unread[idx] = false; this.notify(); };
    subscribe = (fn: () => void) => { this.listeners.push(fn); return () => { this.listeners = this.listeners.filter(l => l !== fn); }; };
    notify = () => this.listeners.forEach(fn => fn());
}

export const storyStore = new StoryStore();

const isMainPanelView = typeof window !== "undefined" &&
    window.location.pathname === "/" &&
    new URLSearchParams(window.location.search).get("view") !== "legacy-reader";

if (isMainPanelView) {
    OBR.onReady(() => storyStore.init());
}

export function useStoryData() {
    const [categories, setCategories] = useState(storyStore.data.questCategories);
    const [quests, setQuests] = useState(storyStore.data.quests);
    const [keywords, setKeywords] = useState(storyStore.data.keywords);
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
            setKeywords(storyStore.data.keywords);
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
        categories, quests, keywords, recaps, shops, loots, legacies, logs, isGM, unread,
        saveQuestCategories: storyStore.saveQuestCategories,
        saveQuests: storyStore.saveQuests,
        saveKeywords: storyStore.saveKeywords,
        saveRecaps: storyStore.saveRecaps,
        saveShops: storyStore.saveShops,
        saveLoots: storyStore.saveLoots,
        saveLegacies: storyStore.saveLegacies,
        importData: storyStore.importData,
        broadcastLegacy: storyStore.broadcastLegacy,
        updateLegacyLive: storyStore.updateLegacyLive,
        toggleQuestCompletion: storyStore.toggleQuestCompletion,
        getFullData: () => storyStore.data,
        clearUnread: storyStore.clearUnread,
        saveSingleQuest: storyStore.saveSingleQuest,
        deleteSingleQuest: storyStore.deleteSingleQuest,
        reorderQuests: storyStore.reorderQuests,
        saveCategoriesProxy: storyStore.saveCategoriesProxy
    };
}