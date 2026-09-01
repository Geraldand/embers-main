// src/components/StoryManager/LootTab.tsx
import { useState, useEffect, useRef } from "react";
import OBR from "@owlbear-rodeo/sdk";
import { FaCirclePlus, FaPencil, FaEye, FaEyeSlash, FaTrash, FaCircleCheck, FaCircleExclamation, FaDiceD20, FaUnlock, FaLock, FaXmark, FaScroll, FaUpload, FaDownload, FaCoins, FaWeightHanging } from "react-icons/fa6";
import { LootSource, LootItem } from "./types";
import { useStoryData } from "./store";
import { LOOT_SCENARIO_LABELS, getRandomScenarioText } from "./constants";
import { NumberInputBlock } from "./ShopTab";
import { downloadFileFromString } from "../../utils";

const SHOP_EVENT_CHANNEL = "com.yourname.character-sheet-extension/shop-events";
const META_ID = "com.yourname.character-sheet-extension/metadata";
const CURR_ID = "com.yourname.character-sheet-extension/currency";

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

function playClickSound() { try { const audio = new Audio('/click.mp3'); audio.volume = 0.15; audio.play().catch(() => { }); } catch (e) { } }
function playLootOpenSound() { try { const audio = new Audio('/loot_open.mp3'); audio.volume = 0.3; audio.play().catch(() => { }); } catch (e) { } }
function playLootTakeSound() { try { const audio = new Audio('/loot_take.mp3'); audio.volume = 0.3; audio.play().catch(() => { }); } catch (e) { } }

