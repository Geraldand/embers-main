// src/components/StoryManager/LegacyTab.tsx
import { useState, useEffect } from "react";
import { FaCirclePlus, FaPencil, FaEye, FaEyeSlash, FaTrash, FaBookOpenReader, FaTowerBroadcast, FaXmark } from "react-icons/fa6";
import { LegacyItem } from "./types";
import { useStoryData } from "./store";
import { LEGACY_THEMES } from "./constants";

function playClickSound() { try { const audio = new Audio('/click.mp3'); audio.volume = 0.15; audio.play().catch(() => { }); } catch (e) { } }
function playLegacyOpenSound() { try { const audio = new Audio('/legacy_open.mp3'); audio.volume = 0.3; audio.play().catch(() => { }); } catch (e) { } }

export default function LegacyTab() {
    const { legacies, isGM, saveLegacies, broadcastLegacy, updateLegacyLive } = useStoryData();
    const [modalOpen, setModalOpen] = useState(false);
    const [broadcastModalOpen, setBroadcastModalOpen] = useState(false);
    const [legacyToBroadcast, setLegacyToBroadcast] = useState<string | null>(null);
    const [readingLegacy, setReadingLegacy] = useState<LegacyItem | null>(null);
    const [editingLegacy, setEditingLegacy] = useState<LegacyItem | null>(null);
    const [form, setForm] = useState<Partial<LegacyItem>>({});
    const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
    const [party, setParty] = useState<any[]>([]);
    const [selectedTargets, setSelectedTargets] = useState<string[]>(["ALL"]);

    // Convert vertical mouse wheel to horizontal scroll for secrets container
    const horizontalScrollRef = (el: HTMLDivElement | null) => {
        if (el) {
            el.onwheel = (e: WheelEvent) => {
                if (e.deltaY !== 0) {
                    e.preventDefault();
                    el.scrollLeft += e.deltaY;
                }
            };
        }
    };

    const getSecretsFromText = (text: string) => {
        const secrets = [];
        const regex = /\[([^|]+)\|([^\]]+)\]/g;
        let match; let secretIndex = 0;
        while ((match = regex.exec(text)) !== null) {
            secrets.push({ id: `secret-${secretIndex}`, condition: match[1], secret: match[2] });
            secretIndex++;
        }
        return secrets;
    };

    useEffect(() => {
        if (!isGM) return;
        import("@owlbear-rodeo/sdk").then(OBR => {
            OBR.default.party.getPlayers().then(setParty);
            const unsub = OBR.default.party.onChange(setParty);
            return () => unsub();
        });
    }, [isGM]);

    useEffect(() => {
        const handler = (e: any) => {
            const legacy = legacies.find(l => l.id === e.detail);
            if (legacy) { playLegacyOpenSound(); setReadingLegacy(legacy); }
        };
        window.addEventListener("force-open-legacy", handler);
        return () => window.removeEventListener("force-open-legacy", handler);
    }, [legacies]);

    useEffect(() => {
        if (readingLegacy) {
            const updated = legacies.find(l => l.id === readingLegacy.id);
            if (updated) setReadingLegacy(updated);
        }
    }, [legacies]);

    const handleSave = () => {
        playClickSound();
        const newItem: LegacyItem = {
            id: editingLegacy?.id || Date.now().toString(36),
            name: form.name || "未知文件",
            description: form.description || "",
            themeId: form.themeId || "standard",
            isVisible: form.isVisible ?? false,
            revealedSecrets: editingLegacy?.revealedSecrets || [],
            createdAt: editingLegacy?.createdAt || Date.now()
        };
        saveLegacies(editingLegacy ? legacies.map(l => l.id === editingLegacy.id ? newItem : l) : [...legacies, newItem]);
        setModalOpen(false);
    };

    const toggleSecret = (legacyId: string, secretId: string) => {
        playClickSound();
        const legacy = legacies.find(l => l.id === legacyId);
        if (!legacy) return;
        const newSecrets = legacy.revealedSecrets.includes(secretId) ? legacy.revealedSecrets.filter(s => s !== secretId) : [...legacy.revealedSecrets, secretId];
        const newLegacy = { ...legacy, revealedSecrets: newSecrets };
        updateLegacyLive(newLegacy);
    };

    const handleBroadcastSubmit = () => {
        if (!legacyToBroadcast) return;
        playClickSound();
        broadcastLegacy(legacyToBroadcast, selectedTargets);
        setBroadcastModalOpen(false);
        setLegacyToBroadcast(null);
    };

    const renderTextWithSecrets = (text: string, revealedSecrets: string[]) => {
        if (!text) return null;
        const parts = [];
        const regex = /\[([^|]+)\|([^\]]+)\]/g;
        let lastIndex = 0; let match; let secretIndex = 0;

        while ((match = regex.exec(text)) !== null) {
            if (match.index > lastIndex) parts.push(<span key={`text-${lastIndex}`}>{text.substring(lastIndex, match.index)}</span>);
            const secret = match[2];
            const secretId = `secret-${secretIndex}`;
            const isRevealed = revealedSecrets?.includes(secretId);

            parts.push(
                <span key={secretId} className={`inline-block font-bold transition-all duration-[1500ms] ease-in-out ${isRevealed ? "opacity-100 blur-none" : "opacity-0 blur-md select-none"}`}>
                    {secret}
                </span>
            );
            lastIndex = regex.lastIndex; secretIndex++;
        }
        if (lastIndex < text.length) parts.push(<span key={`text-${lastIndex}`}>{text.substring(lastIndex)}</span>);
        return parts;
    };

    const visibleLegacies = isGM ? legacies : legacies.filter(l => l.isVisible);

    return (
        <div className="relative px-1">
            <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-bold text-gray-300">發現的遺留物</h3>
                {isGM && <button onClick={() => { setEditingLegacy(null); setForm({ isVisible: false, themeId: "standard" }); setModalOpen(true); playClickSound(); }} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-panel-inactive hover:bg-panel-active text-white rounded-full transition-colors outline-none"><FaCirclePlus className="w-3.5 h-3.5"/> 新增遺留物</button>}
            </div>

            <div className="flex flex-col gap-4 pb-10">
                {visibleLegacies.map(legacy => {
                    return (
                        <div key={legacy.id} className={`flex flex-col bg-panel-content rounded-2xl border ${legacy.isVisible ? "border-panel-inactive hover:border-gray-500" : "border-gray-600 opacity-80"} transition-colors shadow-sm overflow-hidden`}>
                            <div className="p-3 bg-panel-inactive/30 flex items-start justify-between gap-2 border-b border-panel-inactive/50 cursor-pointer">
                                <div className="flex-1 min-w-0" onClick={() => { playLegacyOpenSound(); setReadingLegacy(legacy); }}>
                                    <div className="flex items-center gap-2.5 mb-1">
                                        <button className="p-1.5 text-panel-active hover:text-white outline-none flex items-center justify-center bg-panel-active/10 rounded-full transition-colors"><FaBookOpenReader className="w-4 h-4"/></button>
                                        <h4 className="font-bold text-base text-white truncate">{legacy.name}</h4>
                                    </div>
                                    <p className="text-[11px] text-gray-500 truncate pl-9">{legacy.description.replace(/\[([^|]+)\|([^\]]+)\]/g, "[$1]")}</p>
                                </div>
                                {isGM && (
                                    <div className="flex items-center gap-1 shrink-0 pt-1 border-l border-panel-inactive/50 pl-2 ml-1">
                                        <button onClick={() => { playClickSound(); setLegacyToBroadcast(legacy.id); setSelectedTargets(["ALL"]); setBroadcastModalOpen(true); }} className="p-1.5 text-amber-500 hover:text-white bg-amber-500/10 rounded-full outline-none mr-1 shadow-sm" title="廣播"><FaTowerBroadcast className="w-3.5 h-3.5"/></button>
                                        <button onClick={() => { playClickSound(); saveLegacies(legacies.map(l => l.id === legacy.id ? { ...l, isVisible: !l.isVisible } : l)); }} className={`p-1.5 outline-none rounded-full ${legacy.isVisible ? "text-panel-active" : "text-gray-500 hover:text-white"}`}>{legacy.isVisible ? <FaEye className="w-3.5 h-3.5"/> : <FaEyeSlash className="w-3.5 h-3.5"/>}</button>
                                        <button onClick={() => { setEditingLegacy(legacy); setForm(legacy); setModalOpen(true); playClickSound(); }} className="p-1.5 text-gray-400 hover:text-white outline-none"><FaPencil className="w-3.5 h-3.5"/></button>
                                        <button onClick={() => confirmDeleteId === legacy.id ? saveLegacies(legacies.filter(l => l.id !== legacy.id)) : setConfirmDeleteId(legacy.id)} onMouseLeave={() => setConfirmDeleteId(null)} className={`p-1.5 outline-none ${confirmDeleteId === legacy.id ? "text-red-500" : "text-gray-400 hover:text-red-500"}`}>{confirmDeleteId === legacy.id ? <FaXmark className="w-3.5 h-3.5"/> : <FaTrash className="w-3.5 h-3.5"/>}</button>
                                    </div>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>

            {readingLegacy && (
                <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-300" onClick={() => setReadingLegacy(null)}>
                    <div className="w-full max-w-[600px] h-[85vh] flex flex-col rounded-sm shadow-2xl font-serif relative" style={{ backgroundColor: LEGACY_THEMES[readingLegacy.themeId || "standard"].bg, color: LEGACY_THEMES[readingLegacy.themeId || "standard"].text }} onClick={e => e.stopPropagation()}>
                        <div className="flex-1 overflow-y-auto p-8 relative no-scrollbar">
                            <button onClick={() => setReadingLegacy(null)} className="absolute top-4 right-4 hover:opacity-50 text-xl font-bold outline-none">✕</button>
                            <h2 className="text-3xl font-bold mb-6 text-center border-b border-black/20 pb-4">{readingLegacy.name}</h2>
                            <div className="text-lg leading-relaxed whitespace-pre-wrap pb-10 break-words" style={{ wordBreak: 'break-word', overflowWrap: 'anywhere' }}>
                                {renderTextWithSecrets(readingLegacy.description, readingLegacy.revealedSecrets)}
                            </div>
                        </div>
                        {isGM && (
                            <div className="flex-none bg-[#2d3143] text-white p-4 border-t-2 border-panel-active flex flex-col gap-2 rounded-b-sm shadow-[0_-10px_20px_rgba(0,0,0,0.5)] z-10 w-full">
                                <span className="text-[10px] text-gray-400 font-sans font-bold flex items-center gap-1.5"><FaPencil /> 編輯</span>
                                <textarea
                                    value={readingLegacy.description}
                                    onChange={(e) => {
                                        const newLegacy = { ...readingLegacy, description: e.target.value };
                                        updateLegacyLive(newLegacy);
                                    }}
                                    className="w-full h-24 bg-[#222639] text-gray-300 text-xs rounded-xl p-3 outline-none resize-none font-sans no-scrollbar border border-transparent focus:border-panel-active shadow-inner"
                                />
                                {getSecretsFromText(readingLegacy.description).length > 0 && (
                                    <div ref={horizontalScrollRef} className="flex flex-nowrap overflow-x-auto gap-2 mt-2 pb-2 w-full no-scrollbar scroll-smooth">
                                        {getSecretsFromText(readingLegacy.description).map(s => {
                                            const isRevealed = readingLegacy.revealedSecrets.includes(s.id);
                                            return (
                                                <button key={s.id} onClick={() => toggleSecret(readingLegacy.id, s.id)} className={`shrink-0 max-w-[250px] px-3 py-1.5 text-xs font-sans rounded-xl border transition-colors outline-none shadow-sm flex items-center text-left ${isRevealed ? "bg-panel-active/20 border-panel-active text-white" : "bg-panel-base border-gray-600 text-gray-400 hover:text-white"}`}>
                                                    <span className="opacity-70 mr-1.5 shrink-0">[{s.condition}]</span>
                                                    <span className="truncate flex-1">{s.secret}</span>
                                                </button>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {broadcastModalOpen && (
                <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in">
                    <div className="w-full max-w-[300px] flex flex-col shadow-2xl rounded-2xl bg-panel-content p-5 border border-panel-inactive">
                        <h3 className="font-bold text-white mb-4">選擇廣播對象</h3>
                        <div className="flex flex-col gap-2 mb-6 max-h-[30vh] overflow-y-auto no-scrollbar">
                            <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer p-2 hover:bg-panel-inactive rounded transition-colors">
                                <input type="checkbox" checked={selectedTargets.includes("ALL")} onChange={() => setSelectedTargets(["ALL"])} className="accent-panel-active" />
                                所有人
                            </label>
                            {party.map(p => (
                                <label key={p.id} className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer p-2 hover:bg-panel-inactive rounded transition-colors">
                                    <input type="checkbox" checked={selectedTargets.includes(p.id)} onChange={(e) => {
                                        if (e.target.checked) setSelectedTargets(prev => [...prev.filter(t => t !== "ALL"), p.id]);
                                        else setSelectedTargets(prev => prev.filter(t => t !== p.id));
                                    }} className="accent-panel-active" />
                                    {p.name}
                                </label>
                            ))}
                        </div>
                        <div className="flex justify-end gap-2">
                            <button onClick={() => setBroadcastModalOpen(false)} className="px-4 py-1.5 rounded-full text-xs font-bold text-gray-400 hover:text-white outline-none">取消</button>
                            <button onClick={handleBroadcastSubmit} disabled={selectedTargets.length === 0} className="px-4 py-1.5 rounded-full text-xs font-bold bg-panel-active text-white outline-none disabled:opacity-50">廣播</button>
                        </div>
                    </div>
                </div>
            )}

            {modalOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in">
                    <div className="w-full max-w-[400px] flex flex-col shadow-2xl rounded-2xl bg-panel-content p-5 border border-panel-inactive">
                        <h3 className="font-bold text-white mb-4">{editingLegacy ? "編輯遺留物" : "新增遺留物"}</h3>
                        <input autoFocus type="text" value={form.name || ""} onChange={(e) => setForm({...form, name: e.target.value})} placeholder="名稱" className="w-full bg-panel-base text-white text-sm font-bold rounded-xl p-2.5 outline-none mb-3 border border-transparent focus:border-panel-active shadow-inner" />
                        <select value={form.themeId || "standard"} onChange={(e) => setForm({...form, themeId: e.target.value})} className="w-full bg-panel-base text-white text-xs font-bold rounded-xl p-2.5 outline-none mb-3 border border-transparent focus:border-panel-active shadow-inner">
                            {Object.entries(LEGACY_THEMES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                        </select>
                        <textarea value={form.description || ""} onChange={(e) => setForm({...form, description: e.target.value})} placeholder="內文描述... [條件|隱藏文字]" className="w-full h-32 bg-panel-base text-gray-300 text-xs rounded-xl p-2.5 outline-none mb-3 border border-transparent focus:border-panel-active resize-none no-scrollbar shadow-inner" />
                        <div className="flex justify-end gap-2">
                            <button onClick={() => { playClickSound(); setModalOpen(false); }} className="px-4 py-1.5 rounded-full text-xs font-bold text-gray-400 hover:text-white outline-none">取消</button>
                            <button onClick={handleSave} disabled={!form.name} className="px-4 py-1.5 rounded-full text-xs font-bold bg-panel-active text-white outline-none">儲存</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}