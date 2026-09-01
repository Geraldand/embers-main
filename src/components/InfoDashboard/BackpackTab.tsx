// src/components/InfoDashboard/BackpackTab.tsx
import { useCallback, useEffect, useState } from "react";
import OBR from "@owlbear-rodeo/sdk";
import { getMergedRoomArray } from "../../lib/metadataHelpers";
import { HISTORY_BASE_KEY, ScavengedHistoryItem } from "./ScavengeTab";

export default function BackpackTab() {
    const [history, setHistory] = useState<ScavengedHistoryItem[]>([]);

    const loadHistory = useCallback(async () => {
        const loadedHistory = await getMergedRoomArray<ScavengedHistoryItem>(HISTORY_BASE_KEY);
        // Sort by timestamp descending (newest first)
        setHistory(loadedHistory.sort((a, b) => b.timestamp - a.timestamp));
    }, []);

    useEffect(() => {
        loadHistory();
        const unsubscribe = OBR.room.onMetadataChange(() => loadHistory());
        return () => unsubscribe();
    }, [loadHistory]);

    return (
        <div className="flex flex-col gap-2 w-full">
            {history.length === 0 && <p className="text-mirage-500 text-center mt-4">背包空空如也，快去搜刮怪物吧！</p>}
            
            {history.map((hist) => (
                <div key={hist.id} className="bg-white dark:bg-mirage-950 border border-emerald-500/30 p-4 rounded-xl flex flex-col gap-1.5 shadow-sm">
                    <div className="flex items-center gap-2">
                        <span className="font-bold text-emerald-400">{hist.item.name}</span>
                        <span className="text-[10px] bg-emerald-500/15 text-emerald-500 px-2 py-0.5 rounded-full">來自: {hist.source}</span>
                    </div>
                    {hist.item.description && <span className="text-sm text-mirage-600 dark:text-mirage-300 whitespace-pre-wrap mt-1">{hist.item.description}</span>}
                    <div className="flex gap-3 mt-1 pt-2 border-t border-mirage-100 dark:border-mirage-800">
                        {hist.item.price && <span className="text-xs text-amber-500 font-bold">價值: {hist.item.price}</span>}
                        {hist.item.weight && <span className="text-xs text-mirage-400">重量: {hist.item.weight}</span>}
                    </div>
                </div>
            ))}
        </div>
    );
}