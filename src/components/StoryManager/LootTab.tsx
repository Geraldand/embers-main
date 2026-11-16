// src/components/StoryManager/LootTab.tsx
import { useState, useEffect, useRef } from "react";
import OBR from "@owlbear-rodeo/sdk";
import {
    FaCirclePlus,
    FaPencil,
    FaEye,
    FaEyeSlash,
    FaTrash,
    FaUpload,
    FaDownload,
    FaCircleCheck,
    FaCircleExclamation,
    FaScroll,
    FaCoins,
    FaXmark,
    FaWeightHanging,
    FaCompass,
    FaImage,
    FaCloudArrowUp,
    FaWandMagicSparkles
} from "react-icons/fa6";
import { LootSource } from "./types";
import { useStoryData } from "./store";
import { LOOT_SCENARIOS, LOOT_SCENARIO_LABELS, LEGACY_THEMES, getRandomScenarioText } from "./constants";
import { compressImageFile } from "./ShopTab";
import { ImageCropper, CroppedImage, DEFAULT_IMAGE_CROP, openGlobalImageViewer } from "./ImageCropper";
import { downloadFileFromString } from "../../utils";

const META_ID = "com.yourname.character-sheet-extension/metadata";
const CURR_ID = "com.yourname.character-sheet-extension/currency";
export const ACTIVE_LOOT_STORAGE_KEY = "eu.armindo.embers/active-loot-id";

function playClickSound() {
    try {
        const audio = new Audio("/click.mp3");
        audio.volume = 0.15;
        audio.play().catch(() => {});
    } catch (e) {}
}

function playLootOpenSound() {
    try {
        const audio = new Audio("/loot_open.mp3");
        audio.volume = 0.3;
        audio.play().catch(() => {});
    } catch (e) {}
}

const INVENTORY_CATEGORIES = [
    { id: "equipped", name: "裝備中", weight: 0 },
    { id: "backpack", name: "背包", weight: 5 },
    { id: "pouch", name: "囊袋", weight: 1 },
    { id: "sack", name: "麻袋", weight: 0.5 },
    { id: "quiver", name: "箭袋/弩矢匣", weight: 1 },
    { id: "component_pouch", name: "材料包", weight: 2 },
    { id: "magic", name: "魔法物品", weight: 0 },
    { id: "other", name: "備用格", weight: 0 }
];

export function pickLootScenarioSentence(source?: LootSource | null): string {
    if (!source) return "正在搜尋周遭線索...";
    if (source.customScenarios && source.customScenarios.length > 0) {
        const valid = source.customScenarios.filter(s => s.trim() !== "");
        if (valid.length > 0) {
            return valid[Math.floor(Math.random() * valid.length)];
        }
    }
    return getRandomScenarioText("loot", source.scenarioKey || "humanoid");
}

