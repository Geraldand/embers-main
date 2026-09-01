// src/components/InfoDashboard/HandoutsTab.tsx
import { useCallback, useEffect, useState } from "react";
import OBR from "@owlbear-rodeo/sdk";
import { FaChevronDown, FaEye, FaEyeSlash, FaPencil, FaPlus, FaTrash } from "react-icons/fa6";
import * as Dialog from "@radix-ui/react-dialog";
import { cn } from "../../lib/utils";
import { Button } from "../ui/button";
import { getMergedRoomArray, updateRoomMetadataItem, deleteRoomMetadataItem } from "../../lib/metadataHelpers";

export const HANDOUT_BASE_KEY = `handout`;

export interface Handout {
    id: string;
    title: string;
    description?: string;
    content: string;
    visible: boolean;
    revealedSecrets?: number[];
}

// Dialog Component
const CustomDialog = ({ open, onOpenChange, title, children, onSave, onCancel, saveText = "儲存" }: any) => (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
        <Dialog.Portal>
            <Dialog.Overlay className="fixed inset-0 bg-mirage-950/60 backdrop-blur-sm z-40 animate-in fade-in" />
            <Dialog.Content className="fixed top-[50%] left-[50%] max-h-[85vh] w-[90vw] max-w-[400px] translate-x-[-50%] translate-y-[-50%] rounded-2xl bg-mirage-50 dark:bg-mirage-900 p-6 shadow-2xl z-50 flex flex-col outline-none animate-in zoom-in-95">
                <Dialog.Title className="text-lg font-bold border-b border-mirage-200 dark:border-mirage-800 pb-2 mb-4 text-mirage-900 dark:text-mirage-50">
                    {title}
                </Dialog.Title>
                <div className="overflow-y-auto no-scrollbar flex-grow flex flex-col gap-3">
                    {children}
                </div>
                <div className="mt-6 flex justify-end gap-2">
                    <Button variant="ghost" onClick={onCancel}>取消</Button>
                    <Button variant="default" className="bg-primary text-mirage-950 hover:bg-primary-dark" onClick={onSave}>{saveText}</Button>
                </div>
            </Dialog.Content>
        </Dialog.Portal>
    </Dialog.Root>
);

// Input Component
const CustomInput = ({ label, value, onChange, multiline = false, rows = 3, note }: any) => (
    <div className="flex flex-col">
        <label className="text-xs font-bold text-mirage-500 mb-1">{label}</label>
        {multiline ? (
            <textarea rows={rows} value={value} onChange={onChange} className="w-full bg-white dark:bg-mirage-950 border border-mirage-200 dark:border-mirage-800 text-mirage-900 dark:text-white placeholder-mirage-400 rounded-xl px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary shadow-sm resize-none" />
        ) : (
            <input type="text" value={value} onChange={onChange} className="w-full bg-white dark:bg-mirage-950 border border-mirage-200 dark:border-mirage-800 text-mirage-900 dark:text-white placeholder-mirage-400 rounded-xl px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary shadow-sm" />
        )}
        {note && <span className="text-[10px] text-mirage-400 mt-1">{note}</span>}
    </div>
);

