// src/components/InfoDashboard/QuestsTab.tsx
import { useCallback, useEffect, useState } from "react";
import OBR from "@owlbear-rodeo/sdk";
import { FaEye, FaEyeSlash, FaPencil, FaPlus, FaTrash, FaCheck } from "react-icons/fa6";
import * as Dialog from "@radix-ui/react-dialog";
import { cn } from "../../lib/utils";
import { getMergedRoomArray, updateRoomMetadataItem, deleteRoomMetadataItem } from "../../lib/metadataHelpers";
import { useOBR } from "../../react-obr/providers";

export const QUEST_BASE_KEY = `quest`;

export interface Quest {
    id: string;
    title: string;
    description: string;
    isMainQuest: boolean;
    completed: boolean;
    visible: boolean;
}

const CustomDialog = ({ open, onOpenChange, title, children, onSave, onCancel, saveText = "儲存" }: any) => (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
        <Dialog.Portal>
            <Dialog.Overlay className="fixed inset-0 bg-mirage-950/80 backdrop-blur-sm z-40 animate-in fade-in" />
            <Dialog.Content className="fixed top-[50%] left-[50%] max-h-[85vh] w-[90vw] max-w-[420px] translate-x-[-50%] translate-y-[-50%] rounded-3xl bg-mirage-900 p-6 shadow-2xl z-50 flex flex-col outline-none animate-in zoom-in-95 border border-mirage-800">
                <Dialog.Title className="text-lg font-black border-b border-mirage-800 pb-4 mb-5 text-mirage-50 tracking-wide">
                    {title}
                </Dialog.Title>
                <div className="overflow-y-auto no-scrollbar flex-grow flex flex-col gap-4">
                    {children}
                </div>
                <div className="mt-8 flex justify-end gap-3">
                    <button onClick={onCancel} className="px-5 py-2.5 rounded-xl text-sm font-bold text-mirage-400 hover:text-white hover:bg-mirage-800 transition-colors outline-none">取消</button>
                    <button onClick={onSave} className="px-6 py-2.5 rounded-xl text-sm font-bold bg-primary text-mirage-950 hover:bg-primary-dark transition-all outline-none shadow-sm">{saveText}</button>
                </div>
            </Dialog.Content>
        </Dialog.Portal>
    </Dialog.Root>
);

const CustomInput = ({ label, value, onChange, multiline = false, rows = 3 }: any) => (
    <div className="flex flex-col gap-1.5">
        <label className="text-[13px] font-bold text-mirage-400 ml-1">{label}</label>
        {multiline ? (
            <textarea rows={rows} value={value} onChange={onChange} className="w-full bg-mirage-950 border border-mirage-800 text-mirage-50 placeholder-mirage-600 rounded-xl px-4 py-3 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary shadow-inner resize-none transition-colors" />
        ) : (
            <input type="text" value={value} onChange={onChange} className="w-full bg-mirage-950 border border-mirage-800 text-mirage-50 placeholder-mirage-600 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary shadow-inner transition-colors" />
        )}
    </div>
);

function QuestCard({ quest, isGM, onToggleVis, onToggleComp, onEdit, onDelete }: any) {
    return (
        <div className={cn("bg-mirage-900/60 p-4 rounded-2xl flex flex-col gap-1 transition-all border", quest.visible ? (quest.completed ? "border-emerald-500/30" : "border-mirage-800") : "border-mirage-800/30", !quest.visible && isGM ? "opacity-50" : (quest.completed ? "opacity-60" : "opacity-100"))}>
            <div className="flex justify-between items-start gap-4">
                <div className="flex gap-3.5 items-start flex-grow min-w-0 pt-0.5">
                    <button onClick={isGM ? onToggleComp : undefined} className={cn("w-5 h-5 rounded flex items-center justify-center shrink-0 transition-all border", quest.completed ? "bg-emerald-500/20 border-emerald-500 text-emerald-400" : "border-mirage-600 hover:border-mirage-400 bg-transparent", isGM ? "cursor-pointer" : "cursor-default outline-none")}>
                        {quest.completed && <FaCheck className="size-3" />}
                    </button>
                    <div className="flex flex-col flex-grow min-w-0">
                        <span className={cn("font-bold text-sm leading-tight break-words", quest.completed ? "text-mirage-500 line-through" : "text-mirage-50")}>{quest.title}</span>
                        {quest.description && <span className="text-[13px] text-mirage-400 mt-1.5 whitespace-pre-wrap leading-relaxed break-words">{quest.description}</span>}
                    </div>
                </div>
                {isGM && (
                    <div className="flex items-center gap-1 shrink-0">
                        <button className="p-2 rounded-lg text-mirage-500 hover:text-mirage-200 hover:bg-mirage-800 transition-colors outline-none" onClick={onToggleVis}>{quest.visible ? <FaEye /> : <FaEyeSlash />}</button>
                        <button className="p-2 rounded-lg text-mirage-500 hover:text-primary hover:bg-primary/10 transition-colors outline-none" onClick={onEdit}><FaPencil /></button>
                        <button className="p-2 rounded-lg text-mirage-500 hover:text-red-400 hover:bg-red-500/10 transition-colors outline-none" onClick={onDelete}><FaTrash /></button>
                    </div>
                )}
            </div>
        </div>
    );
}

