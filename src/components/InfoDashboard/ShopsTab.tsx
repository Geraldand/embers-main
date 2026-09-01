// src/components/InfoDashboard/ShopsTab.tsx
import { useCallback, useEffect, useState } from "react";
import OBR from "@owlbear-rodeo/sdk";
import { FaChevronDown, FaEye, FaEyeSlash, FaMinus, FaPencil, FaPlus, FaTrash } from "react-icons/fa6";
import * as Dialog from "@radix-ui/react-dialog";
import { cn } from "../../lib/utils";
import { Button } from "../ui/button";
import { getMergedRoomArray, updateRoomMetadataItem, deleteRoomMetadataItem } from "../../lib/metadataHelpers";

export const SHOP_BASE_KEY = `shop`;

export interface ShopItem { id: string; name: string; description?: string; price: string; weight?: string; qty: number; }
export interface Shop { id: string; name: string; description?: string; visible: boolean; items: ShopItem[]; }

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

export default function ShopsTab({ isGM }: { isGM: boolean }) {
    const [shops, setShops] = useState<Shop[]>([]);
    
    // Shop Modals
    const [openShopModal, setOpenShopModal] = useState(false);
    const [editingShop, setEditingShop] = useState<Shop | null>(null);
    const [shopName, setShopName] = useState("");
    const [shopDescription, setShopDescription] = useState("");

    // Item Modals
    const [openItemModal, setOpenItemModal] = useState(false);
    const [targetShopId, setTargetShopId] = useState<string>("");
    const [editingItem, setEditingItem] = useState<ShopItem | null>(null);
    const [itemName, setItemName] = useState("");
    const [itemDesc, setItemDesc] = useState("");
    const [itemPrice, setItemPrice] = useState("");
    const [itemWeight, setItemWeight] = useState("");
    const [itemQty, setItemQty] = useState(1);

    const loadShops = useCallback(async () => {
        const loadedShops = await getMergedRoomArray<Shop>(SHOP_BASE_KEY);
        setShops(loadedShops);
    }, []);

    useEffect(() => {
        loadShops();
        const unsubscribe = OBR.room.onMetadataChange(() => loadShops());
        return () => unsubscribe();
    }, [loadShops]);

    const handleSaveShop = async () => {
        if (!shopName.trim()) return;
        const shopToSave: Shop = editingShop 
            ? { ...editingShop, name: shopName, description: shopDescription } 
            : { id: `shop-${Date.now()}`, name: shopName, description: shopDescription, visible: true, items: [] };
            
        await updateRoomMetadataItem(SHOP_BASE_KEY, shopToSave);
        setOpenShopModal(false); setEditingShop(null); setShopName(""); setShopDescription("");
    };

    const toggleShopVisibility = async (shop: Shop) => {
        await updateRoomMetadataItem(SHOP_BASE_KEY, { ...shop, visible: !shop.visible });
    };

    const deleteShop = async (id: string) => {
        await deleteRoomMetadataItem(SHOP_BASE_KEY, id);
    };

    const handleSaveItem = async () => {
        if (!itemName.trim() || !targetShopId) return;
        const shop = shops.find(s => s.id === targetShopId);
        if (!shop) return;

        let updatedItems = [...shop.items];
        if (editingItem) {
            updatedItems = updatedItems.map(item => item.id === editingItem.id ? { ...item, name: itemName, description: itemDesc, price: itemPrice, weight: itemWeight, qty: itemQty } : item);
        } else {
            updatedItems.push({ id: `item-${Date.now()}`, name: itemName, description: itemDesc, price: itemPrice, weight: itemWeight, qty: itemQty });
        }

        await updateRoomMetadataItem(SHOP_BASE_KEY, { ...shop, items: updatedItems });
        setOpenItemModal(false); setEditingItem(null); setItemName(""); setItemDesc(""); setItemPrice(""); setItemWeight(""); setItemQty(1);
    };

    const updateItemQty = async (shopId: string, itemId: string, delta: number) => {
        const shop = shops.find(s => s.id === shopId);
        if (!shop) return;
        const updatedItems = shop.items.map(item => item.id === itemId ? { ...item, qty: Math.max(0, item.qty + delta) } : item);
        await updateRoomMetadataItem(SHOP_BASE_KEY, { ...shop, items: updatedItems });
    };

    const deleteItem = async (shopId: string, itemId: string) => {
        const shop = shops.find(s => s.id === shopId);
        if (!shop) return;
        const updatedItems = shop.items.filter(i => i.id !== itemId);
        await updateRoomMetadataItem(SHOP_BASE_KEY, { ...shop, items: updatedItems });
    };

    const visibleShops = isGM ? shops : shops.filter((s) => s.visible);

    return (
        <div className="flex flex-col w-full">
            {isGM && (
                <div className="flex justify-end mb-2">
                    <Button className="flex items-center gap-1 bg-primary text-mirage-950 hover:bg-primary-dark rounded-lg h-8 text-sm font-bold" onClick={() => { setEditingShop(null); setShopName(""); setShopDescription(""); setOpenShopModal(true); }}>
                        <FaPlus /> 新增商店
                    </Button>
                </div>
            )}

            {visibleShops.length === 0 && <p className="text-mirage-500 text-center mt-4">尚無商店。</p>}
            
            {visibleShops.map((shop) => (
                <details key={shop.id} className={cn("bg-white dark:bg-mirage-950 rounded-xl border overflow-hidden group mb-2 transition-opacity", shop.visible ? "border-emerald-500/40" : "border-mirage-200 dark:border-mirage-800", !shop.visible && isGM ? "opacity-60" : "opacity-100")}>
                    <summary className="font-bold p-3 cursor-pointer select-none outline-none flex justify-between items-center text-mirage-800 dark:text-mirage-100">
                        <div className="flex flex-col">
                            <div className="flex items-center gap-2">
                                <span className="text-emerald-500">{shop.name}</span>
                                <span className="text-[10px] bg-emerald-500/15 text-emerald-500 px-2 py-0.5 rounded-full">{shop.items.length} 項目</span>
                            </div>
                            {shop.description && <span className="text-xs text-mirage-400 font-normal mt-1">{shop.description}</span>}
                        </div>
                        <div className="flex items-center gap-2">
                            {isGM && (
                                <div className="flex items-center gap-1">
                                    <button className="p-1.5 text-mirage-400 hover:text-mirage-600 dark:hover:text-white" onClick={(e) => { e.preventDefault(); toggleShopVisibility(shop); }}>{shop.visible ? <FaEye /> : <FaEyeSlash />}</button>
                                    <button className="flex items-center gap-1 px-2 py-1 text-xs border border-emerald-500/50 text-emerald-500 rounded-lg hover:bg-emerald-500/10" onClick={(e) => { e.preventDefault(); setTargetShopId(shop.id); setEditingItem(null); setItemName(""); setItemDesc(""); setItemPrice(""); setItemWeight(""); setItemQty(1); setOpenItemModal(true); }}><FaPlus /> 加商品</button>
                                    <button className="p-1.5 text-mirage-400 hover:text-primary" onClick={(e) => { e.preventDefault(); setEditingShop(shop); setShopName(shop.name); setShopDescription(shop.description || ""); setOpenShopModal(true); }}><FaPencil /></button>
                                    <button className="p-1.5 text-mirage-400 hover:text-red-500" onClick={(e) => { e.preventDefault(); deleteShop(shop.id); }}><FaTrash /></button>
                                </div>
                            )}
                            <FaChevronDown className="text-mirage-400 group-open:rotate-180 transition-transform" />
                        </div>
                    </summary>
                    <div className="p-3 pt-0 border-t border-mirage-100 dark:border-mirage-800 flex flex-col gap-2 mt-2">
                        {shop.items.length === 0 && <p className="text-sm text-mirage-500 italic text-center py-2">商店內無物品</p>}
                        {shop.items.map((item) => (
                            <div key={item.id} className={cn("flex justify-between items-center bg-mirage-50 dark:bg-mirage-900 p-2.5 rounded-lg border border-mirage-200 dark:border-mirage-800", item.qty === 0 ? "opacity-50" : "opacity-100")}>
                                <div className="flex flex-col">
                                    <span className={cn("font-bold text-sm", item.qty === 0 ? "line-through" : "")}>{item.name}</span>
                                    {item.description && <span className="text-xs text-mirage-500 mt-1">{item.description}</span>}
                                    <div className="flex gap-3 mt-1.5">
                                        {item.price && <span className="text-xs text-amber-500 font-bold">價值: {item.price}</span>}
                                        {item.weight && <span className="text-xs text-mirage-400">重量: {item.weight}</span>}
                                    </div>
                                </div>
                                <div className="flex items-center gap-3">
                                    <span className={cn("font-bold text-sm", item.qty > 0 ? "text-emerald-500" : "text-red-500")}>數量: {item.qty}</span>
                                    {isGM && (
                                        <div className="flex items-center gap-1">
                                            <button className="p-1.5 text-mirage-400 hover:text-mirage-600 dark:hover:text-white" onClick={() => updateItemQty(shop.id, item.id, -1)}><FaMinus /></button>
                                            <button className="p-1.5 text-mirage-400 hover:text-mirage-600 dark:hover:text-white" onClick={() => updateItemQty(shop.id, item.id, 1)}><FaPlus /></button>
                                            <button className="p-1.5 text-mirage-400 hover:text-red-500" onClick={() => deleteItem(shop.id, item.id)}><FaTrash /></button>
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                </details>
            ))}

            <CustomDialog open={openShopModal} onOpenChange={setOpenShopModal} title={editingShop ? "編輯商店" : "新增商店"} onSave={handleSaveShop} onCancel={() => setOpenShopModal(false)}>
                <CustomInput label="商店名稱" value={shopName} onChange={(e: any) => setShopName(e.target.value)} />
                <CustomInput label="簡介 / 描述字詞" value={shopDescription} onChange={(e: any) => setShopDescription(e.target.value)} />
            </CustomDialog>

            <CustomDialog open={openItemModal} onOpenChange={setOpenItemModal} title={editingItem ? "編輯商品" : "新增商品"} onSave={handleSaveItem} onCancel={() => setOpenItemModal(false)}>
                <CustomInput label="商品名稱" value={itemName} onChange={(e: any) => setItemName(e.target.value)} />
                <CustomInput label="詳細描述 (選填)" value={itemDesc} onChange={(e: any) => setItemDesc(e.target.value)} multiline rows={2} />
                <div className="grid grid-cols-2 gap-2">
                    <CustomInput label="價格 (例: 50gp)" value={itemPrice} onChange={(e: any) => setItemPrice(e.target.value)} />
                    <CustomInput label="重量 (例: 2磅)" value={itemWeight} onChange={(e: any) => setItemWeight(e.target.value)} />
                </div>
                <CustomInput label="初始數量" type="number" value={itemQty} onChange={(e: any) => setItemQty(parseInt(e.target.value) || 0)} />
            </CustomDialog>
        </div>
    );
}