export default function LootTab() {
    const { loots, logs, isGM, saveLoots } = useStoryData();
    const [sourceModalOpen, setSourceModalOpen] = useState(false);
    const [itemModalOpen, setItemModalOpen] = useState(false);
    const [logModalOpen, setLogModalOpen] = useState(false);
    const [editingSource, setEditingSource] = useState<LootSource | null>(null);
    const [editingItem, setEditingItem] = useState<LootItem | null>(null);
    const [targetSourceId, setTargetSourceId] = useState<string>("");
    const [formSource, setFormSource] = useState<Partial<LootSource>>({});
    const [formItem, setFormItem] = useState<Partial<LootItem>>({});
    const [activeTokenId, setActiveTokenId] = useState<string | null>(null);
    const [activeTokenName, setActiveTokenName] = useState<string>("沒有人");
    const [activeTokenGold, setActiveTokenGold] = useState<number | null>(null);
    const [activeTokenWeight, setActiveTokenWeight] = useState<{ current: number, max: number } | null>(null);
    const [toastMsg, setToastMsg] = useState<{ text: string, type: "success" | "error" } | null>(null);
    const [expandedSourceId, setExpandedSourceId] = useState<string | null>(null);
    const [activeScenarioText, setActiveScenarioText] = useState("正在查看殘骸...");
    const [confirmDeleteSource, setConfirmDeleteSource] = useState<string | null>(null);
    const [confirmDeleteItem, setConfirmDeleteItem] = useState<string | null>(null);

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
            if (safeSelection.length !== 1) { setActiveTokenId(null); setActiveTokenName("沒有人"); setActiveTokenGold(null); setActiveTokenWeight(null); return; }
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
        const handleLootResponses = async (message: any) => {
            const data = message.data;
            if (!data || data.type !== "LOOT_RESPONSE") return;
            const myConnectionId = await OBR.player.getConnectionId();
            if (data.targetConnectionId && data.targetConnectionId !== myConnectionId) return;

            if (data.success) { 
                playLootTakeSound(); 
                setToastMsg({ text: data.message, type: "success" }); 
                if(activeTokenId) fetchTokenData(activeTokenId); 

                // Reduce stock automatically based on response
                saveLoots(loots.map(s => {
                    if (s.id !== data.sourceId) return s;
                    const updatedItems = s.items.map(i => {
                        if (i.id === data.item.id && !i.isInfinite) {
                            return { ...i, quantity: i.quantity - data.quantity };
                        }
                        return i;
                    });
                    return { ...s, items: updatedItems };
                }));

            } else { 
                setToastMsg({ text: data.message, type: "error" }); 
            }
            setTimeout(() => setToastMsg(null), 3000);
        };
        const unsub = OBR.broadcast.onMessage(SHOP_EVENT_CHANNEL, handleLootResponses);
        return () => unsub();
    }, [activeTokenId, loots]);

    const lastExpandedRef = useRef<string | null>(null);
    useEffect(() => {
        if (expandedSourceId !== lastExpandedRef.current) {
            if (expandedSourceId) {
                const source = loots.find(s => s.id === expandedSourceId);
                setActiveScenarioText(getRandomScenarioText("loot", source?.scenarioKey || "humanoid"));
            } else {
                setActiveScenarioText("正在查看殘骸...");
            }
            lastExpandedRef.current = expandedSourceId;
        }
    }, [expandedSourceId, loots]);

    const handleSaveSource = () => {
        playClickSound();
        const newSource: LootSource = {
            id: editingSource?.id || Date.now().toString(36),
            name: formSource.name || "未命名戰利品",
            description: formSource.description || "",
            scenarioKey: formSource.scenarioKey || "humanoid",
            items: editingSource?.items || [],
            isVisible: formSource.isVisible ?? false,
            createdAt: editingSource?.createdAt || Date.now()
        };
        saveLoots(editingSource ? loots.map(s => s.id === editingSource.id ? newSource : s) : [...loots, newSource]);
        setSourceModalOpen(false);
    };

    const handleSaveItem = () => {
        playClickSound();
        const newItem: LootItem = {
            id: editingItem?.id || Date.now().toString(36),
            name: formItem.name || "未知戰利品",
            description: formItem.description || "",
            weight: formItem.weight || 0,
            cost: formItem.cost || 0,
            rarity: formItem.rarity || "none",
            category: formItem.category || "backpack",
            quantity: formItem.quantity || 1,
            isInfinite: formItem.isInfinite || false,
            isRevealed: formItem.isRevealed || false
        };
        saveLoots(loots.map(s => s.id === targetSourceId ? { ...s, items: editingItem ? s.items.map(i => i.id === editingItem.id ? newItem : i) : [...s.items, newItem] } : s));
        setItemModalOpen(false);
    };

    const handleRandomLoot = (sourceId: string) => {
        playClickSound();
        const source = loots.find(s => s.id === sourceId);
        if (!source) return;
        const availableItems = source.items.filter(i => !i.isRevealed && (i.isInfinite || i.quantity > 0));
        if (availableItems.length === 0) {
            setToastMsg({ text: "已經沒有可揭露的戰利品了！", type: "error" }); setTimeout(() => setToastMsg(null), 3000); return;
        }

        const selected = availableItems[Math.floor(Math.random() * availableItems.length)];
        if (selected.isInfinite) {
            const clone: LootItem = { ...selected, id: Date.now().toString(36), isInfinite: false, isRevealed: true, quantity: 1 };
            saveLoots(loots.map(s => s.id === sourceId ? { ...s, items: [...s.items, clone] } : s));
        } else if (selected.quantity > 1) {
            const clone: LootItem = { ...selected, id: Date.now().toString(36), isRevealed: true, quantity: 1 };
            const newItems = source.items.map(i => i.id === selected.id ? { ...i, quantity: i.quantity - 1 } : i);
            newItems.push(clone);
            saveLoots(loots.map(s => s.id === sourceId ? { ...s, items: newItems } : s));
        } else {
            saveLoots(loots.map(s => s.id === sourceId ? { ...s, items: s.items.map(i => i.id === selected.id ? { ...i, isRevealed: true } : i) } : s));
        }
    };

    const handleToggleRevealAll = (sourceId: string, isReveal: boolean) => {
        playClickSound();
        saveLoots(loots.map(s => s.id === sourceId ? { ...s, items: s.items.map(i => ({ ...i, isRevealed: isReveal })) } : s));
        setToastMsg({ text: isReveal ? "已揭露所有戰利品" : "已隱藏所有戰利品", type: "success" }); setTimeout(() => setToastMsg(null), 3000);
    };

    const handleTake = async (sourceId: string, item: LootItem) => {
        playClickSound();
        if (!item.isInfinite && item.quantity <= 0) { setToastMsg({ text: "此戰利品已被拿完！", type: "error" }); setTimeout(() => setToastMsg(null), 3000); return; }
        if (!activeTokenId) { setToastMsg({ text: "請先在畫面上點選要拿取物品的角色代幣！", type: "error" }); setTimeout(() => setToastMsg(null), 3000); return; }
        OBR.broadcast.sendMessage(SHOP_EVENT_CHANNEL, { type: "LOOT_REQUEST", transactionId: Math.random().toString(36).substring(2, 9), sourceId, item, cost: 0, quantity: 1, targetTokenId: activeTokenId }, { destination: "ALL" });
    };

    const handleExportAllLoots = () => {
        downloadFileFromString(JSON.stringify(loots, null, 2), `loots_backup.json`);
    };

    const handleImportAllLoots = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const json = JSON.parse(event.target?.result as string);
                if (Array.isArray(json)) {
                    saveLoots([...loots, ...json]);
                    setToastMsg({ text: `成功匯入戰利品群組`, type: "success" }); setTimeout(() => setToastMsg(null), 3000);
                }
            } catch (err) { alert("JSON 解析失敗。"); }
        };
        reader.readAsText(file); e.target.value = "";
    };

    const visibleLoots = isGM ? loots : loots.filter(s => s.isVisible);

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
                            <label className="p-2 text-gray-400 hover:text-panel-active cursor-pointer transition-colors outline-none" title="匯入來源陣列">
                                <FaUpload className="w-3.5 h-3.5" />
                                <input type="file" accept=".json" className="hidden" onChange={handleImportAllLoots} />
                            </label>
                            <div className="w-px h-3 bg-gray-600 mx-0.5"></div>
                            <button onClick={handleExportAllLoots} className="p-2 text-gray-400 hover:text-panel-active transition-colors outline-none" title="匯出所有來源">
                                <FaDownload className="w-3.5 h-3.5" />
                            </button>
                            <div className="w-px h-3 bg-gray-600 mx-0.5"></div>
                            <button onClick={() => { setEditingSource(null); setFormSource({ isVisible: false, scenarioKey: "humanoid" }); setSourceModalOpen(true); playClickSound(); }} className="p-2 text-white hover:text-panel-active transition-colors outline-none" title="新增來源">
                                <FaCirclePlus className="w-4 h-4" />
                            </button>
                        </>
                    )}
                </div>
            </div>

            <div className="flex flex-col gap-4 pb-10">
                {visibleLoots.map(source => {
                    const isExpanded = expandedSourceId === source.id;
                    const allRevealed = source.items.length > 0 && source.items.every(i => i.isRevealed);
                    return (
                        <div key={source.id} className={`flex flex-col bg-panel-content rounded-2xl border ${source.isVisible ? "border-panel-inactive" : "border-gray-600 opacity-80"} shadow-sm overflow-hidden`}>
                            <div className="p-3 bg-panel-inactive/30 flex items-start justify-between gap-2 border-b border-panel-inactive/50 cursor-pointer hover:bg-panel-inactive/50" onClick={() => { if (!isExpanded) playLootOpenSound(); setExpandedSourceId(isExpanded ? null : source.id); }}>
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2">
                                        <h4 className="font-bold text-xl text-white truncate">{source.name}</h4>
                                    </div>
                                    {source.description && <p className="text-[15px] text-gray-400 mt-1 line-clamp-2">{source.description}</p>}
                                </div>
                                {isGM && (
                                    <div className="flex items-center gap-1 bg-panel-base rounded-full px-1 py-0.5 shadow-inner border border-panel-inactive/50" onClick={e => e.stopPropagation()}>
                                        <button onClick={(e) => { e.stopPropagation(); handleRandomLoot(source.id); }} className="p-1.5 text-indigo-400 hover:text-white outline-none" title="隨機掉落"><FaDiceD20 className="w-3.5 h-3.5" /></button>
                                        <button onClick={(e) => { e.stopPropagation(); handleToggleRevealAll(source.id, !allRevealed); }} className={`p-1.5 outline-none ${allRevealed ? "text-red-400 hover:text-white" : "text-emerald-400 hover:text-white"}`} title={allRevealed ? "全部隱藏" : "全部揭露"}>{allRevealed ? <FaLock className="w-3.5 h-3.5" /> : <FaUnlock className="w-3.5 h-3.5" />}</button>
                                        <div className="w-px h-3 bg-gray-600 mx-0.5"></div>
                                        <button onClick={() => saveLoots(loots.map(s => s.id === source.id ? { ...s, isVisible: !s.isVisible } : s))} className={`p-1.5 outline-none rounded-full ${source.isVisible ? "text-panel-active" : "text-gray-500 hover:text-white"}`} title={source.isVisible ? "隱藏來源" : "顯示來源"}>{source.isVisible ? <FaEye className="w-3.5 h-3.5" /> : <FaEyeSlash className="w-3.5 h-3.5" />}</button>
                                        <button onClick={() => { setEditingSource(source); setFormSource(source); setSourceModalOpen(true); }} className="p-1.5 text-gray-400 hover:text-white outline-none" title="編輯來源"><FaPencil className="w-3.5 h-3.5" /></button>
                                        <button onClick={() => confirmDeleteSource === source.id ? saveLoots(loots.filter(s => s.id !== source.id)) : setConfirmDeleteSource(source.id)} onMouseLeave={() => setConfirmDeleteSource(null)} className={`p-1.5 outline-none ${confirmDeleteSource === source.id ? "text-red-500" : "text-gray-400 hover:text-red-500"}`} title="刪除來源">{confirmDeleteSource === source.id ? <FaXmark className="w-3.5 h-3.5" /> : <FaTrash className="w-3.5 h-3.5" />}</button>
                                    </div>
                                )}
                            </div>
                            
                            {isExpanded && (
                                <div className="p-2 flex flex-col gap-1.5 animate-in fade-in">
                                    {isGM && (
                                        <div className="flex items-center gap-1.5 mb-1">
                                            <button onClick={() => { setEditingItem(null); setFormItem({ quantity: 1, cost: 0, weight: 0, isInfinite: false, rarity: "none", category: "backpack" }); setTargetSourceId(source.id); setItemModalOpen(true); playClickSound(); }} className="flex-1 py-1.5 border border-dashed border-panel-inactive hover:border-panel-active rounded-xl text-xs font-bold text-gray-400 hover:text-white transition-colors outline-none flex justify-center items-center gap-1.5">
                                                <FaCirclePlus className="w-3.5 h-3.5" /> 新增戰利品
                                            </button>
                                        </div>
                                    )}
                                    
                                    {isGM && (
                                        <div className="mt-2 mb-1 px-1 flex justify-between items-end border-b border-panel-inactive/30 pb-1">
                                            <span className="text-[10px] font-bold text-amber-500">掉落區 (玩家可見)</span>
                                        </div>
                                    )}
                                    {source.items.filter(i => i.isRevealed).map(item => {
                                        const isSoldOut = !item.isInfinite && item.quantity <= 0;
                                        return (
                                            <div key={item.id} className={`group flex items-center justify-between p-2 rounded-xl bg-panel-base border transition-colors shadow-sm ${isSoldOut ? "border-transparent opacity-50" : "border-panel-inactive hover:border-gray-600"}`}>
                                                <div className="flex flex-col min-w-0 flex-1 pr-2">
                                                    <div className="flex items-center gap-1.5 truncate">
                                                        <span className={`font-bold text-[16px] truncate ${RARITY_COLORS[item.rarity || 'none']}`}>{item.name}</span>
                                                        {isSoldOut && <span className="text-[9px] bg-red-900/50 text-red-400 px-1 py-0.5 rounded font-black shadow-sm shrink-0">已取完</span>}
                                                    </div>
                                                    <div className="flex items-center gap-2 mt-0.5 text-[11px] text-gray-400 font-bold">
                                                        <span className="text-amber-500">{item.cost} GP</span><span>•</span><span>{item.weight} lb</span><span>•</span><span>{item.isInfinite ? "無限數量" : `剩餘: ${item.quantity}`}</span>
                                                    </div>
                                                    {item.description && <p className="mt-1.5 text-sm text-mirage-500 whitespace-pre-wrap break-words">{item.description}</p>}
                                                </div>
                                                {isGM ? (
                                                    <div className="flex items-center gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity shrink-0 bg-panel-content rounded-full p-0.5 shadow-sm border border-panel-inactive">
                                                        <button onClick={() => saveLoots(loots.map(s => s.id === source.id ? { ...s, items: s.items.map(i => i.id === item.id ? { ...i, isRevealed: false } : i) } : s))} className="p-1.5 outline-none rounded-full text-panel-active" title="隱藏戰利品"><FaEye className="w-3 h-3" /></button>
                                                        <button onClick={() => { setTargetSourceId(source.id); setEditingItem(item); setFormItem(item); setItemModalOpen(true); playClickSound(); }} className="p-1.5 text-gray-400 hover:text-white outline-none"><FaPencil className="w-3 h-3" /></button>
                                                        <button onClick={() => confirmDeleteItem === item.id ? saveLoots(loots.map(s => s.id === source.id ? { ...s, items: s.items.filter(i => i.id !== item.id) } : s)) : setConfirmDeleteItem(item.id)} onMouseLeave={() => setConfirmDeleteItem(null)} className={`p-1.5 outline-none ${confirmDeleteItem === item.id ? "text-red-500" : "text-gray-400 hover:text-red-500"}`}>{confirmDeleteItem === item.id ? <FaXmark className="w-3 h-3" /> : <FaTrash className="w-3 h-3" />}</button>
                                                    </div>
                                                ) : (
                                                    <div className="flex flex-col items-end gap-2 shrink-0 ml-2 pt-1 border-l border-panel-inactive pl-3">
                                                        <button disabled={isSoldOut} onClick={() => handleTake(source.id, item)} className={`px-4 py-1.5 w-full rounded-lg text-xs font-bold transition-all outline-none shrink-0 ${isSoldOut ? "bg-panel-inactive text-gray-500" : "bg-panel-active text-white shadow-sm hover:opacity-80"}`}>拾取</button>
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}

                                    {isGM && source.items.some(i => !i.isRevealed) && (
                                        <div className="mt-4 mb-1 px-1 flex justify-between items-end border-b border-panel-inactive/30 pb-1">
                                            <span className="text-[10px] font-bold text-gray-500">DM 戰利品池 (未揭露)</span>
                                        </div>
                                    )}
                                    {isGM && source.items.filter(i => !i.isRevealed).map(item => {
                                        return (
                                            <div key={item.id} className="group flex items-center justify-between p-2 rounded-xl bg-black/20 border border-transparent hover:border-gray-600 transition-colors shadow-sm opacity-80">
                                                <div className="flex flex-col min-w-0 flex-1 pr-2">
                                                    <div className="flex items-center gap-1.5 truncate">
                                                        <span className="text-[9px] bg-mirage-800 text-mirage-400 px-1 py-0.5 rounded font-black shrink-0">未揭露</span>
                                                        <span className={`font-bold text-[16px] truncate ${RARITY_COLORS[item.rarity || 'none']}`}>{item.name}</span>
                                                    </div>
                                                    <div className="flex items-center gap-2 mt-0.5 text-[11px] text-gray-400 font-bold">
                                                        <span className="text-amber-500">{item.cost} GP</span><span>•</span><span>{item.weight} lb</span><span>•</span><span>{item.isInfinite ? "無限數量" : `剩餘: ${item.quantity}`}</span>
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity shrink-0 bg-panel-content rounded-full p-0.5 shadow-sm border border-panel-inactive">
                                                    <button onClick={() => saveLoots(loots.map(s => s.id === source.id ? { ...s, items: s.items.map(i => i.id === item.id ? { ...i, isRevealed: true } : i) } : s))} className="p-1.5 outline-none rounded-full text-gray-500 hover:text-white" title="揭露戰利品給玩家"><FaEyeSlash className="w-3 h-3" /></button>
                                                    <button onClick={() => { setTargetSourceId(source.id); setEditingItem(item); setFormItem(item); setItemModalOpen(true); playClickSound(); }} className="p-1.5 text-gray-400 hover:text-white outline-none"><FaPencil className="w-3 h-3" /></button>
                                                    <button onClick={() => confirmDeleteItem === item.id ? saveLoots(loots.map(s => s.id === source.id ? { ...s, items: s.items.filter(i => i.id !== item.id) } : s)) : setConfirmDeleteItem(item.id)} onMouseLeave={() => setConfirmDeleteItem(null)} className={`p-1.5 outline-none ${confirmDeleteItem === item.id ? "text-red-500" : "text-gray-400 hover:text-red-500"}`}>{confirmDeleteItem === item.id ? <FaXmark className="w-3 h-3" /> : <FaTrash className="w-3 h-3" />}</button>
                                                </div>
                                            </div>
                                        );
                                    })}
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
            
            {sourceModalOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in">
                    <div className="w-full max-w-[360px] flex flex-col shadow-2xl rounded-2xl bg-panel-content p-5 border border-panel-inactive">
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="font-bold text-white">{editingSource ? "編輯來源" : "新增來源"}</h3>
                        </div>
                        <input autoFocus type="text" value={formSource.name || ""} onChange={(e) => setFormSource({ ...formSource, name: e.target.value })} placeholder="名稱" className="w-full bg-panel-base text-white text-sm font-bold rounded-xl p-2.5 outline-none mb-3 border border-transparent focus:border-panel-active shadow-inner" />
                        <select value={formSource.scenarioKey || "humanoid"} onChange={(e) => setFormSource({ ...formSource, scenarioKey: e.target.value })} className="w-full bg-panel-base text-white text-xs font-bold rounded-xl p-2.5 outline-none mb-3 border border-transparent focus:border-panel-active shadow-inner">
                            {Object.entries(LOOT_SCENARIO_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                        </select>
                        <div className="flex justify-end gap-2 mt-2">
                            <button onClick={() => setSourceModalOpen(false)} className="px-4 py-1.5 rounded-full text-xs font-bold text-gray-400 hover:text-white outline-none">取消</button>
                            <button onClick={handleSaveSource} disabled={!formSource.name} className="px-4 py-1.5 rounded-full text-xs font-bold bg-panel-active text-white outline-none">儲存</button>
                        </div>
                    </div>
                </div>
            )}

            {itemModalOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
                    <div className="w-full max-w-[360px] flex flex-col shadow-2xl rounded-2xl bg-panel-content p-5 border border-panel-inactive">
                        <h3 className="font-bold text-white mb-4">{editingItem ? "編輯戰利品" : "新增戰利品"}</h3>
                        <div className="flex flex-col gap-3 mb-5">
                            <input autoFocus type="text" value={formItem.name || ""} onChange={(e) => setFormItem({ ...formItem, name: e.target.value })} placeholder="物品名稱" className="w-full bg-panel-base text-white text-sm font-bold rounded-xl p-2.5 outline-none border border-transparent focus:border-panel-active shadow-inner" />
                            <textarea value={formItem.description || ""} onChange={(e) => setFormItem({ ...formItem, description: e.target.value })} placeholder="物品說明..." className="w-full h-24 bg-panel-base text-gray-300 text-sm rounded-xl p-2.5 outline-none border border-transparent focus:border-panel-active resize-none no-scrollbar shadow-inner" />
                            
                            {/* Rarity & Category Selectors for Loot */}
                            <div className="flex items-center gap-2">
                                <select value={formItem.rarity || "none"} onChange={(e) => setFormItem({ ...formItem, rarity: e.target.value })} className={`flex-1 bg-panel-base text-xs font-bold rounded-xl p-2.5 outline-none border border-transparent focus:border-panel-active shadow-inner ${RARITY_COLORS[formItem.rarity || 'none']}`}>
                                    {Object.entries(RARITY_LABELS).map(([k, v]) => <option key={k} value={k} className={RARITY_COLORS[k]}>{v}</option>)}
                                </select>
                                <select value={formItem.category || "backpack"} onChange={(e) => setFormItem({ ...formItem, category: e.target.value })} className="flex-1 bg-panel-base text-white text-xs font-bold rounded-xl p-2.5 outline-none border border-transparent focus:border-panel-active shadow-inner">
                                    {INVENTORY_CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                </select>
                            </div>

                            <div className="flex items-center gap-2">
                                <NumberInputBlock label="數量" value={formItem.quantity || 0} onChange={(v: number) => setFormItem({...formItem, quantity: v})} min={0} step={1} isInteger={true} disabled={formItem.isInfinite} />
                                <NumberInputBlock label="重(lb)" value={formItem.weight || 0} onChange={(v: number) => setFormItem({...formItem, weight: v})} min={0} step={0.1} />
                                <NumberInputBlock label="價值" value={formItem.cost || 0} onChange={(v: number) => setFormItem({...formItem, cost: v})} min={0} step={0.5} />
                            </div>
                            <button onClick={() => setFormItem({ ...formItem, isInfinite: !formItem.isInfinite })} className={`flex items-center justify-center w-full h-9 mt-1 rounded-xl text-xs font-bold transition-colors outline-none border shadow-sm ${formItem.isInfinite ? "bg-panel-active/20 border-panel-active text-panel-active" : "bg-panel-base border-transparent text-gray-400 hover:text-white"}`}>
                                重複抽取
                            </button>
                        </div>
                        <div className="flex justify-end gap-2">
                            <button onClick={() => { playClickSound(); setItemModalOpen(false); }} className="px-4 py-1.5 rounded-full text-xs font-bold text-gray-400 hover:text-white outline-none">取消</button>
                            <button onClick={handleSaveItem} disabled={!formItem.name} className="px-4 py-1.5 rounded-full text-xs font-bold bg-panel-active text-white outline-none">儲存</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}