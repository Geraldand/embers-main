// src/components/InfoDashboard/LootPoolsTab.tsx
import { useCallback, useEffect, useState } from "react";
import OBR from "@owlbear-rodeo/sdk";
import { FaChevronDown, FaEye, FaEyeSlash, FaMinus, FaPencil, FaPlus, FaTrash } from "react-icons/fa6";
import * as Dialog from "@radix-ui/react-dialog";
import { cn } from "../../lib/utils";
import { Button } from "../ui/button";
import { getMergedRoomArray, updateRoomMetadataItem, deleteRoomMetadataItem } from "../../lib/metadataHelpers";

export const LOOTPOOL_BASE_KEY = `lootpool`;

export interface LootItem { id: string; name: string; description: string; price?: string; weight?: string; qty: number; }
export interface LootPool { id: string; title: string; visible: boolean; items: LootItem[]; }

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

const CustomInput = ({ label, value, onChange, multiline = false, rows = 3, type = "text" }: any) => (
    <div className="flex flex-col">
        <label className="text-xs font-bold text-mirage-500 mb-1">{label}</label>
        {multiline ? (
            <textarea rows={rows} value={value} onChange={onChange} className="w-full bg-white dark:bg-mirage-950 border border-mirage-200 dark:border-mirage-800 text-mirage-900 dark:text-white placeholder-mirage-400 rounded-xl px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary shadow-sm resize-none" />
        ) : (
            <input type={type} value={value} onChange={onChange} className="w-full bg-white dark:bg-mirage-950 border border-mirage-200 dark:border-mirage-800 text-mirage-900 dark:text-white placeholder-mirage-400 rounded-xl px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary shadow-sm" />
        )}
    </div>
);

