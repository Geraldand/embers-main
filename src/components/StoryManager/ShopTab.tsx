// src/components/StoryManager/ShopTab.tsx
import { useState, useEffect, useRef } from "react";
import OBR from "@owlbear-rodeo/sdk";
import { FaCirclePlus, FaPencil, FaEye, FaEyeSlash, FaTrash, FaUpload, FaDownload, FaCircleCheck, FaCircleExclamation, FaScroll, FaFaceMeh, FaFaceSmile, FaFaceAngry, FaCrown, FaSkull, FaCoins, FaXmark, FaWeightHanging } from "react-icons/fa6";
import { Shop, ShopItem } from "./types";
import { useStoryData } from "./store";
import { SHOP_SCENARIO_LABELS, getRandomScenarioText } from "./constants";
import { downloadFileFromString } from "../../utils";

const SHOP_EVENT_CHANNEL = "com.yourname.character-sheet-extension/shop-events";
const META_ID = "com.yourname.character-sheet-extension/metadata";
const CURR_ID = "com.yourname.character-sheet-extension/currency";

function playClickSound() { try { const audio = new Audio('/click.mp3'); audio.volume = 0.15; audio.play().catch(() => { }); } catch (e) { } }
function playShopEnterSound() { try { const audio = new Audio('/shop_enter.mp3'); audio.volume = 0.3; audio.play().catch(() => { }); } catch (e) { } }
let lastTradeSuccessSoundTime = 0;
function playTradeSuccessSound() {
    const now = Date.now();
    if (now - lastTradeSuccessSoundTime < 500) return;
    lastTradeSuccessSoundTime = now;
    try { const audio = new Audio('/trade_success.mp3'); audio.volume = 0.3; audio.play().catch(() => { }); } catch (e) { }
}

// Update rarity and category constants
const RARITY_COLORS: Record<string, string> = {
    none: "text-mirage-900 dark:text-mirage-50",
    common: "text-slate-600 dark:text-slate-300",
    uncommon: "text-emerald-600 dark:text-emerald-400",
    rare: "text-blue-600 dark:text-blue-400",
    very_rare: "text-purple-600 dark:text-purple-400",
    legendary: "text-orange-500 dark:text-orange-400",
    artifact: "text-red-600 dark:text-red-500"
};

