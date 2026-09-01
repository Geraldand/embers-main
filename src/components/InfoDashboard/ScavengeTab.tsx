// src/components/InfoDashboard/ScavengeTab.tsx
import { useCallback, useEffect, useState } from "react";
import OBR from "@owlbear-rodeo/sdk";
import { FaChevronDown, FaMinus, FaPencil, FaPlus, FaTrash, FaDiceD20, FaBullhorn, FaInfinity } from "react-icons/fa6";
import * as Dialog from "@radix-ui/react-dialog";
import { cn } from "../../lib/utils";
import { Button } from "../ui/button";
import { getMergedRoomArray, updateRoomMetadataItem, deleteRoomMetadataItem } from "../../lib/metadataHelpers";
import { APP_KEY } from "../../config";

export const SCAVENGE_BASE_KEY = `scavenge`;
export const HISTORY_BASE_KEY = `history`;
export const LOOT_DROP_CHANNEL = `${APP_KEY}/loot-drop`;

export interface ScavengeItem { id: string; name: string; description: string; price?: string; weight?: string; qty: number; isRepeatable: boolean; }
export interface ScavengePool { id: string; title: string; items: ScavengeItem[]; }
export interface ScavengedHistoryItem { id: string; source: string; item: ScavengeItem; timestamp: number; }

const CustomDialog = ({ open, onOpenChange, title, children, onSave, onCancel, saveText = "儲存" }: any) => (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
        <Dialog.Portal>
            <Dialog.Overlay className="fixed inset-0 bg-mirage-950/60 backdrop-blur-sm z-40 animate-in fade-in" />
            <Dialog.Content className="fixed top-[50%] left-[50%] max-h-[85vh] w-[90vw] max-w-[400px] translate-x-[-50%] translate-y-[-50%] rounded-2xl bg-mirage-50 dark:bg-mirage-900 p-6 shadow-2xl z-50 flex flex-col outline-none animate-in zoom-in-95">
                <Dialog.Title className="text-lg font-bold border-b border-mirage-200 dark:border-mirage-800 pb-2 mb-4 text-mirage-900 dark:text-mirage-50">{title}</Dialog.Title>
                <div className="overflow-y-auto no-scrollbar flex-grow flex flex-col gap-3">{children}</div>
                <div className="mt-6 flex justify-end gap-2">
                    <Button variant="ghost" onClick={onCancel}>取消</Button>
                    <Button variant="default" className="bg-primary text-mirage-950 hover:bg-primary-dark" onClick={onSave}>{saveText}</Button>
                </div>
            </Dialog.Content>
        </Dialog.Portal>
    </Dialog.Root>
);

const CustomInput = ({ label, value, onChange, multiline = false, rows = 3, type = "text", disabled = false }: any) => (
    <div className="flex flex-col">
        <label className="text-xs font-bold text-mirage-500 mb-1">{label}</label>
        {multiline ? (
            <textarea rows={rows} value={value} onChange={onChange} disabled={disabled} className="w-full bg-white dark:bg-mirage-950 border border-mirage-200 dark:border-mirage-800 text-mirage-900 dark:text-white placeholder-mirage-400 rounded-xl px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary shadow-sm resize-none" />
        ) : (
            <input type={type} value={value} onChange={onChange} disabled={disabled} className="w-full bg-white dark:bg-mirage-950 border border-mirage-200 dark:border-mirage-800 text-mirage-900 dark:text-white placeholder-mirage-400 rounded-xl px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary shadow-sm" />
        )}
    </div>
);