export default function HandoutsTab({ isGM }: { isGM: boolean }) {
    const [handouts, setHandouts] = useState<Handout[]>([]);
    const [openHandoutModal, setOpenHandoutModal] = useState(false);
    const [editingHandout, setEditingHandout] = useState<Handout | null>(null);
    const [handoutTitle, setHandoutTitle] = useState("");
    const [handoutDescription, setHandoutDescription] = useState("");
    const [handoutContent, setHandoutContent] = useState("");

    const loadHandouts = useCallback(async () => {
        const loadedHandouts = await getMergedRoomArray<Handout>(HANDOUT_BASE_KEY);
        setHandouts(loadedHandouts);
    }, []);

    useEffect(() => {
        loadHandouts();
        const unsubscribe = OBR.room.onMetadataChange(() => {
            loadHandouts();
        });
        return () => unsubscribe();
    }, [loadHandouts]);

    const handleSaveHandout = async () => {
        if (!handoutTitle.trim()) return;
        const handoutToSave: Handout = editingHandout
            ? { ...editingHandout, title: handoutTitle, description: handoutDescription, content: handoutContent }
            : { id: `handout-${Date.now()}`, title: handoutTitle, description: handoutDescription, content: handoutContent, visible: true, revealedSecrets: [] };

        await updateRoomMetadataItem(HANDOUT_BASE_KEY, handoutToSave);

        setOpenHandoutModal(false);
        setEditingHandout(null);
        setHandoutTitle("");
        setHandoutDescription("");
        setHandoutContent("");
    };

    const toggleHandoutVisibility = async (handout: Handout) => {
        await updateRoomMetadataItem(HANDOUT_BASE_KEY, { ...handout, visible: !handout.visible });
    };

    const deleteHandout = async (id: string) => {
        await deleteRoomMetadataItem(HANDOUT_BASE_KEY, id);
    };

    const toggleSecretReveal = async (handout: Handout, secretIndex: number) => {
        const rev = handout.revealedSecrets || [];
        const newRevealedSecrets = rev.includes(secretIndex) 
            ? rev.filter((i) => i !== secretIndex) 
            : [...rev, secretIndex];
            
        await updateRoomMetadataItem(HANDOUT_BASE_KEY, { ...handout, revealedSecrets: newRevealedSecrets });
    };

    const renderHandoutContent = (handout: Handout) => {
        const parts = handout.content.split(/\[([^|]+)\|([^\]]+)\]/g);
        if (parts.length === 1) return handout.content;
        
        const elements: React.ReactNode[] = [];
        elements.push(<span key={`text-0`}>{parts[0]}</span>);
        
        for (let i = 1; i < parts.length; i += 3) {
            const condition = parts[i].trim(); 
            const secret = parts[i + 1].trim(); 
            const nextText = parts[i + 2]; 
            const secretIndex = (i - 1) / 3;
            const isRevealed = handout.revealedSecrets?.includes(secretIndex) || false;
            
            elements.push(
                <span 
                    key={`secret-${secretIndex}`} 
                    onClick={isGM ? () => toggleSecretReveal(handout, secretIndex) : undefined} 
                    className={cn(
                        "inline px-2 py-1 mx-1 rounded-md transition-all", 
                        isRevealed ? "bg-emerald-500/15 border border-emerald-500/40" : "bg-black/30 border border-mirage-600", 
                        isGM ? "cursor-pointer" : "cursor-default"
                    )} 
                    title={isGM ? (isRevealed ? "點擊隱藏此段落" : "點擊解鎖給玩家看") : undefined}
                >
                    {!isRevealed && condition && <span className="text-amber-400 font-bold text-xs mr-1">[{condition}]</span>}
                    {!isRevealed && !condition && <span className="text-amber-400 font-bold text-xs mr-1">[ 隱藏資訊 ]</span>}
                    <span className={cn("text-sm", !isRevealed && !isGM ? "blur-[4px] opacity-50 select-none" : isRevealed ? "text-emerald-400" : (isGM && !isRevealed ? "text-mirage-400" : "inherit"))}>
                        {secret}
                    </span>
                    {isGM && <span className="ml-1 inline-block align-middle mt-[-2px]">{isRevealed ? <FaEye className="text-emerald-500 text-xs" /> : <FaEyeSlash className="text-amber-400 text-xs" />}</span>}
                </span>
            );
            if (nextText) elements.push(<span key={`text-${i}`}>{nextText}</span>);
        }
        return elements;
    };

    const visibleHandouts = isGM ? handouts : handouts.filter((h) => h.visible);

    return (
        <div className="flex flex-col w-full">
            {isGM && (
                <div className="flex justify-end mb-2">
                    <Button 
                        className="flex items-center gap-1 bg-primary text-mirage-950 hover:bg-primary-dark rounded-lg h-8 text-sm font-bold"
                        onClick={() => { setEditingHandout(null); setHandoutTitle(""); setHandoutDescription(""); setHandoutContent(""); setOpenHandoutModal(true); }}
                    >
                        <FaPlus /> 新增手記
                    </Button>
                </div>
            )}
            
            {visibleHandouts.length === 0 && <p className="text-mirage-500 text-center mt-4">尚無故事手記。</p>}
            
            {visibleHandouts.map((handout) => (
                <details key={handout.id} className={cn("bg-white dark:bg-mirage-950 rounded-xl border overflow-hidden group mb-2 transition-opacity", handout.visible ? "border-primary/40" : "border-mirage-200 dark:border-mirage-800", !handout.visible && isGM ? "opacity-60" : "opacity-100")}>
                    <summary className="font-bold p-3 cursor-pointer select-none outline-none flex justify-between items-center text-mirage-800 dark:text-mirage-100">
                        <div className="flex flex-col">
                            <span>{handout.title}</span>
                            {handout.description && <span className="text-xs text-mirage-400 font-normal mt-1">{handout.description}</span>}
                        </div>
                        <div className="flex items-center gap-2">
                            {isGM && (
                                <div className="flex items-center gap-1">
                                    <button className="p-1.5 text-mirage-400 hover:text-mirage-600 dark:hover:text-white outline-none" onClick={(e) => { e.preventDefault(); toggleHandoutVisibility(handout); }}>{handout.visible ? <FaEye /> : <FaEyeSlash />}</button>
                                    <button className="p-1.5 text-mirage-400 hover:text-primary outline-none" onClick={(e) => { e.preventDefault(); setEditingHandout(handout); setHandoutTitle(handout.title); setHandoutDescription(handout.description || ""); setHandoutContent(handout.content); setOpenHandoutModal(true); }}><FaPencil /></button>
                                    <button className="p-1.5 text-mirage-400 hover:text-red-500 outline-none" onClick={(e) => { e.preventDefault(); deleteHandout(handout.id); }}><FaTrash /></button>
                                </div>
                            )}
                            <FaChevronDown className="text-mirage-400 group-open:rotate-180 transition-transform" />
                        </div>
                    </summary>
                    <div className="p-4 pt-2 text-sm text-mirage-600 dark:text-mirage-300 border-t border-mirage-100 dark:border-mirage-800 whitespace-pre-wrap leading-relaxed">
                        {renderHandoutContent(handout)}
                    </div>
                </details>
            ))}

            <CustomDialog open={openHandoutModal} onOpenChange={setOpenHandoutModal} title={editingHandout ? "編輯手記" : "新增故事手記"} onSave={handleSaveHandout} onCancel={() => setOpenHandoutModal(false)}>
                <CustomInput label="標題" value={handoutTitle} onChange={(e: any) => setHandoutTitle(e.target.value)} />
                <CustomInput label="簡介 / 描述字詞 (顯示於標題下方)" value={handoutDescription} onChange={(e: any) => setHandoutDescription(e.target.value)} />
                <CustomInput label="手記內容" value={handoutContent} onChange={(e: any) => setHandoutContent(e.target.value)} multiline rows={6} note="小提示：你可以使用 [解密條件 | 隱藏內容] 的格式來建立動態解密文本。" />
            </CustomDialog>
        </div>
    );
}