const RARITY_LABELS: Record<string, string> = {
    none: "無",
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

export const NumberInputBlock = ({ label, value, onChange, min = 0, step = 1, isInteger = false, disabled = false }: any) => {
    const [localVal, setLocalVal] = useState(value.toString());
    useEffect(() => { setLocalVal(value.toString()); }, [value]);

    const handleBlur = () => {
        let val = parseFloat(localVal);
        if (isNaN(val)) val = min;
        const finalVal = Math.max(min, isInteger ? Math.round(val) : val);
        setLocalVal(finalVal.toString());
        onChange(finalVal);
    };

    const handleChange = (e: any) => {
        const val = e.target.value;
        if (val === "" || /^-?\d*\.?\d*$/.test(val)) setLocalVal(val);
    };

    const handleBtn = (diff: number) => {
        let val = parseFloat(localVal);
        if (isNaN(val)) val = min;
        const finalVal = Math.max(min, Number((val + diff).toFixed(2)));
        setLocalVal(finalVal.toString());
        onChange(finalVal);
    };

    return (
        <div className={`flex-1 flex flex-col bg-panel-base shadow-inner rounded-xl border border-transparent focus-within:border-panel-active p-1.5 ${disabled ? 'opacity-50' : ''}`}>
            <span className="text-[9px] text-gray-500 font-bold text-center mb-0.5">{label}</span>
            <div className="flex items-center justify-between bg-panel-inactive/40 rounded-lg">
                <button disabled={disabled} onClick={() => handleBtn(-step)} className="w-5 h-5 flex items-center justify-center text-gray-400 hover:text-white font-bold outline-none">-</button>
                <input disabled={disabled} type="text" value={localVal} onChange={handleChange} onBlur={handleBlur} className="w-8 text-[11px] text-white font-bold bg-transparent text-center outline-none no-scrollbar" />
                <button disabled={disabled} onClick={() => handleBtn(step)} className="w-5 h-5 flex items-center justify-center text-gray-400 hover:text-white font-bold outline-none">+</button>
            </div>
        </div>
    );
};

export default function ShopTab() {
    const { shops, logs, isGM, saveShops } = useStoryData();
    const [shopModalOpen, setShopModalOpen] = useState(false);
    const [itemModalOpen, setItemModalOpen] = useState(false);
    const [logModalOpen, setLogModalOpen] = useState(false);
    const [editingShop, setEditingShop] = useState<Shop | null>(null);
    const [editingItem, setEditingItem] = useState<ShopItem | null>(null);
    const [targetShopId, setTargetShopId] = useState<string>("");
    const [formShop, setFormShop] = useState<Partial<Shop>>({});
    const [formItem, setFormItem] = useState<Partial<ShopItem>>({});
    const [activeTokenId, setActiveTokenId] = useState<string | null>(null);
    const [activeTokenName, setActiveTokenName] = useState<string>("沒有人");
    const [activeTokenGold, setActiveTokenGold] = useState<number | null>(null);
    const [activeTokenWeight, setActiveTokenWeight] = useState<{ current: number, max: number } | null>(null);
    const [toastMsg, setToastMsg] = useState<{ text: string, type: "success" | "error" } | null>(null);
    const [buyQuantities, setBuyQuantities] = useState<Record<string, number>>({});
    const [expandedShopId, setExpandedShopId] = useState<string | null>(null);
    const [activeScenarioText, setActiveScenarioText] = useState("正在市集中四處張望...");
    const [confirmDeleteShop, setConfirmDeleteShop] = useState<string | null>(null);
    const [confirmDeleteItem, setConfirmDeleteItem] = useState<string | null>(null);
    
    // Add state to track which list we are editing (normal items or second-hand items)
    const [editingListType, setEditingListType] = useState<"items" | "boughtItems">("items");

    const getQty = (id: string) => buyQuantities[id] || 1;
    const setQty = (id: string, qty: number, max: number) => setBuyQuantities(p => ({ ...p, [id]: Math.max(1, Math.min(qty, max)) }));

    const fetchTokenData = async (tokenId: string) => {
        const items = await OBR.scene.items.getItems([tokenId]);
        if (items.length > 0) {
            const token = items[0];
            const meta = (token.metadata[META_ID] as any) || {};
            const rawCurr = token.metadata[CURR_ID] || meta.currency;
            const currency = rawCurr || { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 };
            setActiveTokenGold((currency.cp / 100) + (currency.sp / 10) + (currency.ep / 2) + (currency.gp || 0) + (currency.pp * 10));

            const currentW = meta.weight || 0;
            const maxW = meta.carryingCapacity || 0;
            setActiveTokenWeight({ current: currentW, max: maxW });
        }
    };

    useEffect(() => {
        const updateActiveToken = async (selection: string[] | undefined | null) => {
            const safeSelection = selection || [];
            if (safeSelection.length !== 1) {
                setActiveTokenId(null); setActiveTokenName("沒有人"); setActiveTokenGold(null); setActiveTokenWeight(null); return;
            }
            const items = await OBR.scene.items.getItems([safeSelection[0]]);
            if (items.length > 0) {
                setActiveTokenId(items[0].id); setActiveTokenName((items[0] as any).text?.plainText || items[0].name || "未命名");
                fetchTokenData(items[0].id);
            }
        };
        OBR.player.getSelection().then(updateActiveToken);
        const unsub = OBR.player.onChange((player) => updateActiveToken(player.selection));
        return () => unsub();
    }, []);

    useEffect(() => {
        const handleShopResponses = async (message: any) => {
            const data = message.data;
            if (!data) return;
            const myConnectionId = await OBR.player.getConnectionId();
            if (data.targetConnectionId && data.targetConnectionId !== myConnectionId) return;

            if (data.type === "PURCHASE_RESPONSE" || data.type === "SELL_RESPONSE") {
                if (data.success) {
                    playTradeSuccessSound();
                    setToastMsg({ text: data.type === "SELL_RESPONSE" ? `出售成功！獲得 ${data.revenue.toFixed(2)} GP。` : data.message, type: "success" });
                    if (activeTokenId) fetchTokenData(activeTokenId);

                    // Update shop inventory automatically based on action
                    saveShops(shops.map(s => {
                        if (s.id !== data.shopId) return s;
                        
                        if (data.type === "PURCHASE_RESPONSE") {
                            const listToUpdate = data.isBoughtItem ? (s.boughtItems || []) : (s.items || []);
                            const updatedList = listToUpdate.map(i => i.id === data.item.id ? { ...i, quantity: i.quantity - data.quantity } : i);
                            return data.isBoughtItem ? { ...s, boughtItems: updatedList } : { ...s, items: updatedList };
                        } else {
                            // SELL_RESPONSE: Add to boughtItems
                            const newBoughtItems = s.boughtItems ? [...s.boughtItems] : [];
                            const existingBoughtIndex = newBoughtItems.findIndex(i => i.name === data.item.name);
                            if (existingBoughtIndex !== -1) {
                                newBoughtItems[existingBoughtIndex].quantity += data.quantity;
                            } else {
                                // Ensure standard ShopItem format for incoming items
                                const newItem: ShopItem = {
                                    ...data.item,
                                    id: Date.now().toString(36),
                                    quantity: data.quantity,
                                    cost: data.originalCost || data.item.cost,
                                    isVisible: true
                                };
                                newBoughtItems.push(newItem);
                            }
                            return { ...s, boughtItems: newBoughtItems };
                        }
                    }));

                } else { 
                    setToastMsg({ text: data.message, type: "error" }); 
                }
                setTimeout(() => setToastMsg(null), 3000);
            }
        };
        const unsub = OBR.broadcast.onMessage(SHOP_EVENT_CHANNEL, handleShopResponses);
        return () => unsub();
    }, [activeTokenId, shops]);

    const lastExpandedRef = useRef<string | null>(null);
    useEffect(() => {
        if (expandedShopId !== lastExpandedRef.current) {
            if (expandedShopId) {
                const shop = shops.find(s => s.id === expandedShopId);
                setActiveScenarioText(getRandomScenarioText("shop", shop?.scenarioKey || "tavern"));
            } else {
                setActiveScenarioText("正在市集中四處張望...");
            }
            lastExpandedRef.current = expandedShopId;
        }
    }, [expandedShopId, shops]);

    const handleSaveShop = () => {
        playClickSound();
        const newShop: Shop = {
            id: editingShop?.id || Date.now().toString(36),
            name: formShop.name || "未命名商店",
            description: formShop.description || "",
            scenarioKey: formShop.scenarioKey || "tavern",
            items: formShop.items || [],
            boughtItems: editingShop?.boughtItems || [],
            isVisible: formShop.isVisible ?? false,
            priceMultiplier: formShop.priceMultiplier || 1,
            createdAt: editingShop?.createdAt || Date.now()
        };
        saveShops(editingShop ? shops.map(s => s.id === editingShop.id ? newShop : s) : [...shops, newShop]);
        setShopModalOpen(false);
    };

    const handleSaveItem = () => {
        playClickSound();
        const newItem: ShopItem = {
            id: editingItem?.id || Date.now().toString(36),
            name: formItem.name || "未知商品",
            description: formItem.description || "",
            weight: formItem.weight || 0,
            cost: formItem.cost || 0,
            rarity: formItem.rarity || "none",
            category: formItem.category || "backpack",
            quantity: formItem.quantity || 1,
            isVisible: formItem.isVisible ?? true
        };
        
        saveShops(shops.map(s => {
            if (s.id !== targetShopId) return s;
            const targetArray = editingListType === "boughtItems" ? (s.boughtItems || []) : (s.items || []);
            const updatedItems = editingItem ? targetArray.map(i => i.id === editingItem.id ? newItem : i) : [...targetArray, newItem];
            return { ...s, [editingListType]: updatedItems };
        }));
        
        setItemModalOpen(false);
    };

    const handleBuy = async (shop: Shop, item: ShopItem, quantity: number, isBoughtItem: boolean = false) => {
        playClickSound();
        if (item.quantity < quantity) { setToastMsg({ text: "此商品庫存不足！", type: "error" }); setTimeout(() => setToastMsg(null), 3000); return; }
        if (!activeTokenId) { setToastMsg({ text: "請先點選你要購物的角色代幣！", type: "error" }); setTimeout(() => setToastMsg(null), 3000); return; }
        const finalCost = item.cost * shop.priceMultiplier;
        if (activeTokenGold !== null && activeTokenGold < finalCost * quantity) {
            setToastMsg({ text: `餘額不足！需要 ${(finalCost * quantity).toFixed(2)} GP`, type: "error" }); setTimeout(() => setToastMsg(null), 3000); return;
        }
        
        OBR.broadcast.sendMessage(SHOP_EVENT_CHANNEL, { 
            type: "PURCHASE_REQUEST", 
            transactionId: Math.random().toString(36).substring(2, 9), 
            shopId: shop.id, 
            item, 
            quantity, 
            cost: finalCost, 
            targetTokenId: activeTokenId,
            isBoughtItem
        }, { destination: "ALL" });
        setQty(item.id, 1, 1);
    };

    const getMultiplierIcon = (mult: number) => {
        if (mult <= 0.5) return <span className="text-yellow-400 flex items-center gap-1 text-[16px] ml-2"><FaCrown /></span>;
        if (mult < 1.0) return <span className="text-emerald-400 flex items-center gap-1 text-[16px] ml-2"><FaFaceSmile /></span>;
        if (mult === 1.0) return <span className="text-gray-400 flex items-center gap-1 text-[16px] ml-2"><FaFaceMeh /></span>;
        if (mult <= 1.5) return <span className="text-orange-500 flex items-center gap-1 text-[16px] ml-2"><FaFaceAngry /></span>;
        return <span className="text-red-500 flex items-center gap-1 text-[16px] ml-2"><FaSkull /></span>;
    };

    const handleExportAllShops = () => {
        downloadFileFromString(JSON.stringify(shops, null, 2), `shops_backup.json`);
    };

    const handleImportAllShops = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const json = JSON.parse(event.target?.result as string);
                if (Array.isArray(json)) {
                    saveShops([...shops, ...json]);
                    setToastMsg({ text: `成功匯入商店群組`, type: "success" }); setTimeout(() => setToastMsg(null), 3000);
                }
            } catch (err) { alert("JSON 解析失敗。"); }
        };
        reader.readAsText(file); e.target.value = "";
    };

    const visibleShops = isGM ? shops : shops.filter(s => s.isVisible);

    return (
        <div className="relative px-1 pb-4">
            <style>{`.no-scrollbar::-webkit-inner-spin-button { display: none; }`}</style>
            {toastMsg && (
                <div className={`fixed top-4 left-1/2 -translate-x-1/2 z-[200] flex items-center gap-2 px-4 py-2 rounded-full shadow-lg text-xs font-bold text-white animate-in slide-in-from-top-4 fade-in ${toastMsg.type === "success" ? "bg-emerald-600 border border-emerald-400" : "bg-red-600 border border-red-400"}`}>
                    {toastMsg.type === "success" ? <FaCircleCheck /> : <FaCircleExclamation />} {toastMsg.text}
                </div>
            )}

            <div className="flex items-center gap-2 p-3 mb-2 bg-transparent border-b border-mirage-200/50 dark:border-mirage-800/50">
                <span className="text-lg font-black truncate flex-1">
                    <span className="text-[#9c81d8] mr-2">{activeTokenName}</span>
                    <span className="text-[13px] text-mirage-400 font-bold">{activeScenarioText}</span>
                </span>
            </div>

            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pr-2">
                    {activeTokenGold !== null && (
                        <span className="flex items-center gap-1.5 text-xs font-bold text-amber-500 bg-amber-500/10 px-2 py-1 rounded-full border border-amber-500/20 shadow-sm shrink-0">
                            <FaCoins className="w-3.5 h-3.5" /> {activeTokenGold.toFixed(2)} GP
                        </span>
                    )}
                    {activeTokenWeight !== null && (
                        <span className="flex items-center gap-1.5 text-xs font-bold text-blue-400 bg-blue-400/10 px-2 py-1 rounded-full border border-blue-400/20 shadow-sm shrink-0">
                            <FaWeightHanging className="w-3.5 h-3.5" /> {activeTokenWeight.current} / {activeTokenWeight.max} lb
                        </span>
                    )}
                </div>
                
                <div className="flex items-center bg-panel-inactive rounded-full shadow-sm ml-auto shrink-0">
                    <button onClick={() => setLogModalOpen(true)} className="p-2 text-gray-400 hover:text-white transition-colors outline-none" title="日誌">
                        <FaScroll className="w-3.5 h-3.5" />
                    </button>
                    {isGM && (
                        <>
                            <div className="w-px h-3 bg-gray-600 mx-0.5"></div>
                            <label className="p-2 text-gray-400 hover:text-panel-active cursor-pointer transition-colors outline-none" title="匯入商店陣列">
                                <FaUpload className="w-3.5 h-3.5" />
                                <input type="file" accept=".json" className="hidden" onChange={handleImportAllShops} />
                            </label>
                            <div className="w-px h-3 bg-gray-600 mx-0.5"></div>
                            <button onClick={handleExportAllShops} className="p-2 text-gray-400 hover:text-panel-active transition-colors outline-none" title="匯出所有商店">
                                <FaDownload className="w-3.5 h-3.5" />
                            </button>
                            <div className="w-px h-3 bg-gray-600 mx-0.5"></div>
                            <button onClick={() => { setEditingShop(null); setFormShop({ isVisible: false, priceMultiplier: 1, scenarioKey: "tavern", items: [] }); setShopModalOpen(true); playClickSound(); }} className="p-2 text-white hover:text-panel-active transition-colors outline-none" title="新增商店">
                                <FaCirclePlus className="w-4 h-4" />
                            </button>
                        </>
                    )}
                </div>
            </div>

            <div className="flex flex-col gap-4">
                {visibleShops.map(shop => {
                    const isExpanded = expandedShopId === shop.id;
                    return (
                        <div key={shop.id} className={`flex flex-col bg-panel-content rounded-2xl border ${shop.isVisible ? "border-panel-inactive" : "border-gray-600 opacity-80"} shadow-sm overflow-hidden transition-all`}>
                            <div className="p-3 bg-panel-inactive/30 flex items-start justify-between gap-2 border-b border-panel-inactive/50 cursor-pointer hover:bg-panel-inactive/50" onClick={() => { if (!isExpanded) playShopEnterSound(); setExpandedShopId(isExpanded ? null : shop.id); }}>
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center">
                                        <h4 className="font-bold text-xl text-white truncate">{shop.name}</h4>
                                        {getMultiplierIcon(shop.priceMultiplier)}
                                    </div>
                                    {shop.description && <p className="text-[15px] text-gray-400 mt-1 line-clamp-2">{shop.description}</p>}
                                </div>
                                {isGM && (
                                    <div className="flex flex-col items-end gap-2 shrink-0" onClick={e => e.stopPropagation()}>
                                        <div className="flex items-center gap-1 bg-panel-base rounded-full px-1 py-0.5 shadow-inner border border-panel-inactive/50">
                                            <button onClick={() => saveShops(shops.map(s => s.id === shop.id ? { ...s, isVisible: !s.isVisible } : s))} className={`p-1.5 outline-none rounded-full ${shop.isVisible ? "text-panel-active bg-panel-content shadow-sm" : "text-gray-500 hover:text-white"}`}>{shop.isVisible ? <FaEye className="w-3 h-3" /> : <FaEyeSlash className="w-3 h-3" />}</button>
                                            <button onClick={() => { setEditingShop(shop); setFormShop(shop); setShopModalOpen(true); playClickSound(); }} className="p-1.5 text-gray-400 hover:text-white outline-none"><FaPencil className="w-3 h-3" /></button>
                                            <button onClick={() => confirmDeleteShop === shop.id ? saveShops(shops.filter(s => s.id !== shop.id)) : setConfirmDeleteShop(shop.id)} onMouseLeave={() => setConfirmDeleteShop(null)} className={`p-1.5 outline-none ${confirmDeleteShop === shop.id ? "text-red-500" : "text-gray-400 hover:text-red-500"}`}>{confirmDeleteShop === shop.id ? <FaXmark className="w-3 h-3" /> : <FaTrash className="w-3 h-3" />}</button>
                                        </div>
                                        <div className="flex items-center gap-1">
                                            <select value={shop.priceMultiplier} onChange={(e) => saveShops(shops.map(s => s.id === shop.id ? { ...s, priceMultiplier: Number(e.target.value) } : s))} className="bg-panel-base text-gray-300 text-[10px] font-bold rounded-lg px-2 py-1 outline-none border border-transparent focus:border-panel-active shadow-inner">
                                                <option value={0.5}>半價 (x0.5)</option>
                                                <option value={0.8}>折扣 (x0.8)</option>
                                                <option value={1}>原價 (x1.0)</option>
                                                <option value={1.5}>漲價 (x1.5)</option>
                                                <option value={2}>黑店 (x2.0)</option>
                                            </select>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {isExpanded && (
                                <div className="p-2 flex flex-col gap-1.5 animate-in fade-in slide-in-from-top-2">
                                    {isGM && (
                                        <div className="flex items-center gap-1.5 mb-1">
                                            <button onClick={() => { setEditingListType("items"); setEditingItem(null); setFormItem({ rarity: "none", category: "backpack", quantity: 1, weight: 1, cost: 1, isVisible: true }); setTargetShopId(shop.id); setItemModalOpen(true); playClickSound(); }} className="flex-1 py-1.5 border border-dashed border-panel-inactive hover:border-panel-active rounded-xl text-xs font-bold text-gray-400 hover:text-white transition-colors outline-none flex justify-center items-center gap-1.5">
                                                <FaCirclePlus className="w-3.5 h-3.5" /> 新增商品
                                            </button>
                                        </div>
                                    )}
                                    
                                    {/* Normal Shop Items */}
                                    {shop.items.filter(i => isGM || i.isVisible).map(item => {
                                        const finalPrice = item.cost * shop.priceMultiplier;
                                        const isSoldOut = item.quantity <= 0;
                                        const buyQty = getQty(item.id);

                                        return (
                                            <div key={item.id} className={`group flex items-center justify-between p-2 rounded-xl bg-panel-base border transition-colors shadow-sm ${isSoldOut ? "border-transparent opacity-50" : "border-panel-inactive hover:border-gray-600"}`}>
                                                <div className="flex flex-col min-w-0 flex-1 pr-2">
                                                    <div className="flex items-center gap-1.5 truncate">
                                                        {isGM && !item.isVisible && <span className="text-[9px] bg-mirage-800 text-mirage-400 px-1 py-0.5 rounded font-black shrink-0">隱藏</span>}
                                                        <span className={`font-bold text-[16px] truncate ${RARITY_COLORS[item.rarity || 'none']}`}>{item.name}</span>
                                                        {isSoldOut && <span className="text-[9px] bg-red-900/50 text-red-400 px-1 py-0.5 rounded font-black shadow-sm shrink-0">售罄</span>}
                                                    </div>
                                                    <div className="flex items-center gap-2 mt-0.5 text-[11px] text-gray-400 font-bold">
                                                        <span className="text-amber-500">{finalPrice.toFixed(2)} GP</span><span>•</span><span>{item.weight} lb</span><span>•</span><span>庫存: {item.quantity}</span>
                                                    </div>
                                                    {item.description && <p className="mt-1.5 text-sm text-mirage-500 whitespace-pre-wrap break-words">{item.description}</p>}
                                                </div>
                                                {isGM ? (
                                                    <div className="flex flex-col gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity shrink-0 ml-2">
                                                        <div className="flex items-center bg-panel-content rounded-full p-0.5 shadow-sm border border-panel-inactive self-end mt-1">
                                                            <button onClick={() => saveShops(shops.map(s => s.id === shop.id ? { ...s, items: s.items.map(i => i.id === item.id ? { ...i, quantity: Math.max(0, i.quantity - 1) } : i) } : s))} className="w-6 h-6 flex items-center justify-center text-gray-400 hover:text-white font-bold outline-none">-</button>
                                                            <span className="text-xs text-white font-bold w-4 text-center">{item.quantity}</span>
                                                            <button onClick={() => saveShops(shops.map(s => s.id === shop.id ? { ...s, items: s.items.map(i => i.id === item.id ? { ...i, quantity: i.quantity + 1 } : i) } : s))} className="w-6 h-6 flex items-center justify-center text-gray-400 hover:text-white font-bold outline-none">+</button>
                                                        </div>
                                                        <div className="flex items-center bg-panel-content rounded-full p-0.5 shadow-sm border border-panel-inactive self-end">
                                                            <button onClick={() => saveShops(shops.map(s => s.id === shop.id ? { ...s, items: s.items.map(i => i.id === item.id ? { ...i, isVisible: !i.isVisible } : i) } : s))} className={`w-6 h-6 outline-none flex justify-center items-center ${item.isVisible ? "text-panel-active" : "text-gray-500 hover:text-white"}`}>{item.isVisible ? <FaEye className="w-3 h-3" /> : <FaEyeSlash className="w-3 h-3" />}</button>
                                                            <button onClick={() => { setEditingListType("items"); setTargetShopId(shop.id); setEditingItem(item); setFormItem(item); setItemModalOpen(true); playClickSound(); }} className="w-6 h-6 text-gray-400 hover:text-white outline-none flex justify-center items-center"><FaPencil className="w-3 h-3" /></button>
                                                            <button onClick={() => confirmDeleteItem === item.id ? saveShops(shops.map(s => s.id === shop.id ? { ...s, items: s.items.filter(i => i.id !== item.id) } : s)) : setConfirmDeleteItem(item.id)} onMouseLeave={() => setConfirmDeleteItem(null)} className={`w-6 h-6 outline-none flex justify-center items-center ${confirmDeleteItem === item.id ? "text-red-500" : "text-gray-400 hover:text-red-500"}`}>{confirmDeleteItem === item.id ? <FaXmark className="w-3 h-3" /> : <FaTrash className="w-3 h-3" />}</button>
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <div className="flex flex-col items-end gap-2 shrink-0 ml-2 pt-1 border-l border-panel-inactive pl-3">
                                                        {!isSoldOut && (
                                                            <div className="flex items-center bg-panel-inactive/80 rounded-lg border border-panel-inactive overflow-hidden h-7">
                                                                <button className="w-6 flex-shrink-0 flex justify-center items-center font-bold text-gray-400 hover:text-white outline-none" onClick={() => setQty(item.id, buyQty - 1, item.quantity)}>-</button>
                                                                <input type="text" value={buyQty} onChange={(e) => { const v = parseInt(e.target.value); if(!isNaN(v)) setQty(item.id, v, item.quantity); }} className="text-xs font-black text-white w-6 bg-transparent text-center outline-none no-scrollbar flex-shrink-0" />
                                                                <button className="w-6 flex-shrink-0 flex justify-center items-center font-bold text-gray-400 hover:text-white outline-none" onClick={() => setQty(item.id, buyQty + 1, item.quantity)}>+</button>
                                                            </div>
                                                        )}
                                                        <button disabled={isSoldOut} onClick={() => handleBuy(shop, item, buyQty, false)} className={`px-4 py-1.5 w-full rounded-lg text-xs font-bold outline-none ${isSoldOut ? "bg-panel-inactive text-gray-500" : "bg-panel-active text-white shadow-sm hover:opacity-80"}`}>購買</button>
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}

                                    {/* Second-Hand Items Section */}
                                    {shop.boughtItems && shop.boughtItems.length > 0 && shop.boughtItems.filter(i => isGM || i.isVisible).length > 0 && (
                                        <>
                                            <div className="mt-4 mb-1 px-1 flex justify-between items-end border-b border-panel-inactive/30 pb-1">
                                                <span className="text-[10px] font-bold text-amber-500">二手陳列 (玩家售出)</span>
                                            </div>
                                            {shop.boughtItems.filter(i => isGM || i.isVisible).map(item => {
                                                const finalPrice = item.cost * shop.priceMultiplier;
                                                const isSoldOut = item.quantity <= 0;
                                                const buyQty = getQty(item.id);

                                                return (
                                                    <div key={item.id} className={`group flex items-center justify-between p-2 rounded-xl bg-panel-base border transition-colors shadow-sm ${isSoldOut ? "border-transparent opacity-50" : "border-panel-inactive hover:border-gray-600"}`}>
                                                        <div className="flex flex-col min-w-0 flex-1 pr-2">
                                                            <div className="flex items-center gap-1.5 truncate">
                                                                {isGM && !item.isVisible && <span className="text-[9px] bg-mirage-800 text-mirage-400 px-1 py-0.5 rounded font-black shrink-0">隱藏</span>}
                                                                <span className={`font-bold text-[16px] truncate ${RARITY_COLORS[item.rarity || 'none']}`}>{item.name}</span>
                                                                {isSoldOut && <span className="text-[9px] bg-red-900/50 text-red-400 px-1 py-0.5 rounded font-black shadow-sm shrink-0">售罄</span>}
                                                            </div>
                                                            <div className="flex items-center gap-2 mt-0.5 text-[11px] text-gray-400 font-bold">
                                                                <span className="text-amber-500">{finalPrice.toFixed(2)} GP</span><span>•</span><span>{item.weight} lb</span><span>•</span><span>庫存: {item.quantity}</span>
                                                            </div>
                                                            {item.description && <p className="mt-1.5 text-sm text-mirage-500 whitespace-pre-wrap break-words">{item.description}</p>}
                                                        </div>
                                                        {isGM ? (
                                                            <div className="flex flex-col gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity shrink-0 ml-2">
                                                                <div className="flex items-center bg-panel-content rounded-full p-0.5 shadow-sm border border-panel-inactive self-end mt-1">
                                                                    <button onClick={() => saveShops(shops.map(s => s.id === shop.id ? { ...s, boughtItems: s.boughtItems?.map(i => i.id === item.id ? { ...i, quantity: Math.max(0, i.quantity - 1) } : i) } : s))} className="w-6 h-6 flex items-center justify-center text-gray-400 hover:text-white font-bold outline-none">-</button>
                                                                    <span className="text-xs text-white font-bold w-4 text-center">{item.quantity}</span>
                                                                    <button onClick={() => saveShops(shops.map(s => s.id === shop.id ? { ...s, boughtItems: s.boughtItems?.map(i => i.id === item.id ? { ...i, quantity: i.quantity + 1 } : i) } : s))} className="w-6 h-6 flex items-center justify-center text-gray-400 hover:text-white font-bold outline-none">+</button>
                                                                </div>
                                                                <div className="flex items-center bg-panel-content rounded-full p-0.5 shadow-sm border border-panel-inactive self-end">
                                                                    <button onClick={() => saveShops(shops.map(s => s.id === shop.id ? { ...s, boughtItems: s.boughtItems?.map(i => i.id === item.id ? { ...i, isVisible: !i.isVisible } : i) } : s))} className={`w-6 h-6 outline-none flex justify-center items-center ${item.isVisible ? "text-panel-active" : "text-gray-500 hover:text-white"}`}>{item.isVisible ? <FaEye className="w-3 h-3" /> : <FaEyeSlash className="w-3 h-3" />}</button>
                                                                    <button onClick={() => { setEditingListType("boughtItems"); setTargetShopId(shop.id); setEditingItem(item); setFormItem(item); setItemModalOpen(true); playClickSound(); }} className="w-6 h-6 text-gray-400 hover:text-white outline-none flex justify-center items-center"><FaPencil className="w-3 h-3" /></button>
                                                                    <button onClick={() => confirmDeleteItem === item.id ? saveShops(shops.map(s => s.id === shop.id ? { ...s, boughtItems: s.boughtItems?.filter(i => i.id !== item.id) } : s)) : setConfirmDeleteItem(item.id)} onMouseLeave={() => setConfirmDeleteItem(null)} className={`w-6 h-6 outline-none flex justify-center items-center ${confirmDeleteItem === item.id ? "text-red-500" : "text-gray-400 hover:text-red-500"}`}>{confirmDeleteItem === item.id ? <FaXmark className="w-3 h-3" /> : <FaTrash className="w-3 h-3" />}</button>
                                                                </div>
                                                            </div>
                                                        ) : (
                                                            <div className="flex flex-col items-end gap-2 shrink-0 ml-2 pt-1 border-l border-panel-inactive pl-3">
                                                                {!isSoldOut && (
                                                                    <div className="flex items-center bg-panel-inactive/80 rounded-lg border border-panel-inactive overflow-hidden h-7">
                                                                        <button className="w-6 flex-shrink-0 flex justify-center items-center font-bold text-gray-400 hover:text-white outline-none" onClick={() => setQty(item.id, buyQty - 1, item.quantity)}>-</button>
                                                                        <input type="text" value={buyQty} onChange={(e) => { const v = parseInt(e.target.value); if(!isNaN(v)) setQty(item.id, v, item.quantity); }} className="text-xs font-black text-white w-6 bg-transparent text-center outline-none no-scrollbar flex-shrink-0" />
                                                                        <button className="w-6 flex-shrink-0 flex justify-center items-center font-bold text-gray-400 hover:text-white outline-none" onClick={() => setQty(item.id, buyQty + 1, item.quantity)}>+</button>
                                                                    </div>
                                                                )}
                                                                {/* Pass isBoughtItem = true to handleBuy */}
                                                                <button disabled={isSoldOut} onClick={() => handleBuy(shop, item, buyQty, true)} className={`px-4 py-1.5 w-full rounded-lg text-xs font-bold outline-none ${isSoldOut ? "bg-panel-inactive text-gray-500" : "bg-panel-active text-white shadow-sm hover:opacity-80"}`}>回購</button>
                                                            </div>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                        </>
                                    )}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>

            {logModalOpen && (
                <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in">
                    <div className="w-full max-w-[400px] h-[60vh] flex flex-col shadow-2xl rounded-2xl bg-panel-content p-5 border border-panel-inactive">
                        <h3 className="font-bold text-white mb-4">日誌</h3>
                        <div className="flex-1 overflow-y-auto no-scrollbar flex flex-col gap-2">
                            {logs.length === 0 ? <p className="text-xs text-gray-500 text-center mt-10">尚無紀錄</p> : logs.map(l => (
                                <div key={l.id} className="bg-panel-base p-2.5 rounded-xl text-xs text-gray-300 shadow-sm border border-panel-inactive/50 flex flex-col gap-1">
                                    <span className="text-[9px] text-gray-500">{new Date(l.time).toLocaleTimeString()}</span>{l.message}
                                </div>
                            ))}
                        </div>
                        <button onClick={() => setLogModalOpen(false)} className="mt-4 w-full py-2 rounded-full text-xs font-bold bg-panel-inactive text-white hover:bg-panel-active outline-none">關閉</button>
                    </div>
                </div>
            )}

            {shopModalOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in">
                    <div className="w-full max-w-[360px] flex flex-col shadow-2xl rounded-2xl bg-panel-content p-5 border border-panel-inactive">
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="font-bold text-white">{editingShop ? "編輯商店" : "新增商店"}</h3>
                        </div>
                        <div className="flex flex-col gap-3 mb-5">
                            <input autoFocus type="text" value={formShop.name || ""} onChange={(e) => setFormShop({ ...formShop, name: e.target.value })} placeholder="商店名稱" className="w-full bg-panel-base text-white text-sm font-bold rounded-xl p-2.5 outline-none border border-transparent focus:border-panel-active shadow-inner" />
                            <textarea value={formShop.description || ""} onChange={(e) => setFormShop({ ...formShop, description: e.target.value })} placeholder="商店簡述..." className="w-full h-24 bg-panel-base text-gray-300 text-sm rounded-xl p-2.5 outline-none resize-none no-scrollbar shadow-inner border border-transparent focus:border-panel-active" />
                            <select value={formShop.scenarioKey || "tavern"} onChange={(e) => setFormShop({ ...formShop, scenarioKey: e.target.value })} className="w-full bg-panel-base text-white text-xs font-bold rounded-xl p-2.5 outline-none border border-transparent focus:border-panel-active">
                                {Object.entries(SHOP_SCENARIO_LABELS).map(([k, v]) => <option key={k} value={k}>{v} 情境</option>)}
                            </select>
                            <div className="flex items-center gap-2">
                                <select value={formShop.priceMultiplier || 1} onChange={(e) => setFormShop({ ...formShop, priceMultiplier: Number(e.target.value) })} className="flex-1 bg-panel-base text-white text-xs font-bold rounded-xl p-2.5 outline-none border border-transparent focus:border-panel-active">
                                    <option value={0.5}>半價 (x0.5)</option>
                                    <option value={0.8}>折扣 (x0.8)</option>
                                    <option value={1}>原價 (x1.0)</option>
                                    <option value={1.5}>漲價 (x1.5)</option>
                                    <option value={2}>黑店 (x2.0)</option>
                                </select>
                                <button onClick={() => setFormShop({ ...formShop, isVisible: !formShop.isVisible })} className={`flex-1 h-[34px] rounded-xl text-xs font-bold outline-none border ${formShop.isVisible ? "bg-panel-active/20 border-panel-active text-panel-active" : "bg-panel-base border-transparent text-gray-400 hover:text-white"}`}>{formShop.isVisible ? "玩家可見" : "隱藏商店"}</button>
                            </div>
                        </div>
                        <div className="flex justify-end gap-2">
                            <button onClick={() => setShopModalOpen(false)} className="px-4 py-1.5 rounded-full text-xs font-bold text-gray-400 hover:text-white outline-none">取消</button>
                            <button onClick={handleSaveShop} disabled={!formShop.name} className="px-4 py-1.5 rounded-full text-xs font-bold bg-panel-active text-white outline-none">儲存</button>
                        </div>
                    </div>
                </div>
            )}
            
            {itemModalOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in">
                    <div className="w-full max-w-[360px] flex flex-col shadow-2xl rounded-2xl bg-panel-content p-5 border border-panel-inactive">
                        <h3 className="font-bold text-white mb-4">{editingItem ? "編輯商品" : "新增商品"}</h3>
                        <div className="flex flex-col gap-3 mb-5">
                            <input autoFocus type="text" value={formItem.name || ""} onChange={(e) => setFormItem({ ...formItem, name: e.target.value })} placeholder="商品名稱" className="w-full bg-panel-base text-white text-sm font-bold rounded-xl p-2.5 outline-none border border-transparent focus:border-panel-active shadow-inner" />
                            <textarea value={formItem.description || ""} onChange={(e) => setFormItem({ ...formItem, description: e.target.value })} placeholder="物品說明..." className="w-full h-24 bg-panel-base text-gray-300 text-sm rounded-xl p-2.5 outline-none border border-transparent focus:border-panel-active resize-none no-scrollbar shadow-inner" />
                            
                            {/* Rarity & Category Selectors for Shop */}
                            <div className="flex items-center gap-2">
                                <select value={formItem.rarity || "none"} onChange={(e) => setFormItem({ ...formItem, rarity: e.target.value })} className={`flex-1 bg-panel-base text-xs font-bold rounded-xl p-2.5 outline-none border border-transparent focus:border-panel-active shadow-inner ${RARITY_COLORS[formItem.rarity || 'none']}`}>
                                    {Object.entries(RARITY_LABELS).map(([k, v]) => <option key={k} value={k} className={RARITY_COLORS[k]}>{v}</option>)}
                                </select>
                                <select value={formItem.category || "backpack"} onChange={(e) => setFormItem({ ...formItem, category: e.target.value })} className="flex-1 bg-panel-base text-white text-xs font-bold rounded-xl p-2.5 outline-none border border-transparent focus:border-panel-active shadow-inner">
                                    {INVENTORY_CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                </select>
                            </div>

                            <div className="flex items-center gap-2">
                                <NumberInputBlock label="庫存" value={formItem.quantity || 0} onChange={(v: number) => setFormItem({...formItem, quantity: v})} min={0} step={1} isInteger={true} />
                                <NumberInputBlock label="重(lb)" value={formItem.weight || 0} onChange={(v: number) => setFormItem({...formItem, weight: v})} min={0} step={0.1} />
                                <NumberInputBlock label="原價" value={formItem.cost || 0} onChange={(v: number) => setFormItem({...formItem, cost: v})} min={0} step={0.5} />
                            </div>
                            <button onClick={() => setFormItem({ ...formItem, isVisible: !formItem.isVisible })} className={`flex items-center justify-center gap-1.5 w-full h-9 rounded-xl text-xs font-bold transition-colors outline-none border shadow-sm mt-1 ${formItem.isVisible ? "bg-panel-active/20 border-panel-active text-panel-active" : "bg-panel-base border-transparent text-gray-400 hover:text-white"}`}>
                                {formItem.isVisible ? <><FaEye className="w-3.5 h-3.5" /> 玩家可見</> : <><FaEyeSlash className="w-3.5 h-3.5" /> 隱藏商品</>}
                            </button>
                        </div>
                        <div className="flex justify-end gap-2">
                            <button onClick={() => setItemModalOpen(false)} className="px-4 py-1.5 rounded-full text-xs font-bold text-gray-400 hover:text-white outline-none">取消</button>
                            <button onClick={handleSaveItem} disabled={!formItem.name} className="px-4 py-1.5 rounded-full text-xs font-bold bg-panel-active text-white outline-none">儲存</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}