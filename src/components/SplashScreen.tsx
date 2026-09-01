// src/components/SplashScreen.tsx
import { useState } from "react";
import { FaPen, FaCirclePlus, FaBookOpen, FaTrash, FaCaretDown, FaCaretUp, FaXmark, FaArrowDownWideShort, FaArrowUpWideShort } from "react-icons/fa6";
import { Recap } from "./StoryManager/types";
import { useStoryData } from "./StoryManager/store";
import { LEGACY_THEMES } from "./StoryManager/constants";

function playClickSound() { try { const audio = new Audio('/click.mp3'); audio.volume = 0.15; audio.play().catch(() => { }); } catch (e) { } }

export const SplashScreen = ({ role, initialMode, onReady }: { role: "GM" | "PLAYER" | null; initialMode: "latest" | "list"; onReady: () => void; }) => {
    const { recaps, isGM, saveRecaps } = useStoryData();
    const [mode, setMode] = useState<"latest" | "list" | "edit">(initialMode);
    const [editingRecap, setEditingRecap] = useState<Partial<Recap>>({});
    const [expandedRecaps, setExpandedRecaps] = useState<Record<string, boolean>>({});
    const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
    const [sortOrder, setSortOrder] = useState<"desc" | "asc">("desc");

    const handleSave = () => {
        playClickSound();
        const newRecap: Recap = {
            id: editingRecap.id || Date.now().toString(36),
            title: editingRecap.title || "無標題",
            content: editingRecap.content || "",
            themeId: editingRecap.themeId || "standard",
            createdAt: editingRecap.createdAt || Date.now()
        };
        saveRecaps(editingRecap.id ? recaps.map(r => r.id === newRecap.id ? newRecap : r) : [...recaps, newRecap]);
        setMode("list");
    };

    const handleDelete = (id: string) => {
        playClickSound();
        saveRecaps(recaps.filter(r => r.id !== id));
        setConfirmDeleteId(null);
    };

    const openEdit = (recap?: Recap) => {
        playClickSound();
        if (recap) setEditingRecap(recap);
        else setEditingRecap({ title: "本週的冒險...", content: "上回我們說到...", themeId: "standard" });
        setMode("edit");
    };

    if (mode === "edit" && isGM) {
        return (
            <div className="h-screen w-full flex flex-col p-4 bg-panel-base box-border relative">
                <h3 className="text-lg font-bold text-white mb-4 shrink-0">編輯前情提要</h3>
                <div className="flex flex-col gap-3 mb-4 flex-grow overflow-hidden">
                    <div className="flex flex-col gap-1.5 shrink-0">
                        <span className="text-xs font-bold text-gray-500 ml-1">標題</span>
                        <input autoFocus type="text" value={editingRecap.title || ""} onChange={(e) => setEditingRecap({...editingRecap, title: e.target.value})} className="w-full bg-panel-content text-white text-sm font-bold rounded-xl p-3 outline-none border border-transparent focus:border-panel-active shadow-inner" />
                    </div>
                    <div className="flex flex-col gap-1.5 shrink-0">
                        <span className="text-xs font-bold text-gray-500 ml-1">主題背景</span>
                        <select value={editingRecap.themeId || "standard"} onChange={(e) => setEditingRecap({...editingRecap, themeId: e.target.value})} className="w-full bg-panel-content text-white text-sm font-bold rounded-xl p-3 outline-none border border-transparent focus:border-panel-active shadow-inner">
                            {Object.entries(LEGACY_THEMES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                        </select>
                    </div>
                    <div className="flex flex-col gap-1.5 flex-grow overflow-hidden">
                        <span className="text-xs font-bold text-gray-500 ml-1">內文</span>
                        <textarea value={editingRecap.content || ""} onChange={(e) => setEditingRecap({...editingRecap, content: e.target.value})} className="w-full h-full bg-panel-content text-gray-300 text-sm rounded-xl p-3 outline-none resize-none no-scrollbar border border-transparent focus:border-panel-active shadow-inner" />
                    </div>
                </div>
                <div className="flex gap-2 shrink-0">
                    <button className="flex-1 py-2.5 rounded-xl text-sm font-bold border border-gray-500 text-gray-400 hover:text-white outline-none transition-colors" onClick={() => { playClickSound(); setMode("list"); }}>取消</button>
                    <button className="flex-1 py-2.5 rounded-xl text-sm font-bold bg-panel-active text-white outline-none hover:opacity-80 transition-opacity" onClick={handleSave}>儲存</button>
                </div>
            </div>
        );
    }

    if (mode === "list") {
        const sortedRecaps = [...recaps].sort((a, b) => sortOrder === "desc" ? b.createdAt - a.createdAt : a.createdAt - b.createdAt);
        return (
            <div className="h-screen w-full flex flex-col p-4 bg-panel-base box-border">
                <div className="flex justify-between items-center mb-4 shrink-0">
                    <h3 className="text-lg font-bold text-white">歷史前情提要</h3>
                    <div className="flex gap-2">
                        <button className="flex items-center justify-center px-3 py-1.5 rounded-full border border-gray-500 text-gray-400 hover:text-white transition-colors outline-none" onClick={() => { playClickSound(); setSortOrder(sortOrder === "desc" ? "asc" : "desc"); }}>
                            {sortOrder === "desc" ? <FaArrowDownWideShort /> : <FaArrowUpWideShort />}
                        </button>
                        {isGM && <button className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-panel-inactive hover:bg-panel-active text-white rounded-full transition-colors outline-none shadow-sm" onClick={() => openEdit()}><FaCirclePlus /> 新增</button>}
                    </div>
                </div>
                <div className="flex-grow overflow-y-auto flex flex-col gap-3 mb-4 no-scrollbar">
                    {sortedRecaps.length === 0 ? (
                        <p className="text-gray-500 text-center mt-10 text-sm font-bold">尚無任何紀錄</p>
                    ) : (
                        sortedRecaps.map(recap => {
                            const isExpanded = expandedRecaps[recap.id];
                            const themeObj = LEGACY_THEMES[recap.themeId || "standard"];
                            return (
                                <div key={recap.id} className="p-4 rounded-2xl relative cursor-pointer transition-colors shadow-sm" style={{ backgroundColor: themeObj.bg, color: themeObj.text }} onClick={() => setExpandedRecaps(p => ({...p, [recap.id]: !isExpanded}))}>
                                    <div className="flex justify-between items-start">
                                        <h4 className="font-bold text-base pr-12 truncate">{recap.title}</h4>
                                        <div className="opacity-60 mt-1">{isExpanded ? <FaCaretUp /> : <FaCaretDown />}</div>
                                    </div>
                                    {isGM && (
                                        <div className="absolute top-3 right-10 flex gap-1 bg-black/10 rounded-full px-1 py-0.5" onClick={e => e.stopPropagation()}>
                                            <button className="p-1.5 outline-none hover:opacity-50 transition-opacity" onClick={() => openEdit(recap)}><FaPen className="w-3.5 h-3.5"/></button>
                                            <button className={`p-1.5 outline-none hover:opacity-50 transition-opacity ${confirmDeleteId === recap.id ? "text-red-600" : ""}`} onClick={() => confirmDeleteId === recap.id ? handleDelete(recap.id) : setConfirmDeleteId(recap.id)} onMouseLeave={() => setConfirmDeleteId(null)}>
                                                {confirmDeleteId === recap.id ? <FaXmark className="w-3.5 h-3.5"/> : <FaTrash className="w-3.5 h-3.5"/>}
                                            </button>
                                        </div>
                                    )}
                                    {isExpanded && <p className="whitespace-pre-wrap break-words mt-3 text-sm opacity-90 leading-relaxed font-serif">{recap.content}</p>}
                                </div>
                            );
                        })
                    )}
                </div>
                <button className="w-full py-2.5 rounded-xl text-sm font-bold bg-panel-active text-white outline-none shadow-sm hover:opacity-80 shrink-0 transition-opacity" onClick={() => { playClickSound(); onReady(); }}>返回</button>
            </div>
        );
    }

    const latestRecap = recaps.length > 0 ? recaps[recaps.length - 1] : { title: "歡迎來到本週的冒險", content: "目前還沒有任何前情提要...", themeId: "standard" };
    const activeTheme = LEGACY_THEMES[latestRecap.themeId || "standard"];

    return (
        <div className="h-screen w-full flex flex-col p-4 bg-panel-base box-border overflow-hidden">
            <div className="shrink-0 text-center mb-4 mt-4">
                <FaBookOpen className="text-5xl mx-auto mb-3 opacity-90 text-panel-active drop-shadow-md" />
                <h2 className="text-xl font-bold text-white border-b-2 border-panel-active pb-2 px-4 inline-block max-w-full break-words">{latestRecap.title}</h2>
            </div>
            <div className="flex-grow overflow-y-auto p-5 mb-4 rounded-2xl shadow-inner font-serif no-scrollbar" style={{ backgroundColor: activeTheme.bg, color: activeTheme.text }}>
                <p className="whitespace-pre-wrap break-words leading-relaxed text-[15px] opacity-90">{latestRecap.content}</p>
            </div>
            <button className="w-full py-3 rounded-2xl text-base font-black bg-panel-active text-white outline-none shadow-md hover:opacity-80 shrink-0 transition-opacity" onClick={() => { playClickSound(); onReady(); }}>
                {role === "GM" ? "進入 DM 介面" : "返回待命畫面"}
            </button>
        </div>
    );
};