export default function LootTab() {
    const { loots, logs, isGM, saveLoots } = useStoryData();
    const [sourceModalOpen, setSourceModalOpen] = useState(false);
    const [editTab, setEditTab] = useState<"basic" | "background" | "scenarios">("basic");
    const [logModalOpen, setLogModalOpen] = useState(false);
    const [editingSource, setEditingSource] = useState<LootSource | null>(null);
    const [formSource, setFormSource] = useState<Partial<LootSource>>({});
    const [newScenarioInput, setNewScenarioInput] = useState("");
    const [activeTokenId, setActiveTokenId] = useState<string | null>(null);
    const [activeTokenName, setActiveTokenName] = useState<string>("請點選角色");
    const [activeTokenGold, setActiveTokenGold] = useState<number | null>(null);
    const [activeTokenWeight, setActiveTokenWeight] = useState<{ current: number; max: number } | null>(null);
    const [toastMsg, setToastMsg] = useState<{ text: string; type: "success" | "error" } | null>(null);
    const [activeScenarioText, setActiveScenarioText] = useState("正在查看殘骸...");
    const [confirmDeleteSource, setConfirmDeleteSource] = useState<string | null>(null);

    const bgFileInputRef = useRef<HTMLInputElement | null>(null);

    const fetchTokenData = async (tokenId: string) => {
        const items = await OBR.scene.items.getItems([tokenId]);
        if (items.length > 0) {
            const token = items[0];
            const meta = (token.metadata[META_ID] as any) || {};
            const rawCurr = token.metadata[CURR_ID] || meta.currency;
            const currency = rawCurr || { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 };
            setActiveTokenGold(
                (currency.cp / 100) +
                (currency.sp / 10) +
                (currency.ep / 2) +
                (currency.gp || 0) +
                (currency.pp * 10)
            );

            const rawInv = token.metadata["com.yourname.character-sheet-extension/inventory"] || meta.inventory || [];
            const inventory = Array.isArray(rawInv) ? rawInv : [];
            const itemsWeight = inventory.reduce((acc: number, i: any) => acc + ((i.weight || 0) * (i.quantity || 0)), 0);
            const activeContainersWeight = INVENTORY_CATEGORIES.reduce(
                (acc, cat) => (inventory.some((i: any) => i.category === cat.id) ? acc + cat.weight : acc),
                0
            );
            const coinWeight =
                ((currency.cp || 0) +
                    (currency.sp || 0) +
                    (currency.ep || 0) +
                    (currency.gp || 0) +
                    (currency.pp || 0)) / 50;
            const currentW = +(itemsWeight + activeContainersWeight + coinWeight).toFixed(1);

            const abilities = meta.abilities || { str: 10 };
            const maxW = (abilities.str || 10) * 15;

            setActiveTokenWeight({ current: currentW, max: maxW });
        }
    };

    useEffect(() => {
        const updateActiveToken = async (selection: string[] | undefined | null) => {
            const safeSelection = selection || [];
            if (safeSelection.length !== 1) {
                setActiveTokenId(null);
                setActiveTokenName("請點選角色");
                setActiveTokenGold(null);
                setActiveTokenWeight(null);
                return;
            }
            const items = await OBR.scene.items.getItems([safeSelection[0]]);
            if (items.length > 0) {
                setActiveTokenId(items[0].id);
                setActiveTokenName((items[0] as any).text?.plainText || items[0].name || "未命名");
                fetchTokenData(items[0].id);
            }
        };
        OBR.player.getSelection().then(updateActiveToken);
        const unsub = OBR.player.onChange((player) => updateActiveToken(player.selection));
        return () => unsub();
    }, []);

    useEffect(() => {
        const handleGiftNotification = (e: any) => {
            const detail = e.detail;
            if (!detail || !detail.recipientTokenId) return;
            if (activeTokenId && detail.recipientTokenId === activeTokenId) {
                setToastMsg({
                    text: `收到來自 ${detail.senderName} 的贈與：${detail.summary}`,
                    type: "success"
                });
                setTimeout(() => setToastMsg(null), 3500);
            }
        };
        window.addEventListener("gift-received", handleGiftNotification);
        return () => window.removeEventListener("gift-received", handleGiftNotification);
    }, [activeTokenId]);

    const openCentralLootModal = async (source: LootSource) => {
        playLootOpenSound();
        setActiveScenarioText(pickLootScenarioSentence(source));
        localStorage.setItem(ACTIVE_LOOT_STORAGE_KEY, source.id);

        const [viewWidth, viewHeight] = await Promise.all([
            OBR.viewport.getWidth(),
            OBR.viewport.getHeight()
        ]);
        const modalWidth = Math.min(960, Math.max(580, Math.floor(viewWidth * 0.88)));
        const modalHeight = Math.min(680, Math.max(420, Math.floor(viewHeight * 0.86)));

        await OBR.modal.open({
            id: "eu.armindo.embers/loot-modal",
            url: `/?view=loot-modal&lootId=${encodeURIComponent(source.id)}`,
            width: modalWidth,
            height: modalHeight,
            fullScreen: false
        });
    };

    const handleSaveSource = () => {
        playClickSound();
        const newSource: LootSource = {
            id: editingSource?.id || Date.now().toString(36),
            name: formSource.name || "未命名探索地區",
            description: formSource.description || "",
            scenarioKey: formSource.scenarioKey || "humanoid",
            customScenarios: (formSource.customScenarios || []).filter(s => s.trim() !== ""),
            themeId: formSource.themeId || "panel",
            backgroundImageUrl: formSource.backgroundImageUrl || "",
            imageCrop: formSource.imageCrop || { ...DEFAULT_IMAGE_CROP },
            subCategories: editingSource?.subCategories || formSource.subCategories || [],
            hiddenSubCategories: editingSource?.hiddenSubCategories || formSource.hiddenSubCategories || [],
            items: editingSource?.items || formSource.items || [],
            isVisible: formSource.isVisible ?? false,
            createdAt: editingSource?.createdAt || Date.now()
        };
        saveLoots(editingSource ? loots.map(s => (s.id === editingSource.id ? newSource : s)) : [...loots, newSource]);
        setSourceModalOpen(false);
    };

    const handlePickOBRBackground = async () => {
        try {
            const assets = await OBR.assets.downloadImages(false);
            if (assets && assets.length > 0 && assets[0].image?.url) {
                setFormSource(prev => ({
                    ...prev,
                    backgroundImageUrl: assets[0].image.url,
                    imageCrop: { ...DEFAULT_IMAGE_CROP }
                }));
            }
        } catch (e) {
            console.warn("Failed to pick OBR background image", e);
        }
    };

    const handleLocalBgUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        try {
            const compressed = await compressImageFile(file, 800, 0.82);
            setFormSource(prev => ({
                ...prev,
                backgroundImageUrl: compressed,
                imageCrop: { ...DEFAULT_IMAGE_CROP }
            }));
        } catch (err) {
            console.error("Failed to compress loot background image", err);
        } finally {
            e.target.value = "";
        }
    };

    const handleAddScenarioSentence = () => {
        if (!newScenarioInput.trim()) return;
        playClickSound();
        setFormSource(prev => ({
            ...prev,
            customScenarios: [...(prev.customScenarios || []), newScenarioInput.trim()]
        }));
        setNewScenarioInput("");
    };

    const handleImportPresetScenarios = () => {
        playClickSound();
        const key = formSource.scenarioKey || "humanoid";
        const presets = LOOT_SCENARIOS[key] || [];
        const existing = new Set(formSource.customScenarios || []);
        const merged = [...(formSource.customScenarios || [])];
        presets.forEach(p => {
            if (!existing.has(p)) merged.push(p);
        });
        setFormSource(prev => ({ ...prev, customScenarios: merged }));
    };

    const handleExportAllLoots = () => {
        downloadFileFromString(JSON.stringify(loots, null, 2), "loots_backup.json");
    };

    const handleImportAllLoots = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const json = JSON.parse(event.target?.result as string);
                if (Array.isArray(json)) {
                    saveLoots([...loots, ...json]);
                    setToastMsg({ text: "成功匯入探索地區群組", type: "success" });
                    setTimeout(() => setToastMsg(null), 3000);
                }
            } catch (err) {
                alert("JSON 解析失敗。");
            }
        };
        reader.readAsText(file);
        e.target.value = "";
    };

    const visibleLoots = isGM ? loots : loots.filter(s => s.isVisible);

    let weightColor = "text-emerald-400 border-emerald-500/20 bg-emerald-500/10";
    if (activeTokenWeight) {
        if (activeTokenWeight.current > activeTokenWeight.max) {
            weightColor = "text-red-400 border-red-500/30 bg-red-500/15";
        } else if (activeTokenWeight.current > activeTokenWeight.max * 0.8) {
            weightColor = "text-orange-400 border-orange-500/30 bg-orange-500/15";
        }
    }

    return (
        <div className="relative px-1 pb-4">
            <input
                ref={bgFileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleLocalBgUpload}
            />

            {toastMsg && (
                <div
                    className={`fixed top-4 left-1/2 -translate-x-1/2 z-[200] flex items-center gap-2 px-4 py-2 rounded-full shadow-lg text-xs font-bold text-white animate-in slide-in-from-top-4 fade-in ${
                        toastMsg.type === "success"
                            ? "bg-emerald-600 border border-emerald-400"
                            : "bg-red-600 border border-red-400"
                    }`}
                >
                    {toastMsg.type === "success" ? <FaCircleCheck /> : <FaCircleExclamation />} {toastMsg.text}
                </div>
            )}

            {/* Selected Character & Scenario Banner */}
            <div className="flex items-center gap-2 p-2.5 mb-2.5 bg-transparent border-b border-panel-inactive">
                <span className="text-base font-black truncate flex-1">
                    <span className="text-[#9c81d8] mr-2">{activeTokenName}</span>
                    <span className="text-xs text-gray-400 font-bold">{activeScenarioText}</span>
                </span>
            </div>

            {/* Top Action Bar */}
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pr-2">
                    {activeTokenGold !== null && (
                        <span className="flex items-center gap-1.5 text-[11px] font-bold text-amber-400 bg-amber-500/10 px-2.5 py-1.5 rounded-full border border-amber-500/20 shadow-sm shrink-0">
                            <FaCoins className="w-3.5 h-3.5" /> {activeTokenGold.toFixed(2)} GP
                        </span>
                    )}
                    {activeTokenWeight !== null && (
                        <span className={`flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1.5 rounded-full border shadow-sm shrink-0 ${weightColor}`}>
                            <FaWeightHanging className="w-3.5 h-3.5" /> {activeTokenWeight.current} / {activeTokenWeight.max} lb
                        </span>
                    )}
                </div>

                <div className="flex items-center bg-panel-inactive rounded-full shadow-sm ml-auto shrink-0">
                    <button
                        onClick={() => setLogModalOpen(true)}
                        className="p-2 text-gray-400 hover:text-white transition-colors outline-none"
                        title="冒險日誌"
                    >
                        <FaScroll className="w-3.5 h-3.5" />
                    </button>
                    {isGM && (
                        <>
                            <div className="w-px h-3 bg-gray-600 mx-0.5"></div>
                            <label
                                className="p-2 text-gray-400 hover:text-panel-active cursor-pointer transition-colors outline-none"
                                title="匯入探索地區陣列"
                            >
                                <FaUpload className="w-3.5 h-3.5" />
                                <input type="file" accept=".json" className="hidden" onChange={handleImportAllLoots} />
                            </label>
                            <div className="w-px h-3 bg-gray-600 mx-0.5"></div>
                            <button
                                onClick={handleExportAllLoots}
                                className="p-2 text-gray-400 hover:text-panel-active transition-colors outline-none"
                                title="匯出所有探索地區"
                            >
                                <FaDownload className="w-3.5 h-3.5" />
                            </button>
                            <div className="w-px h-3 bg-gray-600 mx-0.5"></div>
                            <button
                                onClick={() => {
                                    setEditingSource(null);
                                    setEditTab("basic");
                                    setFormSource({
                                        isVisible: true,
                                        scenarioKey: "humanoid",
                                        customScenarios: [],
                                        themeId: "panel",
                                        backgroundImageUrl: "",
                                        subCategories: [],
                                        hiddenSubCategories: [],
                                        items: []
                                    });
                                    setNewScenarioInput("");
                                    setSourceModalOpen(true);
                                    playClickSound();
                                }}
                                className="p-2 text-white hover:text-panel-active transition-colors outline-none"
                                title="新增探索地區"
                            >
                                <FaCirclePlus className="w-4 h-4" />
                            </button>
                        </>
                    )}
                </div>
            </div>

            {/* Exploration Regions List */}
            <div className="flex flex-col gap-3.5 pb-10">
                {visibleLoots.length === 0 && (
                    <p className="text-xs font-bold text-gray-500 text-center py-10">
                        目前尚無開放的探索地區，點擊下方按鈕可隨時開啟營地物資交流
                    </p>
                )}

                {visibleLoots.map(source => {
                    const themeObj = LEGACY_THEMES[source.themeId || "panel"] || LEGACY_THEMES.panel;
                    const hiddenCats = new Set(source.hiddenSubCategories || []);
                    const isSubCatHiddenForPlayer = (subCat?: string) => {
                        if (!subCat) return false;
                        const parts = subCat.split("/").map(p => p.trim()).filter(Boolean);
                        let acc = "";
                        for (const p of parts) {
                            acc = acc ? `${acc} / ${p}` : p;
                            if (hiddenCats.has(acc) || hiddenCats.has(p)) return true;
                        }
                        return false;
                    };

                    const visibleItemCount = (source.items || []).filter(i =>
                        isGM ? true : i.isRevealed && !isSubCatHiddenForPlayer(i.subCategory)
                    ).length;

                    return (
                        <div
                            key={source.id}
                            style={{
                                backgroundColor: themeObj.bg,
                                color: themeObj.text,
                                borderColor: themeObj.border || "rgba(255, 255, 255, 0.12)"
                            }}
                            className={`relative flex flex-col rounded-2xl border shadow-md overflow-hidden transition-all ${
                                !source.isVisible ? "opacity-80" : ""
                            }`}
                        >
                            {source.backgroundImageUrl && (
                                <div
                                    onClick={() => openGlobalImageViewer(source.backgroundImageUrl!, source.name)}
                                    title="點擊檢視完整背景圖"
                                    className="relative h-28 w-full overflow-hidden cursor-zoom-in group/banner"
                                >
                                    <CroppedImage
                                        src={source.backgroundImageUrl}
                                        alt={source.name}
                                        crop={source.imageCrop}
                                        containerClassName="w-full h-full"
                                        imgClassName="brightness-105 transition-transform duration-300 group-hover/banner:scale-105"
                                    />
                                    <div className="absolute inset-0 bg-gradient-to-t from-black/65 via-black/20 to-transparent pointer-events-none" />
                                    <div className="absolute bottom-2.5 left-3.5 right-3.5 flex items-center justify-between gap-2">
                                        <div className="flex items-center gap-2 min-w-0">
                                            <h4 className="font-black text-lg text-white drop-shadow truncate">
                                                {source.name}
                                            </h4>
                                            {isGM && !source.isVisible && (
                                                <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-rose-500/80 text-white shadow-sm shrink-0">
                                                    未開放
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            )}

                            <div className="p-3.5 flex flex-col gap-2.5">
                                {!source.backgroundImageUrl && (
                                    <div className="flex items-center justify-between gap-2">
                                        <div className="flex items-center gap-2 min-w-0">
                                            <h4 className="font-black text-lg truncate">{source.name}</h4>
                                            {isGM && !source.isVisible && (
                                                <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-black/30 text-gray-300 border border-white/10 shrink-0">
                                                    未開放
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                )}

                                {source.description && (
                                    <p className="text-sm opacity-85 line-clamp-2 leading-relaxed">
                                        {source.description}
                                    </p>
                                )}

                                <div className="flex items-center justify-between pt-2 border-t border-current/10 mt-0.5">
                                    <span className="text-xs font-bold opacity-75">
                                        發現物數量：{visibleItemCount}
                                    </span>

                                    <div className="flex items-center gap-1.5">
                                        {isGM && (
                                            <div className="flex items-center gap-1 bg-black/25 text-white rounded-full px-2 py-1">
                                                <button
                                                    onClick={() =>
                                                        saveLoots(
                                                            loots.map(s =>
                                                                s.id === source.id ? { ...s, isVisible: !s.isVisible } : s
                                                            )
                                                        )
                                                    }
                                                    title={source.isVisible ? "對玩家開放中" : "對玩家隱藏中"}
                                                    className={`p-1 outline-none ${
                                                        source.isVisible ? "text-amber-300" : "text-gray-400 hover:text-white"
                                                    }`}
                                                >
                                                    {source.isVisible ? <FaEye className="w-3.5 h-3.5" /> : <FaEyeSlash className="w-3.5 h-3.5" />}
                                                </button>
                                                <button
                                                    onClick={() => {
                                                        setEditingSource(source);
                                                        setEditTab("basic");
                                                        setFormSource({
                                                            ...source,
                                                            customScenarios: source.customScenarios || []
                                                        });
                                                        setNewScenarioInput("");
                                                        setSourceModalOpen(true);
                                                        playClickSound();
                                                    }}
                                                    title="編輯地區設定"
                                                    className="p-1 text-gray-300 hover:text-white outline-none"
                                                >
                                                    <FaPencil className="w-3.5 h-3.5" />
                                                </button>
                                                <button
                                                    onClick={() =>
                                                        confirmDeleteSource === source.id
                                                            ? saveLoots(loots.filter(s => s.id !== source.id))
                                                            : setConfirmDeleteSource(source.id)
                                                    }
                                                    onMouseLeave={() => setConfirmDeleteSource(null)}
                                                    title="刪除探索地區"
                                                    className={`p-1 outline-none ${
                                                        confirmDeleteSource === source.id
                                                            ? "text-red-400"
                                                            : "text-gray-300 hover:text-red-400"
                                                    }`}
                                                >
                                                    {confirmDeleteSource === source.id ? (
                                                        <FaXmark className="w-3.5 h-3.5" />
                                                    ) : (
                                                        <FaTrash className="w-3.5 h-3.5" />
                                                    )}
                                                </button>
                                            </div>
                                        )}

                                        <button
                                            onClick={() => openCentralLootModal(source)}
                                            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-black bg-panel-active text-white shadow-md hover:brightness-110 transition-all outline-none"
                                        >
                                            <FaCompass className="w-3.5 h-3.5" /> 進入探索
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Logs Modal */}
            {logModalOpen && (
                <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in">
                    <div className="w-full max-w-[400px] h-[80vh] flex flex-col shadow-2xl rounded-2xl bg-panel-content p-5 border border-panel-inactive">
                        <h3 className="font-bold text-white mb-4">冒險與交易日誌</h3>
                        <div className="flex-1 overflow-y-auto no-scrollbar flex flex-col gap-2">
                            {logs.length === 0 ? (
                                <p className="text-xs text-gray-500 text-center mt-10">尚無紀錄</p>
                            ) : (
                                logs.map(l => (
                                    <div
                                        key={l.id}
                                        className="bg-panel-base p-2.5 rounded-xl text-[13px] text-gray-300 shadow-sm border border-panel-inactive/50 flex flex-col gap-1"
                                    >
                                        <span className="text-[10px] text-amber-400">
                                            {new Date(l.time).toLocaleTimeString()}
                                        </span>
                                        {l.message}
                                    </div>
                                ))
                            )}
                        </div>
                        <button
                            onClick={() => setLogModalOpen(false)}
                            className="mt-4 w-full py-2 rounded-full text-xs font-bold bg-panel-inactive text-white hover:bg-panel-active outline-none"
                        >
                            關閉
                        </button>
                    </div>
                </div>
            )}

            {/* 3-Tab Create / Edit Exploration Region Modal */}
            {sourceModalOpen && (
                <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/65 backdrop-blur-sm p-4 animate-in fade-in">
                    <div className="w-full max-w-[400px] flex flex-col shadow-2xl rounded-2xl bg-panel-content p-5 border border-panel-inactive overflow-hidden">
                        <div className="flex justify-between items-center mb-3 shrink-0">
                            <h3 className="font-bold text-white text-base">
                                {editingSource ? "編輯探索地區" : "新增探索地區"}
                            </h3>
                            <button
                                onClick={() => setSourceModalOpen(false)}
                                className="text-gray-400 hover:text-white outline-none"
                            >
                                <FaXmark className="w-4 h-4" />
                            </button>
                        </div>

                        {/* 3-Tab Pill Switcher */}
                        <div className="flex bg-panel-base/90 rounded-2xl p-1.5 mb-4 shadow-inner shrink-0">
                            <button
                                type="button"
                                onClick={() => {
                                    playClickSound();
                                    setEditTab("basic");
                                }}
                                className={`flex-1 py-1.5 text-xs font-bold rounded-xl transition-all outline-none border ${
                                    editTab === "basic"
                                        ? "bg-panel-inactive text-[#bb99ff] shadow-sm border-white/10"
                                        : "text-gray-400 hover:text-gray-200 border-transparent"
                                }`}
                            >
                                基本資訊
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    playClickSound();
                                    setEditTab("background");
                                }}
                                className={`flex-1 py-1.5 text-xs font-bold rounded-xl transition-all outline-none border ${
                                    editTab === "background"
                                        ? "bg-panel-inactive text-[#bb99ff] shadow-sm border-white/10"
                                        : "text-gray-400 hover:text-gray-200 border-transparent"
                                }`}
                            >
                                氛圍背景
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    playClickSound();
                                    setEditTab("scenarios");
                                }}
                                className={`flex-1 py-1.5 text-xs font-bold rounded-xl transition-all outline-none border ${
                                    editTab === "scenarios"
                                        ? "bg-panel-inactive text-[#bb99ff] shadow-sm border-white/10"
                                        : "text-gray-400 hover:text-gray-200 border-transparent"
                                }`}
                            >
                                情境句子
                            </button>
                        </div>

                        {editTab === "basic" && (
                            <div className="flex flex-col gap-3 animate-in fade-in">
                                <input
                                    autoFocus
                                    type="text"
                                    value={formSource.name || ""}
                                    onChange={(e) => setFormSource({ ...formSource, name: e.target.value })}
                                    placeholder="探索地區名稱，例如：波浪回音洞窟"
                                    className="w-full bg-panel-base text-white text-sm font-bold rounded-xl p-2.5 outline-none border border-transparent focus:border-panel-active shadow-inner"
                                />
                                <textarea
                                    value={formSource.description || ""}
                                    onChange={(e) => setFormSource({ ...formSource, description: e.target.value })}
                                    placeholder="地區環境簡述..."
                                    className="w-full h-24 bg-panel-base text-gray-200 text-xs rounded-xl p-2.5 outline-none resize-none overflow-y-auto editor-scrollbar shadow-inner border border-transparent focus:border-panel-active leading-relaxed"
                                />

                                <div className="flex flex-col gap-1">
                                    <span className="text-[11px] font-bold text-gray-400">介面主題風格</span>
                                    <select
                                        value={formSource.themeId || "panel"}
                                        onChange={(e) => setFormSource({ ...formSource, themeId: e.target.value })}
                                        className="w-full bg-panel-base text-white text-xs font-bold rounded-xl p-2.5 outline-none border border-transparent focus:border-panel-active"
                                    >
                                        {Object.entries(LEGACY_THEMES).map(([k, v]) => (
                                            <option key={k} value={k}>
                                                {v.label}
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                <button
                                    type="button"
                                    onClick={() => setFormSource({ ...formSource, isVisible: !formSource.isVisible })}
                                    className={`w-full h-10 mt-1 rounded-xl text-xs font-bold outline-none border flex items-center justify-center gap-1.5 transition-colors ${
                                        formSource.isVisible
                                            ? "bg-panel-active/20 border-panel-active text-panel-active"
                                            : "bg-panel-base border-transparent text-gray-400 hover:text-white"
                                    }`}
                                >
                                    {formSource.isVisible ? (
                                        <>
                                            <FaEye className="w-3.5 h-3.5" /> 開放探索，對玩家公開
                                        </>
                                    ) : (
                                        <>
                                            <FaEyeSlash className="w-3.5 h-3.5" /> 尚未開放，對玩家隱藏
                                        </>
                                    )}
                                </button>
                            </div>
                        )}

                        {editTab === "background" && (
                            <div className="flex flex-col gap-3 animate-in fade-in">
                                <div className="flex items-center gap-2">
                                    <button
                                        type="button"
                                        onClick={handlePickOBRBackground}
                                        className="flex-1 flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl bg-panel-base hover:bg-panel-inactive text-xs font-bold text-gray-200 outline-none border border-panel-inactive transition-colors"
                                    >
                                        <FaCloudArrowUp className="w-4 h-4 text-panel-active" /> 圖庫選圖
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => bgFileInputRef.current?.click()}
                                        className="flex-1 flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl bg-panel-base hover:bg-panel-inactive text-xs font-bold text-gray-200 outline-none border border-panel-inactive transition-colors"
                                    >
                                        <FaImage className="w-4 h-4 text-amber-400" /> 本機上傳
                                    </button>
                                    {formSource.backgroundImageUrl && (
                                        <button
                                            type="button"
                                            onClick={() =>
                                                setFormSource({
                                                    ...formSource,
                                                    backgroundImageUrl: "",
                                                    imageCrop: { ...DEFAULT_IMAGE_CROP }
                                                })
                                            }
                                            className="px-3 py-2.5 rounded-xl bg-panel-base text-xs font-bold text-red-400 hover:text-red-300 outline-none border border-panel-inactive"
                                        >
                                            移除
                                        </button>
                                    )}
                                </div>

                                {formSource.backgroundImageUrl ? (
                                    <ImageCropper
                                        src={formSource.backgroundImageUrl}
                                        crop={formSource.imageCrop}
                                        aspectClassName="h-36"
                                        onChange={(nextCrop) =>
                                            setFormSource({ ...formSource, imageCrop: nextCrop })
                                        }
                                    />
                                ) : (
                                    <div className="w-full h-44 rounded-xl bg-panel-base border border-dashed border-panel-inactive flex flex-col items-center justify-center text-gray-500 text-xs font-bold gap-2">
                                        <FaImage className="w-6 h-6 opacity-40" />
                                        <span>尚未設定地區背景圖</span>
                                    </div>
                                )}
                            </div>
                        )}

                        {editTab === "scenarios" && (
                            <div className="flex flex-col gap-2.5 animate-in fade-in">
                                <div className="flex items-center justify-between gap-2 bg-panel-base p-2 rounded-xl border border-panel-inactive">
                                    <select
                                        value={formSource.scenarioKey || "humanoid"}
                                        onChange={(e) => setFormSource({ ...formSource, scenarioKey: e.target.value })}
                                        className="flex-1 bg-transparent text-gray-200 text-xs font-bold outline-none cursor-pointer px-1"
                                    >
                                        {Object.entries(LOOT_SCENARIO_LABELS).map(([k, v]) => (
                                            <option key={k} value={k} className="bg-panel-base">
                                                預設分類：{v}
                                            </option>
                                        ))}
                                    </select>
                                    <button
                                        type="button"
                                        onClick={handleImportPresetScenarios}
                                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-panel-content hover:bg-panel-active text-xs font-bold text-amber-400 hover:text-white outline-none transition-colors shrink-0"
                                    >
                                        <FaWandMagicSparkles className="w-3 h-3" /> 匯入範本
                                    </button>
                                </div>

                                <div className="flex items-center gap-1.5">
                                    <input
                                        type="text"
                                        value={newScenarioInput}
                                        onChange={(e) => setNewScenarioInput(e.target.value)}
                                        onKeyDown={(e) => {
                                            if (e.key === "Enter") {
                                                e.preventDefault();
                                                handleAddScenarioSentence();
                                            }
                                        }}
                                        placeholder="新增專屬探索情境，如：正在仔細檢查石壁上的機關..."
                                        className="flex-1 bg-panel-base text-white text-xs rounded-xl p-2.5 outline-none border border-transparent focus:border-panel-active"
                                    />
                                    <button
                                        type="button"
                                        onClick={handleAddScenarioSentence}
                                        className="px-3.5 py-2.5 rounded-xl bg-panel-active text-white text-xs font-bold outline-none shrink-0"
                                    >
                                        新增
                                    </button>
                                </div>

                                {(formSource.customScenarios || []).length > 0 ? (
                                    <div className="h-44 overflow-y-auto no-scrollbar flex flex-col gap-1.5 pr-0.5">
                                        {(formSource.customScenarios || []).map((sentence, sIdx) => (
                                            <div
                                                key={sIdx}
                                                className="flex items-center gap-2 bg-panel-base px-3 py-2 rounded-xl border border-panel-inactive/60"
                                            >
                                                <input
                                                    type="text"
                                                    value={sentence}
                                                    onChange={(e) => {
                                                        const next = [...(formSource.customScenarios || [])];
                                                        next[sIdx] = e.target.value;
                                                        setFormSource({ ...formSource, customScenarios: next });
                                                    }}
                                                    className="flex-1 bg-transparent text-xs text-gray-200 outline-none"
                                                />
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        const next = (formSource.customScenarios || []).filter(
                                                            (_, i) => i !== sIdx
                                                        );
                                                        setFormSource({ ...formSource, customScenarios: next });
                                                    }}
                                                    className="text-gray-500 hover:text-red-400 outline-none"
                                                >
                                                    <FaTrash className="w-3 h-3" />
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="h-44 rounded-xl bg-panel-base/50 border border-dashed border-panel-inactive flex items-center justify-center p-4 text-center text-xs text-gray-500 font-bold">
                                        目前無自訂句子，將自動使用預設分類探索句。可於上方輸入新增或點擊匯入範本。
                                    </div>
                                )}
                            </div>
                        )}

                        <div className="flex justify-end gap-2 mt-4 pt-3 border-t border-panel-base shrink-0">
                            <button
                                onClick={() => setSourceModalOpen(false)}
                                className="px-4 py-1.5 rounded-full text-xs font-bold text-gray-400 hover:text-white outline-none"
                            >
                                取消
                            </button>
                            <button
                                onClick={handleSaveSource}
                                disabled={!formSource.name}
                                className="px-5 py-1.5 rounded-full text-xs font-bold bg-panel-active text-white outline-none disabled:opacity-50"
                            >
                                儲存地區
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}