export default function ScavengeTab() {
    const [scavenges, setScavenges] = useState<ScavengePool[]>([]);
    
    // Pool Modals
    const [openScavengeModal, setOpenScavengeModal] = useState(false);
    const [editingScavenge, setEditingScavenge] = useState<ScavengePool | null>(null);
    const [scavengeTitle, setScavengeTitle] = useState("");

    // Item Modals
    const [openScavengeItemModal, setOpenScavengeItemModal] = useState(false);
    const [targetScavengeId, setTargetScavengeId] = useState<string>("");
    const [editingScavengeItem, setEditingScavengeItem] = useState<ScavengeItem | null>(null);
    const [scavengeItemName, setScavengeItemName] = useState("");
    const [scavengeItemDesc, setScavengeItemDesc] = useState("");
    const [scavengeItemPrice, setScavengeItemPrice] = useState("");
    const [scavengeItemWeight, setScavengeItemWeight] = useState("");
    const [scavengeItemQty, setScavengeItemQty] = useState(1);
    const [scavengeItemRepeatable, setScavengeItemRepeatable] = useState(false);

    const loadScavenges = useCallback(async () => {
        const loadedPools = await getMergedRoomArray<ScavengePool>(SCAVENGE_BASE_KEY);
        setScavenges(loadedPools);
    }, []);

    useEffect(() => {
        loadScavenges();
        const unsubscribe = OBR.room.onMetadataChange(() => loadScavenges());
        return () => unsubscribe();
    }, [loadScavenges]);

    const handleSaveScavenge = async () => {
        if (!scavengeTitle.trim()) return;
        const poolToSave: ScavengePool = editingScavenge 
            ? { ...editingScavenge, title: scavengeTitle } 
            : { id: `scavenge-${Date.now()}`, title: scavengeTitle, items: [] };
            
        await updateRoomMetadataItem(SCAVENGE_BASE_KEY, poolToSave);
        setOpenScavengeModal(false); setEditingScavenge(null); setScavengeTitle("");
    };

    const deleteScavenge = async (id: string) => {
        await deleteRoomMetadataItem(SCAVENGE_BASE_KEY, id);
    };

    const handleSaveScavengeItem = async () => {
        if (!scavengeItemName.trim() || !targetScavengeId) return;
        const pool = scavenges.find(p => p.id === targetScavengeId);
        if (!pool) return;

        let updatedItems = [...pool.items];
        if (editingScavengeItem) {
            updatedItems = updatedItems.map(item => item.id === editingScavengeItem.id ? { ...item, name: scavengeItemName, description: scavengeItemDesc, price: scavengeItemPrice, weight: scavengeItemWeight, qty: scavengeItemQty, isRepeatable: scavengeItemRepeatable } : item);
        } else {
            updatedItems.push({ id: `s-item-${Date.now()}`, name: scavengeItemName, description: scavengeItemDesc, price: scavengeItemPrice, weight: scavengeItemWeight, qty: scavengeItemQty, isRepeatable: scavengeItemRepeatable });
        }

        await updateRoomMetadataItem(SCAVENGE_BASE_KEY, { ...pool, items: updatedItems });
        setOpenScavengeItemModal(false); setEditingScavengeItem(null); setScavengeItemName(""); setScavengeItemDesc(""); setScavengeItemPrice(""); setScavengeItemWeight(""); setScavengeItemQty(1); setScavengeItemRepeatable(false);
    };

    const updateScavengeItemQty = async (poolId: string, itemId: string, delta: number) => {
        const pool = scavenges.find(p => p.id === poolId);
        if (!pool) return;
        const updatedItems = pool.items.map(item => item.id === itemId ? { ...item, qty: Math.max(0, item.qty + delta) } : item);
        await updateRoomMetadataItem(SCAVENGE_BASE_KEY, { ...pool, items: updatedItems });
    };

    const deleteScavengeItem = async (poolId: string, itemId: string) => {
        const pool = scavenges.find(p => p.id === poolId);
        if (!pool) return;
        const updatedItems = pool.items.filter(i => i.id !== itemId);
        await updateRoomMetadataItem(SCAVENGE_BASE_KEY, { ...pool, items: updatedItems });
    };

    const triggerLootDrop = async (poolTitle: string, poolId: string, item: ScavengeItem) => {
        // Broadcast to all players
        OBR.broadcast.sendMessage(LOOT_DROP_CHANNEL, { pool: poolTitle, item: item.name }, { destination: "REMOTE" });
        OBR.notification.show(`發送成功：${item.name}`, "SUCCESS");

        // Write to history log
        const historyItem: ScavengedHistoryItem = { id: `hist-${Date.now()}-${Math.random()}`, source: poolTitle, item: item, timestamp: Date.now() };
        await updateRoomMetadataItem(HISTORY_BASE_KEY, historyItem);

        // Deduct quantity if not repeatable
        if (!item.isRepeatable) {
            await updateScavengeItemQty(poolId, item.id, -1);
        }
    };

    const rollRandomScavenge = async (pool: ScavengePool) => {
        const availableItems = pool.items.filter(i => i.isRepeatable || i.qty > 0);
        if (availableItems.length === 0) {
            OBR.notification.show("此清單已無可用物品", "WARNING");
            return;
        }
        const rolledItem = availableItems[Math.floor(Math.random() * availableItems.length)];
        await triggerLootDrop(pool.title, pool.id, rolledItem);
    };

    const clearScavengeHistory = async () => {
        if (window.confirm("確定要清空隊伍背包嗎？")) {
            const historyItems = await getMergedRoomArray<ScavengedHistoryItem>(HISTORY_BASE_KEY);
            for (const item of historyItems) {
                await deleteRoomMetadataItem(HISTORY_BASE_KEY, item.id);
            }
            OBR.notification.show("已清空隊伍背包", "SUCCESS");
        }
    };

    return (
        <div className="flex flex-col w-full">
            <div className="flex justify-end gap-2 mb-2">
                <Button variant="outline" className="flex items-center gap-1 border-red-500 text-red-500 hover:bg-red-500/10 rounded-lg h-8 text-sm font-bold" onClick={clearScavengeHistory}>
                    <FaTrash /> 清空背包
                </Button>
                <Button className="flex items-center gap-1 bg-amber-500 text-amber-950 hover:bg-amber-600 rounded-lg h-8 text-sm font-bold" onClick={() => { setEditingScavenge(null); setScavengeTitle(""); setOpenScavengeModal(true); }}>
                    <FaPlus /> 新增掉落表
                </Button>
            </div>

            {scavenges.length === 0 && <p className="text-mirage-500 text-center mt-4">尚無搜刮掉落表。</p>}
            
            {scavenges.map((pool) => (
                <details key={pool.id} className="bg-white dark:bg-mirage-950 rounded-xl border border-amber-500/40 overflow-hidden group mb-2">
                    <summary className="font-bold p-3 cursor-pointer select-none outline-none flex justify-between items-center text-mirage-800 dark:text-mirage-100">
                        <div className="flex items-center gap-2">
                            <span className="text-amber-500">{pool.title}</span>
                            <span className="text-[10px] bg-amber-500/15 text-amber-500 px-2 py-0.5 rounded-full">{pool.items.length} 項目</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <div className="flex items-center gap-1">
                                <button className="flex items-center justify-center p-1.5 w-8 h-8 bg-amber-500/15 text-amber-500 rounded-lg hover:bg-amber-500/30 transition-colors" onClick={(e) => { e.preventDefault(); rollRandomScavenge(pool); }} title="隨機抽取並廣播給全體玩家"><FaDiceD20 /></button>
                                <button className="flex items-center gap-1 px-2 py-1 text-xs border border-amber-500/50 text-amber-500 rounded-lg hover:bg-amber-500/10" onClick={(e) => { e.preventDefault(); setTargetScavengeId(pool.id); setEditingScavengeItem(null); setScavengeItemName(""); setScavengeItemDesc(""); setScavengeItemPrice(""); setScavengeItemWeight(""); setScavengeItemQty(1); setScavengeItemRepeatable(false); setOpenScavengeItemModal(true); }}><FaPlus /> 加掉落物</button>
                                <button className="p-1.5 text-mirage-400 hover:text-primary" onClick={(e) => { e.preventDefault(); setEditingScavenge(pool); setScavengeTitle(pool.title); setOpenScavengeModal(true); }}><FaPencil /></button>
                                <button className="p-1.5 text-mirage-400 hover:text-red-500" onClick={(e) => { e.preventDefault(); deleteScavenge(pool.id); }}><FaTrash /></button>
                            </div>
                            <FaChevronDown className="text-mirage-400 group-open:rotate-180 transition-transform" />
                        </div>
                    </summary>
                    <div className="p-3 pt-0 border-t border-mirage-100 dark:border-mirage-800 flex flex-col gap-2 mt-2">
                        {pool.items.length === 0 && <p className="text-sm text-mirage-500 italic text-center py-2">無掉落物</p>}
                        {pool.items.map((item) => (
                            <div key={item.id} className={cn("flex justify-between items-center bg-mirage-50 dark:bg-mirage-900 p-2.5 rounded-lg border border-mirage-200 dark:border-mirage-800", (!item.isRepeatable && item.qty === 0) ? "opacity-50" : "opacity-100")}>
                                <div className="flex flex-col">
                                    <div className="flex items-center gap-2">
                                        <span className={cn("font-bold text-sm", (!item.isRepeatable && item.qty === 0) ? "line-through text-mirage-500" : "")}>{item.name}</span>
                                        {item.isRepeatable && <span className="text-amber-500 flex items-center" title="無限掉落"><FaInfinity size={14} /></span>}
                                    </div>
                                    {item.description && <span className="text-xs text-amber-500 mt-1 whitespace-pre-wrap">{item.description}</span>}
                                    <div className="flex gap-3 mt-1.5">
                                        {item.price && <span className="text-xs text-amber-500 font-bold">價值: {item.price}</span>}
                                        {item.weight && <span className="text-xs text-mirage-400">重量: {item.weight}</span>}
                                    </div>
                                </div>
                                <div className="flex items-center gap-3">
                                    {!item.isRepeatable && <span className={cn("font-bold text-sm", item.qty > 0 ? "text-amber-500" : "text-red-500")}>餘: {item.qty}</span>}
                                    <div className="flex items-center gap-1">
                                        <button className="p-1.5 text-primary hover:text-primary-dark transition-colors" title="手動指定掉落此物品" onClick={() => triggerLootDrop(pool.title, pool.id, item)}><FaBullhorn /></button>
                                        {!item.isRepeatable && <button className="p-1.5 text-mirage-400 hover:text-mirage-600 dark:hover:text-white" onClick={() => updateScavengeItemQty(pool.id, item.id, -1)}><FaMinus /></button>}
                                        {!item.isRepeatable && <button className="p-1.5 text-mirage-400 hover:text-mirage-600 dark:hover:text-white" onClick={() => updateScavengeItemQty(pool.id, item.id, 1)}><FaPlus /></button>}
                                        <button className="p-1.5 text-mirage-400 hover:text-red-500" onClick={() => deleteScavengeItem(pool.id, item.id)}><FaTrash /></button>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </details>
            ))}

            <CustomDialog open={openScavengeModal} onOpenChange={setOpenScavengeModal} title={editingScavenge ? "編輯搜刮表" : "新增搜刮掉落表"} onSave={handleSaveScavenge} onCancel={() => setOpenScavengeModal(false)}>
                <CustomInput label="搜刮目標 (例如: 哥布林口袋)" value={scavengeTitle} onChange={(e: any) => setScavengeTitle(e.target.value)} />
            </CustomDialog>

            <CustomDialog open={openScavengeItemModal} onOpenChange={setOpenScavengeItemModal} title={editingScavengeItem ? "編輯掉落物" : "新增掉落物"} onSave={handleSaveScavengeItem} onCancel={() => setOpenScavengeItemModal(false)}>
                <CustomInput label="物品名稱" value={scavengeItemName} onChange={(e: any) => setScavengeItemName(e.target.value)} />
                <CustomInput label="描述 (給 GM 看的備註 或 玩家抽中時顯示的資訊)" value={scavengeItemDesc} onChange={(e: any) => setScavengeItemDesc(e.target.value)} multiline rows={2} />
                <div className="grid grid-cols-2 gap-2">
                    <CustomInput label="價值 (例: 10gp)" value={scavengeItemPrice} onChange={(e: any) => setScavengeItemPrice(e.target.value)} />
                    <CustomInput label="重量 (例: 5磅)" value={scavengeItemWeight} onChange={(e: any) => setScavengeItemWeight(e.target.value)} />
                </div>
                <div className="grid grid-cols-2 gap-4 items-end mt-2">
                    <CustomInput label="可掉落次數" type="number" disabled={scavengeItemRepeatable} value={scavengeItemQty} onChange={(e: any) => setScavengeItemQty(parseInt(e.target.value) || 0)} />
                    <label className="flex items-center gap-2 cursor-pointer text-sm font-bold text-amber-500 mb-2.5">
                        <input type="checkbox" checked={scavengeItemRepeatable} onChange={(e) => setScavengeItemRepeatable(e.target.checked)} className="w-5 h-5 rounded text-amber-500 focus:ring-amber-500 accent-amber-500" />
                        無限掉落
                    </label>
                </div>
            </CustomDialog>
        </div>
    );
}