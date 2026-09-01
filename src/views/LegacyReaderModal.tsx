// src/views/LegacyReaderModal.tsx
import { useEffect, useState } from "react";
import OBR from "@owlbear-rodeo/sdk";
import { LEGACY_THEMES } from "../components/StoryManager/constants";

export default function LegacyReaderModal() {
    const [legacy, setLegacy] = useState<any>(null);
    const [themeObj, setThemeObj] = useState(LEGACY_THEMES.standard);

    useEffect(() => {
        OBR.onReady(() => {
            const saved = localStorage.getItem(`eu.armindo.embers/current-broadcast-legacy`);
            if (saved) {
                try { setLegacy(JSON.parse(saved)); } catch (e) {}
            }

            const unsub = OBR.broadcast.onMessage("eu.armindo.embers/story-sync", (msg) => {
                const payload = msg.data as any;
                if (payload.type === "UPDATE_LEGACY_CONTENT" || payload.type === "FORCE_OPEN_LEGACY") {
                    setLegacy(payload.legacy);
                    localStorage.setItem(`eu.armindo.embers/current-broadcast-legacy`, JSON.stringify(payload.legacy));
                }
            });
            return () => unsub();
        });
    }, []);

    useEffect(() => {
        if (legacy && legacy.themeId) {
            setThemeObj(LEGACY_THEMES[legacy.themeId] || LEGACY_THEMES.standard);
        }
    }, [legacy]);

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

    if (!legacy) return <div className="p-8 text-center text-white bg-panel-base h-screen font-bold">載入中或文件已銷毀...</div>;

    return (
        <div className="w-full h-screen overflow-y-auto p-10 font-serif relative selection:bg-black/20 no-scrollbar" style={{ backgroundColor: themeObj.bg, color: themeObj.text }}>
            <h2 className="text-3xl font-bold mb-8 text-center border-b border-black/20 pb-6">{legacy.name}</h2>
            <div className="text-lg leading-relaxed whitespace-pre-wrap break-words" style={{ wordBreak: 'break-word', overflowWrap: 'anywhere' }}>
                {renderTextWithSecrets(legacy.description, legacy.revealedSecrets)}
            </div>
        </div>
    );
}