// src/views/LootModal.tsx
import { useState, useEffect, useRef } from "react";
import OBR from "@owlbear-rodeo/sdk";
import LZString from "lz-string";
import {
    FaCoins,
    FaWeightHanging,
    FaCirclePlus,
    FaPencil,
    FaTrash,
    FaEye,
    FaEyeSlash,
    FaXmark,
    FaImage,
    FaCloudArrowUp,
    FaArrowsRotate,
    FaCompass,
    FaBagShopping,
    FaMagnifyingGlass,
    FaUpload,
    FaDownload,
    FaUserCheck,
    FaCaretDown,
    FaCaretUp,
    FaSort,
    FaGem,
    FaScroll,
    FaDiceD20,
    FaUnlock,
    FaLock,
    FaFolderPlus,
    FaFolderOpen,
    FaFolder,
    FaRightLeft,
    FaHandHoldingHeart,
    FaStore,
    FaGripVertical,
    FaCheck,
    FaCircleQuestion
} from "react-icons/fa6";
import { LootSource, LootItem } from "../components/StoryManager/types";
import { useStoryData } from "../components/StoryManager/store";
import { LEGACY_THEMES } from "../components/StoryManager/constants";
import { compressImageFile } from "../components/StoryManager/ShopTab";
import { pickLootScenarioSentence, ACTIVE_LOOT_STORAGE_KEY } from "../components/StoryManager/LootTab";
import { ImageCropper, CroppedImage, DEFAULT_IMAGE_CROP, LightboxOverlay } from "../components/StoryManager/ImageCropper";
import { downloadFileFromString } from "../utils";

const SHOP_EVENT_CHANNEL = "com.yourname.character-sheet-extension/shop-events";
const SYNC_CHANNEL = "eu.armindo.embers/story-sync";
const META_ID = "com.yourname.character-sheet-extension/metadata";
const CURR_ID = "com.yourname.character-sheet-extension/currency";
const INV_ID = "com.yourname.character-sheet-extension/inventory";

interface TradeNotice {
    id: string;
    text: string;
}

interface CategoryTreeNode {
    name: string;
    fullPath: string;
    parentPath: string;
    depth: number;
    items: LootItem[];
    children: CategoryTreeNode[];
    isHidden: boolean;
}

type SortMode = "default" | "rarity" | "value" | "weight";

const RARITY_WEIGHT: Record<string, number> = {
    none: 0,
    common: 1,
    uncommon: 2,
    rare: 3,
    very_rare: 4,
    legendary: 5,
    artifact: 6
};

const processedLootTxIds = new Set<string>();

function playClickSound() {
    try {
        const audio = new Audio("/click.mp3");
        audio.volume = 0.15;
        audio.play().catch(() => {});
    } catch (e) {}
}

function playItemInspectSound() {
    try {
        const audio = new Audio("/quest_check.mp3");
        audio.volume = 0.3;
        audio.play().catch(() => {});
    } catch (e) {}
}

let lastLootTakeSoundTime = 0;
function playLootTakeSound() {
    const now = Date.now();
    if (now - lastLootTakeSoundTime < 220) return;
    lastLootTakeSoundTime = now;
    try {
        const audio = new Audio("/loot_take.mp3");
        audio.volume = 0.32;
        audio.play().catch(() => {});
    } catch (e) {}
}

let lastCoinSoundTime = 0;
function playCoinDropSound() {
    const now = Date.now();
    if (now - lastCoinSoundTime < 220) return;
    lastCoinSoundTime = now;
    try {
        const audio = new Audio("/coin drop.mp3");
        audio.volume = 0.35;
        audio.play().catch(() => {});
    } catch (e) {}
}

const RARITY_COLORS: Record<string, string> = {
    none: "text-white",
    common: "text-slate-300",
    uncommon: "text-emerald-400",
    rare: "text-sky-400",
    very_rare: "text-purple-400",
    legendary: "text-amber-400",
    artifact: "text-rose-500"
};

const RARITY_LABELS: Record<string, string> = {
    none: "一般",
    common: "普通",
    uncommon: "非凡",
    rare: "稀有",
    very_rare: "極稀有",
    legendary: "傳說",
    artifact: "神器"
};

const INVENTORY_CATEGORIES = [
    { id: "equipped", name: "裝備中", weight: 0 },
    { id: "backpack", name: "背包", weight: 5 },
    { id: "pouch", name: "囊袋", weight: 1 },
    { id: "sack", name: "麻袋", weight: 0.5 },
    { id: "quiver", name: "箭袋/弩矢匣", weight: 1 },
    { id: "component_pouch", name: "材料包", weight: 2 },
    { id: "magic", name: "魔法物品", weight: 0 },
    { id: "other", name: "備用格", weight: 0 }
];

// Normalize slash-separated category paths
function normalizeSubCategoryPath(raw?: string): string {
    if (!raw) return "";
    return raw
        .split("/")
        .map(part => part.trim())
        .filter(Boolean)
        .join(" / ");
}

function getLeafName(path: string): string {
    const parts = path.split(" / ");
    return parts[parts.length - 1] || path;
}

function getParentPath(path: string): string {
    const parts = path.split(" / ");
    if (parts.length <= 1) return "";
    return parts.slice(0, -1).join(" / ");
}

// Compact inline stepper with direct text input and fallback on blur
function InlineNumberInput({
    value,
    onChange,
    min = 0,
    max = 99999,
    fallbackValue = 0,
    widthClass = "w-20",
    heightClass = "h-7"
}: {
    value: number;
    onChange: (nextVal: number) => void;
    min?: number;
    max?: number;
    fallbackValue?: number;
    widthClass?: string;
    heightClass?: string;
}) {
    const [localStr, setLocalStr] = useState(value.toString());
    const [isFocused, setIsFocused] = useState(false);

    useEffect(() => {
        if (!isFocused) {
            setLocalStr(value.toString());
        }
    }, [value, isFocused]);

    const commitValue = (raw: string) => {
        const trimmed = raw.trim();
        if (trimmed === "" || isNaN(Number(trimmed))) {
            const restored = value !== undefined ? value : fallbackValue;
            setLocalStr(restored.toString());
            onChange(restored);
            return;
        }
        const parsed = Math.round(Number(trimmed));
        const clamped = Math.max(min, Math.min(max, parsed));
        setLocalStr(clamped.toString());
        if (clamped !== value) {
            onChange(clamped);
        }
    };

    const stepBy = (delta: number) => {
        playClickSound();
        const current = isNaN(Number(localStr)) ? value : Number(localStr);
        const clamped = Math.max(min, Math.min(max, Math.round(current + delta)));
        setLocalStr(clamped.toString());
        onChange(clamped);
    };

    return (
        <div
            className={`flex items-center justify-between bg-black/40 rounded-full px-1 border border-white/15 shadow-sm ${widthClass} ${heightClass}`}
        >
            <button
                type="button"
                onClick={() => stepBy(-1)}
                className="w-5 h-5 flex items-center justify-center font-bold text-gray-300 hover:text-white outline-none shrink-0"
            >
                -
            </button>
            <input
                type="text"
                inputMode="numeric"
                value={localStr}
                onFocus={(e) => {
                    setIsFocused(true);
                    e.target.select();
                }}
                onChange={(e) => {
                    const v = e.target.value;
                    if (v === "" || /^\d*$/.test(v)) {
                        setLocalStr(v);
                    }
                }}
                onBlur={() => {
                    setIsFocused(false);
                    commitValue(localStr);
                }}
                onKeyDown={(e) => {
                    if (e.key === "Enter") {
                        e.currentTarget.blur();
                    }
                }}
                className="w-full min-w-0 bg-transparent text-center text-xs font-black text-white outline-none"
            />
            <button
                type="button"
                onClick={() => stepBy(1)}
                className="w-5 h-5 flex items-center justify-center font-bold text-gray-300 hover:text-white outline-none shrink-0"
            >
                +
            </button>
        </div>
    );
}

// Form field with left/right minus and plus buttons and direct typing
function FormNumberField({
    label,
    value,
    onChange,
    min = 0,
    step = 1,
    isInteger = false,
    disabled = false,
    textColorClass = "text-white"
}: {
    label: string;
    value: number;
    onChange: (val: number) => void;
    min?: number;
    step?: number;
    isInteger?: boolean;
    disabled?: boolean;
    textColorClass?: string;
}) {
    const [localStr, setLocalStr] = useState(value.toString());
    const [isFocused, setIsFocused] = useState(false);

    useEffect(() => {
        if (!isFocused) {
            setLocalStr(value.toString());
        }
    }, [value, isFocused]);

    const commitValue = (raw: string) => {
        const trimmed = raw.trim();
        if (trimmed === "" || isNaN(Number(trimmed))) {
            const restored = value !== undefined && !isNaN(value) ? value : 0;
            setLocalStr(restored.toString());
            onChange(restored);
            return;
        }
        const num = parseFloat(trimmed);
        const finalVal = Math.max(min, isInteger ? Math.round(num) : Number(num.toFixed(2)));
        setLocalStr(finalVal.toString());
        onChange(finalVal);
    };

    const handleStep = (delta: number) => {
        if (disabled) return;
        playClickSound();
        const current = isNaN(parseFloat(localStr)) ? (value || 0) : parseFloat(localStr);
        const next = Math.max(min, isInteger ? Math.round(current + delta) : Number((current + delta).toFixed(2)));
        setLocalStr(next.toString());
        onChange(next);
    };

    return (
        <div
            className={`flex flex-col bg-panel-base p-2 rounded-xl border border-transparent focus-within:border-panel-active shadow-inner ${
                disabled ? "opacity-45 pointer-events-none" : ""
            }`}
        >
            <span className="text-[10px] text-gray-400 font-bold text-center mb-1">{label}</span>
            <div className="flex items-center justify-between bg-panel-inactive/50 rounded-lg px-1 h-7">
                <button
                    type="button"
                    disabled={disabled}
                    onClick={() => handleStep(-step)}
                    className="w-5 h-5 flex items-center justify-center text-gray-400 hover:text-white font-bold outline-none shrink-0"
                >
                    -
                </button>
                <input
                    type="text"
                    inputMode="decimal"
                    disabled={disabled}
                    value={localStr}
                    onFocus={(e) => {
                        setIsFocused(true);
                        e.target.select();
                    }}
                    onChange={(e) => {
                        const v = e.target.value;
                        if (v === "" || /^\d*\.?\d*$/.test(v)) {
                            setLocalStr(v);
                        }
                    }}
                    onBlur={() => {
                        setIsFocused(false);
                        commitValue(localStr);
                    }}
                    onKeyDown={(e) => {
                        if (e.key === "Enter") {
                            e.currentTarget.blur();
                        }
                    }}
                    className={`w-full min-w-0 bg-transparent text-center text-xs font-black outline-none ${textColorClass}`}
                />
                <button
                    type="button"
                    disabled={disabled}
                    onClick={() => handleStep(step)}
                    className="w-5 h-5 flex items-center justify-center text-gray-400 hover:text-white font-bold outline-none shrink-0"
                >
                    +
                </button>
            </div>
        </div>
    );
}

// Read merged inventory items including flat keys written by the character sheet extension
function readTokenInventory(token: any): any[] {
    const meta = (token.metadata?.[META_ID] as any) || {};
    const fallbackData = (meta.inventory as any[]) || [];
    const currentData = (token.metadata?.[INV_ID] as any[]) || [];
    const mergedMap = new Map<string, any>();

    if (Array.isArray(fallbackData)) {
        fallbackData.forEach(x => {
            if (x && x.id) mergedMap.set(x.id, x);
        });
    }
    if (Array.isArray(currentData)) {
        currentData.forEach(x => {
            if (x && x.id) mergedMap.set(x.id, { ...(mergedMap.get(x.id) || {}), ...x });
        });
    }
    for (const key in token.metadata || {}) {
        if (key.startsWith(`${INV_ID}_`)) {
            const data = token.metadata[key] as any;
            if (data && data.id) {
                mergedMap.set(data.id, { ...(mergedMap.get(data.id) || {}), ...data });
            }
        }
    }
    return Array.from(mergedMap.values());
}