export default function LootPoolsTab({ isGM }: { isGM: boolean }) {
    const [lootPools, setLootPools] = useState<LootPool[]>([]);
    
    // Pool Modals
    const [openLootPoolModal, setOpenLootPoolModal] = useState(false);
    const [editingLootPool, setEditingLootPool] = useState<LootPool | null>(null);
    const [lootPoolTitle, setLootPoolTitle] = useState("");

    // Item Modals
    const [openLootItemModal, setOpenLootItemModal] = useState(false);
    const [targetLootPoolId, setTargetLootPoolId] = useState<string>("");
    const [editingLootItem, setEditingLootItem] = useState<LootItem | null>(null);
    const [lootItemName, setLootItemName] = useState("");
    const [lootItemDesc, setLootItemDesc] = useState("");
    const [lootItemPrice, setLootItemPrice] = useState("");
    const [lootItemWeight, setLootItemWeight] = useState("");
    const [lootItemQty, setLootItemQty] = useState(1);

    const loadLootPools = useCallback(async () => {
        const loadedPools = await getMergedRoomArray<LootPool>(LOOTPOOL_BASE_KEY);
        setLootPools(loadedPools);
    }, []);

    useEffect(() => {
        loadLootPools();
        const unsubscribe = OBR.room.onMetadataChange(() => loadLootPools());
        return () => unsubscribe();
    }, [loadLootPools]);

    const handleSaveLootPool = async () => {
        if (!lootPoolTitle.trim()) return;
        const poolToSave: LootPool = editingLootPool 
            ? { ...editingLootPool, title: lootPoolTitle } 
            : { id: `lootpool-${Date.now()}`, title: lootPoolTitle, visible: true, items: [] };
            
        await updateRoomMetadataItem(LOOTPOOL_BASE_KEY, poolToSave);
        setOpenLootPoolModal(false); setEditingLootPool(null); setLootPoolTitle("");
    };

    const toggleLootPoolVisibility = async (pool: LootPool) => {
        await updateRoomMetadataItem(LOOTPOOL_BASE_KEY, { ...pool, visible: !pool.visible });
    };

    const deleteLootPool = async (id: string) => {
        await deleteRoomMetadataItem(LOOTPOOL_BASE_KEY, id);
    };

    const handleSaveLootItem = async () => {
        if (!lootItemName.trim() || !targetLootPoolId) return;
        const pool = lootPools.find(p => p.id === targetLootPoolId);
        if (!pool) return;

        let updatedItems = [...pool.items];
        if (editingLootItem) {
            updatedItems = updatedItems.map(item => item.id === editingLootItem.id ? { ...item, name: lootItemName, description: lootItemDesc, price: lootItemPrice, weight: lootItemWeight, qty: lootItemQty } : item);
        } else {
            updatedItems.push({ id: `lootitem-${Date.now()}`, name: lootItemName, description: lootItemDesc, price: lootItemPrice, weight: lootItemWeight, qty: lootItemQty });
        }

        await updateRoomMetadataItem(LOOTPOOL_BASE_KEY, { ...pool, items: updatedItems });
        setOpenLootItemModal(false); setEditingLootItem(null); setLootItemName(""); setLootItemDesc(""); setLootItemPrice(""); setLootItemWeight(""); setLootItemQty(1);
    };

    const updateLootItemQty = async (poolId: string, itemId: string, delta: number) => {
        const pool = lootPools.find(p => p.id === poolId);
        if (!pool) return;
        const updatedItems = pool.items.map(item => item.id === itemId ? { ...item, qty: Math.max(0, item.qty + delta) } : item);
        await updateRoomMetadataItem(LOOTPOOL_BASE_KEY, { ...pool, items: updatedItems });
    };

    const deleteLootItem = async (poolId: string, itemId: string) => {
        const pool = lootPools.find(p => p.id === poolId);
        if (!pool) return;
        const updatedItems = pool.items.filter(i => i.id !== itemId);
        await updateRoomMetadataItem(LOOTPOOL_BASE_KEY, { ...pool, items: updatedItems });
    };

    const visibleLootPools = isGM ? lootPools : lootPools.filter((p) => p.visible);

    return (
        <div className="flex flex-col w-full">
            {isGM && (
                <div className="flex justify-end mb-2">
                    <Button className="flex items-center gap-1 bg-primary text-mirage-950 hover:bg-primary-dark rounded-lg h-8 text-sm font-bold" onClick={() => { setEditingLootPool(null); setLootPoolTitle(""); setOpenLootPoolModal(true); }}>
                        <FaPlus /> 新增戰利品
                    </Button>
                </div>
            )}

            {visibleLootPools.length === 0 && <p className="text-mirage-500 text-center mt-4">尚無戰利品池。</p>}
            
            {visibleLootPools.map((pool) => (
                <details key={pool.id} className={cn("bg-white dark:bg-mirage-950 rounded-xl border overflow-hidden group mb-2 transition-opacity", pool.visible ? "border-purple-500/40" : "border-mirage-200 dark:border-mirage-800", !pool.visible && isGM ? "opacity-60" : "opacity-100")}>
                    <summary className="font-bold p-3 cursor-pointer select-none outline-none flex justify-between items-center text-mirage-800 dark:text-mirage-100">
                        <div className="flex items-center gap-2">
                            <span className="text-purple-500">{pool.title}</span>
                            <span className="text-[10px] bg-purple-500/15 text-purple-500 px-2 py-0.5 rounded-full">{pool.items.length} 件</span>
                        </div>
                        <div className="flex items-center gap-2">
                            {isGM && (
                                <div className="flex items-center gap-1">
                                    <button className="p-1.5 text-mirage-400 hover:text-mirage-600 dark:hover:text-white" onClick={(e) => { e.preventDefault(); toggleLootPoolVisibility(pool); }}>{pool.visible ? <FaEye /> : <FaEyeSlash />}</button>
                                    <button className="flex items-center gap-1 px-2 py-1 text-xs border border-purple-500/50 text-purple-500 rounded-lg hover:bg-purple-500/10" onClick={(e) => { e.preventDefault(); setTargetLootPoolId(pool.id); setEditingLootItem(null); setLootItemName(""); setLootItemDesc(""); setLootItemPrice(""); setLootItemWeight(""); setLootItemQty(1); setOpenLootItemModal(true); }}><FaPlus /> 加戰利品</button>
                                    <button className="p-1.5 text-mirage-400 hover:text-primary" onClick={(e) => { e.preventDefault(); setEditingLootPool(pool); setLootPoolTitle(pool.title); setOpenLootPoolModal(true); }}><FaPencil /></button>
                                    <button className="p-1.5 text-mirage-400 hover:text-red-500" onClick={(e) => { e.preventDefault(); deleteLootPool(pool.id); }}><FaTrash /></button>
                                </div>
                            )}
                            <FaChevronDown className="text-mirage-400 group-open:rotate-180 transition-transform" />
                        </div>
                    </summary>
                    <div className="p-3 pt-0 border-t border-mirage-100 dark:border-mirage-800 flex flex-col gap-2 mt-2">
                        {pool.items.length === 0 && <p className="text-sm text-mirage-500 italic text-center py-2">池子裡空空如也</p>}
                        {pool.items.map((item) => (
                            <div key={item.id} className={cn("flex justify-between items-center bg-mirage-50 dark:bg-mirage-900 p-2.5 rounded-lg border border-mirage-200 dark:border-mirage-800", item.qty === 0 ? "opacity-50" : "opacity-100")}>
                                <div className="flex flex-col">
                                    <span className={cn("font-bold text-sm", item.qty === 0 ? "line-through text-mirage-500" : "")}>{item.name}</span>
                                    {item.description && <span className="text-xs text-purple-400 mt-1">{item.description}</span>}
                                    <div className="flex gap-3 mt-1.5">
                                        {item.price && <span className="text-xs text-amber-500 font-bold">價值: {item.price}</span>}
                                        {item.weight && <span className="text-xs text-mirage-400">重量: {item.weight}</span>}
                                    </div>
                                </div>
                                <div className="flex items-center gap-3">
                                    <span className={cn("font-bold text-sm", item.qty > 0 ? "text-purple-500" : "text-red-500")}>數量: {item.qty}</span>
                                    {isGM && (
                                        <div className="flex items-center gap-1">
                                            <button className="p-1.5 text-mirage-400 hover:text-mirage-600 dark:hover:text-white" onClick={() => updateLootItemQty(pool.id, item.id, -1)}><FaMinus /></button>
                                            <button className="p-1.5 text-mirage-400 hover:text-mirage-600 dark:hover:text-white" onClick={() => updateLootItemQty(pool.id, item.id, 1)}><FaPlus /></button>
                                            <button className="p-1.5 text-mirage-400 hover:text-red-500" onClick={() => deleteLootItem(pool.id, item.id)}><FaTrash /></button>
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                </details>
            ))}

            <CustomDialog open={openLootPoolModal} onOpenChange={setOpenLootPoolModal} title={editingLootPool ? "編輯戰利品池" : "新增戰利品池"} onSave={handleSaveLootPool} onCancel={() => setOpenLootPoolModal(false)}>
                <CustomInput label="掉落來源 (例如: 龍穴寶藏)" value={lootPoolTitle} onChange={(e: any) => setLootPoolTitle(e.target.value)} />
            </CustomDialog>

            <CustomDialog open={openLootItemModal} onOpenChange={setOpenLootItemModal} title={editingLootItem ? "編輯戰利品" : "新增區域戰利品"} onSave={handleSaveLootItem} onCancel={() => setOpenLootItemModal(false)}>
                <CustomInput label="物品名稱" value={lootItemName} onChange={(e: any) => setLootItemName(e.target.value)} />
                <CustomInput label="描述 (屬性效果 / 或標記分配給誰)" value={lootItemDesc} onChange={(e: any) => setLootItemDesc(e.target.value)} multiline rows={2} />
                <div className="grid grid-cols-2 gap-2">
                    <CustomInput label="價值 (例: 10gp)" value={lootItemPrice} onChange={(e: any) => setLootItemPrice(e.target.value)} />
                    <CustomInput label="重量 (例: 5磅)" value={lootItemWeight} onChange={(e: any) => setLootItemWeight(e.target.value)} />
                </div>
                <CustomInput label="數量" type="number" value={lootItemQty} onChange={(e: any) => setLootItemQty(parseInt(e.target.value) || 0)} />
            </CustomDialog>
        </div>
    );
}