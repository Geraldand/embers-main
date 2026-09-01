// src/components/InfoDashboard/index.tsx
import { useEffect, useState, useRef } from "react";
import OBR from "@owlbear-rodeo/sdk";
import { FaDownload, FaUpload } from "react-icons/fa6";
import * as Tabs from "@radix-ui/react-tabs";
import { useOBR } from "../../react-obr/providers";

import QuestsTab from "./QuestsTab";
import HandoutsTab from "./HandoutsTab";
import ShopsTab from "./ShopsTab";
import LootPoolsTab from "./LootPoolsTab";
import ScavengeTab, { LOOT_DROP_CHANNEL } from "./ScavengeTab";
import BackpackTab from "./BackpackTab";

export default function InfoDashboard() {
    const obr = useOBR();
    const [isGM, setIsGM] = useState(false);
    const [tabIndex, setTabIndex] = useState("0");
    const fileInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (!obr.ready || !obr.player) return;
        setIsGM(obr.player.role === "GM");

        const unsub = OBR.broadcast.onMessage(LOOT_DROP_CHANNEL, (event) => {
            const data = event.data as { pool: string, item: string };
            OBR.notification.show(`從 [${data.pool}] 搜刮到了：${data.item}`, "SUCCESS");
        });

        return () => unsub();
    }, [obr.ready, obr.player]);

    const handleExport = () => {
        OBR.notification.show("匯出功能準備就緒", "INFO");
    };

    const handleImport = () => {
        OBR.notification.show("匯入功能準備就緒", "INFO");
    };

    return (
        <div className="flex flex-col h-full w-full px-5">
            <Tabs.Root value={tabIndex} onValueChange={setTabIndex} className="flex flex-col flex-grow h-full overflow-hidden">
                
                {/* Sub Navigation Bar */}
                <div className="flex-none flex flex-col mb-5">
                    <div className="flex items-center justify-between">
                        <Tabs.List className="flex overflow-x-auto no-scrollbar gap-2 w-full pr-2">
                            <Tabs.Trigger value="0" className="px-4 py-1.5 rounded-full text-xs font-bold text-mirage-500 bg-transparent hover:text-mirage-300 data-[state=active]:bg-mirage-800 data-[state=active]:text-white transition-all outline-none whitespace-nowrap">任務板</Tabs.Trigger>
                            <Tabs.Trigger value="1" className="px-4 py-1.5 rounded-full text-xs font-bold text-mirage-500 bg-transparent hover:text-mirage-300 data-[state=active]:bg-mirage-800 data-[state=active]:text-white transition-all outline-none whitespace-nowrap">故事手記</Tabs.Trigger>
                            <Tabs.Trigger value="2" className="px-4 py-1.5 rounded-full text-xs font-bold text-mirage-500 bg-transparent hover:text-mirage-300 data-[state=active]:bg-mirage-800 data-[state=active]:text-white transition-all outline-none whitespace-nowrap">互動商店</Tabs.Trigger>
                            <Tabs.Trigger value="3" className="px-4 py-1.5 rounded-full text-xs font-bold text-mirage-500 bg-transparent hover:text-mirage-300 data-[state=active]:bg-mirage-800 data-[state=active]:text-white transition-all outline-none whitespace-nowrap">區域戰利品</Tabs.Trigger>
                            
                            {!isGM && <Tabs.Trigger value="4" className="px-4 py-1.5 rounded-full text-xs font-bold text-emerald-600/80 bg-transparent hover:text-emerald-400 hover:bg-emerald-500/10 data-[state=active]:bg-emerald-500/20 data-[state=active]:text-emerald-400 transition-all outline-none whitespace-nowrap">隊伍背包</Tabs.Trigger>}
                            {isGM && <Tabs.Trigger value="5" className="px-4 py-1.5 rounded-full text-xs font-bold text-amber-600/80 bg-transparent hover:text-amber-400 hover:bg-amber-500/10 data-[state=active]:bg-amber-500/20 data-[state=active]:text-amber-400 transition-all outline-none whitespace-nowrap">搜刮系統</Tabs.Trigger>}
                        </Tabs.List>

                        {isGM && (
                            <div className="flex gap-1.5 flex-shrink-0 ml-2">
                                <input ref={fileInputRef} style={{ display: "none" }} accept=".json" type="file" onChange={handleImport} />
                                <button title="匯入 JSON" className="w-8 h-8 flex items-center justify-center rounded-full bg-mirage-900 text-mirage-400 hover:text-white hover:bg-mirage-800 border border-mirage-800 transition-all outline-none shadow-sm" onClick={() => fileInputRef.current?.click()}><FaUpload size={12} /></button>
                                <button title="匯出 JSON" className="w-8 h-8 flex items-center justify-center rounded-full bg-mirage-900 text-mirage-400 hover:text-white hover:bg-mirage-800 border border-mirage-800 transition-all outline-none shadow-sm" onClick={handleExport}><FaDownload size={12} /></button>
                            </div>
                        )}
                    </div>
                </div>

                {/* Sub Tab Content */}
                <div className="flex-grow overflow-y-auto no-scrollbar pb-6 flex flex-col">
                    <Tabs.Content value="0" className="h-full w-full outline-none flex flex-col"><QuestsTab isGM={isGM} /></Tabs.Content>
                    <Tabs.Content value="1" className="h-full w-full outline-none flex flex-col"><HandoutsTab isGM={isGM} /></Tabs.Content>
                    <Tabs.Content value="2" className="h-full w-full outline-none flex flex-col"><ShopsTab isGM={isGM} /></Tabs.Content>
                    <Tabs.Content value="3" className="h-full w-full outline-none flex flex-col"><LootPoolsTab isGM={isGM} /></Tabs.Content>
                    {!isGM && <Tabs.Content value="4" className="h-full w-full outline-none flex flex-col"><BackpackTab /></Tabs.Content>}
                    {isGM && <Tabs.Content value="5" className="h-full w-full outline-none flex flex-col"><ScavengeTab /></Tabs.Content>}
                </div>
            </Tabs.Root>
        </div>
    );
}