export default function QuestsTab({ isGM }: { isGM: boolean }) {
    const obr = useOBR();
    const [quests, setQuests] = useState<Quest[]>([]);
    const [openQuestModal, setOpenQuestModal] = useState(false);
    const [editingQuest, setEditingQuest] = useState<Quest | null>(null);
    const [questTitle, setQuestTitle] = useState("");
    const [questDescription, setQuestDescription] = useState("");
    const [questIsMain, setQuestIsMain] = useState(false);

    const loadQuests = useCallback(async () => {
        const loadedQuests = await getMergedRoomArray<Quest>(QUEST_BASE_KEY);
        setQuests(loadedQuests);
    }, []);

    useEffect(() => {
        if (!obr.ready) return;
        loadQuests();
        const unsubscribe = OBR.room.onMetadataChange(() => loadQuests());
        return () => unsubscribe();
    }, [loadQuests, obr.ready]);

    const handleSaveQuest = async () => {
        if (!questTitle.trim()) return;
        const questToSave: Quest = editingQuest
            ? { ...editingQuest, title: questTitle, description: questDescription, isMainQuest: questIsMain }
            : { id: `quest-${Date.now()}`, title: questTitle, description: questDescription, isMainQuest: questIsMain, completed: false, visible: true };

        await updateRoomMetadataItem(QUEST_BASE_KEY, questToSave);
        
        setOpenQuestModal(false); 
        setEditingQuest(null); 
        setQuestTitle(""); 
        setQuestDescription(""); 
        setQuestIsMain(false);
    };

    const toggleQuestVisibility = async (quest: Quest) => {
        await updateRoomMetadataItem(QUEST_BASE_KEY, { ...quest, visible: !quest.visible });
    };

    const toggleQuestCompletion = async (quest: Quest) => {
        await updateRoomMetadataItem(QUEST_BASE_KEY, { ...quest, completed: !quest.completed });
    };

    const deleteQuest = async (id: string) => {
        await deleteRoomMetadataItem(QUEST_BASE_KEY, id);
    };

    const visibleQuests = isGM ? quests : quests.filter((q) => q.visible);
    const mainQuests = visibleQuests.filter(q => q.isMainQuest);
    const sideQuests = visibleQuests.filter(q => !q.isMainQuest);

    return (
        <div className="flex flex-col w-full h-full">
            {isGM && (
                <div className="flex justify-end mb-4">
                    <button 
                        className="flex items-center gap-1.5 bg-transparent border border-mirage-700 text-mirage-300 hover:text-white hover:border-mirage-500 hover:bg-mirage-800 rounded-xl px-4 py-2 text-sm font-bold transition-all outline-none"
                        onClick={() => { setEditingQuest(null); setQuestTitle(""); setQuestDescription(""); setQuestIsMain(false); setOpenQuestModal(true); }}
                    >
                        <FaPlus /> 新增任務
                    </button>
                </div>
            )}
            
            {visibleQuests.length === 0 && <p className="text-mirage-600 text-center mt-8 font-medium">目前沒有任何任務。</p>}
            
            <div className="flex flex-col gap-6 pb-6">
                {mainQuests.length > 0 && (
                    <div className="flex flex-col gap-3">
                        <span className="text-amber-500 font-bold text-sm tracking-wide ml-1">主線任務</span>
                        {mainQuests.map(q => <QuestCard key={q.id} quest={q} isGM={isGM} onToggleVis={() => toggleQuestVisibility(q)} onToggleComp={() => toggleQuestCompletion(q)} onEdit={() => { setEditingQuest(q); setQuestTitle(q.title); setQuestDescription(q.description); setQuestIsMain(q.isMainQuest); setOpenQuestModal(true); }} onDelete={() => deleteQuest(q.id)} />)}
                    </div>
                )}
                
                {sideQuests.length > 0 && (
                    <div className="flex flex-col gap-3">
                        <span className="text-sky-400 font-bold text-sm tracking-wide ml-1">支線與個人任務</span>
                        {sideQuests.map(q => <QuestCard key={q.id} quest={q} isGM={isGM} onToggleVis={() => toggleQuestVisibility(q)} onToggleComp={() => toggleQuestCompletion(q)} onEdit={() => { setEditingQuest(q); setQuestTitle(q.title); setQuestDescription(q.description); setQuestIsMain(q.isMainQuest); setOpenQuestModal(true); }} onDelete={() => deleteQuest(q.id)} />)}
                    </div>
                )}
            </div>

            <CustomDialog open={openQuestModal} onOpenChange={setOpenQuestModal} title={editingQuest ? "編輯任務" : "新增任務"} onSave={handleSaveQuest} onCancel={() => setOpenQuestModal(false)}>
                <CustomInput label="任務標題" value={questTitle} onChange={(e: any) => setQuestTitle(e.target.value)} />
                <CustomInput label="任務描述 (選填)" value={questDescription} onChange={(e: any) => setQuestDescription(e.target.value)} multiline rows={4} />
                <div className="flex items-center gap-3 mt-3">
                    <button onClick={() => setQuestIsMain(true)} className={cn("px-4 py-2.5 rounded-xl text-sm font-bold transition-all outline-none flex-1 border", questIsMain ? "bg-amber-500/20 border-amber-500 text-amber-400 shadow-[0_0_10px_rgba(245,158,11,0.1)]" : "bg-mirage-950 border-mirage-800 text-mirage-500 hover:border-mirage-600 hover:text-mirage-300")}>主線任務</button>
                    <button onClick={() => setQuestIsMain(false)} className={cn("px-4 py-2.5 rounded-xl text-sm font-bold transition-all outline-none flex-1 border", !questIsMain ? "bg-sky-500/20 border-sky-500 text-sky-400 shadow-[0_0_10px_rgba(14,165,233,0.1)]" : "bg-mirage-950 border-mirage-800 text-mirage-500 hover:border-mirage-600 hover:text-mirage-300")}>支線 / 個人</button>
                </div>
            </CustomDialog>
        </div>
    );
}