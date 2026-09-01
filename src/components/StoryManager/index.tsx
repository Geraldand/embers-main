// src/components/StoryManager/index.tsx
import { useState, useRef, ReactNode, useEffect } from "react";
import QuestTab from "./QuestTab";
import ShopTab from "./ShopTab";
import LootTab from "./LootTab";
import LegacyTab from "./LegacyTab";
import { FaDownload, FaUpload, FaBook } from "react-icons/fa6";
import { useStoryData } from "./store";
import { downloadFileFromString, loadJSONFile } from "../../utils";

const SUB_TABS = ["故事", "商店", "戰利品", "遺留物"];

export default function StoryManager({ openRecap, renderLeftToggle }: { openRecap?: () => void, renderLeftToggle?: ReactNode }) {
    const [activeTab, setActiveTab] = useState(0);
    const { isGM, getFullData, importData, unread, clearUnread } = useStoryData();
    const fileInputRef = useRef<HTMLInputElement>(null);

    // 確保當下處於該分頁時，收到廣播立刻消除紅點
    useEffect(() => {
        if (unread[activeTab]) {
            clearUnread(activeTab);
        }
    }, [unread, activeTab, clearUnread]);

    function playClickSound() {
        try { const audio = new Audio('/click.mp3'); audio.volume = 0.15; audio.play().catch(() => { }); } catch (e) { }
    }
    const handleExport = () => {
        playClickSound();
        const data = getFullData();
        const jsonString = JSON.stringify(data, null, 2);
        const dateStr = new Date().toISOString().split('T')[0];
        downloadFileFromString(jsonString, `campaign-backup-${dateStr}.json`);
    };

    const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
        loadJSONFile(e, (json) => {
            if (confirm("警告：匯入將會覆蓋當前所有的故事紀錄。確定要繼續嗎？")) {
                importData(json);
            }
        });
    };

    const handleTabClick = (idx: number) => {
        playClickSound();
        setActiveTab(idx);
        clearUnread(idx);
    };

    return (
        <div className="flex flex-col h-full w-full">
            <input ref={fileInputRef} style={{ display: "none" }} accept=".json" type="file" onChange={handleImport} />

            <div className="flex w-full items-center mb-3 shrink-0">
                {renderLeftToggle}
                
                <div className="flex flex-1 bg-panel-inactive p-1 rounded-lg shadow-sm">
                    {SUB_TABS.map((tab, idx) => {
                        const isActive = activeTab === idx;
                        return (
                            <button
                                key={idx}
                                onClick={() => handleTabClick(idx)}
                                title={tab}
                                className={`relative flex-1 text-[12px] font-bold h-7 rounded-md transition-all outline-none truncate px-0.5 ${
                                    isActive ? "bg-panel-active text-white shadow-sm" : "text-gray-400 hover:text-white"
                                }`}
                            >
                                {tab}
                                {unread[idx] && !isActive && (
                                    <span className="absolute top-1 right-2 w-1.5 h-1.5 bg-red-500 rounded-full shadow-sm animate-pulse"></span>
                                )}
                            </button>
                        );
                    })}
                </div>
                
                {isGM ? (
                    <div className="flex items-center gap-0.5 ml-1.5 bg-panel-inactive p-1 rounded-lg shadow-sm shrink-0">
                        <button onClick={() => fileInputRef.current?.click()} title="匯入紀錄" className="w-7 h-7 rounded text-gray-400 hover:text-panel-active hover:bg-black/20 transition-colors outline-none flex items-center justify-center"><FaUpload className="w-3.5 h-3.5" /></button>
                        <button onClick={handleExport} title="匯出紀錄" className="w-7 h-7 rounded text-gray-400 hover:text-panel-active hover:bg-black/20 transition-colors outline-none flex items-center justify-center"><FaDownload className="w-3.5 h-3.5" /></button>
                        {openRecap && (
                            <button onClick={() => { playClickSound(); openRecap(); }} title="歷史前情提要" className="w-7 h-7 rounded text-gray-400 hover:text-white hover:bg-black/20 transition-colors outline-none flex items-center justify-center"><FaBook className="w-3.5 h-3.5" /></button>
                        )}
                    </div>
                ) : (
                    openRecap && (
                        <div className="flex items-center ml-1.5 bg-panel-inactive p-1 rounded-lg shadow-sm shrink-0">
                            <button onClick={() => { playClickSound(); openRecap(); }} title="歷史前情提要" className="w-7 h-7 rounded text-gray-400 hover:text-white transition-colors outline-none flex items-center justify-center"><FaBook className="w-3.5 h-3.5" /></button>
                        </div>
                    )
                )}
            </div>

            <div className="flex-1 overflow-y-auto no-scrollbar scroll-smooth relative px-1">
                {activeTab === 0 && <QuestTab />}
                {activeTab === 1 && <ShopTab />}
                {activeTab === 2 && <LootTab />}
                {activeTab === 3 && <LegacyTab />}
            </div>
        </div>
    );
}