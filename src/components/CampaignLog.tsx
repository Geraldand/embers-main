import { useCallback, useEffect, useState } from "react";
import OBR from "@owlbear-rodeo/sdk";
import { FaChevronDown, FaEye, FaEyeSlash, FaPencil, FaPlus, FaTrash } from "react-icons/fa6";
import * as Dialog from "@radix-ui/react-dialog";
import { APP_KEY } from "../config";
import { cn } from "../lib/utils";
import { Button } from "./ui/button";
import { getMergedRoomArray, updateRoomMetadataItem, deleteRoomMetadataItem } from "../lib/metadataHelpers";

export const CAMPAIGN_LOG_BASE_KEY = `campaign-log`;

export interface Recap {
    id: string;
    title: string;
    content: string;
    visible: boolean;
    createdAt: number;
}

// Reusable Radix Dialog Component
const CustomDialog = ({ open, onOpenChange, title, children, onSave, onCancel }: any) => (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
        <Dialog.Portal>
            <Dialog.Overlay className="fixed inset-0 bg-mirage-950/60 backdrop-blur-sm z-40 animate-in fade-in" />
            <Dialog.Content className="fixed top-[50%] left-[50%] max-h-[85vh] w-[90vw] max-w-[500px] translate-x-[-50%] translate-y-[-50%] rounded-2xl bg-mirage-50 dark:bg-mirage-900 p-6 shadow-2xl z-50 flex flex-col outline-none animate-in zoom-in-95">
                <Dialog.Title className="text-lg font-bold border-b border-mirage-200 dark:border-mirage-800 pb-2 mb-4 text-mirage-900 dark:text-mirage-50">
                    {title}
                </Dialog.Title>
                <div className="overflow-y-auto no-scrollbar flex-grow flex flex-col gap-3">
                    {children}
                </div>
                <div className="mt-6 flex justify-end gap-2">
                    <Button variant="ghost" onClick={onCancel}>取消</Button>
                    <Button variant="default" className="bg-primary text-mirage-950 hover:bg-primary-dark" onClick={onSave}>儲存</Button>
                </div>
            </Dialog.Content>
        </Dialog.Portal>
    </Dialog.Root>
);

const CustomInput = ({ label, value, onChange, multiline = false, rows = 3 }: any) => (
    <div className="flex flex-col">
        <label className="text-xs font-bold text-mirage-500 mb-1">{label}</label>
        {multiline ? (
            <textarea rows={rows} value={value} onChange={onChange} className="w-full bg-white dark:bg-mirage-950 border border-mirage-200 dark:border-mirage-800 text-mirage-900 dark:text-white placeholder-mirage-400 rounded-xl px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary shadow-sm resize-none" />
        ) : (
            <input type="text" value={value} onChange={onChange} className="w-full bg-white dark:bg-mirage-950 border border-mirage-200 dark:border-mirage-800 text-mirage-900 dark:text-white placeholder-mirage-400 rounded-xl px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary shadow-sm" />
        )}
    </div>
);

