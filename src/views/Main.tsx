import { useEffect, useState } from "react";
import { FaBook, FaBookOpen, FaWandMagicSparkles } from "react-icons/fa6";

import MovementHandler from "../components/MovementHandler";
import SceneControls from "../components/SceneControls";
import SpellBook from "../components/SpellBook";
import StoryManager from "../components/StoryManager";
import { SplashScreen } from "../components/SplashScreen";
import { useOBR } from "../react-obr/providers";

function playClickSound() {
    try { const audio = new Audio('/click.mp3'); audio.volume = 0.15; audio.play().catch(() => { }); } catch (e) { }
}

export default function Main() {
    const obr = useOBR();
    const [role, setRole] = useState<"GM" | "PLAYER" | null>(null);
    const [recapMode, setRecapMode] = useState<"latest" | "list" | null>("latest");
    
    const [primaryTab, setPrimaryTab] = useState<"MAGIC" | "STORY">("STORY");
    const [magicTab, setMagicTab] = useState<"SPELLBOOK" | "ACTIVE">("SPELLBOOK");

    useEffect(() => {
        if (!obr.ready || !obr.player?.role) return;
        setRole(obr.player.role as "GM" | "PLAYER");
    }, [obr.ready, obr.player?.role]);

    if (!obr.ready) return null;

    if (recapMode !== null) {
        return <SplashScreen role={role} initialMode={recapMode} onReady={() => setRecapMode(null)} />;
    }

    return (
        <div className="relative h-screen w-full flex flex-col bg-panel-base text-white font-sans overflow-hidden">
            <div className="flex-1 overflow-y-auto p-3 pb-4 scroll-smooth no-scrollbar flex flex-col">
                {role === "GM" && primaryTab === "MAGIC" && (
                    <>
                        {/* GM 法術介面：單列設計 */}
                        <div className="flex w-full items-center mb-3 shrink-0">
                            <div className="flex bg-panel-inactive p-1 rounded-lg shrink-0 shadow-sm mr-1.5">
                                <button className="w-8 h-7 bg-panel-active text-white rounded flex items-center justify-center shadow-sm outline-none"><FaWandMagicSparkles className="w-3.5 h-3.5" /></button>
                                <button onClick={() => { playClickSound(); setPrimaryTab("STORY"); }} className="w-8 h-7 text-gray-400 hover:text-white flex items-center justify-center outline-none transition-colors"><FaBookOpen className="w-3.5 h-3.5" /></button>
                            </div>
                            <div className="flex flex-1 bg-panel-inactive p-1 rounded-lg shadow-sm">
                                <button onClick={() => { playClickSound(); setMagicTab("SPELLBOOK"); }} className={`flex-1 text-[13px] font-bold h-7 rounded-md transition-all outline-none ${magicTab === "SPELLBOOK" ? "bg-panel-active text-white shadow-sm" : "text-gray-400 hover:text-white"}`}>法術書</button>
                                <button onClick={() => { playClickSound(); setMagicTab("ACTIVE"); }} className={`flex-1 text-[13px] font-bold h-7 rounded-md transition-all outline-none ${magicTab === "ACTIVE" ? "bg-panel-active text-white shadow-sm" : "text-gray-400 hover:text-white"}`}>運行法術</button>
                            </div>
                            <div className="flex items-center ml-1.5 bg-panel-inactive p-1 rounded-lg shadow-sm">
                                <button onClick={() => { playClickSound(); setRecapMode("list"); }} title="歷史前情提要" className="w-7 h-7 text-gray-400 hover:text-white flex items-center justify-center outline-none transition-colors"><FaBook className="w-3.5 h-3.5" /></button>
                            </div>
                        </div>
                        <div className="flex-1 relative overflow-y-auto no-scrollbar">
                            {magicTab === "SPELLBOOK" ? <SpellBook /> : <SceneControls />}
                        </div>
                    </>
                )}

                {/* 故事管理介面 (支援 GM 與 PLAYER) */}
                {(role === "PLAYER" || primaryTab === "STORY") && (
                    <StoryManager
                        openRecap={() => setRecapMode("list")}
                        renderLeftToggle={ role === "GM" ? (
                            <div className="flex bg-panel-inactive p-1 rounded-lg shrink-0 shadow-sm mr-1.5">
                                <button onClick={() => { playClickSound(); setPrimaryTab("MAGIC"); }} className="w-8 h-7 text-gray-400 hover:text-white flex items-center justify-center outline-none transition-colors"><FaWandMagicSparkles className="w-3.5 h-3.5" /></button>
                                <button className="w-8 h-7 bg-panel-active text-white rounded flex items-center justify-center shadow-sm outline-none"><FaBookOpen className="w-3.5 h-3.5" /></button>
                            </div>
                        ) : undefined }
                    />
                )}
            </div>
            <MovementHandler />
        </div>
    );
}