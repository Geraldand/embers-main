// src/views/ShopModal.tsx
import { useState, useEffect, useRef } from "react";
import OBR from "@owlbear-rodeo/sdk";
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
    FaStore,
    FaBagShopping,
    FaMagnifyingGlass,
    FaUpload,
    FaDownload,
    FaCrown,
    FaFaceSmile,
    FaFaceMeh,
    FaFaceAngry,
    FaSkull,
    FaUserCheck,
    FaCaretDown,
    FaCaretUp,
    FaSort,
    FaGem,
    FaScroll
} from "react-icons/fa6";
import { Shop, ShopItem } from "../components/StoryManager/types";
import { useStoryData } from "../components/StoryManager/store";
import { LEGACY_THEMES } from "../components/StoryManager/constants";
import {
    compressImageFile,
    pickShopScenarioSentence,
    ACTIVE_SHOP_STORAGE_KEY
} from "../components/StoryManager/ShopTab";
import { ImageCropper, CroppedImage, DEFAULT_IMAGE_CROP, LightboxOverlay } from "../components/StoryManager/ImageCropper";
import { downloadFileFromString } from "../utils";

const SHOP_EVENT_CHANNEL = "com.yourname.character-sheet-extension/shop-events";
const META_ID = "com.yourname.character-sheet-extension/metadata";
const CURR_ID = "com.yourname.character-sheet-extension/currency";
const INV_ID = "com.yourname.character-sheet-extension/inventory";