export default function CampaignLog() {
    const [recaps, setRecaps] = useState<Recap[]>([]);
    const [openModal, setOpenModal] = useState(false);
    const [editingRecap, setEditingRecap] = useState<Recap | null>(null);
    const [title, setTitle] = useState("");
    const [content, setContent] = useState("");

    const loadRecaps = useCallback(async () => {
        const loadedRecaps = await getMergedRoomArray<Recap>(CAMPAIGN_LOG_BASE_KEY);
        // 按建立時間降冪排序
        setRecaps(loadedRecaps.sort((a, b) => b.createdAt - a.createdAt));
    }, []);

    useEffect(() => {
        loadRecaps();
        const unsubscribe = OBR.room.onMetadataChange(() => {
            loadRecaps();
        });
        return () => unsubscribe();
    }, [loadRecaps]);

    const handleSave = async () => {
        if (!title.trim()) return;
        const recapToSave: Recap = editingRecap 
            ? { ...editingRecap, title, content } 
            : { id: `recap-${Date.now()}`, title, content, visible: true, createdAt: Date.now() };

        // 寫入單一節點，避免整包陣列傳輸
        await updateRoomMetadataItem(CAMPAIGN_LOG_BASE_KEY, recapToSave);
        
        setOpenModal(false); setEditingRecap(null); setTitle(""); setContent("");
    };

    const toggleVis = async (recap: Recap) => {
        await updateRoomMetadataItem(CAMPAIGN_LOG_BASE_KEY, { ...recap, visible: !recap.visible });
    };

    const deleteRecap = async (id: string) => {
        await deleteRoomMetadataItem(CAMPAIGN_LOG_BASE_KEY, id);
    };

    return (
        <div className="flex flex-col text-mirage-900 dark:text-white h-full">
            <div className="flex justify-between items-center mb-4 pb-2 border-b border-mirage-200 dark:border-mirage-800">
                <span className="text-sm font-bold">團務紀錄與回顧管理</span>
                <Button 
                    className="flex items-center gap-1 bg-primary text-mirage-950 hover:bg-primary-dark rounded-lg h-8"
                    onClick={() => { setEditingRecap(null); setTitle(""); setContent(""); setOpenModal(true); }}
                >
                    <FaPlus /> 新增回顧
                </Button>
            </div>

            <div className="flex-grow flex flex-col gap-2 overflow-y-auto no-scrollbar">
                {recaps.length === 0 && <p className="text-mirage-500 text-center mt-4">尚無故事回顧。</p>}
                {recaps.map((recap) => (
                    <details key={recap.id} className={cn("bg-white dark:bg-mirage-950 rounded-xl border overflow-hidden group transition-opacity", recap.visible ? "border-primary/40" : "border-mirage-200 dark:border-mirage-800", !recap.visible ? "opacity-60" : "opacity-100")}>
                        <summary className="font-bold p-3 cursor-pointer select-none outline-none flex justify-between items-center text-mirage-800 dark:text-mirage-100">
                            <span>{recap.title}</span>
                            <div className="flex items-center gap-2">
                                <div className="flex items-center gap-1">
                                    <button className="p-1.5 text-mirage-400 hover:text-mirage-600 dark:hover:text-white" onClick={(e) => { e.preventDefault(); toggleVis(recap); }}>{recap.visible ? <FaEye /> : <FaEyeSlash />}</button>
                                    <button className="p-1.5 text-mirage-400 hover:text-primary" onClick={(e) => { e.preventDefault(); setEditingRecap(recap); setTitle(recap.title); setContent(recap.content); setOpenModal(true); }}><FaPencil /></button>
                                    <button className="p-1.5 text-mirage-400 hover:text-red-500" onClick={(e) => { e.preventDefault(); deleteRecap(recap.id); }}><FaTrash /></button>
                                </div>
                                <FaChevronDown className="text-mirage-400 group-open:rotate-180 transition-transform" />
                            </div>
                        </summary>
                        <div className="p-4 pt-2 text-sm text-mirage-600 dark:text-mirage-300 border-t border-mirage-100 dark:border-mirage-800 whitespace-pre-wrap leading-relaxed">
                            {recap.content}
                        </div>
                    </details>
                ))}
            </div>

            <CustomDialog open={openModal} onOpenChange={setOpenModal} title={editingRecap ? "編輯故事回顧" : "新增故事回顧"} onSave={handleSave} onCancel={() => setOpenModal(false)}>
                <CustomInput label="標題 (例: 第五次團務回顧)" value={title} onChange={(e: any) => setTitle(e.target.value)} />
                <CustomInput label="回顧內容" value={content} onChange={(e: any) => setContent(e.target.value)} multiline rows={8} />
            </CustomDialog>
        </div>
    );
}