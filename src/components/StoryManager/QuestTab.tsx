// src/components/StoryManager/QuestTab.tsx
import { useState } from "react";
import { FaCirclePlus, FaPencil, FaEye, FaEyeSlash, FaCheck, FaTrash, FaGear, FaXmark } from "react-icons/fa6";
import { Quest, QuestCategory } from "./types";
import { useStoryData } from "./store";

function playClickSound() { try { const audio = new Audio('/click.mp3'); audio.volume = 0.15; audio.play().catch(() => { }); } catch (e) { } }
function playQuestCheckSound() { try { const audio = new Audio('/quest_check.mp3'); audio.volume = 0.3; audio.play().catch(() => { }); } catch (e) { } }

export default function QuestTab() {
    const { categories, quests, isGM, saveQuests, saveQuestCategories, toggleQuestCompletion } = useStoryData();
    const [modalOpen, setModalOpen] = useState(false);
    const [categoryModalOpen, setCategoryModalOpen] = useState(false);
    const [editingQuest, setEditingQuest] = useState<Quest | null>(null);
    const [form, setForm] = useState<Partial<Quest>>({});
    const [categoryForm, setCategoryForm] = useState<QuestCategory[]>([]);
    const [expandedQuests, setExpandedQuests] = useState<Record<string, boolean>>({});
    const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

    const handleSaveQuest = () => {
        playClickSound();
        const newQuest: Quest = {
            id: editingQuest?.id || Date.now().toString(36),
            title: form.title || "未命名任務",
            description: form.description || "",
            categoryId: form.categoryId || categories[0]?.id || "main",
            isVisible: form.isVisible ?? false,
            isCompleted: form.isCompleted ?? false,
            markerStyle: form.markerStyle || "checkbox",
            createdAt: editingQuest?.createdAt || Date.now()
        };
        saveQuests(editingQuest ? quests.map(q => q.id === editingQuest.id ? newQuest : q) : [...quests, newQuest]);
        setModalOpen(false);
    };

    const handleSaveCategories = () => {
        playClickSound();
        saveQuestCategories(categoryForm);
        setCategoryModalOpen(false);
    };

    const handleDelete = (id: string) => {
        playClickSound();
        saveQuests(quests.filter(q => q.id !== id));
        setConfirmDeleteId(null);
    };

    const openEditModal = (quest?: Quest) => {
        playClickSound();
        if (quest) { setEditingQuest(quest); setForm(quest); } 
        else { setEditingQuest(null); setForm({ categoryId: categories[0]?.id, isVisible: false, isCompleted: false, markerStyle: "checkbox" }); }
        setModalOpen(true);
    };

    const visibleQuests = isGM ? quests : quests.filter(q => q.isVisible);

    return (
        <div className="relative px-1">
            <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-bold text-gray-300">冒險日誌</h3>
                {isGM && (
                    <div className="flex items-center gap-2">
                        <button onClick={() => { setCategoryForm(categories); setCategoryModalOpen(true); playClickSound(); }} className="p-1.5 text-gray-400 hover:text-white bg-panel-inactive rounded-full transition-colors outline-none"><FaGear className="w-3.5 h-3.5"/></button>
                        <button onClick={() => openEditModal()} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-panel-inactive hover:bg-panel-active text-white rounded-full transition-colors shadow-sm outline-none"><FaCirclePlus className="w-3.5 h-3.5"/> 新增任務</button>
                    </div>
                )}
            </div>

            {categories.filter(c => isGM || c.isVisible !== false).map(cat => {
                const list = visibleQuests.filter(q => q.categoryId === cat.id);
                return (
                    <div key={cat.id} className="mb-4">
                        <div className="flex items-center justify-between border-b border-panel-inactive pb-1 mb-2">
                            <h4 className="text-base font-bold text-panel-active px-1">{cat.name}</h4>
                            {isGM && (
                                <button onClick={() => saveQuestCategories(categories.map(c => c.id === cat.id ? { ...c, isVisible: c.isVisible === false ? true : false } : c))} className={`p-1.5 outline-none rounded-full transition-colors ${cat.isVisible === false ? "text-gray-500 hover:text-white" : "text-panel-active hover:text-white"}`} title={cat.isVisible === false ? "此分類對玩家隱藏" : "此分類公開"}>
                                    {cat.isVisible === false ? <FaEyeSlash className="w-4 h-4"/> : <FaEye className="w-4 h-4"/>}
                                </button>
                            )}
                        </div>
                        {list.length === 0 && <p className="text-xs font-bold text-gray-500 px-1">無任務</p>}
                        <div className="flex flex-col gap-2">
                            {list.map(quest => {
                                const isExpanded = expandedQuests[quest.id];
                                return (
                                    <div key={quest.id} className={`relative p-3 rounded-xl bg-panel-content border transition-colors shadow-sm group ${quest.isCompleted ? "opacity-50 border-transparent hover:opacity-80" : "border-panel-inactive hover:border-gray-500"}`}>
                                        <div className="flex items-start gap-3">
                                            {quest.markerStyle !== "none" && (
                                                <button onClick={() => { playQuestCheckSound(); toggleQuestCompletion(quest.id); }} className={`mt-0.5 shrink-0 w-4 h-4 rounded-[4px] border flex items-center justify-center transition-colors outline-none ${quest.isCompleted ? "bg-emerald-500 border-emerald-500 text-white" : "border-gray-500 hover:border-gray-300 text-transparent"}`}>
                                                    <FaCheck className="w-2.5 h-2.5"/>
                                                </button>
                                            )}
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-start justify-between gap-2">
                                                    <h5 className={`font-bold text-[15px] text-white truncate ${quest.isCompleted ? "line-through text-gray-400" : ""}`}>{quest.title}</h5>
                                                    {isGM && (
                                                        <div className="flex items-center gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity bg-panel-content/80 rounded-full shrink-0">
                                                            <button onClick={() => { playClickSound(); saveQuests(quests.map(q => q.id === quest.id ? { ...q, isVisible: !q.isVisible } : q)); }} className={`p-1.5 outline-none ${quest.isVisible ? "text-panel-active" : "text-gray-400 hover:text-white"}`}>{quest.isVisible ? <FaEye className="w-3.5 h-3.5"/> : <FaEyeSlash className="w-3.5 h-3.5"/>}</button>
                                                            <button onClick={() => openEditModal(quest)} className="p-1.5 text-gray-400 hover:text-white outline-none"><FaPencil className="w-3.5 h-3.5"/></button>
                                                            <button onClick={() => confirmDeleteId === quest.id ? handleDelete(quest.id) : setConfirmDeleteId(quest.id)} onMouseLeave={() => setConfirmDeleteId(null)} className={`p-1.5 outline-none ${confirmDeleteId === quest.id ? "text-red-500" : "text-gray-400 hover:text-red-500"}`}>
                                                                {confirmDeleteId === quest.id ? <FaXmark className="w-3.5 h-3.5"/> : <FaTrash className="w-3.5 h-3.5"/>}
                                                            </button>
                                                        </div>
                                                    )}
                                                </div>
                                                {quest.description && (
                                                    <p onClick={() => setExpandedQuests(p => ({ ...p, [quest.id]: !p[quest.id] }))} className={`mt-1 text-sm text-gray-400 cursor-pointer whitespace-pre-wrap break-words transition-all ${isExpanded ? "" : "line-clamp-2"} ${quest.isCompleted ? "line-through" : ""}`}>{quest.description}</p>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                );
            })}

            {categoryModalOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in">
                    <div className="w-full max-w-[360px] flex flex-col shadow-2xl rounded-2xl bg-panel-content p-5 border border-panel-inactive">
                        <h3 className="font-bold text-white mb-4">管理任務分類</h3>
                        <div className="flex flex-col gap-2 mb-4 max-h-[40vh] overflow-y-auto no-scrollbar pr-2">
                            {categoryForm.map((cat, idx) => (
                                <div key={cat.id} className="flex gap-2">
                                    <input value={cat.name} onChange={(e) => { const nc = [...categoryForm]; nc[idx].name = e.target.value; setCategoryForm(nc); }} className="flex-1 bg-panel-base text-white text-xs font-bold rounded-xl p-2 outline-none border border-transparent focus:border-panel-active" />
                                    <button onClick={() => setCategoryForm(categoryForm.filter(c => c.id !== cat.id))} className="text-gray-500 hover:text-red-500 outline-none"><FaTrash className="w-3.5 h-3.5"/></button>
                                </div>
                            ))}
                            <button onClick={() => setCategoryForm([...categoryForm, { id: Date.now().toString(36), name: "新分類", isVisible: true }])} className="text-xs text-panel-active font-bold py-2 mt-2 border border-dashed border-panel-inactive rounded-xl hover:border-panel-active outline-none transition-colors">新增分類</button>
                        </div>
                        <div className="flex justify-end gap-2">
                            <button onClick={() => setCategoryModalOpen(false)} className="px-4 py-1.5 rounded-full text-xs font-bold text-gray-400 hover:text-white outline-none">取消</button>
                            <button onClick={handleSaveCategories} className="px-4 py-1.5 rounded-full text-xs font-bold bg-panel-active text-white outline-none">儲存設定</button>
                        </div>
                    </div>
                </div>
            )}

            {modalOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in">
                    <div className="w-full max-w-[360px] flex flex-col shadow-2xl rounded-2xl bg-panel-content p-5 border border-panel-inactive">
                        <h3 className="font-bold text-white mb-4">{editingQuest ? "編輯任務" : "新增任務"}</h3>
                        <div className="flex flex-col gap-3 mb-5">
                            <input autoFocus type="text" value={form.title || ""} onChange={(e) => setForm({...form, title: e.target.value})} placeholder="任務名稱" className="w-full bg-panel-base text-white text-sm font-bold rounded-xl p-2.5 outline-none border border-transparent focus:border-panel-active shadow-inner" />
                            <textarea value={form.description || ""} onChange={(e) => setForm({...form, description: e.target.value})} placeholder="任務說明..." className="w-full h-24 bg-panel-base text-gray-300 text-xs rounded-xl p-2.5 outline-none border border-transparent focus:border-panel-active resize-none no-scrollbar shadow-inner" />
                            <div className="flex items-center gap-3">
                                <select value={form.categoryId || categories[0]?.id} onChange={(e) => setForm({...form, categoryId: e.target.value})} className="flex-1 bg-panel-base text-white text-xs font-bold rounded-xl p-2.5 outline-none border border-transparent focus:border-panel-active">
                                    {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                </select>
                                <select value={form.markerStyle || "checkbox"} onChange={(e) => setForm({...form, markerStyle: e.target.value as "checkbox"|"none"})} className="flex-1 bg-panel-base text-white text-xs font-bold rounded-xl p-2.5 outline-none border border-transparent focus:border-panel-active">
                                    <option value="checkbox">打勾格式</option>
                                    <option value="none">純文字</option>
                                </select>
                            </div>
                            <button onClick={() => setForm({...form, isVisible: !form.isVisible})} className={`flex items-center justify-center gap-1.5 w-full h-9 rounded-xl text-xs font-bold outline-none border shadow-sm ${form.isVisible ? "bg-panel-active/20 border-panel-active text-panel-active" : "bg-panel-base border-transparent text-gray-400 hover:text-white"}`}>
                                {form.isVisible ? <><FaEye className="w-3.5 h-3.5"/> 玩家可見</> : <><FaEyeSlash className="w-3.5 h-3.5"/> 隱藏任務</>}
                            </button>
                        </div>
                        <div className="flex justify-end gap-2">
                            <button onClick={() => {playClickSound(); setModalOpen(false);}} className="px-4 py-1.5 rounded-full text-xs font-bold text-gray-400 hover:text-white outline-none transition-colors">取消</button>
                            <button onClick={handleSaveQuest} disabled={!form.title} className="px-4 py-1.5 rounded-full text-xs font-bold bg-panel-active text-white outline-none disabled:opacity-50 transition-opacity">儲存</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}