interface TradeNotice {
    id: string;
    text: string;
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

let lastTradeSoundTime = 0;
function playTradeSound(isSell = false) {
    const now = Date.now();
    if (now - lastTradeSoundTime < 250) return;
    lastTradeSoundTime = now;
    try {
        const audio = new Audio(isSell ? "/coin drop.mp3" : "/trade_success.mp3");
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
    textColorClass = "text-white"
}: {
    label: string;
    value: number;
    onChange: (val: number) => void;
    min?: number;
    step?: number;
    isInteger?: boolean;
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
        playClickSound();
        const current = isNaN(parseFloat(localStr)) ? (value || 0) : parseFloat(localStr);
        const next = Math.max(min, isInteger ? Math.round(current + delta) : Number((current + delta).toFixed(2)));
        setLocalStr(next.toString());
        onChange(next);
    };

    return (
        <div className="flex flex-col bg-panel-base p-2 rounded-xl border border-transparent focus-within:border-panel-active shadow-inner">
            <span className="text-[10px] text-gray-400 font-bold text-center mb-1">{label}</span>
            <div className="flex items-center justify-between bg-panel-inactive/50 rounded-lg px-1 h-7">
                <button
                    type="button"
                    onClick={() => handleStep(-step)}
                    className="w-5 h-5 flex items-center justify-center text-gray-400 hover:text-white font-bold outline-none shrink-0"
                >
                    -
                </button>
                <input
                    type="text"
                    inputMode="decimal"
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

export default function ShopModal() {
    const { shops, logs, isGM, saveShops } = useStoryData();
    const params = new URLSearchParams(window.location.search);
    const initialShopId =
        params.get("shopId") || localStorage.getItem(ACTIVE_SHOP_STORAGE_KEY) || "";

    const [obrReady, setObrReady] = useState(false);
    const [selectedShopId, setSelectedShopId] = useState<string>(initialShopId);
    const [shopSection, setShopSection] = useState<"items" | "boughtItems">("items");
    const [shopCategoryFilter, setShopCategoryFilter] = useState<string>("all");
    const [shopSortMode, setShopSortMode] = useState<SortMode>("default");
    const [shopSearch, setShopSearch] = useState<string>("");
    const [invCategoryFilter, setInvCategoryFilter] = useState<string>("all");
    const [invSortMode, setInvSortMode] = useState<SortMode>("default");
    const [isWalletExpanded, setIsWalletExpanded] = useState<boolean>(false);
    const [logModalOpen, setLogModalOpen] = useState<boolean>(false);

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

    const [buyQuantities, setBuyQuantities] = useState<Record<string, number>>({});
    const [sellQuantities, setSellQuantities] = useState<Record<string, number>>({});
    const [processingIds, setProcessingIds] = useState<Record<string, boolean>>({});
    const [tradeNotices, setTradeNotices] = useState<TradeNotice[]>([]);
    const [scenarioSentence, setScenarioSentence] = useState<string>("正在挑選商品...");

    // Item detail modal & DM item editor modal with tabs
    const [inspectingItem, setInspectingItem] = useState<{
        item: any;
        displayPrice: number;
        sourceLabel: string;
    } | null>(null);
    const [lightboxImage, setLightboxImage] = useState<{ src: string; title?: string } | null>(null);
    const [itemEditorOpen, setItemEditorOpen] = useState(false);
    const [itemEditTab, setItemEditTab] = useState<"basic" | "image">("basic");
    const [editingListType, setEditingListType] = useState<"items" | "boughtItems">("items");
    const [editingItem, setEditingItem] = useState<ShopItem | null>(null);
    const [formItem, setFormItem] = useState<Partial<ShopItem>>({});
    const [confirmDeleteItemId, setConfirmDeleteItemId] = useState<string | null>(null);

    const itemImageInputRef = useRef<HTMLInputElement | null>(null);
    const importItemsInputRef = useRef<HTMLInputElement | null>(null);
    const activeTokenIdRef = useRef<string | null>(null);

    useEffect(() => {
        activeTokenIdRef.current = activeTokenId;
    }, [activeTokenId]);

    // Push a new stacking trade notice at the top and auto-remove after 2.6 seconds
    const pushTradeNotice = (text: string) => {
        const id = `${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
        setTradeNotices(prev => [{ id, text }, ...prev].slice(0, 4));
        window.setTimeout(() => {
            setTradeNotices(prev => prev.filter(n => n.id !== id));
        }, 2600);
    };

    const shop: Shop | undefined =
        shops.find(s => s.id === selectedShopId) || shops.find(s => isGM || s.isVisible);

    useEffect(() => {
        if (shop && !selectedShopId) {
            setSelectedShopId(shop.id);
        }
        if (shop) {
            setScenarioSentence(pickShopScenarioSentence(shop));
        }
    }, [shop?.id]);

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
        let unsubShopEvents: (() => void) | null = null;

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

            unsubShopEvents = OBR.broadcast.onMessage(SHOP_EVENT_CHANNEL, async (msg: any) => {
                const data = msg.data;
                if (!data) return;
                const myConn = await OBR.player.getConnectionId();
                if (data.targetConnectionId && data.targetConnectionId !== myConn) return;

                if (data.type === "PURCHASE_RESPONSE" || data.type === "SELL_RESPONSE") {
                    if (data.success) {
                        const isSell = data.type === "SELL_RESPONSE";
                        playTradeSound(isSell);
                        const itemName =
                            data.itemName ||
                            data.item?.name ||
                            data.serviceItem?.name ||
                            "商品";
                        const qty = data.quantity || 1;
                        if (isSell) {
                            const totalRev = ((data.revenue || 0) * qty).toFixed(2);
                            pushTradeNotice(`已出售 ${itemName} x${qty}，獲得 ${totalRev} GP`);
                        } else {
                            const totalPaid = ((data.cost || 0) * qty).toFixed(2);
                            pushTradeNotice(`已購買 ${itemName} x${qty}，花費 ${totalPaid} GP`);
                        }
                        loadTokensAndSelection(true);
                    } else {
                        pushTradeNotice(data.message || "交易失敗");
                    }
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
            if (unsubPlayer) unsubPlayer();
            if (unsubScene) unsubScene();
            if (unsubShopEvents) unsubShopEvents();
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

    const getShopMultiplierIcon = (mult: number) => {
        if (mult <= 0.5) return <FaCrown className="text-yellow-400 w-3.5 h-3.5" title="物價狀態" />;
        if (mult < 1.0) return <FaFaceSmile className="text-emerald-400 w-3.5 h-3.5" title="物價狀態" />;
        if (mult === 1.0) return <FaFaceMeh className="text-gray-200 w-3.5 h-3.5" title="物價狀態" />;
        if (mult <= 1.5) return <FaFaceAngry className="text-orange-400 w-3.5 h-3.5" title="物價狀態" />;
        return <FaSkull className="text-red-400 w-3.5 h-3.5" title="物價狀態" />;
    };

    const nextSortMode = (prev: SortMode): SortMode => {
        if (prev === "default") return "rarity";
        if (prev === "rarity") return "value";
        if (prev === "value") return "weight";
        return "default";
    };

    const getSortButtonTitle = (mode: SortMode) => {
        if (mode === "rarity") return "目前排序：依稀有度";
        if (mode === "value") return "目前排序：依價值";
        if (mode === "weight") return "目前排序：依重量";
        return "目前排序：預設順序";
    };

    const renderSortIcon = (mode: SortMode) => {
        if (mode === "rarity") return <FaGem className="w-3.5 h-3.5" />;
        if (mode === "value") return <FaCoins className="w-3.5 h-3.5" />;
        if (mode === "weight") return <FaWeightHanging className="w-3.5 h-3.5" />;
        return <FaSort className="w-3.5 h-3.5" />;
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

    const handleUpdateItemStock = (itemId: string, nextStock: number) => {
        if (!shop) return;
        saveShops(
            shops.map(s =>
                s.id === shop.id
                    ? {
                          ...s,
                          [shopSection]: (s[shopSection] || []).map((i: ShopItem) =>
                              i.id === itemId ? { ...i, quantity: Math.max(0, nextStock) } : i
                          )
                      }
                    : s
            )
        );
    };

    const handleBuyItem = (item: ShopItem, isBoughtItem: boolean) => {
        if (!shop || processingIds[item.id]) return;
        playClickSound();
        const qty = buyQuantities[item.id] || 1;
        if (item.quantity < qty) {
            pushTradeNotice(`庫存不足：${item.name}`);
            return;
        }
        if (!activeTokenId) {
            pushTradeNotice("請先於右側選擇要購物的角色");
            return;
        }

        const unitCost = isBoughtItem
            ? Number(item.cost.toFixed(2))
            : Number((item.cost * (shop.priceMultiplier || 1)).toFixed(2));
        const totalNeed = unitCost * qty;

        if (totalGP + 0.0001 < totalNeed) {
            pushTradeNotice(`餘額不足，需要 ${totalNeed.toFixed(2)} GP`);
            return;
        }

        if (item.isService) {
            OBR.scene.items.getItems([activeTokenId]).then(async (items) => {
                if (items.length === 0) return;
                const token = items[0];
                const meta = (token.metadata[META_ID] as any) || {};
                const rawCurr = token.metadata[CURR_ID] || meta.currency || { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 };
                const totalCostCp = Math.round(unitCost * qty * 100);
                const currentTotalCp = Math.round(
                    (rawCurr.pp || 0) * 1000 +
                    (rawCurr.gp || 0) * 100 +
                    (rawCurr.ep || 0) * 50 +
                    (rawCurr.sp || 0) * 10 +
                    (rawCurr.cp || 0)
                );
                let remainingCp = Math.max(0, currentTotalCp - totalCostCp);
                const newGp = Math.floor(remainingCp / 100);
                remainingCp %= 100;
                const newSp = Math.floor(remainingCp / 10);
                const newCp = remainingCp % 10;
                const newCurr = { pp: 0, gp: newGp, ep: 0, sp: newSp, cp: newCp };

                await OBR.scene.items.updateItems([activeTokenId], (draft) => {
                    if (draft[0].metadata[CURR_ID] !== undefined) {
                        draft[0].metadata[CURR_ID] = newCurr;
                    } else {
                        draft[0].metadata[META_ID] = { ...meta, currency: newCurr };
                    }
                });
            });
        }

        setProcessingIds(prev => ({ ...prev, [item.id]: true }));
        OBR.broadcast.sendMessage(
            SHOP_EVENT_CHANNEL,
            {
                type: "PURCHASE_REQUEST",
                transactionId: Math.random().toString(36).substring(2, 9),
                shopId: shop.id,
                item,
                quantity: qty,
                cost: unitCost,
                targetTokenId: activeTokenId,
                isBoughtItem
            },
            { destination: "ALL" }
        );
        setBuyQuantities(prev => ({ ...prev, [item.id]: 1 }));
        setTimeout(() => setProcessingIds(prev => ({ ...prev, [item.id]: false })), 800);
    };

    const handleSellInventoryItem = (invItem: any) => {
        if (!shop || !activeTokenId || processingIds[invItem.id]) return;
        playClickSound();
        const buybackMult = Math.min(1, Math.max(0, shop.buybackMultiplier ?? 1));
        if (buybackMult <= 0) {
            pushTradeNotice("本店目前不收購物品");
            return;
        }
        const qty = Math.min(sellQuantities[invItem.id] || 1, invItem.quantity || 1);
        if (qty <= 0) return;

        const baseCost = Math.max(0, Number(invItem.cost) || 0);
        const unitSellPrice = Number((baseCost * buybackMult).toFixed(2));

        setProcessingIds(prev => ({ ...prev, [invItem.id]: true }));
        OBR.broadcast.sendMessage(
            SHOP_EVENT_CHANNEL,
            {
                type: "SELL_REQUEST",
                transactionId: Math.random().toString(36).substring(2, 9),
                shopId: shop.id,
                item: invItem,
                quantity: qty,
                price: unitSellPrice,
                targetTokenId: activeTokenId
            },
            { destination: "ALL" }
        );
        setSellQuantities(prev => ({ ...prev, [invItem.id]: 1 }));
        setTimeout(() => setProcessingIds(prev => ({ ...prev, [invItem.id]: false })), 800);
    };

    const handleSaveShopItem = () => {
        if (!shop || !formItem.name?.trim()) return;
        playClickSound();
        const newItem: ShopItem = {
            id: editingItem?.id || Date.now().toString(36),
            name: formItem.name.trim(),
            description: formItem.description || "",
            imageUrl: formItem.imageUrl || "",
            imageCrop: formItem.imageCrop || { ...DEFAULT_IMAGE_CROP },
            weight: Number(formItem.weight) || 0,
            cost: Number(formItem.cost) || 0,
            rarity: formItem.rarity || "none",
            category: formItem.category || "backpack",
            quantity: Math.max(0, Math.round(Number(formItem.quantity) ?? 1)),
            isVisible: formItem.isVisible ?? true,
            isAttuned: Boolean(formItem.isAttuned),
            isService: Boolean(formItem.isService)
        };

        saveShops(
            shops.map(s => {
                if (s.id !== shop.id) return s;
                const list = editingListType === "boughtItems" ? s.boughtItems || [] : s.items || [];
                const updated = editingItem
                    ? list.map(i => (i.id === editingItem.id ? newItem : i))
                    : [...list, newItem];
                return { ...s, [editingListType]: updated };
            })
        );
        setItemEditorOpen(false);
    };

    const handleExportShopItems = () => {
        if (!shop) return;
        playClickSound();
        const targetList = shopSection === "boughtItems" ? shop.boughtItems || [] : shop.items || [];
        downloadFileFromString(JSON.stringify(targetList, null, 2), `${shop.name}_items.json`);
    };

    const handleImportShopItems = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !shop) return;
        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const json = JSON.parse(event.target?.result as string);
                if (Array.isArray(json)) {
                    const imported: ShopItem[] = json.map((raw: any) => ({
                        id: Date.now().toString(36) + Math.random().toString(36).substring(2, 7),
                        name: raw.name || "未命名商品",
                        description: raw.description || "",
                        imageUrl: raw.imageUrl || "",
                        imageCrop: raw.imageCrop || { ...DEFAULT_IMAGE_CROP },
                        weight: Number(raw.weight) || 0,
                        cost: Number(raw.cost) || 0,
                        rarity: raw.rarity || "none",
                        category: raw.category || "backpack",
                        quantity: Number(raw.quantity) ?? 1,
                        isVisible: raw.isVisible ?? true,
                        isAttuned: Boolean(raw.isAttuned),
                        isService: Boolean(raw.isService)
                    }));
                    saveShops(
                        shops.map(s =>
                            s.id === shop.id
                                ? { ...s, [shopSection]: [...(s[shopSection] || []), ...imported] }
                                : s
                        )
                    );
                    pushTradeNotice(`已匯入 ${imported.length} 項商品`);
                }
            } catch (err) {
                pushTradeNotice("商品 JSON 匯入失敗");
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
                <span className="text-sm font-bold text-gray-400">正在載入商店...</span>
            </div>
        );
    }

    if (!shop) {
        return (
            <div className="fixed inset-0 w-screen h-screen flex flex-col items-center justify-center bg-panel-base text-white p-6 overflow-hidden">
                <p className="text-sm font-bold text-gray-400 mb-4">找不到指定的商店或商店尚未公開</p>
                <button
                    onClick={() => OBR.modal.close("eu.armindo.embers/shop-modal")}
                    className="px-5 py-2 rounded-full text-xs font-bold bg-panel-active text-white"
                >
                    關閉視窗
                </button>
            </div>
        );
    }

    const themeObj = LEGACY_THEMES[shop.themeId || "panel"] || LEGACY_THEMES.panel;
    const isSecondHandSection = shopSection === "boughtItems";

    const activeShopList = (isSecondHandSection ? shop.boughtItems || [] : shop.items || [])
        .filter(i => isGM || i.isVisible !== false)
        .filter(i => (shopCategoryFilter === "all" ? true : i.category === shopCategoryFilter))
        .filter(i =>
            shopSearch.trim() === ""
                ? true
                : i.name.toLowerCase().includes(shopSearch.trim().toLowerCase()) ||
                  (i.description || "").toLowerCase().includes(shopSearch.trim().toLowerCase())
        )
        .slice()
        .sort((a, b) => {
            if (shopSortMode === "rarity") {
                const diff = (RARITY_WEIGHT[b.rarity || "none"] || 0) - (RARITY_WEIGHT[a.rarity || "none"] || 0);
                if (diff !== 0) return diff;
            } else if (shopSortMode === "value") {
                const priceA = isSecondHandSection ? a.cost : a.cost * (shop.priceMultiplier || 1);
                const priceB = isSecondHandSection ? b.cost : b.cost * (shop.priceMultiplier || 1);
                if (priceB !== priceA) return priceB - priceA;
            } else if (shopSortMode === "weight") {
                const wA = Number(a.weight) || 0;
                const wB = Number(b.weight) || 0;
                if (wB !== wA) return wB - wA;
            }
            return 0;
        });

    const filteredInventory = tokenInventory
        .filter(i => (invCategoryFilter === "all" ? true : i.category === invCategoryFilter))
        .slice()
        .sort((a, b) => {
            if (invSortMode === "rarity") {
                const diff = (RARITY_WEIGHT[b.rarity || "none"] || 0) - (RARITY_WEIGHT[a.rarity || "none"] || 0);
                if (diff !== 0) return diff;
            } else if (invSortMode === "value") {
                const diff = (Number(b.cost) || 0) - (Number(a.cost) || 0);
                if (diff !== 0) return diff;
            } else if (invSortMode === "weight") {
                const wA = (Number(a.weight) || 0) * (Number(a.quantity) || 1);
                const wB = (Number(b.weight) || 0) * (Number(b.quantity) || 1);
                if (wB !== wA) return wB - wA;
            }
            return 0;
        });

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
                onChange={handleImportShopItems}
            />

            {/* Stacking Light-Gray Rounded Trade Notifications at Top Center */}
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

            {/* Responsive Locked Top Shop Banner */}
            <div className="relative shrink-0 h-[88px] sm:h-[112px] flex items-end border-b border-current/15 overflow-hidden z-20">
                {shop.backgroundImageUrl && (
                    <div className="absolute inset-0">
                        <CroppedImage
                            src={shop.backgroundImageUrl}
                            alt={shop.name}
                            crop={shop.imageCrop}
                            containerClassName="w-full h-full"
                            imgClassName="brightness-110 contrast-105"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/25 to-black/10 pointer-events-none" />
                    </div>
                )}

                <div
                    className={`relative z-10 w-full px-4 sm:px-6 py-3 sm:py-4 flex items-center justify-between gap-3 ${
                        shop.backgroundImageUrl ? "text-white" : ""
                    }`}
                >
                    <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                            <h2 className="text-xl sm:text-2xl md:text-3xl font-black tracking-wide truncate drop-shadow-md">
                                {shop.name}
                            </h2>
                            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-black/40 border border-white/20 shrink-0 shadow-sm">
                                {getShopMultiplierIcon(shop.priceMultiplier)}
                                {isGM && (
                                    <span className="text-xs font-bold text-white">
                                        x{shop.priceMultiplier}
                                    </span>
                                )}
                            </div>
                            <button
                                type="button"
                                onClick={() => {
                                    playClickSound();
                                    setLogModalOpen(true);
                                }}
                                title="檢視交易日誌"
                                className="p-2 rounded-full bg-black/40 hover:bg-black/65 border border-white/20 text-amber-300 transition-colors outline-none shrink-0 shadow-sm"
                            >
                                <FaScroll className="w-3.5 h-3.5" />
                            </button>
                            {isGM && !shop.isVisible && (
                                <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-rose-500/85 text-white shrink-0 shadow-sm">
                                    打烊中
                                </span>
                            )}
                        </div>
                        {shop.description && (
                            <p className="text-xs sm:text-sm opacity-95 mt-1 line-clamp-1 sm:line-clamp-2 drop-shadow-md font-medium">
                                {shop.description}
                            </p>
                        )}
                    </div>

                    <button
                        onClick={() => OBR.modal.close("eu.armindo.embers/shop-modal")}
                        className="p-2 sm:p-2.5 rounded-full bg-black/40 hover:bg-black/65 text-white transition-colors outline-none shrink-0 border border-white/15 shadow-sm"
                        title="離開商店"
                    >
                        <FaXmark className="w-4 h-4" />
                    </button>
                </div>
            </div>

            {/* Dual-Column Trading Body with Independent Column Scrolling */}
            <div className="flex-1 min-h-0 grid grid-cols-[1.35fr_1fr] divide-x divide-current/15 overflow-hidden">
                {/* Left Column: Shop Counter */}
                <div className="h-full min-h-0 flex flex-col p-3 sm:p-4 overflow-hidden">
                    <div className="flex flex-wrap items-center justify-between gap-2 mb-2.5 shrink-0">
                        <div className="flex items-center gap-1 bg-black/20 p-1 rounded-full">
                            <button
                                onClick={() => {
                                    playClickSound();
                                    setShopSection("items");
                                }}
                                className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1 rounded-full text-xs font-bold transition-all outline-none ${
                                    shopSection === "items"
                                        ? "bg-panel-active text-white shadow"
                                        : "opacity-70 hover:opacity-100"
                                }`}
                            >
                                <FaStore className="w-3 h-3" /> 店內商品 {(shop.items || []).filter(i => isGM || i.isVisible !== false).length}
                            </button>
                            <button
                                onClick={() => {
                                    playClickSound();
                                    setShopSection("boughtItems");
                                }}
                                className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1 rounded-full text-xs font-bold transition-all outline-none ${
                                    shopSection === "boughtItems"
                                        ? "bg-amber-600 text-white shadow"
                                        : "opacity-70 hover:opacity-100"
                                }`}
                            >
                                二手收購區 {(shop.boughtItems || []).filter(i => isGM || i.isVisible !== false).length}
                            </button>
                        </div>

                        <div className="flex items-center gap-1.5 flex-wrap">
                            <div className="flex items-center bg-black/20 rounded-full px-2.5 py-1 border border-current/10">
                                <FaMagnifyingGlass className="w-3 h-3 opacity-60 mr-1.5" />
                                <input
                                    type="text"
                                    value={shopSearch}
                                    onChange={(e) => setShopSearch(e.target.value)}
                                    placeholder="搜尋商品..."
                                    className="w-16 sm:w-20 bg-transparent text-xs font-bold outline-none placeholder:opacity-50"
                                />
                            </div>

                            <button
                                type="button"
                                onClick={() => {
                                    playClickSound();
                                    setShopSortMode(nextSortMode);
                                }}
                                title={getSortButtonTitle(shopSortMode)}
                                className={`w-7 h-7 rounded-full flex items-center justify-center border border-current/10 transition-colors outline-none shrink-0 ${
                                    shopSortMode === "default"
                                        ? "bg-black/25 opacity-75 hover:opacity-100"
                                        : "bg-panel-active text-white shadow-sm"
                                }`}
                            >
                                {renderSortIcon(shopSortMode)}
                            </button>

                            <select
                                value={shopCategoryFilter}
                                onChange={(e) => setShopCategoryFilter(e.target.value)}
                                className="bg-black/20 text-xs font-bold rounded-full px-2.5 py-1 outline-none border border-current/10 cursor-pointer"
                            >
                                <option value="all" className="bg-panel-base text-white">所有分類</option>
                                {INVENTORY_CATEGORIES.map(c => (
                                    <option key={c.id} value={c.id} className="bg-panel-base text-white">
                                        {c.name}
                                    </option>
                                ))}
                            </select>

                            {isGM && (
                                <div className="flex items-center gap-1 bg-black/25 rounded-full p-0.5 border border-current/10">
                                    <button
                                        onClick={() => importItemsInputRef.current?.click()}
                                        title="匯入商品 JSON 至此商店"
                                        className="p-1.5 rounded-full opacity-75 hover:opacity-100 outline-none"
                                    >
                                        <FaUpload className="w-3 h-3" />
                                    </button>
                                    <button
                                        onClick={handleExportShopItems}
                                        title="匯出此商店商品 JSON"
                                        className="p-1.5 rounded-full opacity-75 hover:opacity-100 outline-none"
                                    >
                                        <FaDownload className="w-3 h-3" />
                                    </button>
                                    <button
                                        onClick={() => {
                                            playClickSound();
                                            setEditingListType(shopSection);
                                            setEditingItem(null);
                                            setItemEditTab("basic");
                                            setFormItem({
                                                name: "",
                                                description: "",
                                                imageUrl: "",
                                                imageCrop: { ...DEFAULT_IMAGE_CROP },
                                                rarity: "none",
                                                category: "backpack",
                                                quantity: 1,
                                                weight: 1,
                                                cost: 10,
                                                isVisible: true,
                                                isService: false
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

                    {/* Shop Items Scroll List */}
                    <div className="flex-1 min-h-0 overflow-y-auto no-scrollbar flex flex-col gap-2 pr-1">
                        {activeShopList.length === 0 ? (
                            <div className="text-center py-16 opacity-60 text-xs font-bold">
                                目前此分區沒有符合條件的商品
                            </div>
                        ) : (
                            activeShopList.map(item => {
                                const finalPrice = isSecondHandSection
                                    ? Number(item.cost.toFixed(2))
                                    : Number((item.cost * (shop.priceMultiplier || 1)).toFixed(2));
                                const isSoldOut = item.quantity <= 0;
                                const qty = buyQuantities[item.id] || 1;

                                return (
                                    <div
                                        key={item.id}
                                        onClick={() => {
                                            playItemInspectSound();
                                            setInspectingItem({
                                                item,
                                                displayPrice: finalPrice,
                                                sourceLabel: isSecondHandSection ? "商店二手商品" : "商店販售商品"
                                            });
                                        }}
                                        className={`group shrink-0 flex items-center justify-between gap-2.5 p-2.5 sm:p-3 rounded-2xl bg-black/25 border border-current/10 hover:border-current/30 cursor-pointer transition-all ${
                                            isSoldOut && !isGM ? "opacity-50" : ""
                                        }`}
                                    >
                                        <div className="flex items-center gap-2.5 sm:gap-3 min-w-0 flex-1">
                                            {item.imageUrl && (
                                                <CroppedImage
                                                    src={item.imageUrl}
                                                    alt={item.name}
                                                    crop={item.imageCrop}
                                                    containerClassName="w-11 h-11 sm:w-12 sm:h-12 rounded-xl shrink-0 border border-white/15 bg-black/30"
                                                />
                                            )}

                                            <div className="min-w-0 flex-1">
                                                <div className="flex items-center gap-1.5 flex-wrap">
                                                    {isGM && item.isVisible === false && (
                                                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-600 text-white font-bold">
                                                            隱藏
                                                        </span>
                                                    )}
                                                    {item.isService && (
                                                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-400/30 font-bold">
                                                            服務
                                                        </span>
                                                    )}
                                                    <span
                                                        className={`font-bold text-sm sm:text-base truncate ${
                                                            RARITY_COLORS[item.rarity || "none"]
                                                        }`}
                                                    >
                                                        {item.name}
                                                    </span>
                                                    {isSoldOut && (
                                                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-500/30 text-red-300 font-bold">
                                                            售罄
                                                        </span>
                                                    )}
                                                </div>

                                                <div className="flex items-center gap-2 sm:gap-3 text-xs font-bold opacity-80 mt-0.5">
                                                    <span className="text-amber-400">{finalPrice.toFixed(2)} GP</span>
                                                    <span>•</span>
                                                    <span>{item.weight} lb</span>
                                                    <span>•</span>
                                                    <span>庫存：{item.quantity}</span>
                                                </div>
                                                {item.description && (
                                                    <p className="text-xs opacity-70 line-clamp-1 mt-0.5">
                                                        {item.description}
                                                    </p>
                                                )}
                                            </div>
                                        </div>

                                        {/* Right Side Item Controls */}
                                        <div
                                            onClick={(e) => e.stopPropagation()}
                                            className="flex items-center gap-1.5 sm:gap-2 shrink-0"
                                        >
                                            {isGM ? (
                                                <div className="flex flex-col items-end gap-1.5 shrink-0">
                                                    <InlineNumberInput
                                                        value={item.quantity}
                                                        min={0}
                                                        max={99999}
                                                        fallbackValue={item.quantity}
                                                        widthClass="w-[84px] sm:w-[88px]"
                                                        heightClass="h-7"
                                                        onChange={(nextStock) =>
                                                            handleUpdateItemStock(item.id, nextStock)
                                                        }
                                                    />
                                                    <div className="flex items-center justify-between w-[84px] sm:w-[88px] h-7 bg-black/40 rounded-full px-1.5 border border-white/15 shadow-sm">
                                                        <button
                                                            onClick={() =>
                                                                saveShops(
                                                                    shops.map(s =>
                                                                        s.id === shop.id
                                                                            ? {
                                                                                  ...s,
                                                                                  [shopSection]: (
                                                                                      s[shopSection] || []
                                                                                  ).map((i: ShopItem) =>
                                                                                      i.id === item.id
                                                                                          ? {
                                                                                                ...i,
                                                                                                isVisible:
                                                                                                    i.isVisible ===
                                                                                                    false
                                                                                            }
                                                                                          : i
                                                                                  )
                                                                              }
                                                                            : s
                                                                    )
                                                                )
                                                            }
                                                            className={`w-6 h-6 flex items-center justify-center outline-none ${
                                                                item.isVisible !== false
                                                                    ? "text-panel-active"
                                                                    : "text-gray-400 hover:text-white"
                                                            }`}
                                                            title="切換商品顯示"
                                                        >
                                                            {item.isVisible !== false ? (
                                                                <FaEye className="w-3.5 h-3.5" />
                                                            ) : (
                                                                <FaEyeSlash className="w-3.5 h-3.5" />
                                                            )}
                                                        </button>
                                                        <button
                                                            onClick={() => {
                                                                setEditingListType(shopSection);
                                                                setEditingItem(item);
                                                                setItemEditTab("basic");
                                                                setFormItem(item);
                                                                setItemEditorOpen(true);
                                                                playClickSound();
                                                            }}
                                                            className="w-6 h-6 flex items-center justify-center text-gray-300 hover:text-white outline-none"
                                                            title="編輯商品"
                                                        >
                                                            <FaPencil className="w-3 h-3" />
                                                        </button>
                                                        <button
                                                            onClick={() =>
                                                                confirmDeleteItemId === item.id
                                                                    ? saveShops(
                                                                          shops.map(s =>
                                                                              s.id === shop.id
                                                                                  ? {
                                                                                        ...s,
                                                                                        [shopSection]: (
                                                                                            s[shopSection] || []
                                                                                        ).filter(
                                                                                            (i: ShopItem) =>
                                                                                                i.id !== item.id
                                                                                        )
                                                                                    }
                                                                                  : s
                                                                          )
                                                                      )
                                                                    : setConfirmDeleteItemId(item.id)
                                                            }
                                                            onMouseLeave={() => setConfirmDeleteItemId(null)}
                                                            className={`w-6 h-6 flex items-center justify-center outline-none ${
                                                                confirmDeleteItemId === item.id
                                                                    ? "text-red-400"
                                                                    : "text-gray-300 hover:text-red-400"
                                                            }`}
                                                            title="刪除商品"
                                                        >
                                                            {confirmDeleteItemId === item.id ? (
                                                                <FaXmark className="w-3.5 h-3.5" />
                                                            ) : (
                                                                <FaTrash className="w-3 h-3" />
                                                            )}
                                                        </button>
                                                    </div>
                                                </div>
                                            ) : (
                                                <>
                                                    {!isSoldOut && (
                                                        <InlineNumberInput
                                                            value={qty}
                                                            min={1}
                                                            max={item.quantity}
                                                            fallbackValue={1}
                                                            widthClass="w-16 sm:w-20"
                                                            heightClass="h-7"
                                                            onChange={(nextQty) =>
                                                                setBuyQuantities(p => ({
                                                                    ...p,
                                                                    [item.id]: nextQty
                                                                }))
                                                            }
                                                        />
                                                    )}
                                                    <button
                                                        disabled={isSoldOut || processingIds[item.id]}
                                                        onClick={() => handleBuyItem(item, isSecondHandSection)}
                                                        className={`px-3 sm:px-3.5 py-1.5 rounded-full text-xs font-black outline-none transition-all ${
                                                            isSoldOut
                                                                ? "bg-black/20 opacity-40 cursor-not-allowed"
                                                                : processingIds[item.id]
                                                                ? "bg-gray-600 text-gray-300 cursor-wait"
                                                                : "bg-panel-active text-white shadow hover:brightness-110"
                                                        }`}
                                                    >
                                                        {processingIds[item.id]
                                                            ? "處理中"
                                                            : isSecondHandSection
                                                            ? "回購"
                                                            : "購買"}
                                                    </button>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                );
                            })
                        )}
                    </div>
                </div>

                {/* Right Column: Prominent Trader Header & Backpack */}
                <div className="h-full min-h-0 flex flex-col p-3 sm:p-4 bg-black/15 overflow-hidden">
                    {/* Prominent Trader Selector & White 14px Scenario Card */}
                    <div className="p-3 rounded-2xl bg-black/30 border border-current/15 mb-2.5 shrink-0 flex flex-col gap-1.5">
                        <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2 min-w-0">
                                <FaBagShopping className="w-4 h-4 text-[#bb99ff] shrink-0" />
                                <span className="text-base sm:text-lg font-black text-[#bb99ff] truncate">
                                    {activeTokenId ? activeTokenName : "尚未選取購物角色"}
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
                                    切換購物角色...
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
                            <p className="text-sm font-black mb-1">請先設定選購角色</p>
                            <p className="text-xs opacity-70 leading-relaxed max-w-[240px]">
                                請由上方下拉選單選擇你要進行交易的角色，或直接在地圖上點選你的角色代表物。
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

                                    <button
                                        type="button"
                                        className="p-1 opacity-70 hover:opacity-100 outline-none shrink-0"
                                        title={isWalletExpanded ? "收起資產與負重明細" : "展開資產與負重明細"}
                                    >
                                        {isWalletExpanded ? (
                                            <FaCaretUp className="w-3.5 h-3.5" />
                                        ) : (
                                            <FaCaretDown className="w-3.5 h-3.5" />
                                        )}
                                    </button>
                                </div>

                                {isWalletExpanded && (
                                    <div className="px-3.5 pb-3 pt-2 border-t border-current/10 flex flex-col gap-2.5 animate-in fade-in duration-150">
                                        <div className="flex items-center justify-between">
                                            <span className="text-[11px] font-bold opacity-75">各幣種持有數量</span>
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    handleConsolidateCurrency();
                                                }}
                                                title="將銅幣、銀幣、電金幣與白金幣自動換算整合為金幣"
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

                            {/* Inventory Filter, Buyback Rate & Icon-Only Sort Bar */}
                            <div className="flex items-center justify-between gap-2 mb-2 shrink-0">
                                <div className="flex items-center gap-2 min-w-0">
                                    <span className="text-xs font-bold opacity-80 shrink-0">
                                        行囊物品 {filteredInventory.length}
                                    </span>
                                    {isGM ? (
                                        <select
                                            value={shop.buybackMultiplier ?? 1}
                                            onChange={(e) => {
                                                playClickSound();
                                                const nextVal = Math.min(1, Math.max(0, Number(e.target.value)));
                                                saveShops(
                                                    shops.map(s =>
                                                        s.id === shop.id ? { ...s, buybackMultiplier: nextVal } : s
                                                    )
                                                );
                                            }}
                                            title="調整本店收購物品倍率"
                                            className="bg-amber-500/20 text-amber-300 text-[11px] font-bold rounded-full px-2 py-0.5 border border-amber-400/35 outline-none cursor-pointer"
                                        >
                                            <option value={0} className="bg-panel-base text-white">不收購</option>
                                            <option value={0.25} className="bg-panel-base text-white">收購 x0.25</option>
                                            <option value={0.5} className="bg-panel-base text-white">收購 x0.5</option>
                                            <option value={0.75} className="bg-panel-base text-white">收購 x0.75</option>
                                            <option value={0.8} className="bg-panel-base text-white">收購 x0.8</option>
                                            <option value={1} className="bg-panel-base text-white">收購 x1.0</option>
                                        </select>
                                    ) : (
                                        <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-300 border border-amber-400/30 shrink-0">
                                            {(shop.buybackMultiplier ?? 1) <= 0
                                                ? "本店不收購"
                                                : `收購 x${shop.buybackMultiplier ?? 1}`}
                                        </span>
                                    )}
                                </div>

                                <div className="flex items-center gap-1.5 shrink-0">
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

                            {/* Inventory Items Scroll List */}
                            <div className="flex-1 min-h-0 overflow-y-auto no-scrollbar flex flex-col gap-2 pr-1">
                                {filteredInventory.length === 0 ? (
                                    <div className="text-center py-12 opacity-60 text-xs font-bold">
                                        行囊內目前沒有物品
                                    </div>
                                ) : (
                                    filteredInventory.map(invItem => {
                                        const sellQty = Math.min(
                                            sellQuantities[invItem.id] || 1,
                                            invItem.quantity || 1
                                        );
                                        const buybackMult = Math.min(1, Math.max(0, shop.buybackMultiplier ?? 1));
                                        const isBuybackDisabled = buybackMult <= 0;
                                        const unitSellPrice = Number(
                                            (Math.max(0, Number(invItem.cost) || 0) * buybackMult).toFixed(2)
                                        );
                                        const catObj = INVENTORY_CATEGORIES.find(c => c.id === invItem.category);

                                        return (
                                            <div
                                                key={invItem.id}
                                                onClick={() => {
                                                    playItemInspectSound();
                                                    setInspectingItem({
                                                        item: invItem,
                                                        displayPrice: unitSellPrice,
                                                        sourceLabel: `背包物品 | ${catObj?.name || "背包"}`
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
                                                                {isBuybackDisabled
                                                                    ? "本店不收購"
                                                                    : `收購單價：${unitSellPrice.toFixed(2)} GP`}
                                                            </span>
                                                            <span>•</span>
                                                            <span>{invItem.weight || 0} lb</span>
                                                        </div>
                                                    </div>
                                                </div>

                                                <div
                                                    onClick={(e) => e.stopPropagation()}
                                                    className="flex items-center gap-1.5 shrink-0"
                                                >
                                                    {!isBuybackDisabled && invItem.quantity > 1 && (
                                                        <InlineNumberInput
                                                            value={sellQty}
                                                            min={1}
                                                            max={invItem.quantity}
                                                            fallbackValue={1}
                                                            widthClass="w-16"
                                                            heightClass="h-7"
                                                            onChange={(nextQty) =>
                                                                setSellQuantities(p => ({
                                                                    ...p,
                                                                    [invItem.id]: nextQty
                                                                }))
                                                            }
                                                        />
                                                    )}

                                                    <button
                                                        disabled={isBuybackDisabled || processingIds[invItem.id]}
                                                        onClick={() => handleSellInventoryItem(invItem)}
                                                        className={`px-3 py-1.5 rounded-full text-xs font-black outline-none transition-all ${
                                                            isBuybackDisabled
                                                                ? "bg-black/25 text-gray-400 opacity-50 cursor-not-allowed"
                                                                : processingIds[invItem.id]
                                                                ? "bg-gray-600 text-gray-300 cursor-wait"
                                                                : "bg-amber-600 hover:bg-amber-500 text-white shadow"
                                                        }`}
                                                    >
                                                        {isBuybackDisabled
                                                            ? "不收購"
                                                            : processingIds[invItem.id]
                                                            ? "處理中"
                                                            : "出售"}
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

            {/* Transaction Logs Modal */}
            {logModalOpen && (
                <div
                    onClick={() => setLogModalOpen(false)}
                    className="fixed inset-0 z-[300] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-in fade-in duration-150"
                >
                    <div
                        onClick={(e) => e.stopPropagation()}
                        className="w-full max-w-[420px] h-[75vh] flex flex-col shadow-2xl rounded-2xl bg-panel-content text-white p-5 border border-panel-inactive animate-in zoom-in-95 duration-150"
                    >
                        <div className="flex items-center justify-between mb-3 shrink-0">
                            <div className="flex items-center gap-2">
                                <FaScroll className="w-4 h-4 text-amber-400" />
                                <h3 className="font-bold text-base">交易日誌</h3>
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
                                    尚無任何交易紀錄
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
                            關閉日誌
                        </button>
                    </div>
                </div>
            )}

            {/* Item Detail Inspection Popup with Centered Pipe-Separated Metadata */}
            {inspectingItem && (
                <div
                    onClick={() => setInspectingItem(null)}
                    className="fixed inset-0 z-[250] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-in fade-in duration-150"
                >
                    <div
                        onClick={(e) => e.stopPropagation()}
                        style={{
                            backgroundColor: themeObj.bg,
                            color: themeObj.text,
                            borderColor: themeObj.border || "rgba(255,255,255,0.2)"
                        }}
                        className="w-full max-w-[400px] max-h-[82vh] flex flex-col rounded-2xl border shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150"
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
                                    價格：{inspectingItem.displayPrice.toFixed(2)} GP
                                </span>
                                <span className="opacity-40">|</span>
                                <span>
                                    重量：{inspectingItem.item.weight || 0} lb
                                </span>
                                {inspectingItem.item.isAttuned && (
                                    <>
                                        <span className="opacity-40">|</span>
                                        <span className="text-indigo-300">需同調</span>
                                    </>
                                )}
                                {inspectingItem.item.isService && (
                                    <>
                                        <span className="opacity-40">|</span>
                                        <span className="text-amber-300">無形服務</span>
                                    </>
                                )}
                            </div>

                            <div className="text-sm leading-relaxed whitespace-pre-wrap break-words opacity-95 font-serif">
                                {inspectingItem.item.description || "此物品尚無詳細說明。"}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* DM Add / Edit Shop Item Modal with Two Tabs */}
            {isGM && itemEditorOpen && (
                <div className="fixed inset-0 z-[260] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-in fade-in">
                    <div className="w-full max-w-[400px] flex flex-col rounded-2xl bg-panel-content text-white p-5 border border-panel-inactive shadow-2xl overflow-hidden">
                        <div className="flex items-center justify-between mb-3 shrink-0">
                            <h3 className="font-bold text-base">
                                {editingItem ? "編輯商品資訊" : "新增商店商品"}
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
                                商品圖片
                            </button>
                        </div>

                        {itemEditTab === "basic" && (
                            <div className="flex flex-col gap-3 animate-in fade-in">
                                <input
                                    autoFocus
                                    type="text"
                                    value={formItem.name || ""}
                                    onChange={(e) => setFormItem({ ...formItem, name: e.target.value })}
                                    placeholder="商品名稱"
                                    className={`w-full bg-panel-base text-sm font-bold rounded-xl p-2.5 outline-none border border-transparent focus:border-panel-active ${
                                        RARITY_COLORS[formItem.rarity || "none"]
                                    }`}
                                />

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
                                                分類：{c.name}
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                <div className="grid grid-cols-3 gap-2">
                                    <FormNumberField
                                        label="庫存數量"
                                        value={formItem.quantity ?? 1}
                                        min={0}
                                        step={1}
                                        isInteger={true}
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
                                        label="基礎原價 GP"
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
                                    placeholder="輸入商品詳細背景描述與效果..."
                                    className="w-full h-24 bg-panel-base text-gray-200 text-xs rounded-xl p-2.5 outline-none resize-none overflow-y-auto editor-scrollbar border border-transparent focus:border-panel-active leading-relaxed"
                                />

                                <div className="flex items-center gap-2">
                                    <button
                                        type="button"
                                        onClick={() =>
                                            setFormItem({ ...formItem, isVisible: !(formItem.isVisible ?? true) })
                                        }
                                        className={`flex-1 h-9 rounded-xl text-xs font-bold border outline-none transition-colors ${
                                            formItem.isVisible !== false
                                                ? "bg-panel-active/20 border-panel-active text-panel-active"
                                                : "bg-panel-base border-transparent text-gray-400"
                                        }`}
                                    >
                                        {formItem.isVisible !== false ? "對玩家公開" : "隱藏商品"}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setFormItem({ ...formItem, isService: !formItem.isService })}
                                        className={`flex-1 h-9 rounded-xl text-xs font-bold border outline-none transition-colors ${
                                            formItem.isService
                                                ? "bg-amber-500/20 border-amber-500 text-amber-400"
                                                : "bg-panel-base border-transparent text-gray-400"
                                        }`}
                                    >
                                        {formItem.isService ? "無形服務" : "實體物品"}
                                    </button>
                                </div>
                            </div>
                        )}

                        {itemEditTab === "image" && (
                            <div className="flex flex-col gap-3 animate-in fade-in">
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
                                        <span>尚未設定商品展示圖片</span>
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
                                onClick={handleSaveShopItem}
                                disabled={!formItem.name?.trim()}
                                className="px-5 py-1.5 rounded-full text-xs font-bold bg-panel-active text-white outline-none disabled:opacity-50"
                            >
                                儲存商品
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