export default function LootModal() {
    const { loots, shops, logs, isGM, saveLoots } = useStoryData();
    const params = new URLSearchParams(window.location.search);
    const initialLootId =
        params.get("lootId") || localStorage.getItem(ACTIVE_LOOT_STORAGE_KEY) || "";

    const [obrReady, setObrReady] = useState(false);
    const [selectedSourceId, setSelectedSourceId] = useState<string>(initialLootId);
    const [lootSearch, setLootSearch] = useState<string>("");
    const [lootSortMode, setLootSortMode] = useState<SortMode>("default");
    const [collapsedBranches, setCollapsedBranches] = useState<Record<string, boolean>>({});
    const [invCategoryFilter, setInvCategoryFilter] = useState<string>("all");
    const [invSortMode, setInvSortMode] = useState<SortMode>("default");
    const [isWalletExpanded, setIsWalletExpanded] = useState<boolean>(false);
    const [logModalOpen, setLogModalOpen] = useState<boolean>(false);
    const [nowTimestamp, setNowTimestamp] = useState<number>(() => Date.now());

    const [availableTokens, setAvailableTokens] = useState<{ id: string; name: string }[]>([]);
    const [activeTokenId, setActiveTokenId] = useState<string | null>(null);
    const [activeTokenName, setActiveTokenName] = useState<string>("");
    const [tokenCurrency, setTokenCurrency] = useState<{ cp: number; sp: number; ep: number; gp: number; pp: number }>({
        cp: 0,
        sp: 0,
        ep: 0,
        gp: 0,
        pp: 0
    });
    const [tokenInventory, setTokenInventory] = useState<any[]>([]);
    const [tokenMaxWeight, setTokenMaxWeight] = useState<number>(150);

    const [takeQuantities, setTakeQuantities] = useState<Record<string, number>>({});
    const [processingIds, setProcessingIds] = useState<Record<string, boolean>>({});
    const [tradeNotices, setTradeNotices] = useState<TradeNotice[]>([]);
    const [scenarioSentence, setScenarioSentence] = useState<string>("正在搜尋線索...");

    // Player Item Gift Modal state
    const [giftItemTarget, setGiftItemTarget] = useState<any | null>(null);
    const [giftRecipientId, setGiftRecipientId] = useState<string>("");
    const [giftQty, setGiftQty] = useState<number>(1);

    // Direct Gold Gift Modal state
    const [goldGiftOpen, setGoldGiftOpen] = useState<boolean>(false);
    const [goldGiftTargetId, setGoldGiftTargetId] = useState<string>("");
    const [goldGiftAmount, setGoldGiftAmount] = useState<string>("1");

    // DM Sub-Category Manager, Inline Creation & Drag-and-Drop states
    const [subCatModalOpen, setSubCatModalOpen] = useState<boolean>(false);
    const [newTopCatInput, setNewTopCatInput] = useState<string>("");
    const [addingChildOfPath, setAddingChildOfPath] = useState<string | null>(null);
    const [newChildCatInput, setNewChildCatInput] = useState<string>("");
    const [inlineInsertSlotKey, setInlineInsertSlotKey] = useState<string | null>(null);
    const [inlineInsertValue, setInlineInsertValue] = useState<string>("");
    const [confirmDeleteCatPath, setConfirmDeleteCatPath] = useState<string | null>(null);

    // Drag and drop state with anti-jitter caching
    const [draggedEntity, setDraggedEntity] = useState<{
        type: "category" | "item";
        id: string;
    } | null>(null);
    const [dropIndicator, setDropIndicator] = useState<{
        targetPath: string;
        zone: "inside" | "before" | "after" | "outer";
    } | null>(null);
    const lastDropRef = useRef<{ targetPath: string; zone: string } | null>(null);
    const gripArmedRef = useRef<boolean>(false);
    const mainScrollContainerRef = useRef<HTMLDivElement | null>(null);
    const modalScrollContainerRef = useRef<HTMLDivElement | null>(null);
    const dragPointerYRef = useRef<number | null>(null);

    // Quick Move & Shop Import Modals
    const [movingItem, setMovingItem] = useState<LootItem | null>(null);
    const [moveTargetRegionId, setMoveTargetRegionId] = useState<string>("");
    const [moveTargetSubCat, setMoveTargetSubCat] = useState<string>("");
    const [shopImportOpen, setShopImportOpen] = useState<boolean>(false);
    const [importShopId, setImportShopId] = useState<string>("");
    const [importTargetSubCat, setImportTargetSubCat] = useState<string>("");
    const [selectedImportItemIds, setSelectedImportItemIds] = useState<Set<string>>(new Set());

    // Item detail modal & DM item editor modal with tabs
    const [inspectingItem, setInspectingItem] = useState<{
        item: any;
        sourceLabel: string;
    } | null>(null);
    const [lightboxImage, setLightboxImage] = useState<{ src: string; title?: string } | null>(null);
    const [itemEditorOpen, setItemEditorOpen] = useState(false);
    const [itemEditTab, setItemEditTab] = useState<"basic" | "image">("basic");
    const [editingItem, setEditingItem] = useState<LootItem | null>(null);
    const [formItem, setFormItem] = useState<Partial<LootItem>>({});
    const [confirmDeleteItemId, setConfirmDeleteItemId] = useState<string | null>(null);

    // Refs for file inputs
    const itemImageInputRef = useRef<HTMLInputElement | null>(null);
    const importItemsInputRef = useRef<HTMLInputElement | null>(null);
    const importCategoryInputRef = useRef<HTMLInputElement | null>(null);
    const activeTokenIdRef = useRef<string | null>(null);

    useEffect(() => {
        activeTokenIdRef.current = activeTokenId;
    }, [activeTokenId]);

    useEffect(() => {
        const timer = window.setInterval(() => {
            setNowTimestamp(Date.now());
        }, 10000);
        return () => window.clearInterval(timer);
    }, []);

    // Update drop indicator only when target or zone actually changes to prevent render lag
    const updateDropIndicatorThrottled = (
        next: { targetPath: string; zone: "inside" | "before" | "after" | "outer" } | null
    ) => {
        const prev = lastDropRef.current;
        if (!next && !prev) return;
        if (next && prev && next.targetPath === prev.targetPath && next.zone === prev.zone) return;
        lastDropRef.current = next;
        setDropIndicator(next);
    };

    const clearDragState = () => {
        gripArmedRef.current = false;
        dragPointerYRef.current = null;
        lastDropRef.current = null;
        setDraggedEntity(null);
        setDropIndicator(null);
    };

    // Enable smooth auto-scroll near top/bottom edges and wheel scrolling during active drag
    useEffect(() => {
        if (!draggedEntity) return;
        let rafId: number;

        const autoScrollStep = () => {
            const clientY = dragPointerYRef.current;
            const container = subCatModalOpen
                ? modalScrollContainerRef.current
                : mainScrollContainerRef.current;

            if (clientY !== null && container) {
                const rect = container.getBoundingClientRect();
                const edgeThreshold = 46;
                if (clientY < rect.top + edgeThreshold) {
                    const intensity = Math.max(2, Math.round((rect.top + edgeThreshold - clientY) * 0.25));
                    container.scrollTop -= intensity;
                } else if (clientY > rect.bottom - edgeThreshold) {
                    const intensity = Math.max(2, Math.round((clientY - (rect.bottom - edgeThreshold)) * 0.25));
                    container.scrollTop += intensity;
                }
            }
            rafId = requestAnimationFrame(autoScrollStep);
        };

        const handleGlobalWheel = (e: WheelEvent) => {
            const container = subCatModalOpen
                ? modalScrollContainerRef.current
                : mainScrollContainerRef.current;
            if (container) {
                container.scrollTop += e.deltaY;
            }
        };

        rafId = requestAnimationFrame(autoScrollStep);
        window.addEventListener("wheel", handleGlobalWheel, { passive: true });
        return () => {
            cancelAnimationFrame(rafId);
            window.removeEventListener("wheel", handleGlobalWheel);
        };
    }, [draggedEntity, subCatModalOpen]);

    const pushTradeNotice = (text: string) => {
        const id = `${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
        setTradeNotices(prev => [{ id, text }, ...prev].slice(0, 4));
        window.setTimeout(() => {
            setTradeNotices(prev => prev.filter(n => n.id !== id));
        }, 3000);
    };

    const source: LootSource | undefined =
        loots.find(s => s.id === selectedSourceId) || loots.find(s => isGM || s.isVisible);

    useEffect(() => {
        if (source && !selectedSourceId) {
            setSelectedSourceId(source.id);
        }
        if (source) {
            setScenarioSentence(pickLootScenarioSentence(source));
        }
    }, [source?.id]);

    const syncFromTokenItem = (token: any) => {
        setActiveTokenId(token.id);
        setActiveTokenName(token.text?.plainText || token.name || "未命名角色");
        const meta = (token.metadata?.[META_ID] as any) || {};
        const rawCurr = token.metadata?.[CURR_ID] || meta.currency || { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 };
        setTokenCurrency({
            cp: Number(rawCurr.cp) || 0,
            sp: Number(rawCurr.sp) || 0,
            ep: Number(rawCurr.ep) || 0,
            gp: Number(rawCurr.gp) || 0,
            pp: Number(rawCurr.pp) || 0
        });
        setTokenInventory(readTokenInventory(token));
        setNowTimestamp(Date.now());
        const str = meta.abilities?.str || 10;
        setTokenMaxWeight(str * 15);
    };

    const loadTokensAndSelection = async (preserveCurrent = true) => {
        if (!OBR.isReady) return;
        const allItems = await OBR.scene.items.getItems(
            i => (i.layer === "CHARACTER" || i.layer === "MOUNT") && i.type === "IMAGE"
        );
        const tokenList = allItems
            .filter(i => !(i.metadata && i.metadata["eu.armindo.embers/is-effect-token"]))
            .map(i => ({
                id: i.id,
                name: (i as any).text?.plainText || i.name || "未命名角色"
            }));
        setAvailableTokens(tokenList);

        const selection = await OBR.player.getSelection();
        if (selection && selection.length === 1) {
            const matched = allItems.find(i => i.id === selection[0]);
            if (matched) {
                syncFromTokenItem(matched);
                return;
            }
        }

        if (preserveCurrent && activeTokenIdRef.current) {
            const current = allItems.find(i => i.id === activeTokenIdRef.current);
            if (current) {
                syncFromTokenItem(current);
                return;
            }
        }

        setActiveTokenId(null);
        setActiveTokenName("");
        setTokenInventory([]);
    };

    useEffect(() => {
        let unsubPlayer: (() => void) | null = null;
        let unsubScene: (() => void) | null = null;
        let unsubLootEvents: (() => void) | null = null;

        const handleGiftReceived = async (e: any) => {
            const detail = e.detail;
            if (!detail || !detail.recipientTokenId) return;
            const currentId = activeTokenIdRef.current;
            const selection = OBR.isReady ? await OBR.player.getSelection() : [];
            const isRecipient =
                currentId === detail.recipientTokenId ||
                (Array.isArray(selection) && selection.includes(detail.recipientTokenId));

            if (isRecipient) {
                if (detail.isGold) playCoinDropSound();
                else playLootTakeSound();
                pushTradeNotice(`收到來自 ${detail.senderName} 的贈與：${detail.summary}`);
                loadTokensAndSelection(true);
            }
        };

        window.addEventListener("gift-received", handleGiftReceived);

        const setupOBR = async () => {
            setObrReady(true);
            await loadTokensAndSelection(false);

            unsubPlayer = OBR.player.onChange(() => {
                loadTokensAndSelection(true);
            });

            unsubScene = OBR.scene.items.onChange((items) => {
                const currentId = activeTokenIdRef.current;
                if (!currentId) return;
                const found = items.find(i => i.id === currentId);
                if (found) syncFromTokenItem(found);
            });

            unsubLootEvents = OBR.broadcast.onMessage(SHOP_EVENT_CHANNEL, async (msg: any) => {
                const data = msg.data;
                if (!data || data.type !== "LOOT_RESPONSE") return;
                const myConn = await OBR.player.getConnectionId();
                if (data.targetConnectionId && data.targetConnectionId !== "ALL" && data.targetConnectionId !== myConn) {
                    return;
                }

                if (data.transactionId && processedLootTxIds.has(data.transactionId)) {
                    return;
                }
                if (data.transactionId) {
                    processedLootTxIds.add(data.transactionId);
                }

                if (data.success) {
                    const receivedItem = data.currencyItem || data.item;
                    if (receivedItem?.isCurrency) {
                        playCoinDropSound();
                        const targetId = data.targetTokenId || activeTokenIdRef.current;
                        if (targetId) {
                            const items = await OBR.scene.items.getItems([targetId]);
                            if (items.length > 0) {
                                const token = items[0];
                                const meta = (token.metadata[META_ID] as any) || {};
                                const rawCurr = token.metadata[CURR_ID] || meta.currency || { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 };
                                const totalAddedCp = Math.round((Number(receivedItem.cost) || 0) * (data.quantity || 1) * 100);
                                const currentTotalCp = Math.round(
                                    (rawCurr.pp || 0) * 1000 +
                                    (rawCurr.gp || 0) * 100 +
                                    (rawCurr.ep || 0) * 50 +
                                    (rawCurr.sp || 0) * 10 +
                                    (rawCurr.cp || 0)
                                );
                                let nextTotalCp = currentTotalCp + totalAddedCp;
                                const newGp = Math.floor(nextTotalCp / 100);
                                nextTotalCp %= 100;
                                const newSp = Math.floor(nextTotalCp / 10);
                                const newCp = nextTotalCp % 10;
                                const newCurr = { pp: 0, gp: newGp, ep: 0, sp: newSp, cp: newCp };

                                await OBR.scene.items.updateItems([targetId], (draft) => {
                                    if (draft[0].metadata[CURR_ID] !== undefined) {
                                        draft[0].metadata[CURR_ID] = newCurr;
                                    } else {
                                        draft[0].metadata[META_ID] = { ...meta, currency: newCurr };
                                    }
                                });
                            }
                        }
                    } else {
                        playLootTakeSound();
                    }

                    pushTradeNotice(data.message || "拾取成功！");
                    loadTokensAndSelection(true);
                } else {
                    pushTradeNotice(data.message || "無法拾取該物品");
                }
            });
        };

        if (OBR.isReady) {
            setupOBR();
        } else {
            OBR.onReady(() => {
                setupOBR();
            });
        }

        return () => {
            window.removeEventListener("gift-received", handleGiftReceived);
            if (unsubPlayer) unsubPlayer();
            if (unsubScene) unsubScene();
            if (unsubLootEvents) unsubLootEvents();
        };
    }, []);

    const totalGP =
        tokenCurrency.cp / 100 +
        tokenCurrency.sp / 10 +
        tokenCurrency.ep / 2 +
        tokenCurrency.gp +
        tokenCurrency.pp * 10;

    const coinWeight =
        (tokenCurrency.cp + tokenCurrency.sp + tokenCurrency.ep + tokenCurrency.gp + tokenCurrency.pp) / 50;
    const itemsWeight = tokenInventory.reduce(
        (acc, item) => acc + (Number(item.weight) || 0) * (Number(item.quantity) || 0),
        0
    );
    const containersWeight = INVENTORY_CATEGORIES.reduce(
        (acc, cat) => (tokenInventory.some(i => i.category === cat.id) ? acc + cat.weight : acc),
        0
    );
    const currentTotalWeight = +(coinWeight + itemsWeight + containersWeight).toFixed(1);

    const warningLimit = tokenMaxWeight * 0.8;
    let weightColor = "text-emerald-400";
    let barColor = "bg-emerald-500";
    let weightWarning = "";
    if (currentTotalWeight > tokenMaxWeight) {
        weightColor = "text-red-500";
        barColor = "bg-red-500";
        weightWarning = "已超重";
    } else if (currentTotalWeight > warningLimit) {
        weightColor = "text-orange-400";
        barColor = "bg-orange-500";
        weightWarning = "負重沉重";
    }

    const nextSortMode = (prev: SortMode): SortMode => {
        if (prev === "default") return "rarity";
        if (prev === "rarity") return "value";
        if (prev === "value") return "weight";
        return "default";
    };

    const getSortButtonTitle = (mode: SortMode) => {
        if (mode === "rarity") return "排序：依稀有度";
        if (mode === "value") return "排序：依價值";
        if (mode === "weight") return "排序：依重量";
        return "排序：預設順序";
    };

    const renderSortIcon = (mode: SortMode) => {
        if (mode === "rarity") return <FaGem className="w-3.5 h-3.5" />;
        if (mode === "value") return <FaCoins className="w-3.5 h-3.5" />;
        if (mode === "weight") return <FaWeightHanging className="w-3.5 h-3.5" />;
        return <FaSort className="w-3.5 h-3.5" />;
    };

    const sortItemsList = <T extends Record<string, any>>(list: T[], mode: SortMode, byTotalWeight = false): T[] => {
        if (mode === "default") return list;
        return list.slice().sort((a, b) => {
            if (mode === "rarity") {
                return (RARITY_WEIGHT[b.rarity || "none"] || 0) - (RARITY_WEIGHT[a.rarity || "none"] || 0);
            }
            if (mode === "value") {
                return (Number(b.cost) || 0) - (Number(a.cost) || 0);
            }
            if (mode === "weight") {
                const wA = byTotalWeight ? (Number(a.weight) || 0) * (Number(a.quantity) || 1) : Number(a.weight) || 0;
                const wB = byTotalWeight ? (Number(b.weight) || 0) * (Number(b.quantity) || 1) : Number(b.weight) || 0;
                return wB - wA;
            }
            return 0;
        });
    };

    const broadcastGiftNotification = async (
        recipientTokenId: string,
        recipientName: string,
        summary: string,
        isGold: boolean
    ) => {
        const senderName = activeTokenName || (isGM ? "DM" : "冒險者");
        const payload = {
            type: "GIFT_RECEIVED",
            senderName,
            recipientTokenId,
            recipientName,
            summary,
            isGold,
            logMessage: `${senderName} 贈與了 ${summary} 給 ${recipientName}`
        };
        const compressed = LZString.compressToUTF16(JSON.stringify(payload));
        await OBR.broadcast.sendMessage(SYNC_CHANNEL, compressed, { destination: "ALL" });
    };

    const handleConsolidateCurrency = async () => {
        if (!activeTokenId) return;
        playClickSound();
        const totalCP = Math.round(
            (tokenCurrency.cp || 0) +
                (tokenCurrency.sp || 0) * 10 +
                (tokenCurrency.ep || 0) * 50 +
                (tokenCurrency.gp || 0) * 100 +
                (tokenCurrency.pp || 0) * 1000
        );
        const newGP = Math.floor(totalCP / 100);
        const rem = totalCP % 100;
        const newSP = Math.floor(rem / 10);
        const newCP = rem % 10;
        const nextCurr = { cp: newCP, sp: newSP, ep: 0, gp: newGP, pp: 0 };

        setTokenCurrency(nextCurr);
        await OBR.scene.items.updateItems([activeTokenId], (items) => {
            if (items.length === 0) return;
            items[0].metadata[CURR_ID] = nextCurr;
        });
    };

    const handleTakeLoot = (item: LootItem) => {
        if (!source || processingIds[item.id]) return;
        playClickSound();
        const qty = item.isInfinite ? 1 : Math.min(takeQuantities[item.id] || 1, item.quantity);
        if (!item.isInfinite && item.quantity < qty) {
            pushTradeNotice(`剩餘數量不足：${item.name}`);
            return;
        }
        if (!activeTokenId) {
            pushTradeNotice("請先於右側選擇角色");
            return;
        }

        setProcessingIds(prev => ({ ...prev, [item.id]: true }));
        OBR.broadcast.sendMessage(
            SHOP_EVENT_CHANNEL,
            {
                type: "LOOT_REQUEST",
                transactionId: Math.random().toString(36).substring(2, 9),
                sourceId: source.id,
                item,
                cost: 0,
                quantity: qty,
                targetTokenId: activeTokenId
            },
            { destination: "ALL" }
        );
        setTakeQuantities(prev => ({ ...prev, [item.id]: 1 }));
        setTimeout(() => setProcessingIds(prev => ({ ...prev, [item.id]: false })), 700);
    };

    const handleExecuteItemGift = async () => {
        if (!activeTokenId || !giftItemTarget) return;
        const qty = Math.min(Math.max(1, giftQty), giftItemTarget.quantity || 1);

        if (!giftRecipientId || giftRecipientId === activeTokenId) {
            pushTradeNotice("請選擇接收角色");
            return;
        }

        const sceneItems = await OBR.scene.items.getItems([activeTokenId, giftRecipientId]);
        const recipientToken = sceneItems.find(i => i.id === giftRecipientId);
        if (!recipientToken) {
            pushTradeNotice("找不到目標角色");
            return;
        }

        const recipientMeta = (recipientToken.metadata?.[META_ID] as any) || {};
        const recipientCurr = recipientToken.metadata?.[CURR_ID] || recipientMeta.currency || { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 };
        const recipientInv = readTokenInventory(recipientToken);
        const recCoinW =
            ((recipientCurr.cp || 0) +
                (recipientCurr.sp || 0) * 10 +
                (recipientCurr.ep || 0) * 50 +
                (recipientCurr.gp || 0) * 100 +
                (recipientCurr.pp || 0) * 1000) / 50;
        const recItemsW = recipientInv.reduce(
            (acc: number, i: any) => acc + (Number(i.weight) || 0) * (Number(i.quantity) || 0),
            0
        );
        const recContW = INVENTORY_CATEGORIES.reduce(
            (acc, cat) => (recipientInv.some((i: any) => i.category === cat.id) ? acc + cat.weight : acc),
            0
        );
        const addedW = (Number(giftItemTarget.weight) || 0) * qty;
        const recMaxW = (recipientMeta.abilities?.str || 10) * 15;

        if (recCoinW + recItemsW + recContW + addedW > recMaxW) {
            pushTradeNotice(`對方負重上限為 ${recMaxW} lb`);
            return;
        }

        playLootTakeSound();
        const recipientName = (recipientToken as any).text?.plainText || recipientToken.name || "隊友";
        const giftedTimestamp = Date.now();

        await OBR.scene.items.updateItems([activeTokenId, giftRecipientId], (items) => {
            const sender = items.find(i => i.id === activeTokenId);
            const receiver = items.find(i => i.id === giftRecipientId);
            if (!sender || !receiver) return;

            const sInv = readTokenInventory(sender);
            const nextSInv: any[] = [];
            for (const entry of sInv) {
                if (entry.id === giftItemTarget.id) {
                    const rem = entry.quantity - qty;
                    if (rem > 0) {
                        const updated = { ...entry, quantity: rem };
                        nextSInv.push(updated);
                        sender.metadata[`${INV_ID}_${entry.id}`] = updated;
                    } else {
                        delete sender.metadata[`${INV_ID}_${entry.id}`];
                    }
                } else {
                    nextSInv.push(entry);
                }
            }
            sender.metadata[INV_ID] = nextSInv;

            const rInv = readTokenInventory(receiver);
            const existingIdx = rInv.findIndex(
                (i: any) =>
                    i.name === giftItemTarget.name &&
                    Number(i.cost || 0) === Number(giftItemTarget.cost || 0)
            );
            if (existingIdx !== -1) {
                const updated = {
                    ...rInv[existingIdx],
                    quantity: rInv[existingIdx].quantity + qty,
                    addedAt: giftedTimestamp
                };
                rInv[existingIdx] = updated;
                receiver.metadata[`${INV_ID}_${updated.id}`] = updated;
            } else {
                const newEntry = {
                    ...giftItemTarget,
                    id: Date.now().toString(36) + Math.random().toString(36).substring(2, 6),
                    quantity: qty,
                    addedAt: giftedTimestamp
                };
                rInv.push(newEntry);
                receiver.metadata[`${INV_ID}_${newEntry.id}`] = newEntry;
            }
            receiver.metadata[INV_ID] = rInv;
        });

        const summary = `${giftItemTarget.name} x${qty}`;
        pushTradeNotice(`已贈與 ${summary} 給 ${recipientName}`);
        await broadcastGiftNotification(giftRecipientId, recipientName, summary, false);
        setGiftItemTarget(null);
    };

    const handleExecuteGoldGift = async () => {
        if (!activeTokenId || !goldGiftTargetId || goldGiftTargetId === activeTokenId) {
            pushTradeNotice("請選擇接收角色");
            return;
        }
        const amount = Number(parseFloat(goldGiftAmount).toFixed(2));
        if (isNaN(amount) || amount <= 0) return;
        if (totalGP + 0.0001 < amount) {
            pushTradeNotice(`持有金幣不足 ${amount.toFixed(2)} GP`);
            return;
        }

        playCoinDropSound();
        const deltaCp = Math.round(amount * 100);
        const targetObj = availableTokens.find(t => t.id === goldGiftTargetId);
        const recipientName = targetObj?.name || "隊友";

        await OBR.scene.items.updateItems([activeTokenId, goldGiftTargetId], (items) => {
            const sender = items.find(i => i.id === activeTokenId);
            const receiver = items.find(i => i.id === goldGiftTargetId);
            if (!sender || !receiver) return;

            const adjustCurr = (tok: any, diffCp: number) => {
                const meta = (tok.metadata?.[META_ID] as any) || {};
                const raw = tok.metadata?.[CURR_ID] || meta.currency || { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 };
                const curCp = Math.round(
                    (raw.pp || 0) * 1000 +
                    (raw.gp || 0) * 100 +
                    (raw.ep || 0) * 50 +
                    (raw.sp || 0) * 10 +
                    (raw.cp || 0)
                );
                let nextCp = Math.max(0, curCp + diffCp);
                const gp = Math.floor(nextCp / 100);
                nextCp %= 100;
                const sp = Math.floor(nextCp / 10);
                const cp = nextCp % 10;
                const nextObj = { pp: 0, gp, ep: 0, sp, cp };
                if (tok.metadata[CURR_ID] !== undefined) {
                    tok.metadata[CURR_ID] = nextObj;
                } else {
                    tok.metadata[META_ID] = { ...meta, currency: nextObj };
                }
            };

            adjustCurr(sender, -deltaCp);
            adjustCurr(receiver, deltaCp);
        });

        const summary = `${amount.toFixed(2)} GP`;
        pushTradeNotice(`已轉交 ${summary} 給 ${recipientName}`);
        await broadcastGiftNotification(goldGiftTargetId, recipientName, summary, true);
        setGoldGiftOpen(false);
    };

    const handleRandomReveal = (targetSubCat?: string) => {
        if (!source) return;
        playClickSound();
        const pool = source.items.filter(i => {
            if (i.isRevealed) return false;
            if (!i.isInfinite && i.quantity <= 0) return false;
            if (targetSubCat !== undefined) {
                const norm = normalizeSubCategoryPath(i.subCategory);
                return norm === targetSubCat || norm.startsWith(`${targetSubCat} / `);
            }
            return true;
        });

        if (pool.length === 0) {
            pushTradeNotice("無未揭露物品");
            return;
        }

        const picked = pool[Math.floor(Math.random() * pool.length)];
        let nextItems: LootItem[];

        if (picked.isInfinite) {
            const clone: LootItem = {
                ...picked,
                id: Date.now().toString(36),
                isInfinite: false,
                isRevealed: true,
                quantity: 1
            };
            nextItems = [...source.items, clone];
        } else if (picked.quantity > 1) {
            const clone: LootItem = {
                ...picked,
                id: Date.now().toString(36),
                isRevealed: true,
                quantity: 1
            };
            nextItems = source.items.map(i =>
                i.id === picked.id ? { ...i, quantity: i.quantity - 1 } : i
            );
            nextItems.push(clone);
        } else {
            nextItems = source.items.map(i =>
                i.id === picked.id ? { ...i, isRevealed: true } : i
            );
        }

        saveLoots(loots.map(s => (s.id === source.id ? { ...s, items: nextItems } : s)));
        pushTradeNotice(`揭露：${picked.name}`);
    };

    const handleRevealAllInBranch = (reveal: boolean, targetSubCat?: string) => {
        if (!source) return;
        playClickSound();
        const nextItems = source.items.map(i => {
            if (targetSubCat !== undefined) {
                const norm = normalizeSubCategoryPath(i.subCategory);
                if (norm !== targetSubCat && !norm.startsWith(`${targetSubCat} / `)) {
                    return i;
                }
            }
            return { ...i, isRevealed: reveal };
        });
        saveLoots(loots.map(s => (s.id === source.id ? { ...s, items: nextItems } : s)));
        pushTradeNotice(reveal ? "已全部揭露" : "已全部隱藏");
    };

    const handleToggleSubCatVisibility = (subCatPath: string) => {
        if (!source) return;
        playClickSound();
        const currentHidden = new Set((source.hiddenSubCategories || []).map(normalizeSubCategoryPath));
        if (currentHidden.has(subCatPath)) {
            currentHidden.delete(subCatPath);
        } else {
            currentHidden.add(subCatPath);
        }
        saveLoots(
            loots.map(s =>
                s.id === source.id
                    ? { ...s, hiddenSubCategories: Array.from(currentHidden) }
                    : s
            )
        );
    };

    const createCategoryAt = (parentPath: string, rawLeafName: string, insertAfterPath?: string) => {
        if (!source) return;
        const cleanLeaf = rawLeafName.replaceAll("/", "").trim();
        if (!cleanLeaf) return;

        const existingSet = new Set((source.subCategories || []).map(normalizeSubCategoryPath));
        let candidatePath = parentPath ? `${parentPath} / ${cleanLeaf}` : cleanLeaf;
        let counter = 2;
        while (existingSet.has(candidatePath)) {
            candidatePath = parentPath ? `${parentPath} / ${cleanLeaf} (${counter++})` : `${cleanLeaf} (${counter++})`;
        }

        const nextList = (source.subCategories || []).map(normalizeSubCategoryPath);
        if (insertAfterPath) {
            const idx = nextList.indexOf(insertAfterPath);
            if (idx !== -1) {
                nextList.splice(idx + 1, 0, candidatePath);
            } else {
                nextList.push(candidatePath);
            }
        } else {
            nextList.push(candidatePath);
        }

        saveLoots(
            loots.map(s =>
                s.id === source.id ? { ...s, subCategories: Array.from(new Set(nextList)) } : s
            )
        );
        playClickSound();
    };

    const handleDeleteSubCategory = (subCatPath: string) => {
        if (!source) return;
        playClickSound();
        const parentOfDeleted = getParentPath(subCatPath);
        const isTargetOrDescendant = (p: string) => p === subCatPath || p.startsWith(`${subCatPath} / `);

        const nextSubCats = (source.subCategories || [])
            .map(normalizeSubCategoryPath)
            .filter(c => !isTargetOrDescendant(c));
        const nextHidden = (source.hiddenSubCategories || [])
            .map(normalizeSubCategoryPath)
            .filter(c => !isTargetOrDescendant(c));
        const nextItems = source.items.map(i => {
            const norm = normalizeSubCategoryPath(i.subCategory);
            if (isTargetOrDescendant(norm)) {
                return { ...i, subCategory: parentOfDeleted };
            }
            return i;
        });

        saveLoots(
            loots.map(s =>
                s.id === source.id
                    ? {
                          ...s,
                          subCategories: nextSubCats,
                          hiddenSubCategories: nextHidden,
                          items: nextItems
                      }
                    : s
            )
        );
        setConfirmDeleteCatPath(null);
    };

    const handleMoveCategoryTree = (
        sourcePath: string,
        newParentPath: string,
        anchorSiblingPath?: string,
        position?: "before" | "after"
    ) => {
        if (!source) return;
        const normSource = normalizeSubCategoryPath(sourcePath);
        const normNewParent = normalizeSubCategoryPath(newParentPath);

        if (!normSource) return;
        if (normNewParent === normSource || normNewParent.startsWith(`${normSource} / `)) {
            return;
        }

        const leafName = getLeafName(normSource);
        const currentParent = getParentPath(normSource);
        let newRootPath = normNewParent ? `${normNewParent} / ${leafName}` : leafName;

        const existingPaths = (source.subCategories || []).map(normalizeSubCategoryPath);
        if (currentParent !== normNewParent) {
            const existingSet = new Set(existingPaths);
            let counter = 2;
            while (existingSet.has(newRootPath)) {
                newRootPath = normNewParent
                    ? `${normNewParent} / ${leafName} (${counter++})`
                    : `${leafName} (${counter++})`;
            }
        }

        const remapPath = (p: string): string => {
            const norm = normalizeSubCategoryPath(p);
            if (norm === normSource) return newRootPath;
            if (norm.startsWith(`${normSource} / `)) {
                return `${newRootPath}${norm.slice(normSource.length)}`;
            }
            return norm;
        };

        const isMovingBranch = (p: string) => p === normSource || p.startsWith(`${normSource} / `);
        const remainingPaths = existingPaths.filter(p => !isMovingBranch(p));
        const movedPaths = existingPaths.filter(isMovingBranch).map(remapPath);

        const ancestorsToEnsure: string[] = [];
        if (normNewParent) {
            const parts = normNewParent.split(" / ");
            let acc = "";
            for (const part of parts) {
                acc = acc ? `${acc} / ${part}` : part;
                if (!remainingPaths.includes(acc) && !movedPaths.includes(acc)) {
                    ancestorsToEnsure.push(acc);
                }
            }
        }

        let orderedSubCats = [...remainingPaths, ...ancestorsToEnsure];
        if (anchorSiblingPath && (position === "before" || position === "after")) {
            const remappedAnchor = remapPath(anchorSiblingPath);
            const anchorIdx = orderedSubCats.indexOf(remappedAnchor);
            if (anchorIdx !== -1) {
                const insertIdx = position === "before" ? anchorIdx : anchorIdx + 1;
                orderedSubCats.splice(insertIdx, 0, ...movedPaths);
            } else {
                orderedSubCats.push(...movedPaths);
            }
        } else {
            orderedSubCats.push(...movedPaths);
        }

        const nextHidden = (source.hiddenSubCategories || []).map(remapPath);
        const nextItems = source.items.map(item => ({
            ...item,
            subCategory: remapPath(item.subCategory || "")
        }));

        saveLoots(
            loots.map(s =>
                s.id === source.id
                    ? {
                          ...s,
                          subCategories: Array.from(new Set(orderedSubCats)),
                          hiddenSubCategories: Array.from(new Set(nextHidden)),
                          items: nextItems
                      }
                    : s
            )
        );
        playClickSound();
    };

    const handleDropItemToCategory = (itemId: string, targetCategoryPath: string) => {
        if (!source) return;
        const normTarget = normalizeSubCategoryPath(targetCategoryPath);
        const targetItem = source.items.find(i => i.id === itemId);
        if (!targetItem) return;
        if (normalizeSubCategoryPath(targetItem.subCategory) === normTarget) return;

        const nextItems = source.items.map(i =>
            i.id === itemId ? { ...i, subCategory: normTarget } : i
        );
        saveLoots(loots.map(s => (s.id === source.id ? { ...s, items: nextItems } : s)));
        playClickSound();
        pushTradeNotice(`已移至${normTarget ? getLeafName(normTarget) : "一般發現物"}`);
    };

    const handleExportSingleCategory = (categoryPath: string) => {
        if (!source) return;
        playClickSound();
        const normCat = normalizeSubCategoryPath(categoryPath);
        const leafName = getLeafName(normCat);

        const descendantSubCats = (source.subCategories || [])
            .map(normalizeSubCategoryPath)
            .filter(c => c.startsWith(`${normCat} / `))
            .map(c => c.slice(normCat.length + 3));

        const categoryItems = (source.items || [])
            .filter(i => {
                const normItemCat = normalizeSubCategoryPath(i.subCategory);
                return normItemCat === normCat || normItemCat.startsWith(`${normCat} / `);
            })
            .map(i => {
                const normItemCat = normalizeSubCategoryPath(i.subCategory);
                const relSub = normItemCat === normCat ? "" : normItemCat.slice(normCat.length + 3);
                return {
                    ...i,
                    subCategory: relSub
                };
            });

        const exportPayload = {
            categoryName: leafName,
            subCategories: descendantSubCats,
            items: categoryItems
        };

        downloadFileFromString(JSON.stringify(exportPayload, null, 2), `${leafName}_分類.json`);
    };

    const handleImportCategoryFile = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !source) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const json = JSON.parse(event.target?.result as string);
                const subSet = new Set((source.subCategories || []).map(normalizeSubCategoryPath));

                if (json && typeof json === "object" && !Array.isArray(json) && Array.isArray(json.items)) {
                    const baseName = (json.categoryName || "匯入分類").toString().replaceAll("/", "").trim();
                    let basePath = baseName;
                    let counter = 2;
                    while (subSet.has(basePath)) {
                        basePath = `${baseName} (${counter++})`;
                    }

                    subSet.add(basePath);
                    if (Array.isArray(json.subCategories)) {
                        json.subCategories.forEach((rel: any) => {
                            const normRel = normalizeSubCategoryPath(String(rel || ""));
                            if (normRel) subSet.add(`${basePath} / ${normRel}`);
                        });
                    }

                    const importedItems: LootItem[] = json.items.map((raw: any) => {
                        const normRel = normalizeSubCategoryPath(raw.subCategory);
                        const fullSub = normRel ? `${basePath} / ${normRel}` : basePath;
                        subSet.add(fullSub);
                        return {
                            id: Date.now().toString(36) + Math.random().toString(36).substring(2, 7),
                            name: raw.name || "未命名戰利品",
                            description: raw.description || "",
                            imageUrl: raw.imageUrl || "",
                            imageCrop: raw.imageCrop || { ...DEFAULT_IMAGE_CROP },
                            subCategory: fullSub,
                            weight: Number(raw.weight) || 0,
                            cost: Number(raw.cost) || 0,
                            rarity: raw.rarity || "none",
                            category: raw.category || "backpack",
                            quantity: Number(raw.quantity) ?? 1,
                            isInfinite: Boolean(raw.isInfinite),
                            isRevealed: Boolean(raw.isRevealed),
                            isCurrency: Boolean(raw.isCurrency)
                        };
                    });

                    saveLoots(
                        loots.map(s =>
                            s.id === source.id
                                ? {
                                      ...s,
                                      subCategories: Array.from(subSet),
                                      items: [...s.items, ...importedItems]
                                  }
                                : s
                        )
                    );
                    pushTradeNotice(`已匯入分類「${baseName}」`);
                }
            } catch (err) {
                pushTradeNotice("分類檔案格式錯誤");
            }
        };
        reader.readAsText(file);
        e.target.value = "";
    };

    const handleConfirmMoveItem = () => {
        if (!source || !movingItem) return;
        playClickSound();
        const targetRegId = moveTargetRegionId || source.id;
        const normalizedSub = normalizeSubCategoryPath(moveTargetSubCat);
        const updatedItem: LootItem = { ...movingItem, subCategory: normalizedSub };

        if (targetRegId === source.id) {
            const subSet = new Set((source.subCategories || []).map(normalizeSubCategoryPath));
            if (normalizedSub) subSet.add(normalizedSub);
            saveLoots(
                loots.map(s =>
                    s.id === source.id
                        ? {
                              ...s,
                              subCategories: Array.from(subSet),
                              items: s.items.map(i => (i.id === movingItem.id ? updatedItem : i))
                          }
                        : s
                )
            );
        } else {
            saveLoots(
                loots.map(s => {
                    if (s.id === source.id) {
                        return { ...s, items: s.items.filter(i => i.id !== movingItem.id) };
                    }
                    if (s.id === targetRegId) {
                        const subSet = new Set((s.subCategories || []).map(normalizeSubCategoryPath));
                        if (normalizedSub) subSet.add(normalizedSub);
                        return {
                            ...s,
                            subCategories: Array.from(subSet),
                            items: [...s.items, updatedItem]
                        };
                    }
                    return s;
                })
            );
        }
        setMovingItem(null);
        pushTradeNotice(`已移動「${movingItem.name}」`);
    };

    const handleConfirmImportFromShop = () => {
        if (!source || !importShopId || selectedImportItemIds.size === 0) return;
        playClickSound();
        const targetShop = shops.find(s => s.id === importShopId);
        if (!targetShop) return;

        const normalizedSub = normalizeSubCategoryPath(importTargetSubCat);
        const pool = [...(targetShop.items || []), ...(targetShop.boughtItems || [])];
        const clonedItems: LootItem[] = pool
            .filter(i => selectedImportItemIds.has(i.id))
            .map(i => ({
                ...i,
                id: Date.now().toString(36) + Math.random().toString(36).substring(2, 6),
                subCategory: normalizedSub,
                quantity: 1,
                isRevealed: false,
                isInfinite: false,
                isCurrency: false
            }));

        const subSet = new Set((source.subCategories || []).map(normalizeSubCategoryPath));
        if (normalizedSub) subSet.add(normalizedSub);

        saveLoots(
            loots.map(s =>
                s.id === source.id
                    ? {
                          ...s,
                          subCategories: Array.from(subSet),
                          items: [...s.items, ...clonedItems]
                      }
                    : s
            )
        );
        setShopImportOpen(false);
        setSelectedImportItemIds(new Set());
        pushTradeNotice(`已匯入 ${clonedItems.length} 件物品`);
    };

    const handleSaveLootItem = () => {
        if (!source || !formItem.name?.trim()) return;
        playClickSound();
        const normalizedSub = normalizeSubCategoryPath(formItem.subCategory);
        const newItem: LootItem = {
            id: editingItem?.id || Date.now().toString(36),
            name: formItem.name.trim(),
            description: formItem.description || "",
            imageUrl: formItem.imageUrl || "",
            imageCrop: formItem.imageCrop || { ...DEFAULT_IMAGE_CROP },
            subCategory: normalizedSub,
            weight: Number(formItem.weight) || 0,
            cost: Number(formItem.cost) || 0,
            rarity: formItem.rarity || "none",
            category: formItem.category || "backpack",
            quantity: Math.max(0, Math.round(Number(formItem.quantity) ?? 1)),
            isInfinite: Boolean(formItem.isInfinite),
            isRevealed: Boolean(formItem.isRevealed),
            isCurrency: Boolean(formItem.isCurrency)
        };

        const subSet = new Set((source.subCategories || []).map(normalizeSubCategoryPath));
        if (normalizedSub) subSet.add(normalizedSub);

        saveLoots(
            loots.map(s => {
                if (s.id !== source.id) return s;
                const updated = editingItem
                    ? s.items.map(i => (i.id === editingItem.id ? newItem : i))
                    : [...s.items, newItem];
                return {
                    ...s,
                    subCategories: Array.from(subSet),
                    items: updated
                };
            })
        );
        setItemEditorOpen(false);
    };

    const handleExportRegionItems = () => {
        if (!source) return;
        playClickSound();
        downloadFileFromString(JSON.stringify(source.items || [], null, 2), `${source.name}_戰利品.json`);
    };

    const handleImportRegionItems = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !source) return;
        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const json = JSON.parse(event.target?.result as string);
                if (Array.isArray(json)) {
                    const imported: LootItem[] = json.map((raw: any) => ({
                        id: Date.now().toString(36) + Math.random().toString(36).substring(2, 7),
                        name: raw.name || "未命名戰利品",
                        description: raw.description || "",
                        imageUrl: raw.imageUrl || "",
                        imageCrop: raw.imageCrop || { ...DEFAULT_IMAGE_CROP },
                        subCategory: normalizeSubCategoryPath(raw.subCategory),
                        weight: Number(raw.weight) || 0,
                        cost: Number(raw.cost) || 0,
                        rarity: raw.rarity || "none",
                        category: raw.category || "backpack",
                        quantity: Number(raw.quantity) ?? 1,
                        isInfinite: Boolean(raw.isInfinite),
                        isRevealed: Boolean(raw.isRevealed),
                        isCurrency: Boolean(raw.isCurrency)
                    }));
                    const subSet = new Set((source.subCategories || []).map(normalizeSubCategoryPath));
                    imported.forEach(i => {
                        if (i.subCategory) subSet.add(i.subCategory);
                    });
                    saveLoots(
                        loots.map(s =>
                            s.id === source.id
                                ? {
                                      ...s,
                                      subCategories: Array.from(subSet),
                                      items: [...s.items, ...imported]
                                  }
                                : s
                        )
                    );
                    pushTradeNotice(`已匯入 ${imported.length} 件戰利品`);
                }
            } catch (err) {
                pushTradeNotice("匯入失敗");
            }
        };
        reader.readAsText(file);
        e.target.value = "";
    };

    const handlePickItemOBRAsset = async () => {
        try {
            const assets = await OBR.assets.downloadImages(false);
            if (assets && assets.length > 0 && assets[0].image?.url) {
                setFormItem(prev => ({
                    ...prev,
                    imageUrl: assets[0].image.url,
                    imageCrop: { ...DEFAULT_IMAGE_CROP }
                }));
            }
        } catch (e) {
            console.warn("Failed to pick item asset", e);
        }
    };

    const handleItemLocalImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        try {
            const compressed = await compressImageFile(file, 520, 0.78);
            setFormItem(prev => ({
                ...prev,
                imageUrl: compressed,
                imageCrop: { ...DEFAULT_IMAGE_CROP }
            }));
        } catch (err) {
            console.error("Failed to compress item image", err);
        } finally {
            e.target.value = "";
        }
    };

    if (!obrReady) {
        return (
            <div className="fixed inset-0 w-screen h-screen flex items-center justify-center bg-panel-base text-white overflow-hidden">
                <span className="text-sm font-bold text-gray-400">載入中...</span>
            </div>
        );
    }

    if (!source) {
        return (
            <div className="fixed inset-0 w-screen h-screen flex flex-col items-center justify-center bg-panel-base text-white p-6 overflow-hidden">
                <p className="text-sm font-bold text-gray-400 mb-4">找不到指定的探索地區</p>
                <button
                    onClick={() => OBR.modal.close("eu.armindo.embers/loot-modal")}
                    className="px-5 py-2 rounded-full text-xs font-bold bg-panel-active text-white"
                >
                    關閉
                </button>
            </div>
        );
    }

    const themeObj = LEGACY_THEMES[source.themeId || "panel"] || LEGACY_THEMES.panel;
    const hiddenSubCatsSet = new Set((source.hiddenSubCategories || []).map(normalizeSubCategoryPath));

    const isPathHiddenForPlayer = (path: string): boolean => {
        if (!path) return false;
        const parts = path.split(" / ").filter(Boolean);
        let acc = "";
        for (const p of parts) {
            acc = acc ? `${acc} / ${p}` : p;
            if (hiddenSubCatsSet.has(acc) || hiddenSubCatsSet.has(p)) return true;
        }
        return false;
    };

    const allSubCatPathsSet = new Set<string>();
    const addWithAncestors = (rawPath: string) => {
        const norm = normalizeSubCategoryPath(rawPath);
        if (!norm) return;
        const parts = norm.split(" / ");
        let acc = "";
        for (const part of parts) {
            acc = acc ? `${acc} / ${part}` : part;
            allSubCatPathsSet.add(acc);
        }
    };

    (source.subCategories || []).forEach(addWithAncestors);
    (source.items || []).forEach(i => addWithAncestors(i.subCategory || ""));
    const orderedSubCatPaths = Array.from(allSubCatPathsSet);

    const matchingItems = (source.items || [])
        .filter(i => (isGM ? true : i.isRevealed && !isPathHiddenForPlayer(normalizeSubCategoryPath(i.subCategory))))
        .filter(i =>
            lootSearch.trim() === ""
                ? true
                : i.name.toLowerCase().includes(lootSearch.trim().toLowerCase()) ||
                  (i.description || "").toLowerCase().includes(lootSearch.trim().toLowerCase())
        );

    const rootItems = sortItemsList(
        matchingItems.filter(i => normalizeSubCategoryPath(i.subCategory) === ""),
        lootSortMode,
        false
    );

    const nodeMap = new Map<string, CategoryTreeNode>();
    for (const path of orderedSubCatPaths) {
        if (!isGM && isPathHiddenForPlayer(path)) continue;
        const parts = path.split(" / ");
        nodeMap.set(path, {
            name: parts[parts.length - 1],
            fullPath: path,
            parentPath: parts.slice(0, -1).join(" / "),
            depth: parts.length - 1,
            items: sortItemsList(
                matchingItems.filter(i => normalizeSubCategoryPath(i.subCategory) === path),
                lootSortMode,
                false
            ),
            children: [],
            isHidden: hiddenSubCatsSet.has(path)
        });
    }

    const rootCategoryNodes: CategoryTreeNode[] = [];
    for (const node of nodeMap.values()) {
        if (node.parentPath && nodeMap.has(node.parentPath)) {
            nodeMap.get(node.parentPath)!.children.push(node);
        } else {
            rootCategoryNodes.push(node);
        }
    }

    const hasAnyVisibleInSubtree = (node: CategoryTreeNode): boolean => {
        if (node.items.length > 0) return true;
        return node.children.some(hasAnyVisibleInSubtree);
    };

    const visibleRootCategoryNodes = isGM
        ? rootCategoryNodes
        : rootCategoryNodes.filter(hasAnyVisibleInSubtree);

    const filteredInventory = sortItemsList(
        tokenInventory.filter(i => (invCategoryFilter === "all" ? true : i.category === invCategoryFilter)),
        invSortMode,
        true
    );

    // Render hover-activated dashed-border inline category creator slot
    const renderDashedAddCategorySlot = (slotKey: string, parentPath: string, insertAfterPath?: string, label = "新增分類") => {
        if (!isGM) return null;
        const isEditingThisSlot = inlineInsertSlotKey === slotKey;

        if (isEditingThisSlot) {
            return (
                <div className="flex items-center gap-1.5 my-1 px-1">
                    <input
                        autoFocus
                        type="text"
                        value={inlineInsertValue}
                        onChange={(e) => setInlineInsertValue(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === "Enter") {
                                e.preventDefault();
                                createCategoryAt(parentPath, inlineInsertValue, insertAfterPath);
                                setInlineInsertSlotKey(null);
                                setInlineInsertValue("");
                            } else if (e.key === "Escape") {
                                setInlineInsertSlotKey(null);
                                setInlineInsertValue("");
                            }
                        }}
                        placeholder="輸入分類名稱..."
                        className="flex-1 bg-black/45 text-white text-xs font-bold rounded-xl px-3 py-1.5 outline-none border border-panel-active"
                    />
                    <button
                        type="button"
                        onClick={() => {
                            createCategoryAt(parentPath, inlineInsertValue, insertAfterPath);
                            setInlineInsertSlotKey(null);
                            setInlineInsertValue("");
                        }}
                        className="p-1.5 rounded-lg bg-panel-active text-white outline-none"
                    >
                        <FaCheck className="w-3 h-3" />
                    </button>
                    <button
                        type="button"
                        onClick={() => {
                            setInlineInsertSlotKey(null);
                            setInlineInsertValue("");
                        }}
                        className="p-1.5 rounded-lg bg-black/40 text-gray-300 hover:text-white outline-none"
                    >
                        <FaXmark className="w-3 h-3" />
                    </button>
                </div>
            );
        }

        return (
            <div
                onClick={() => {
                    playClickSound();
                    setInlineInsertSlotKey(slotKey);
                    setInlineInsertValue("");
                }}
                className="group/slot py-0.5 cursor-pointer select-none"
            >
                <div className="h-2 group-hover/slot:h-7 rounded-xl border border-dashed border-transparent group-hover/slot:border-panel-active/80 group-hover/slot:bg-panel-active/10 flex items-center justify-center gap-1.5 text-[11px] font-bold text-transparent group-hover/slot:text-[#bb99ff] transition-all duration-150 overflow-hidden">
                    <FaCirclePlus className="w-3 h-3 shrink-0" />
                    <span>{label}</span>
                </div>
            </div>
        );
    };

    // Render single loot item card with grip-restricted drag and clean drag image
    const renderLootItemCard = (item: LootItem) => {
        const isDepleted = !item.isInfinite && item.quantity <= 0;
        const qty = takeQuantities[item.id] || 1;
        const isBeingDragged = draggedEntity?.type === "item" && draggedEntity.id === item.id;

        return (
            <div
                key={item.id}
                draggable={isGM}
                onDragStart={(e) => {
                    if (!isGM || !gripArmedRef.current) {
                        e.preventDefault();
                        return;
                    }
                    e.stopPropagation();
                    setDraggedEntity({ type: "item", id: item.id });
                    e.dataTransfer.effectAllowed = "move";
                    e.dataTransfer.setDragImage(e.currentTarget, 24, 24);
                }}
                onDragEnd={clearDragState}
                onClick={() => {
                    playItemInspectSound();
                    setInspectingItem({
                        item,
                        sourceLabel: item.subCategory ? `${source.name} | ${item.subCategory}` : source.name
                    });
                }}
                className={`group shrink-0 flex items-center justify-between gap-2.5 p-2.5 rounded-2xl bg-black/25 border border-current/10 hover:border-current/30 cursor-pointer ${
                    isDepleted && !isGM ? "opacity-50" : ""
                } ${!item.isRevealed ? "opacity-75 border-dashed" : ""} ${
                    isBeingDragged ? "opacity-35" : ""
                }`}
            >
                <div className="flex items-center gap-2 min-w-0 flex-1">
                    {isGM && (
                        <div
                            onMouseDown={() => {
                                gripArmedRef.current = true;
                            }}
                            onMouseUp={() => {
                                gripArmedRef.current = false;
                            }}
                            onClick={(e) => e.stopPropagation()}
                            className="cursor-grab active:cursor-grabbing opacity-45 hover:opacity-100 p-1 shrink-0"
                            title="拖曳移動"
                        >
                            <FaGripVertical className="w-3.5 h-3.5" />
                        </div>
                    )}

                    {item.imageUrl && (
                        <CroppedImage
                            src={item.imageUrl}
                            alt={item.name}
                            crop={item.imageCrop}
                            containerClassName="w-11 h-11 rounded-xl shrink-0 border border-white/15 bg-black/30"
                        />
                    )}

                    <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                            {isGM && !item.isRevealed && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-600 text-white font-bold">
                                    未揭露
                                </span>
                            )}
                            {item.isCurrency && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-400/30 font-bold">
                                    貨幣
                                </span>
                            )}
                            {item.isInfinite && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-sky-500/20 text-sky-300 border border-sky-400/30 font-bold">
                                    無限
                                </span>
                            )}
                            <span className={`font-bold text-sm sm:text-base truncate ${RARITY_COLORS[item.rarity || "none"]}`}>
                                {item.name}
                            </span>
                            {isDepleted && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-500/30 text-red-300 font-bold">
                                    已取完
                                </span>
                            )}
                        </div>

                        <div className="flex items-center gap-2 text-xs font-bold opacity-80 mt-0.5">
                            <span className="text-amber-400">{Number(item.cost || 0).toFixed(2)} GP</span>
                            <span>•</span>
                            <span>{item.weight || 0} lb</span>
                            <span>•</span>
                            <span>{item.isInfinite ? "無限" : `剩餘：${item.quantity}`}</span>
                        </div>
                        {item.description && (
                            <p className="text-xs opacity-70 line-clamp-1 mt-0.5">{item.description}</p>
                        )}
                    </div>
                </div>

                {/* Right Item Controls */}
                <div onClick={(e) => e.stopPropagation()} className="flex items-center gap-1.5 shrink-0">
                    {isGM ? (
                        <div className="flex flex-col items-end gap-1.5 shrink-0">
                            {!item.isInfinite && (
                                <InlineNumberInput
                                    value={item.quantity}
                                    min={0}
                                    max={99999}
                                    fallbackValue={item.quantity}
                                    widthClass="w-[96px]"
                                    heightClass="h-7"
                                    onChange={(nextQty) =>
                                        saveLoots(
                                            loots.map(s =>
                                                s.id === source.id
                                                    ? {
                                                          ...s,
                                                          items: s.items.map(i =>
                                                              i.id === item.id ? { ...i, quantity: nextQty } : i
                                                          )
                                                      }
                                                    : s
                                            )
                                        )
                                    }
                                />
                            )}
                            <div className="flex items-center justify-between w-[96px] h-7 bg-black/40 rounded-full px-1.5 border border-white/15 shadow-sm">
                                <button
                                    onClick={() =>
                                        saveLoots(
                                            loots.map(s =>
                                                s.id === source.id
                                                    ? {
                                                          ...s,
                                                          items: s.items.map(i =>
                                                              i.id === item.id ? { ...i, isRevealed: !i.isRevealed } : i
                                                          )
                                                      }
                                                    : s
                                            )
                                        )
                                    }
                                    className={`w-5 h-5 flex items-center justify-center outline-none ${
                                        item.isRevealed ? "text-panel-active" : "text-gray-400 hover:text-white"
                                    }`}
                                    title={item.isRevealed ? "已揭露" : "點擊揭露"}
                                >
                                    {item.isRevealed ? <FaEye className="w-3 h-3" /> : <FaEyeSlash className="w-3 h-3" />}
                                </button>
                                <button
                                    onClick={() => {
                                        playClickSound();
                                        setMovingItem(item);
                                        setMoveTargetRegionId(source.id);
                                        setMoveTargetSubCat(normalizeSubCategoryPath(item.subCategory));
                                    }}
                                    className="w-5 h-5 flex items-center justify-center text-sky-300 hover:text-white outline-none"
                                    title="移動分類"
                                >
                                    <FaRightLeft className="w-3 h-3" />
                                </button>
                                <button
                                    onClick={() => {
                                        setEditingItem(item);
                                        setItemEditTab("basic");
                                        setFormItem(item);
                                        setItemEditorOpen(true);
                                        playClickSound();
                                    }}
                                    className="w-5 h-5 flex items-center justify-center text-gray-300 hover:text-white outline-none"
                                    title="編輯"
                                >
                                    <FaPencil className="w-3 h-3" />
                                </button>
                                <button
                                    onClick={() =>
                                        confirmDeleteItemId === item.id
                                            ? saveLoots(
                                                  loots.map(s =>
                                                      s.id === source.id
                                                          ? { ...s, items: s.items.filter(i => i.id !== item.id) }
                                                          : s
                                                  )
                                              )
                                            : setConfirmDeleteItemId(item.id)
                                    }
                                    onMouseLeave={() => setConfirmDeleteItemId(null)}
                                    className={`w-5 h-5 flex items-center justify-center outline-none ${
                                        confirmDeleteItemId === item.id ? "text-red-400" : "text-gray-300 hover:text-red-400"
                                    }`}
                                    title="刪除"
                                >
                                    {confirmDeleteItemId === item.id ? (
                                        <FaXmark className="w-3 h-3" />
                                    ) : (
                                        <FaTrash className="w-3 h-3" />
                                    )}
                                </button>
                            </div>
                        </div>
                    ) : (
                        <>
                            {!isDepleted && !item.isInfinite && item.quantity > 1 && (
                                <InlineNumberInput
                                    value={qty}
                                    min={1}
                                    max={item.quantity}
                                    fallbackValue={1}
                                    widthClass="w-16 sm:w-20"
                                    heightClass="h-7"
                                    onChange={(nextQty) =>
                                        setTakeQuantities(p => ({ ...p, [item.id]: nextQty }))
                                    }
                                />
                            )}
                            <button
                                disabled={isDepleted || processingIds[item.id]}
                                onClick={() => handleTakeLoot(item)}
                                className={`px-3.5 py-1.5 rounded-full text-xs font-black outline-none transition-all ${
                                    isDepleted
                                        ? "bg-black/20 opacity-40 cursor-not-allowed"
                                        : processingIds[item.id]
                                        ? "bg-gray-600 text-gray-300 cursor-wait"
                                        : "bg-panel-active text-white shadow hover:brightness-110"
                                }`}
                            >
                                {processingIds[item.id] ? "處理中" : "拾取"}
                            </button>
                        </>
                    )}
                </div>
            </div>
        );
    };

    // Recursively render nested category folders with header-focused drop zones and non-shifting indicators
    const renderCategoryNode = (node: CategoryTreeNode) => {
        const isCollapsed = collapsedBranches[node.fullPath] ?? false;
        const allBranchRevealed =
            node.items.length > 0 && node.items.every(i => i.isRevealed);
        const visibleChildren = isGM ? node.children : node.children.filter(hasAnyVisibleInSubtree);

        const isDraggingThisCategory =
            draggedEntity?.type === "category" && draggedEntity.id === node.fullPath;
        const isInvalidDropTarget =
            draggedEntity?.type === "category" &&
            (draggedEntity.id === node.fullPath || node.fullPath.startsWith(`${draggedEntity.id} / `));

        const activeZone =
            dropIndicator?.targetPath === node.fullPath ? dropIndicator.zone : null;

        return (
            <div key={node.fullPath} className="flex flex-col relative">
                {activeZone === "before" && (
                    <div className="absolute -top-0.5 left-2 right-2 h-0.5 bg-amber-400 rounded-full z-20 pointer-events-none" />
                )}

                <div
                    onDragOver={(e) => {
                        if (!isGM || !draggedEntity || draggedEntity.type !== "item") return;
                        e.preventDefault();
                        e.stopPropagation();
                        updateDropIndicatorThrottled({ targetPath: node.fullPath, zone: "inside" });
                    }}
                    onDrop={(e) => {
                        if (!isGM || !draggedEntity || draggedEntity.type !== "item") return;
                        e.preventDefault();
                        e.stopPropagation();
                        handleDropItemToCategory(draggedEntity.id, node.fullPath);
                        clearDragState();
                    }}
                    className={`flex flex-col gap-2 rounded-2xl p-2.5 ${
                        node.depth > 0
                            ? "ml-3 sm:ml-4 bg-black/20 border-l-2 border-amber-400/40"
                            : "bg-black/15 border border-current/10"
                    } ${node.isHidden ? "border-dashed border-rose-400/40 opacity-85" : ""} ${
                        isDraggingThisCategory ? "opacity-35" : ""
                    }`}
                >
                    {/* Category Header Bar acts as precise drop target for nesting and reordering */}
                    <div
                        draggable={isGM}
                        onDragStart={(e) => {
                            if (!isGM || !gripArmedRef.current) {
                                e.preventDefault();
                                return;
                            }
                            e.stopPropagation();
                            setDraggedEntity({ type: "category", id: node.fullPath });
                            e.dataTransfer.effectAllowed = "move";
                            e.dataTransfer.setDragImage(e.currentTarget, 20, 18);
                        }}
                        onDragEnd={clearDragState}
                        onDragOver={(e) => {
                            if (!isGM || !draggedEntity) return;
                            e.preventDefault();
                            e.stopPropagation();

                            if (draggedEntity.type === "item") {
                                updateDropIndicatorThrottled({ targetPath: node.fullPath, zone: "inside" });
                                return;
                            }
                            if (isInvalidDropTarget) return;

                            const rect = e.currentTarget.getBoundingClientRect();
                            const relY = e.clientY - rect.top;
                            const ratio = relY / Math.max(1, rect.height);
                            if (ratio < 0.28) {
                                updateDropIndicatorThrottled({ targetPath: node.fullPath, zone: "before" });
                            } else if (ratio > 0.72) {
                                updateDropIndicatorThrottled({ targetPath: node.fullPath, zone: "after" });
                            } else {
                                updateDropIndicatorThrottled({ targetPath: node.fullPath, zone: "inside" });
                            }
                        }}
                        onDrop={(e) => {
                            if (!isGM || !draggedEntity) return;
                            e.preventDefault();
                            e.stopPropagation();

                            if (draggedEntity.type === "item") {
                                handleDropItemToCategory(draggedEntity.id, node.fullPath);
                            } else if (draggedEntity.type === "category" && !isInvalidDropTarget) {
                                const zone = lastDropRef.current?.zone || "inside";
                                if (zone === "inside") {
                                    handleMoveCategoryTree(draggedEntity.id, node.fullPath);
                                } else {
                                    handleMoveCategoryTree(
                                        draggedEntity.id,
                                        node.parentPath,
                                        node.fullPath,
                                        zone === "before" ? "before" : "after"
                                    );
                                }
                            }
                            clearDragState();
                        }}
                        onClick={() => {
                            playClickSound();
                            setCollapsedBranches(prev => ({
                                ...prev,
                                [node.fullPath]: !prev[node.fullPath]
                            }));
                        }}
                        className={`flex items-center justify-between gap-2 cursor-pointer select-none px-2 py-1 rounded-xl ${
                            activeZone === "inside"
                                ? "ring-2 ring-inset ring-[#bb99ff] bg-panel-active/20"
                                : ""
                        }`}
                    >
                        <div className="flex items-center gap-1.5 min-w-0">
                            {isGM && (
                                <span
                                    onMouseDown={() => {
                                        gripArmedRef.current = true;
                                    }}
                                    onMouseUp={() => {
                                        gripArmedRef.current = false;
                                    }}
                                    onClick={(e) => e.stopPropagation()}
                                    className="cursor-grab active:cursor-grabbing opacity-45 hover:opacity-100 p-0.5 shrink-0"
                                    title="拖曳調整分類階層或順序"
                                >
                                    <FaGripVertical className="w-3 h-3" />
                                </span>
                            )}
                            <FaFolderOpen className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                            <span className="font-black text-sm truncate">{node.name}</span>
                            <span className="text-[11px] font-bold opacity-65 shrink-0">
                                {node.items.length}
                            </span>
                            {isGM && node.isHidden && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-rose-500/80 text-white font-bold shrink-0">
                                    未推送
                                </span>
                            )}
                        </div>

                        <div
                            onClick={(e) => e.stopPropagation()}
                            className="flex items-center gap-1 shrink-0"
                        >
                            {isGM && (
                                <div className="flex items-center gap-0.5 bg-black/35 rounded-full px-1.5 py-0.5">
                                    <button
                                        onClick={() => {
                                            playClickSound();
                                            setAddingChildOfPath(
                                                addingChildOfPath === node.fullPath ? null : node.fullPath
                                            );
                                            setNewChildCatInput("");
                                            setCollapsedBranches(prev => ({ ...prev, [node.fullPath]: false }));
                                        }}
                                        title="新增子分類"
                                        className="p-1 text-amber-300 hover:text-white outline-none"
                                    >
                                        <FaFolderPlus className="w-3 h-3" />
                                    </button>
                                    <button
                                        onClick={() => handleRandomReveal(node.fullPath)}
                                        title="隨機揭露"
                                        className="p-1 text-rose-400 hover:text-white outline-none"
                                    >
                                        <FaDiceD20 className="w-3 h-3" />
                                    </button>
                                    <button
                                        onClick={() =>
                                            handleRevealAllInBranch(!allBranchRevealed, node.fullPath)
                                        }
                                        title={allBranchRevealed ? "全部隱藏" : "全部揭露"}
                                        className={`p-1 outline-none ${
                                            allBranchRevealed ? "text-amber-300" : "text-emerald-300"
                                        }`}
                                    >
                                        {allBranchRevealed ? (
                                            <FaLock className="w-3 h-3" />
                                        ) : (
                                            <FaUnlock className="w-3 h-3" />
                                        )}
                                    </button>
                                    <button
                                        onClick={() => handleToggleSubCatVisibility(node.fullPath)}
                                        title={node.isHidden ? "公開此分類" : "隱藏此分類"}
                                        className={`p-1 outline-none ${
                                            !node.isHidden ? "text-panel-active" : "text-gray-400 hover:text-white"
                                        }`}
                                    >
                                        {!node.isHidden ? (
                                            <FaEye className="w-3 h-3" />
                                        ) : (
                                            <FaEyeSlash className="w-3 h-3" />
                                        )}
                                    </button>
                                    <button
                                        onClick={() => handleExportSingleCategory(node.fullPath)}
                                        title="單獨匯出此分類"
                                        className="p-1 text-sky-300 hover:text-white outline-none"
                                    >
                                        <FaDownload className="w-3 h-3" />
                                    </button>
                                    <button
                                        onClick={() => {
                                            playClickSound();
                                            setEditingItem(null);
                                            setItemEditTab("basic");
                                            setFormItem({
                                                name: "",
                                                description: "",
                                                imageUrl: "",
                                                imageCrop: { ...DEFAULT_IMAGE_CROP },
                                                subCategory: node.fullPath,
                                                rarity: "none",
                                                category: "backpack",
                                                quantity: 1,
                                                weight: 0,
                                                cost: 0,
                                                isInfinite: false,
                                                isRevealed: false,
                                                isCurrency: false
                                            });
                                            setItemEditorOpen(true);
                                        }}
                                        title="新增物品"
                                        className="p-1 text-gray-200 hover:text-white outline-none"
                                    >
                                        <FaCirclePlus className="w-3 h-3" />
                                    </button>
                                    <button
                                        onClick={() =>
                                            confirmDeleteCatPath === node.fullPath
                                                ? handleDeleteSubCategory(node.fullPath)
                                                : setConfirmDeleteCatPath(node.fullPath)
                                        }
                                        onMouseLeave={() => setConfirmDeleteCatPath(null)}
                                        title={confirmDeleteCatPath === node.fullPath ? "再次點擊確認刪除" : "刪除此分類"}
                                        className={`p-1 outline-none ${
                                            confirmDeleteCatPath === node.fullPath
                                                ? "text-red-400"
                                                : "text-gray-400 hover:text-red-400"
                                        }`}
                                    >
                                        {confirmDeleteCatPath === node.fullPath ? (
                                            <FaXmark className="w-3 h-3" />
                                        ) : (
                                            <FaTrash className="w-3 h-3" />
                                        )}
                                    </button>
                                </div>
                            )}
                            <button
                                onClick={() =>
                                    setCollapsedBranches(prev => ({
                                        ...prev,
                                        [node.fullPath]: !prev[node.fullPath]
                                    }))
                                }
                                className="p-1 opacity-70 hover:opacity-100 outline-none"
                            >
                                {isCollapsed ? (
                                    <FaCaretDown className="w-3.5 h-3.5" />
                                ) : (
                                    <FaCaretUp className="w-3.5 h-3.5" />
                                )}
                            </button>
                        </div>
                    </div>

                    {/* Inline Child Folder Creation Input */}
                    {isGM && addingChildOfPath === node.fullPath && (
                        <div className="flex items-center gap-1.5 ml-4 px-1">
                            <FaFolder className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                            <input
                                autoFocus
                                type="text"
                                value={newChildCatInput}
                                onChange={(e) => setNewChildCatInput(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === "Enter") {
                                        e.preventDefault();
                                        createCategoryAt(node.fullPath, newChildCatInput);
                                        setAddingChildOfPath(null);
                                        setNewChildCatInput("");
                                    } else if (e.key === "Escape") {
                                        setAddingChildOfPath(null);
                                        setNewChildCatInput("");
                                    }
                                }}
                                placeholder="輸入子分類名稱..."
                                className="flex-1 bg-black/45 text-white text-xs font-bold rounded-xl px-3 py-1.5 outline-none border border-panel-active"
                            />
                            <button
                                type="button"
                                onClick={() => {
                                    createCategoryAt(node.fullPath, newChildCatInput);
                                    setAddingChildOfPath(null);
                                    setNewChildCatInput("");
                                }}
                                className="p-1.5 rounded-lg bg-panel-active text-white outline-none"
                            >
                                <FaCheck className="w-3 h-3" />
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    setAddingChildOfPath(null);
                                    setNewChildCatInput("");
                                }}
                                className="p-1.5 rounded-lg bg-black/40 text-gray-300 hover:text-white outline-none"
                            >
                                <FaXmark className="w-3 h-3" />
                            </button>
                        </div>
                    )}

                    {/* Folder Content: Direct Items & Nested Child Sub-Categories */}
                    {!isCollapsed && (
                        <div className="flex flex-col gap-2 pt-0.5">
                            {node.items.map(renderLootItemCard)}

                            {visibleChildren.map((childNode, cIdx) => (
                                <div key={childNode.fullPath} className="flex flex-col">
                                    {renderCategoryNode(childNode)}
                                    {cIdx < visibleChildren.length - 1 &&
                                        renderDashedAddCategorySlot(
                                            `between-${childNode.fullPath}`,
                                            node.fullPath,
                                            childNode.fullPath,
                                            "新增子分類"
                                        )}
                                </div>
                            ))}

                            {visibleChildren.length > 0 &&
                                renderDashedAddCategorySlot(
                                    `bottom-${node.fullPath}`,
                                    node.fullPath,
                                    visibleChildren[visibleChildren.length - 1].fullPath,
                                    "新增子分類"
                                )}

                            {node.items.length === 0 && visibleChildren.length === 0 && (
                                <p className="text-[11px] opacity-50 text-center py-1.5 font-bold">
                                    暫無物品
                                </p>
                            )}
                        </div>
                    )}
                </div>

                {activeZone === "after" && (
                    <div className="absolute -bottom-0.5 left-2 right-2 h-0.5 bg-amber-400 rounded-full z-20 pointer-events-none" />
                )}
            </div>
        );
    };

    // Recursively render category nodes inside the Sub-Category Manager Modal
    const renderModalCategoryTree = (node: CategoryTreeNode) => {
        const isDraggingThis =
            draggedEntity?.type === "category" && draggedEntity.id === node.fullPath;
        const isInvalidTarget =
            draggedEntity?.type === "category" &&
            (draggedEntity.id === node.fullPath || node.fullPath.startsWith(`${draggedEntity.id} / `));
        const activeZone =
            dropIndicator?.targetPath === node.fullPath ? dropIndicator.zone : null;

        return (
            <div key={node.fullPath} className="flex flex-col relative">
                {activeZone === "before" && (
                    <div className="absolute -top-0.5 left-2 right-2 h-0.5 bg-amber-400 rounded-full z-20 pointer-events-none" />
                )}

                <div
                    draggable
                    onDragStart={(e) => {
                        if (!gripArmedRef.current) {
                            e.preventDefault();
                            return;
                        }
                        e.stopPropagation();
                        setDraggedEntity({ type: "category", id: node.fullPath });
                        e.dataTransfer.effectAllowed = "move";
                        e.dataTransfer.setDragImage(e.currentTarget, 20, 18);
                    }}
                    onDragEnd={clearDragState}
                    onDragOver={(e) => {
                        if (!draggedEntity || draggedEntity.type !== "category" || isInvalidTarget) return;
                        e.preventDefault();
                        e.stopPropagation();
                        const rect = e.currentTarget.getBoundingClientRect();
                        const ratio = (e.clientY - rect.top) / Math.max(1, rect.height);
                        if (ratio < 0.28) {
                            updateDropIndicatorThrottled({ targetPath: node.fullPath, zone: "before" });
                        } else if (ratio > 0.72) {
                            updateDropIndicatorThrottled({ targetPath: node.fullPath, zone: "after" });
                        } else {
                            updateDropIndicatorThrottled({ targetPath: node.fullPath, zone: "inside" });
                        }
                    }}
                    onDrop={(e) => {
                        if (!draggedEntity || draggedEntity.type !== "category" || isInvalidTarget) return;
                        e.preventDefault();
                        e.stopPropagation();
                        const zone = lastDropRef.current?.zone || "inside";
                        if (zone === "inside") {
                            handleMoveCategoryTree(draggedEntity.id, node.fullPath);
                        } else {
                            handleMoveCategoryTree(
                                draggedEntity.id,
                                node.parentPath,
                                node.fullPath,
                                zone === "before" ? "before" : "after"
                            );
                        }
                        clearDragState();
                    }}
                    style={{ marginLeft: `${node.depth * 16}px` }}
                    className={`flex items-center justify-between bg-panel-base px-3 py-2 rounded-xl my-0.5 ${
                        isDraggingThis ? "opacity-35" : ""
                    } ${
                        activeZone === "inside"
                            ? "ring-2 ring-inset ring-[#bb99ff] bg-panel-active/20"
                            : ""
                    }`}
                >
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                        <span
                            onMouseDown={() => {
                                gripArmedRef.current = true;
                            }}
                            onMouseUp={() => {
                                gripArmedRef.current = false;
                            }}
                            className="cursor-grab active:cursor-grabbing text-gray-500 hover:text-gray-300 shrink-0"
                            title="拖曳調整階層"
                        >
                            <FaGripVertical className="w-3 h-3" />
                        </span>
                        <FaFolder className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                        <span className="text-xs font-bold truncate">{node.name}</span>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                        <button
                            type="button"
                            onClick={() => {
                                playClickSound();
                                setAddingChildOfPath(
                                    addingChildOfPath === node.fullPath ? null : node.fullPath
                                );
                                setNewChildCatInput("");
                            }}
                            className="p-1 text-amber-300 hover:text-white outline-none"
                            title="新增子分類"
                        >
                            <FaFolderPlus className="w-3.5 h-3.5" />
                        </button>
                        <button
                            type="button"
                            onClick={() => handleExportSingleCategory(node.fullPath)}
                            className="p-1 text-sky-300 hover:text-white outline-none"
                            title="單獨匯出此分類"
                        >
                            <FaDownload className="w-3 h-3" />
                        </button>
                        <button
                            type="button"
                            onClick={() => handleToggleSubCatVisibility(node.fullPath)}
                            className={`p-1 outline-none ${
                                !node.isHidden ? "text-panel-active" : "text-gray-400 hover:text-white"
                            }`}
                            title={!node.isHidden ? "公開中" : "隱藏中"}
                        >
                            {!node.isHidden ? <FaEye className="w-3.5 h-3.5" /> : <FaEyeSlash className="w-3.5 h-3.5" />}
                        </button>
                        <button
                            type="button"
                            onClick={() =>
                                confirmDeleteCatPath === node.fullPath
                                    ? handleDeleteSubCategory(node.fullPath)
                                    : setConfirmDeleteCatPath(node.fullPath)
                            }
                            onMouseLeave={() => setConfirmDeleteCatPath(null)}
                            className={`p-1 outline-none ${
                                confirmDeleteCatPath === node.fullPath
                                    ? "text-red-400"
                                    : "text-gray-400 hover:text-red-400"
                            }`}
                            title="刪除分類"
                        >
                            {confirmDeleteCatPath === node.fullPath ? (
                                <FaXmark className="w-3.5 h-3.5" />
                            ) : (
                                <FaTrash className="w-3.5 h-3.5" />
                            )}
                        </button>
                    </div>
                </div>

                {activeZone === "after" && (
                    <div className="absolute -bottom-0.5 left-2 right-2 h-0.5 bg-amber-400 rounded-full z-20 pointer-events-none" />
                )}

                {addingChildOfPath === node.fullPath && (
                    <div
                        style={{ marginLeft: `${(node.depth + 1) * 16}px` }}
                        className="flex items-center gap-1.5 my-1"
                    >
                        <input
                            autoFocus
                            type="text"
                            value={newChildCatInput}
                            onChange={(e) => setNewChildCatInput(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                    e.preventDefault();
                                    createCategoryAt(node.fullPath, newChildCatInput);
                                    setAddingChildOfPath(null);
                                    setNewChildCatInput("");
                                } else if (e.key === "Escape") {
                                    setAddingChildOfPath(null);
                                    setNewChildCatInput("");
                                }
                            }}
                            placeholder="輸入子分類名稱..."
                            className="flex-1 bg-panel-base text-white text-xs rounded-xl px-3 py-1.5 outline-none border border-panel-active"
                        />
                        <button
                            type="button"
                            onClick={() => {
                                createCategoryAt(node.fullPath, newChildCatInput);
                                setAddingChildOfPath(null);
                                setNewChildCatInput("");
                            }}
                            className="px-2.5 py-1.5 rounded-xl bg-panel-active text-white text-xs font-bold outline-none"
                        >
                            新增
                        </button>
                    </div>
                )}

                {node.children.map((child, idx) => (
                    <div key={child.fullPath} className="flex flex-col">
                        {renderModalCategoryTree(child)}
                        {idx < node.children.length - 1 &&
                            renderDashedAddCategorySlot(
                                `modal-between-${child.fullPath}`,
                                node.fullPath,
                                child.fullPath,
                                "新增子分類"
                            )}
                    </div>
                ))}
            </div>
        );
    };

    return (
        <div
            style={{ backgroundColor: themeObj.bg, color: themeObj.text }}
            className="fixed inset-0 w-screen h-screen flex flex-col overflow-hidden font-sans select-none"
        >
            <input
                ref={itemImageInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleItemLocalImageUpload}
            />
            <input
                ref={importItemsInputRef}
                type="file"
                accept=".json"
                className="hidden"
                onChange={handleImportRegionItems}
            />
            <input
                ref={importCategoryInputRef}
                type="file"
                accept=".json"
                className="hidden"
                onChange={handleImportCategoryFile}
            />

            {/* Stacking Light-Gray Rounded Notifications at Top Center */}
            {tradeNotices.length > 0 && (
                <div className="fixed top-3 left-1/2 -translate-x-1/2 z-[350] flex flex-col items-center gap-1.5 pointer-events-none">
                    {tradeNotices.map(notice => (
                        <div
                            key={notice.id}
                            className="px-4 py-1.5 rounded-full bg-slate-200/95 text-slate-900 border border-white/80 shadow-lg text-xs font-black tracking-wide animate-in fade-in slide-in-from-top-2 duration-200"
                        >
                            {notice.text}
                        </div>
                    ))}
                </div>
            )}

            {/* Locked Top Region Banner */}
            <div className="relative shrink-0 h-[88px] sm:h-[112px] flex items-end border-b border-current/15 overflow-hidden z-20">
                {source.backgroundImageUrl && (
                    <div className="absolute inset-0">
                        <CroppedImage
                            src={source.backgroundImageUrl}
                            alt={source.name}
                            crop={source.imageCrop}
                            containerClassName="w-full h-full"
                            imgClassName="brightness-110 contrast-105"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/25 to-black/10 pointer-events-none" />
                    </div>
                )}

                <div
                    className={`relative z-10 w-full px-4 sm:px-6 py-3 sm:py-4 flex items-center justify-between gap-3 ${
                        source.backgroundImageUrl ? "text-white" : ""
                    }`}
                >
                    <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                            <h2 className="text-xl sm:text-2xl md:text-3xl font-black tracking-wide truncate drop-shadow-md">
                                {source.name}
                            </h2>
                            <button
                                type="button"
                                onClick={() => {
                                    playClickSound();
                                    setLogModalOpen(true);
                                }}
                                title="檢視日誌"
                                className="p-2 rounded-full bg-black/40 hover:bg-black/65 border border-white/20 text-amber-300 transition-colors outline-none shrink-0 shadow-sm"
                            >
                                <FaScroll className="w-3.5 h-3.5" />
                            </button>
                            {isGM && !source.isVisible && (
                                <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-rose-500/85 text-white shrink-0 shadow-sm">
                                    未開放
                                </span>
                            )}
                        </div>
                        {source.description && (
                            <p className="text-xs sm:text-sm opacity-95 mt-1 line-clamp-1 sm:line-clamp-2 drop-shadow-md font-medium">
                                {source.description}
                            </p>
                        )}
                    </div>

                    <button
                        onClick={() => OBR.modal.close("eu.armindo.embers/loot-modal")}
                        className="p-2 sm:p-2.5 rounded-full bg-black/40 hover:bg-black/65 text-white transition-colors outline-none shrink-0 border border-white/15 shadow-sm"
                        title="關閉視窗"
                    >
                        <FaXmark className="w-4 h-4" />
                    </button>
                </div>
            </div>

            {/* Dual-Column Exploration & Backpack Body */}
            <div className="flex-1 min-h-0 grid grid-cols-[1.35fr_1fr] divide-x divide-current/15 overflow-hidden">
                {/* Left Column: Region Loot Hierarchical Tree */}
                <div className="h-full min-h-0 flex flex-col p-3 sm:p-4 overflow-hidden">
                    <div className="flex flex-wrap items-center justify-between gap-2 mb-2.5 shrink-0">
                        <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-black/25 text-xs font-black">
                            <FaCompass className="w-3.5 h-3.5 text-panel-active" />
                            <span>地區發現物</span>
                        </div>

                        <div className="flex items-center gap-1.5 flex-wrap">
                            <div className="flex items-center bg-black/20 rounded-full px-2.5 py-1 border border-current/10">
                                <FaMagnifyingGlass className="w-3 h-3 opacity-60 mr-1.5" />
                                <input
                                    type="text"
                                    value={lootSearch}
                                    onChange={(e) => setLootSearch(e.target.value)}
                                    placeholder="搜尋..."
                                    className="w-16 sm:w-20 bg-transparent text-xs font-bold outline-none placeholder:opacity-50"
                                />
                            </div>

                            <button
                                type="button"
                                onClick={() => {
                                    playClickSound();
                                    setLootSortMode(nextSortMode);
                                }}
                                title={getSortButtonTitle(lootSortMode)}
                                className={`w-7 h-7 rounded-full flex items-center justify-center border border-current/10 transition-colors outline-none shrink-0 ${
                                    lootSortMode === "default"
                                        ? "bg-black/25 opacity-75 hover:opacity-100"
                                        : "bg-panel-active text-white shadow-sm"
                                }`}
                            >
                                {renderSortIcon(lootSortMode)}
                            </button>

                            {isGM && (
                                <div className="flex items-center gap-1 bg-black/25 rounded-full p-0.5 border border-current/10">
                                    <button
                                        onClick={() => {
                                            playClickSound();
                                            handleRandomReveal();
                                        }}
                                        title="全區隨機揭露"
                                        className="p-1.5 rounded-full text-rose-400 hover:text-white outline-none"
                                    >
                                        <FaDiceD20 className="w-3 h-3" />
                                    </button>
                                    <button
                                        onClick={() => {
                                            playClickSound();
                                            setNewTopCatInput("");
                                            setAddingChildOfPath(null);
                                            setSubCatModalOpen(true);
                                        }}
                                        title="管理分類"
                                        className="p-1.5 rounded-full text-amber-300 hover:text-white outline-none"
                                    >
                                        <FaFolderPlus className="w-3 h-3" />
                                    </button>
                                    <button
                                        onClick={() => {
                                            playClickSound();
                                            importCategoryInputRef.current?.click();
                                        }}
                                        title="匯入單一分類檔案"
                                        className="p-1.5 rounded-full text-sky-300 hover:text-white outline-none"
                                    >
                                        <FaFolder className="w-3 h-3" />
                                    </button>
                                    <button
                                        onClick={() => {
                                            playClickSound();
                                            setImportShopId(shops[0]?.id || "");
                                            setImportTargetSubCat("");
                                            setSelectedImportItemIds(new Set());
                                            setShopImportOpen(true);
                                        }}
                                        title="從商店匯入"
                                        className="p-1.5 rounded-full text-emerald-300 hover:text-white outline-none"
                                    >
                                        <FaStore className="w-3 h-3" />
                                    </button>
                                    <button
                                        onClick={() => importItemsInputRef.current?.click()}
                                        title="匯入戰利品清單"
                                        className="p-1.5 rounded-full opacity-75 hover:opacity-100 outline-none"
                                    >
                                        <FaUpload className="w-3 h-3" />
                                    </button>
                                    <button
                                        onClick={handleExportRegionItems}
                                        title="匯出全區戰利品"
                                        className="p-1.5 rounded-full opacity-75 hover:opacity-100 outline-none"
                                    >
                                        <FaDownload className="w-3 h-3" />
                                    </button>
                                    <button
                                        onClick={() => {
                                            playClickSound();
                                            setEditingItem(null);
                                            setItemEditTab("basic");
                                            setFormItem({
                                                name: "",
                                                description: "",
                                                imageUrl: "",
                                                imageCrop: { ...DEFAULT_IMAGE_CROP },
                                                subCategory: "",
                                                rarity: "none",
                                                category: "backpack",
                                                quantity: 1,
                                                weight: 0,
                                                cost: 0,
                                                isInfinite: false,
                                                isRevealed: false,
                                                isCurrency: false
                                            });
                                            setItemEditorOpen(true);
                                        }}
                                        className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-panel-active text-white shadow outline-none hover:brightness-110"
                                    >
                                        <FaCirclePlus className="w-3 h-3" /> 新增
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Outer Level Drop Zone when DM drags a nested sub-category or item */}
                    {isGM && draggedEntity && (
                        <div
                            onDragOver={(e) => {
                                e.preventDefault();
                                updateDropIndicatorThrottled({ targetPath: "__ROOT__", zone: "outer" });
                            }}
                            onDrop={(e) => {
                                e.preventDefault();
                                if (draggedEntity.type === "category") {
                                    handleMoveCategoryTree(draggedEntity.id, "");
                                } else {
                                    handleDropItemToCategory(draggedEntity.id, "");
                                }
                                clearDragState();
                            }}
                            className={`mb-2 py-1.5 px-3 rounded-xl border border-dashed text-center text-xs font-black shrink-0 ${
                                dropIndicator?.targetPath === "__ROOT__"
                                    ? "border-amber-400 bg-amber-400/20 text-amber-200"
                                    : "border-white/25 bg-black/25 text-gray-300"
                            }`}
                        >
                            {draggedEntity.type === "category" ? "移至最外層" : "移出分類"}
                        </div>
                    )}

                    {/* Region Loot Hierarchical Tree with Auto-Scroll & Wheel Support */}
                    <div
                        ref={mainScrollContainerRef}
                        onDragOver={(e) => {
                            if (draggedEntity) {
                                dragPointerYRef.current = e.clientY;
                            }
                        }}
                        className="flex-1 min-h-0 overflow-y-auto no-scrollbar flex flex-col gap-1 pr-1 pb-6"
                    >
                        {rootItems.length === 0 && visibleRootCategoryNodes.length === 0 && (
                            <div className="text-center py-12 opacity-60 text-xs font-bold">
                                尚無公開戰利品
                            </div>
                        )}

                        {rootItems.length > 0 && (
                            <div className="flex flex-col gap-2 mb-2">
                                {visibleRootCategoryNodes.length > 0 && (
                                    <div className="flex items-center justify-between px-2 py-1 text-xs font-black opacity-80 border-b border-current/10">
                                        <span>一般發現物 {rootItems.length}</span>
                                    </div>
                                )}
                                {rootItems.map(renderLootItemCard)}
                            </div>
                        )}

                        {visibleRootCategoryNodes.map((node, idx) => (
                            <div key={node.fullPath} className="flex flex-col">
                                {renderCategoryNode(node)}
                                {idx < visibleRootCategoryNodes.length - 1 &&
                                    renderDashedAddCategorySlot(
                                        `root-between-${node.fullPath}`,
                                        "",
                                        node.fullPath,
                                        "新增分類"
                                    )}
                            </div>
                        ))}

                        {renderDashedAddCategorySlot(
                            "root-bottom",
                            "",
                            visibleRootCategoryNodes[visibleRootCategoryNodes.length - 1]?.fullPath,
                            "新增分類"
                        )}
                    </div>
                </div>

                {/* Right Column: Prominent Character Header & Backpack */}
                <div className="h-full min-h-0 flex flex-col p-3 sm:p-4 bg-black/15 overflow-hidden">
                    <div className="p-3 rounded-2xl bg-black/30 border border-current/15 mb-2.5 shrink-0 flex flex-col gap-1.5">
                        <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2 min-w-0">
                                <FaBagShopping className="w-4 h-4 text-[#bb99ff] shrink-0" />
                                <span className="text-base sm:text-lg font-black text-[#bb99ff] truncate">
                                    {activeTokenId ? activeTokenName : "尚未選取角色"}
                                </span>
                            </div>

                            <select
                                value={activeTokenId || ""}
                                onChange={async (e) => {
                                    const id = e.target.value;
                                    if (!id) {
                                        setActiveTokenId(null);
                                        setActiveTokenName("");
                                        setTokenInventory([]);
                                        return;
                                    }
                                    const items = await OBR.scene.items.getItems([id]);
                                    if (items.length > 0) syncFromTokenItem(items[0]);
                                }}
                                className="bg-black/40 text-xs font-bold text-amber-300 rounded-full px-2.5 py-1 border border-white/15 outline-none cursor-pointer shrink-0"
                            >
                                <option value="" className="bg-panel-base text-gray-400">
                                    切換角色...
                                </option>
                                {availableTokens.map(t => (
                                    <option key={t.id} value={t.id} className="bg-panel-base text-white">
                                        {t.name}
                                    </option>
                                ))}
                            </select>
                        </div>

                        {activeTokenId && (
                            <p className="text-[14px] font-bold text-white leading-relaxed">
                                {scenarioSentence}
                            </p>
                        )}
                    </div>

                    {!activeTokenId ? (
                        <div className="flex-1 min-h-0 flex flex-col items-center justify-center text-center p-6 rounded-2xl border border-dashed border-current/15 bg-black/10">
                            <FaUserCheck className="w-8 h-8 opacity-40 mb-3" />
                            <p className="text-sm font-black mb-1">請先設定角色</p>
                            <p className="text-xs opacity-70 max-w-[220px]">
                                請由上方選單選擇角色或點選地圖代表物
                            </p>
                        </div>
                    ) : (
                        <>
                            {/* Collapsible Currency & Weight Status Card */}
                            <div className="rounded-2xl bg-black/25 border border-current/10 mb-2.5 shrink-0 overflow-hidden">
                                <div
                                    onClick={() => {
                                        playClickSound();
                                        setIsWalletExpanded(prev => !prev);
                                    }}
                                    className="px-3.5 py-2 flex items-center justify-between gap-2 cursor-pointer hover:bg-black/20 transition-colors"
                                >
                                    <div className="flex items-center gap-2.5 min-w-0 flex-wrap">
                                        <span className="flex items-center gap-1.5 text-xs font-black text-amber-400">
                                            <FaCoins className="w-3.5 h-3.5 shrink-0" />
                                            {totalGP.toFixed(2)} GP
                                        </span>
                                        <span className="opacity-30">|</span>
                                        <span className={`flex items-center gap-1.5 text-xs font-black ${weightColor}`}>
                                            <FaWeightHanging className="w-3.5 h-3.5 shrink-0" />
                                            {currentTotalWeight.toFixed(1)} / {tokenMaxWeight} lb
                                            {weightWarning && (
                                                <span className="text-[11px] ml-0.5">{weightWarning}</span>
                                            )}
                                        </span>
                                    </div>

                                    <div className="flex items-center gap-1 shrink-0">
                                        <button
                                            type="button"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                playClickSound();
                                                const otherTokens = availableTokens.filter(t => t.id !== activeTokenId);
                                                setGoldGiftTargetId(otherTokens[0]?.id || "");
                                                setGoldGiftAmount("1");
                                                setGoldGiftOpen(true);
                                            }}
                                            title="轉交金幣給隊友"
                                            className="px-2 py-0.5 rounded-full bg-amber-500/20 hover:bg-amber-500/35 text-amber-300 text-[11px] font-bold outline-none"
                                        >
                                            轉交金幣
                                        </button>
                                        <button
                                            type="button"
                                            className="p-1 opacity-70 hover:opacity-100 outline-none"
                                        >
                                            {isWalletExpanded ? (
                                                <FaCaretUp className="w-3.5 h-3.5" />
                                            ) : (
                                                <FaCaretDown className="w-3.5 h-3.5" />
                                            )}
                                        </button>
                                    </div>
                                </div>

                                {isWalletExpanded && (
                                    <div className="px-3.5 pb-3 pt-2 border-t border-current/10 flex flex-col gap-2.5">
                                        <div className="flex items-center justify-between">
                                            <span className="text-[11px] font-bold opacity-75">持有貨幣</span>
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    handleConsolidateCurrency();
                                                }}
                                                title="整合為金幣"
                                                className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-black/35 hover:bg-black/55 text-[11px] font-bold outline-none transition-colors"
                                            >
                                                <FaArrowsRotate className="w-3 h-3 text-amber-300" /> 整合貨幣
                                            </button>
                                        </div>

                                        <div className="grid grid-cols-5 gap-1.5 text-center text-[11px] font-bold">
                                            <div className="bg-black/25 rounded-lg py-1">
                                                <span className="text-sky-300 block">PP</span>
                                                {tokenCurrency.pp}
                                            </div>
                                            <div className="bg-black/25 rounded-lg py-1">
                                                <span className="text-amber-400 block">GP</span>
                                                {tokenCurrency.gp}
                                            </div>
                                            <div className="bg-black/25 rounded-lg py-1">
                                                <span className="text-indigo-300 block">EP</span>
                                                {tokenCurrency.ep}
                                            </div>
                                            <div className="bg-black/25 rounded-lg py-1">
                                                <span className="text-slate-300 block">SP</span>
                                                {tokenCurrency.sp}
                                            </div>
                                            <div className="bg-black/25 rounded-lg py-1">
                                                <span className="text-orange-400 block">CP</span>
                                                {tokenCurrency.cp}
                                            </div>
                                        </div>

                                        <div className="pt-1">
                                            <div className="w-full h-2 bg-black/40 rounded-full overflow-hidden shadow-inner">
                                                <div
                                                    className={`h-full transition-all duration-500 ${barColor}`}
                                                    style={{
                                                        width: `${Math.min(
                                                            100,
                                                            (currentTotalWeight / tokenMaxWeight) * 100
                                                        )}%`
                                                    }}
                                                />
                                            </div>
                                            <div className="text-[11px] font-bold opacity-65 text-right mt-1">
                                                硬幣 {coinWeight.toFixed(1)} lb | 物品 {itemsWeight.toFixed(1)} lb | 容器 {containersWeight} lb
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Inventory Filter & Icon-Only Sort Bar */}
                            <div className="flex items-center justify-between mb-2 shrink-0">
                                <span className="text-xs font-bold opacity-80">
                                    行囊物品 {filteredInventory.length}
                                </span>
                                <div className="flex items-center gap-1.5">
                                    <button
                                        type="button"
                                        onClick={() => {
                                            playClickSound();
                                            setInvSortMode(nextSortMode);
                                        }}
                                        title={getSortButtonTitle(invSortMode)}
                                        className={`w-7 h-7 rounded-full flex items-center justify-center border border-current/10 transition-colors outline-none ${
                                            invSortMode === "default"
                                                ? "bg-black/25 opacity-75 hover:opacity-100"
                                                : "bg-panel-active text-white shadow-sm"
                                        }`}
                                    >
                                        {renderSortIcon(invSortMode)}
                                    </button>
                                    <select
                                        value={invCategoryFilter}
                                        onChange={(e) => setInvCategoryFilter(e.target.value)}
                                        className="bg-black/25 text-xs font-bold rounded-full px-2.5 py-1 outline-none border border-current/10 cursor-pointer"
                                    >
                                        <option value="all" className="bg-panel-base text-white">全部位置</option>
                                        {INVENTORY_CATEGORIES.map(c => (
                                            <option key={c.id} value={c.id} className="bg-panel-base text-white">
                                                {c.name}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            {/* Inventory Items Scroll List with Yellow New-Item Indicator & Gift Button */}
                            <div className="flex-1 min-h-0 overflow-y-auto no-scrollbar flex flex-col gap-2 pr-1">
                                {filteredInventory.length === 0 ? (
                                    <div className="text-center py-12 opacity-60 text-xs font-bold">
                                        行囊內無物品
                                    </div>
                                ) : (
                                    filteredInventory.map(invItem => {
                                        const catObj = INVENTORY_CATEGORIES.find(c => c.id === invItem.category);
                                        const isNewItem = Boolean(invItem.addedAt && nowTimestamp - invItem.addedAt < 60000);

                                        return (
                                            <div
                                                key={invItem.id}
                                                onClick={() => {
                                                    playItemInspectSound();
                                                    setInspectingItem({
                                                        item: invItem,
                                                        sourceLabel: `角色行囊 | ${catObj?.name || "背包"}`
                                                    });
                                                }}
                                                className="shrink-0 flex items-center justify-between gap-2 p-2.5 rounded-2xl bg-black/25 border border-current/10 hover:border-current/30 cursor-pointer transition-all"
                                            >
                                                <div className="flex items-center gap-2.5 min-w-0 flex-1">
                                                    {invItem.imageUrl && (
                                                        <CroppedImage
                                                            src={invItem.imageUrl}
                                                            alt={invItem.name}
                                                            crop={invItem.imageCrop}
                                                            containerClassName="w-10 h-10 rounded-xl shrink-0 border border-white/15 bg-black/30"
                                                        />
                                                    )}
                                                    <div className="min-w-0 flex-1">
                                                        <div className="flex items-center gap-1.5">
                                                            {isNewItem && (
                                                                <span
                                                                    title="新獲得物資"
                                                                    className="w-2 h-2 rounded-full bg-yellow-400 shadow-[0_0_8px_rgba(250,204,21,0.9)] animate-pulse shrink-0"
                                                                />
                                                            )}
                                                            <span
                                                                className={`font-bold text-sm truncate ${
                                                                    RARITY_COLORS[invItem.rarity || "none"]
                                                                }`}
                                                            >
                                                                {invItem.name}
                                                            </span>
                                                            <span className="text-[11px] font-mono font-bold opacity-75 shrink-0">
                                                                x{invItem.quantity}
                                                            </span>
                                                        </div>
                                                        <div className="flex items-center gap-2 text-[11px] font-bold opacity-75 mt-0.5">
                                                            <span className="text-amber-400">
                                                                {Number(invItem.cost || 0).toFixed(2)} GP
                                                            </span>
                                                            <span>•</span>
                                                            <span>{invItem.weight || 0} lb</span>
                                                        </div>
                                                    </div>
                                                </div>

                                                <div
                                                    onClick={(e) => e.stopPropagation()}
                                                    className="flex items-center gap-1 shrink-0"
                                                >
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            playClickSound();
                                                            const otherTokens = availableTokens.filter(
                                                                t => t.id !== activeTokenId
                                                            );
                                                            setGiftItemTarget(invItem);
                                                            setGiftRecipientId(otherTokens[0]?.id || "");
                                                            setGiftQty(1);
                                                        }}
                                                        title="贈與隊友"
                                                        className="p-2 rounded-full bg-panel-active/25 hover:bg-panel-active text-[#bb99ff] hover:text-white transition-colors outline-none"
                                                    >
                                                        <FaHandHoldingHeart className="w-3.5 h-3.5" />
                                                    </button>
                                                </div>
                                            </div>
                                        );
                                    })
                                )}
                            </div>
                        </>
                    )}
                </div>
            </div>

            {/* Player Item Gift Modal */}
            {giftItemTarget && (
                <div
                    onClick={() => setGiftItemTarget(null)}
                    className="fixed inset-0 z-[280] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
                >
                    <div
                        onClick={(e) => e.stopPropagation()}
                        className="w-full max-w-[350px] flex flex-col rounded-2xl bg-panel-content text-white p-5 border border-panel-inactive shadow-2xl gap-3"
                    >
                        <div className="flex items-center justify-between">
                            <h3 className="font-bold text-base">贈與隊友</h3>
                            <button
                                onClick={() => setGiftItemTarget(null)}
                                className="text-gray-400 hover:text-white outline-none"
                            >
                                <FaXmark className="w-4 h-4" />
                            </button>
                        </div>

                        <div className="p-2.5 rounded-xl bg-panel-base flex items-center justify-between">
                            <span className={`font-bold text-sm truncate ${RARITY_COLORS[giftItemTarget.rarity || "none"]}`}>
                                {giftItemTarget.name}
                            </span>
                            <span className="text-xs font-bold text-gray-400 shrink-0">
                                持有：{giftItemTarget.quantity}
                            </span>
                        </div>

                        <select
                            value={giftRecipientId}
                            onChange={(e) => setGiftRecipientId(e.target.value)}
                            className="w-full bg-panel-base text-white text-xs font-bold rounded-xl p-2.5 outline-none"
                        >
                            {availableTokens.filter(t => t.id !== activeTokenId).length === 0 ? (
                                <option value="">無其他角色</option>
                            ) : (
                                availableTokens
                                    .filter(t => t.id !== activeTokenId)
                                    .map(t => (
                                        <option key={t.id} value={t.id}>
                                            {t.name}
                                        </option>
                                    ))
                            )}
                        </select>

                        <div className="flex items-center justify-between bg-panel-base px-3 py-2 rounded-xl">
                            <span className="text-xs font-bold text-gray-300">數量</span>
                            <InlineNumberInput
                                value={giftQty}
                                min={1}
                                max={giftItemTarget.quantity || 1}
                                fallbackValue={1}
                                widthClass="w-24"
                                heightClass="h-7"
                                onChange={setGiftQty}
                            />
                        </div>

                        <div className="flex justify-end gap-2 mt-1">
                            <button
                                onClick={() => setGiftItemTarget(null)}
                                className="px-4 py-1.5 rounded-full text-xs font-bold text-gray-400 hover:text-white outline-none"
                            >
                                取消
                            </button>
                            <button
                                onClick={handleExecuteItemGift}
                                disabled={!giftRecipientId}
                                className="px-5 py-1.5 rounded-full text-xs font-bold bg-panel-active text-white outline-none disabled:opacity-50"
                            >
                                確認
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Player Direct Gold Gift Modal */}
            {goldGiftOpen && (
                <div
                    onClick={() => setGoldGiftOpen(false)}
                    className="fixed inset-0 z-[280] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
                >
                    <div
                        onClick={(e) => e.stopPropagation()}
                        className="w-full max-w-[340px] flex flex-col rounded-2xl bg-panel-content text-white p-5 border border-panel-inactive shadow-2xl gap-3"
                    >
                        <div className="flex items-center justify-between">
                            <h3 className="font-bold text-base">轉交金幣</h3>
                            <button
                                onClick={() => setGoldGiftOpen(false)}
                                className="text-gray-400 hover:text-white outline-none"
                            >
                                <FaXmark className="w-4 h-4" />
                            </button>
                        </div>

                        <select
                            value={goldGiftTargetId}
                            onChange={(e) => setGoldGiftTargetId(e.target.value)}
                            className="w-full bg-panel-base text-white text-xs font-bold rounded-xl p-2.5 outline-none"
                        >
                            {availableTokens.filter(t => t.id !== activeTokenId).length === 0 ? (
                                <option value="">無其他角色</option>
                            ) : (
                                availableTokens
                                    .filter(t => t.id !== activeTokenId)
                                    .map(t => (
                                        <option key={t.id} value={t.id}>
                                            {t.name}
                                        </option>
                                    ))
                            )}
                        </select>

                        <div className="flex items-center justify-between bg-panel-base px-3 py-2 rounded-xl">
                            <span className="text-xs font-bold text-amber-400">金額 GP</span>
                            <input
                                type="text"
                                inputMode="decimal"
                                value={goldGiftAmount}
                                onChange={(e) => {
                                    if (e.target.value === "" || /^\d*\.?\d*$/.test(e.target.value)) {
                                        setGoldGiftAmount(e.target.value);
                                    }
                                }}
                                className="w-24 bg-panel-content text-right text-sm font-black text-amber-300 rounded-lg px-2 py-1 outline-none"
                            />
                        </div>

                        <div className="flex justify-end gap-2 mt-1">
                            <button
                                onClick={() => setGoldGiftOpen(false)}
                                className="px-4 py-1.5 rounded-full text-xs font-bold text-gray-400 hover:text-white outline-none"
                            >
                                取消
                            </button>
                            <button
                                onClick={handleExecuteGoldGift}
                                disabled={!goldGiftTargetId}
                                className="px-5 py-1.5 rounded-full text-xs font-bold bg-amber-600 text-white outline-none disabled:opacity-50"
                            >
                                確認
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* DM Sub-Category Manager Modal with Hover Question Tooltip */}
            {isGM && subCatModalOpen && (
                <div
                    onClick={() => setSubCatModalOpen(false)}
                    className="fixed inset-0 z-[280] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
                >
                    <div
                        onClick={(e) => e.stopPropagation()}
                        className="w-full max-w-[400px] max-h-[82vh] flex flex-col rounded-2xl bg-panel-content text-white p-5 border border-panel-inactive shadow-2xl gap-3 overflow-hidden"
                    >
                        <div className="flex items-center justify-between shrink-0">
                            <div className="flex items-center gap-2 relative">
                                <h3 className="font-bold text-base">管理地區細項分類</h3>
                                <div className="relative group/cathelp flex items-center">
                                    <FaCircleQuestion className="w-3.5 h-3.5 text-gray-400 hover:text-white cursor-help transition-colors" />
                                    <div className="absolute left-0 top-6 w-60 p-2.5 rounded-xl bg-panel-base border border-panel-inactive text-[11px] font-bold text-gray-200 shadow-xl opacity-0 pointer-events-none group-hover/cathelp:opacity-100 transition-opacity z-30 leading-relaxed">
                                        點擊資料夾圖標新增子分類；拖曳左側把手可調整階層與順序。
                                    </div>
                                </div>
                            </div>
                            <button
                                onClick={() => setSubCatModalOpen(false)}
                                className="p-1 text-gray-400 hover:text-white outline-none"
                            >
                                <FaXmark className="w-4 h-4" />
                            </button>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                            <input
                                autoFocus
                                type="text"
                                value={newTopCatInput}
                                onChange={(e) => setNewTopCatInput(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === "Enter") {
                                        e.preventDefault();
                                        createCategoryAt("", newTopCatInput);
                                        setNewTopCatInput("");
                                    }
                                }}
                                placeholder="輸入分類名稱..."
                                className="flex-1 bg-panel-base text-white text-xs font-bold rounded-xl p-2.5 outline-none border border-transparent focus:border-panel-active"
                            />
                            <button
                                type="button"
                                onClick={() => {
                                    createCategoryAt("", newTopCatInput);
                                    setNewTopCatInput("");
                                }}
                                className="px-4 py-2.5 rounded-xl bg-panel-active text-white text-xs font-bold outline-none shrink-0"
                            >
                                新增
                            </button>
                        </div>

                        {draggedEntity?.type === "category" && (
                            <div
                                onDragOver={(e) => {
                                    e.preventDefault();
                                    updateDropIndicatorThrottled({ targetPath: "__MODAL_ROOT__", zone: "outer" });
                                }}
                                onDrop={(e) => {
                                    e.preventDefault();
                                    handleMoveCategoryTree(draggedEntity.id, "");
                                    clearDragState();
                                }}
                                className={`py-1.5 px-3 rounded-xl border border-dashed text-center text-xs font-bold shrink-0 ${
                                    dropIndicator?.targetPath === "__MODAL_ROOT__"
                                        ? "border-amber-400 bg-amber-400/20 text-amber-200"
                                        : "border-white/25 bg-panel-base text-gray-300"
                                }`}
                            >
                                移至最外層
                            </div>
                        )}

                        <div
                            ref={modalScrollContainerRef}
                            onDragOver={(e) => {
                                if (draggedEntity) {
                                    dragPointerYRef.current = e.clientY;
                                }
                            }}
                            className="flex-1 min-h-0 overflow-y-auto no-scrollbar flex flex-col gap-0.5 pr-0.5"
                        >
                            {rootCategoryNodes.length === 0 ? (
                                <p className="text-xs text-gray-500 text-center py-6 font-bold">
                                    尚無分類
                                </p>
                            ) : (
                                rootCategoryNodes.map((node, idx) => (
                                    <div key={node.fullPath} className="flex flex-col">
                                        {renderModalCategoryTree(node)}
                                        {idx < rootCategoryNodes.length - 1 &&
                                            renderDashedAddCategorySlot(
                                                `modal-root-between-${node.fullPath}`,
                                                "",
                                                node.fullPath,
                                                "新增分類"
                                            )}
                                    </div>
                                ))
                            )}

                            {renderDashedAddCategorySlot(
                                "modal-root-bottom",
                                "",
                                rootCategoryNodes[rootCategoryNodes.length - 1]?.fullPath,
                                "新增分類"
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* DM Quick Move Item Modal */}
            {isGM && movingItem && (
                <div
                    onClick={() => setMovingItem(null)}
                    className="fixed inset-0 z-[280] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
                >
                    <div
                        onClick={(e) => e.stopPropagation()}
                        className="w-full max-w-[350px] flex flex-col rounded-2xl bg-panel-content text-white p-5 border border-panel-inactive shadow-2xl gap-3"
                    >
                        <div className="flex items-center justify-between">
                            <h3 className="font-bold text-base">移動位置</h3>
                            <button
                                onClick={() => setMovingItem(null)}
                                className="text-gray-400 hover:text-white outline-none"
                            >
                                <FaXmark className="w-4 h-4" />
                            </button>
                        </div>

                        <p className="text-xs font-bold text-amber-300 truncate">{movingItem.name}</p>

                        <select
                            value={moveTargetRegionId || source.id}
                            onChange={(e) => {
                                setMoveTargetRegionId(e.target.value);
                                setMoveTargetSubCat("");
                            }}
                            className="w-full bg-panel-base text-white text-xs font-bold rounded-xl p-2.5 outline-none"
                        >
                            {loots.map(reg => (
                                <option key={reg.id} value={reg.id}>
                                    地區：{reg.name}
                                </option>
                            ))}
                        </select>

                        <select
                            value={moveTargetSubCat}
                            onChange={(e) => setMoveTargetSubCat(e.target.value)}
                            className="w-full bg-panel-base text-white text-xs font-bold rounded-xl p-2.5 outline-none"
                        >
                            <option value="">一般發現物</option>
                            {(
                                loots.find(r => r.id === (moveTargetRegionId || source.id))?.subCategories || []
                            ).map(sc => (
                                <option key={sc} value={normalizeSubCategoryPath(sc)}>
                                    分類：{normalizeSubCategoryPath(sc)}
                                </option>
                            ))}
                        </select>

                        <div className="flex justify-end gap-2 mt-1">
                            <button
                                onClick={() => setMovingItem(null)}
                                className="px-4 py-1.5 rounded-full text-xs font-bold text-gray-400 hover:text-white outline-none"
                            >
                                取消
                            </button>
                            <button
                                onClick={handleConfirmMoveItem}
                                className="px-5 py-1.5 rounded-full text-xs font-bold bg-panel-active text-white outline-none"
                            >
                                確認
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* DM Import From Shop Modal */}
            {isGM && shopImportOpen && (
                <div
                    onClick={() => setShopImportOpen(false)}
                    className="fixed inset-0 z-[280] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
                >
                    <div
                        onClick={(e) => e.stopPropagation()}
                        className="w-full max-w-[400px] max-h-[80vh] flex flex-col rounded-2xl bg-panel-content text-white p-5 border border-panel-inactive shadow-2xl gap-3 overflow-hidden"
                    >
                        <div className="flex items-center justify-between shrink-0">
                            <h3 className="font-bold text-base">從商店匯入</h3>
                            <button
                                onClick={() => setShopImportOpen(false)}
                                className="text-gray-400 hover:text-white outline-none"
                            >
                                <FaXmark className="w-4 h-4" />
                            </button>
                        </div>

                        <select
                            value={importShopId}
                            onChange={(e) => {
                                setImportShopId(e.target.value);
                                setSelectedImportItemIds(new Set());
                            }}
                            className="w-full bg-panel-base text-white text-xs font-bold rounded-xl p-2.5 outline-none shrink-0"
                        >
                            {shops.length === 0 ? (
                                <option value="">無可用商店</option>
                            ) : (
                                shops.map(s => (
                                    <option key={s.id} value={s.id}>
                                        {s.name}
                                    </option>
                                ))
                            )}
                        </select>

                        <select
                            value={importTargetSubCat}
                            onChange={(e) => setImportTargetSubCat(e.target.value)}
                            className="w-full bg-panel-base text-white text-xs font-bold rounded-xl p-2.5 outline-none shrink-0"
                        >
                            <option value="">放入一般發現物</option>
                            {orderedSubCatPaths.map(sc => (
                                <option key={sc} value={sc}>
                                    放入分類：{sc}
                                </option>
                            ))}
                        </select>

                        <div className="flex-1 min-h-0 overflow-y-auto no-scrollbar flex flex-col gap-1.5">
                            {(() => {
                                const targetShop = shops.find(s => s.id === importShopId);
                                const items = targetShop?.items || [];
                                if (items.length === 0) {
                                    return (
                                        <p className="text-xs text-gray-500 text-center py-6 font-bold">
                                            商店內無商品
                                        </p>
                                    );
                                }
                                return items.map(it => {
                                    const checked = selectedImportItemIds.has(it.id);
                                    return (
                                        <label
                                            key={it.id}
                                            className={`flex items-center justify-between p-2.5 rounded-xl cursor-pointer border ${
                                                checked
                                                    ? "bg-panel-active/20 border-panel-active"
                                                    : "bg-panel-base border-transparent"
                                            }`}
                                        >
                                            <div className="flex items-center gap-2 min-w-0">
                                                <input
                                                    type="checkbox"
                                                    checked={checked}
                                                    onChange={() => {
                                                        const next = new Set(selectedImportItemIds);
                                                        if (next.has(it.id)) next.delete(it.id);
                                                        else next.add(it.id);
                                                        setSelectedImportItemIds(next);
                                                    }}
                                                />
                                                <span className={`text-xs font-bold truncate ${RARITY_COLORS[it.rarity || "none"]}`}>
                                                    {it.name}
                                                </span>
                                            </div>
                                            <span className="text-xs font-bold text-amber-400 shrink-0">
                                                {it.cost} GP
                                            </span>
                                        </label>
                                    );
                                });
                            })()}
                        </div>

                        <div className="flex justify-end gap-2 shrink-0">
                            <button
                                onClick={() => setShopImportOpen(false)}
                                className="px-4 py-1.5 rounded-full text-xs font-bold text-gray-400 hover:text-white outline-none"
                            >
                                取消
                            </button>
                            <button
                                onClick={handleConfirmImportFromShop}
                                disabled={selectedImportItemIds.size === 0}
                                className="px-5 py-1.5 rounded-full text-xs font-bold bg-panel-active text-white outline-none disabled:opacity-50"
                            >
                                匯入 {selectedImportItemIds.size} 項
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Logs Modal */}
            {logModalOpen && (
                <div
                    onClick={() => setLogModalOpen(false)}
                    className="fixed inset-0 z-[300] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
                >
                    <div
                        onClick={(e) => e.stopPropagation()}
                        className="w-full max-w-[420px] h-[75vh] flex flex-col shadow-2xl rounded-2xl bg-panel-content text-white p-5 border border-panel-inactive"
                    >
                        <div className="flex items-center justify-between mb-3 shrink-0">
                            <div className="flex items-center gap-2">
                                <FaScroll className="w-4 h-4 text-amber-400" />
                                <h3 className="font-bold text-base">冒險日誌</h3>
                            </div>
                            <button
                                onClick={() => setLogModalOpen(false)}
                                className="p-1 text-gray-400 hover:text-white outline-none"
                            >
                                <FaXmark className="w-4 h-4" />
                            </button>
                        </div>

                        <div className="flex-1 min-h-0 overflow-y-auto no-scrollbar flex flex-col gap-2 pr-0.5">
                            {logs.length === 0 ? (
                                <p className="text-xs text-gray-500 text-center my-auto font-bold">
                                    尚無紀錄
                                </p>
                            ) : (
                                logs.map(l => (
                                    <div
                                        key={l.id}
                                        className="bg-panel-base p-3 rounded-xl text-[13px] text-gray-200 shadow-sm border border-panel-inactive/60 flex flex-col gap-1"
                                    >
                                        <span className="text-[10px] font-bold text-amber-400">
                                            {new Date(l.time).toLocaleTimeString()}
                                        </span>
                                        <span className="leading-relaxed">{l.message}</span>
                                    </div>
                                ))
                            )}
                        </div>

                        <button
                            onClick={() => setLogModalOpen(false)}
                            className="mt-4 w-full py-2 rounded-full text-xs font-bold bg-panel-inactive text-white hover:bg-panel-active transition-colors outline-none shrink-0"
                        >
                            關閉
                        </button>
                    </div>
                </div>
            )}

            {/* Item Detail Inspection Popup */}
            {inspectingItem && (
                <div
                    onClick={() => setInspectingItem(null)}
                    className="fixed inset-0 z-[250] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
                >
                    <div
                        onClick={(e) => e.stopPropagation()}
                        style={{
                            backgroundColor: themeObj.bg,
                            color: themeObj.text,
                            borderColor: themeObj.border || "rgba(255,255,255,0.2)"
                        }}
                        className="w-full max-w-[400px] max-h-[82vh] flex flex-col rounded-2xl border shadow-2xl overflow-hidden"
                    >
                        {inspectingItem.item.imageUrl && (
                            <CroppedImage
                                src={inspectingItem.item.imageUrl}
                                alt={inspectingItem.item.name}
                                crop={inspectingItem.item.imageCrop}
                                title="點擊檢視完整圖片"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    playItemInspectSound();
                                    setLightboxImage({
                                        src: inspectingItem.item.imageUrl!,
                                        title: inspectingItem.item.name
                                    });
                                }}
                                containerClassName="w-full h-56 bg-black/30 border-b border-current/15 shrink-0"
                            />
                        )}
                        <div className="p-5 overflow-y-auto no-scrollbar flex-1">
                            <div className="flex items-start justify-between gap-2 border-b border-current/15 pb-3 mb-3">
                                <div className="min-w-0 flex-1">
                                    <span className="text-[11px] font-bold opacity-70 block mb-0.5">
                                        {inspectingItem.sourceLabel}
                                    </span>
                                    <h3
                                        className={`text-xl font-black break-words ${
                                            RARITY_COLORS[inspectingItem.item.rarity || "none"]
                                        }`}
                                    >
                                        {inspectingItem.item.name}
                                    </h3>
                                </div>
                                <button
                                    onClick={() => setInspectingItem(null)}
                                    className="p-1.5 opacity-60 hover:opacity-100 outline-none shrink-0"
                                >
                                    <FaXmark className="w-4 h-4" />
                                </button>
                            </div>

                            <div className="flex flex-wrap items-center justify-center gap-2 py-2 px-3 mb-3.5 rounded-xl bg-black/25 border border-current/10 text-xs font-bold text-center">
                                <span className={RARITY_COLORS[inspectingItem.item.rarity || "none"]}>
                                    稀有度：{RARITY_LABELS[inspectingItem.item.rarity || "none"]}
                                </span>
                                <span className="opacity-40">|</span>
                                <span className="text-amber-400">
                                    價值：{Number(inspectingItem.item.cost || 0).toFixed(2)} GP
                                </span>
                                <span className="opacity-40">|</span>
                                <span>
                                    重量：{inspectingItem.item.weight || 0} lb
                                </span>
                                {inspectingItem.item.isCurrency && (
                                    <>
                                        <span className="opacity-40">|</span>
                                        <span className="text-amber-300">貨幣袋</span>
                                    </>
                                )}
                            </div>

                            <div className="text-sm leading-relaxed whitespace-pre-wrap break-words opacity-95 font-serif">
                                {inspectingItem.item.description || "無詳細說明。"}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* DM Add / Edit Loot Item Modal with Two Tabs */}
            {isGM && itemEditorOpen && (
                <div className="fixed inset-0 z-[260] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
                    <div className="w-full max-w-[400px] flex flex-col rounded-2xl bg-panel-content text-white p-5 border border-panel-inactive shadow-2xl overflow-hidden">
                        <div className="flex items-center justify-between mb-3 shrink-0">
                            <h3 className="font-bold text-base">
                                {editingItem ? "編輯戰利品" : "新增戰利品"}
                            </h3>
                            <button
                                onClick={() => setItemEditorOpen(false)}
                                className="text-gray-400 hover:text-white outline-none"
                            >
                                <FaXmark className="w-4 h-4" />
                            </button>
                        </div>

                        <div className="flex bg-panel-base/90 rounded-2xl p-1.5 mb-4 shadow-inner shrink-0">
                            <button
                                type="button"
                                onClick={() => {
                                    playClickSound();
                                    setItemEditTab("basic");
                                }}
                                className={`flex-1 py-1.5 text-xs font-bold rounded-xl transition-all outline-none border ${
                                    itemEditTab === "basic"
                                        ? "bg-panel-inactive text-[#bb99ff] shadow-sm border-white/10"
                                        : "text-gray-400 hover:text-gray-200 border-transparent"
                                }`}
                            >
                                基本設定
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    playClickSound();
                                    setItemEditTab("image");
                                }}
                                className={`flex-1 py-1.5 text-xs font-bold rounded-xl transition-all outline-none border ${
                                    itemEditTab === "image"
                                        ? "bg-panel-inactive text-[#bb99ff] shadow-sm border-white/10"
                                        : "text-gray-400 hover:text-gray-200 border-transparent"
                                }`}
                            >
                                物品圖片
                            </button>
                        </div>

                        {itemEditTab === "basic" && (
                            <div className="flex flex-col gap-3">
                                <input
                                    autoFocus
                                    type="text"
                                    value={formItem.name || ""}
                                    onChange={(e) => setFormItem({ ...formItem, name: e.target.value })}
                                    placeholder="戰利品名稱"
                                    className={`w-full bg-panel-base text-sm font-bold rounded-xl p-2.5 outline-none border border-transparent focus:border-panel-active ${
                                        RARITY_COLORS[formItem.rarity || "none"]
                                    }`}
                                />

                                <select
                                    value={normalizeSubCategoryPath(formItem.subCategory)}
                                    onChange={(e) => setFormItem({ ...formItem, subCategory: e.target.value })}
                                    className="w-full bg-panel-base text-gray-200 text-xs font-bold rounded-xl p-2.5 outline-none border border-transparent focus:border-panel-active"
                                >
                                    <option value="">所屬分類：一般發現物</option>
                                    {orderedSubCatPaths.map(sc => (
                                        <option key={sc} value={sc}>
                                            所屬分類：{sc}
                                        </option>
                                    ))}
                                </select>

                                <div className="grid grid-cols-2 gap-2">
                                    <select
                                        value={formItem.rarity || "none"}
                                        onChange={(e) => setFormItem({ ...formItem, rarity: e.target.value })}
                                        className={`bg-panel-base text-xs font-bold rounded-xl p-2.5 outline-none border border-transparent focus:border-panel-active ${
                                            RARITY_COLORS[formItem.rarity || "none"]
                                        }`}
                                    >
                                        {Object.entries(RARITY_LABELS).map(([k, v]) => (
                                            <option
                                                key={k}
                                                value={k}
                                                className={`bg-panel-base font-bold ${RARITY_COLORS[k]}`}
                                            >
                                                稀有度：{v}
                                            </option>
                                        ))}
                                    </select>
                                    <select
                                        value={formItem.category || "backpack"}
                                        onChange={(e) => setFormItem({ ...formItem, category: e.target.value })}
                                        className="bg-panel-base text-white text-xs font-bold rounded-xl p-2.5 outline-none border border-transparent focus:border-panel-active"
                                    >
                                        {INVENTORY_CATEGORIES.map(c => (
                                            <option key={c.id} value={c.id} className="bg-panel-base">
                                                背包位置：{c.name}
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                <div className="grid grid-cols-3 gap-2">
                                    <FormNumberField
                                        label="掉落數量"
                                        value={formItem.quantity ?? 1}
                                        min={0}
                                        step={1}
                                        isInteger={true}
                                        disabled={Boolean(formItem.isInfinite)}
                                        onChange={(v) => setFormItem({ ...formItem, quantity: v })}
                                    />
                                    <FormNumberField
                                        label="單件重量 lb"
                                        value={formItem.weight ?? 0}
                                        min={0}
                                        step={0.1}
                                        onChange={(v) => setFormItem({ ...formItem, weight: v })}
                                    />
                                    <FormNumberField
                                        label="估算價值 GP"
                                        value={formItem.cost ?? 0}
                                        min={0}
                                        step={0.5}
                                        textColorClass="text-amber-400"
                                        onChange={(v) => setFormItem({ ...formItem, cost: v })}
                                    />
                                </div>

                                <textarea
                                    value={formItem.description || ""}
                                    onChange={(e) => setFormItem({ ...formItem, description: e.target.value })}
                                    placeholder="物品描述..."
                                    className="w-full h-20 bg-panel-base text-gray-200 text-xs rounded-xl p-2.5 outline-none resize-none overflow-y-auto editor-scrollbar border border-transparent focus:border-panel-active leading-relaxed"
                                />

                                <div className="grid grid-cols-3 gap-1.5">
                                    <button
                                        type="button"
                                        onClick={() => setFormItem({ ...formItem, isRevealed: !formItem.isRevealed })}
                                        className={`h-9 rounded-xl text-xs font-bold border outline-none transition-colors ${
                                            formItem.isRevealed
                                                ? "bg-panel-active/20 border-panel-active text-panel-active"
                                                : "bg-panel-base border-transparent text-gray-400"
                                        }`}
                                    >
                                        {formItem.isRevealed ? "已揭露" : "暫時隱藏"}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setFormItem({ ...formItem, isInfinite: !formItem.isInfinite })}
                                        className={`h-9 rounded-xl text-xs font-bold border outline-none transition-colors ${
                                            formItem.isInfinite
                                                ? "bg-sky-500/20 border-sky-500 text-sky-300"
                                                : "bg-panel-base border-transparent text-gray-400"
                                        }`}
                                    >
                                        重複抽取
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setFormItem({ ...formItem, isCurrency: !formItem.isCurrency })}
                                        className={`h-9 rounded-xl text-xs font-bold border outline-none transition-colors ${
                                            formItem.isCurrency
                                                ? "bg-amber-500/20 border-amber-500 text-amber-400"
                                                : "bg-panel-base border-transparent text-gray-400"
                                        }`}
                                    >
                                        金錢拾取
                                    </button>
                                </div>
                            </div>
                        )}

                        {itemEditTab === "image" && (
                            <div className="flex flex-col gap-3">
                                <div className="flex items-center gap-2">
                                    <button
                                        type="button"
                                        onClick={handlePickItemOBRAsset}
                                        className="flex-1 flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl bg-panel-base hover:bg-panel-inactive text-xs font-bold text-gray-200 outline-none border border-panel-inactive transition-colors"
                                    >
                                        <FaCloudArrowUp className="w-4 h-4 text-panel-active" /> 圖庫選圖
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => itemImageInputRef.current?.click()}
                                        className="flex-1 flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl bg-panel-base hover:bg-panel-inactive text-xs font-bold text-gray-200 outline-none border border-panel-inactive transition-colors"
                                    >
                                        <FaImage className="w-4 h-4 text-amber-400" /> 本機上傳
                                    </button>
                                    {formItem.imageUrl && (
                                        <button
                                            type="button"
                                            onClick={() =>
                                                setFormItem({
                                                    ...formItem,
                                                    imageUrl: "",
                                                    imageCrop: { ...DEFAULT_IMAGE_CROP }
                                                })
                                            }
                                            className="px-3 py-2.5 rounded-xl bg-panel-base text-xs font-bold text-red-400 hover:text-red-300 outline-none border border-panel-inactive"
                                        >
                                            移除
                                        </button>
                                    )}
                                </div>

                                {formItem.imageUrl ? (
                                    <ImageCropper
                                        src={formItem.imageUrl}
                                        crop={formItem.imageCrop}
                                        aspectClassName="h-48"
                                        onChange={(nextCrop) =>
                                            setFormItem({ ...formItem, imageCrop: nextCrop })
                                        }
                                    />
                                ) : (
                                    <div className="w-full h-48 rounded-xl bg-panel-base border border-dashed border-panel-inactive flex flex-col items-center justify-center text-gray-500 text-xs font-bold gap-2">
                                        <FaImage className="w-6 h-6 opacity-40" />
                                        <span>尚未設定圖片</span>
                                    </div>
                                )}
                            </div>
                        )}

                        <div className="flex justify-end gap-2 mt-4 pt-3 border-t border-panel-base shrink-0">
                            <button
                                onClick={() => setItemEditorOpen(false)}
                                className="px-4 py-1.5 rounded-full text-xs font-bold text-gray-400 hover:text-white outline-none"
                            >
                                取消
                            </button>
                            <button
                                onClick={handleSaveLootItem}
                                disabled={!formItem.name?.trim()}
                                className="px-5 py-1.5 rounded-full text-xs font-bold bg-panel-active text-white outline-none disabled:opacity-50"
                            >
                                儲存
                            </button>
                        </div>
                    </div>
                </div>
            )}
        <LightboxOverlay
                src={lightboxImage?.src || null}
                title={lightboxImage?.title}
                onClose={() => setLightboxImage(null)}
            />
        </div>
    );
}