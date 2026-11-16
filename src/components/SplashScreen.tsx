// src/components/SplashScreen.tsx
import { useState, useRef } from "react";
import OBR from "@owlbear-rodeo/sdk";
import {
    FaPen,
    FaCirclePlus,
    FaBookOpen,
    FaTrash,
    FaCaretDown,
    FaCaretUp,
    FaXmark,
    FaArrowDownWideShort,
    FaArrowUpWideShort,
    FaCalendarDays,
    FaLocationDot,
    FaImage,
    FaCloudArrowUp
} from "react-icons/fa6";
import { Recap } from "./StoryManager/types";
import { useStoryData } from "./StoryManager/store";
import { LEGACY_THEMES } from "./StoryManager/constants";
import { compressImageFile } from "./StoryManager/ShopTab";
import {
    ImageCropper,
    CroppedImage,
    DEFAULT_IMAGE_CROP,
    openGlobalImageViewer
} from "./StoryManager/ImageCropper";
import { playClickSound } from "../utils";

export const SplashScreen = ({
    role,
    initialMode,
    onReady
}: {
    role: "GM" | "PLAYER" | null;
    initialMode: "latest" | "list";
    onReady: () => void;
}) => {
    const { recaps, isGM, saveRecaps } = useStoryData();
    const [mode, setMode] = useState<"latest" | "list" | "edit">(initialMode);
    const [editTab, setEditTab] = useState<"basic" | "banner">("basic");
    const [showThemePicker, setShowThemePicker] = useState<boolean>(false);
    const [editingRecap, setEditingRecap] = useState<Partial<Recap>>({});
    const [expandedRecaps, setExpandedRecaps] = useState<Record<string, boolean>>({});
    const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
    const [sortOrder, setSortOrder] = useState<"desc" | "asc">("desc");

    const bgFileInputRef = useRef<HTMLInputElement | null>(null);

    const handleSave = () => {
        playClickSound();
        const newRecap: Recap = {
            id: editingRecap.id || Date.now().toString(36),
            title: editingRecap.title?.trim() || "未命名章節",
            content: editingRecap.content || "",
            sessionDate: editingRecap.sessionDate?.trim() || "",
            location: editingRecap.location?.trim() || "",
            themeId: editingRecap.themeId || "standard",
            backgroundImageUrl: editingRecap.backgroundImageUrl || "",
            imageCrop: editingRecap.imageCrop || { ...DEFAULT_IMAGE_CROP },
            createdAt: editingRecap.createdAt || Date.now()
        };
        saveRecaps(
            editingRecap.id
                ? recaps.map(r => (r.id === newRecap.id ? newRecap : r))
                : [...recaps, newRecap]
        );
        setMode("list");
    };

    const handleDelete = (id: string) => {
        playClickSound();
        saveRecaps(recaps.filter(r => r.id !== id));
        setConfirmDeleteId(null);
    };

    const openEdit = (recap?: Recap) => {
        playClickSound();
        setEditTab("basic");
        setShowThemePicker(false);
        if (recap) {
            setEditingRecap({
                ...recap,
                imageCrop: recap.imageCrop || { ...DEFAULT_IMAGE_CROP }
            });
        } else {
            setEditingRecap({
                title: "",
                content: "",
                sessionDate: "",
                location: "",
                themeId: "standard",
                backgroundImageUrl: "",
                imageCrop: { ...DEFAULT_IMAGE_CROP }
            });
        }
        setMode("edit");
    };

    const handlePickOBRBanner = async () => {
        try {
            const assets = await OBR.assets.downloadImages(false);
            if (assets && assets.length > 0 && assets[0].image?.url) {
                setEditingRecap(prev => ({
                    ...prev,
                    backgroundImageUrl: assets[0].image.url,
                    imageCrop: { ...DEFAULT_IMAGE_CROP }
                }));
            }
        } catch (e) {
            console.warn("Failed to pick recap banner asset", e);
        }
    };

    const handleLocalBannerUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        try {
            const compressed = await compressImageFile(file, 800, 0.82);
            setEditingRecap(prev => ({
                ...prev,
                backgroundImageUrl: compressed,
                imageCrop: { ...DEFAULT_IMAGE_CROP }
            }));
        } catch (err) {
            console.error("Failed to compress recap banner image", err);
        } finally {
            e.target.value = "";
        }
    };

    const scrollbarStyleTag = (
        <style>{`
            .recap-scrollbar::-webkit-scrollbar {
                width: 5px;
            }
            .recap-scrollbar::-webkit-scrollbar-track {
                background: rgba(0, 0, 0, 0.14);
                border-radius: 9999px;
                margin: 8px 0;
            }
            .recap-scrollbar::-webkit-scrollbar-thumb {
                background: rgba(156, 129, 216, 0.55);
                border-radius: 9999px;
            }
            .recap-scrollbar::-webkit-scrollbar-thumb:hover {
                background: rgba(156, 129, 216, 0.9);
            }
        `}</style>
    );

    // Edit Mode with balanced proportions and unclipped content box
    if (mode === "edit" && isGM) {
        const currentTheme = LEGACY_THEMES[editingRecap.themeId || "standard"] || LEGACY_THEMES.standard;

        return (
            <div className="h-screen w-full flex flex-col p-3.5 bg-panel-base box-border relative overflow-hidden">
                {scrollbarStyleTag}
                <input
                    ref={bgFileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleLocalBannerUpload}
                />

                <div className="flex items-center justify-between mb-2.5 shrink-0">
                    <h3 className="text-base font-bold text-white">
                        {editingRecap.id ? "編輯前情提要" : "新增前情提要"}
                    </h3>
                </div>

                {/* Two-Tab Switcher */}
                <div className="flex bg-panel-content p-1 rounded-2xl mb-2.5 shadow-inner shrink-0">
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
                            setEditTab("banner");
                        }}
                        className={`flex-1 py-1.5 text-xs font-bold rounded-xl transition-all outline-none border ${
                            editTab === "banner"
                                ? "bg-panel-inactive text-[#bb99ff] shadow-sm border-white/10"
                                : "text-gray-400 hover:text-gray-200 border-transparent"
                        }`}
                    >
                        橫幅圖片
                    </button>
                </div>

                {editTab === "basic" && (
                    <div className="flex-1 min-h-0 flex flex-col gap-2 mb-3 overflow-hidden">
                        <div className="flex flex-col gap-1 shrink-0">
                            <span className="text-[11px] font-bold text-gray-400 ml-1">標題</span>
                            <input
                                autoFocus
                                type="text"
                                value={editingRecap.title || ""}
                                onChange={(e) =>
                                    setEditingRecap({ ...editingRecap, title: e.target.value })
                                }
                                placeholder="輸入章節標題..."
                                className="w-full bg-panel-content text-white text-sm font-bold rounded-xl px-3 py-2 outline-none border border-panel-inactive/60 focus:border-panel-active shadow-inner"
                            />
                        </div>

                        {/* Date and Location Fields */}
                        <div className="grid grid-cols-2 gap-2 shrink-0">
                            <div className="flex flex-col gap-1">
                                <span className="text-[11px] font-bold text-gray-400 ml-1 flex items-center gap-1">
                                    <FaCalendarDays className="w-3 h-3 text-amber-400" /> 日期
                                </span>
                                <input
                                    type="text"
                                    value={editingRecap.sessionDate || ""}
                                    onChange={(e) =>
                                        setEditingRecap({ ...editingRecap, sessionDate: e.target.value })
                                    }
                                    placeholder="例如：耀陽之月 14 日"
                                    className="w-full bg-panel-content text-white text-xs font-bold rounded-xl px-3 py-2 outline-none border border-panel-inactive/60 focus:border-panel-active shadow-inner"
                                />
                            </div>
                            <div className="flex flex-col gap-1">
                                <span className="text-[11px] font-bold text-gray-400 ml-1 flex items-center gap-1">
                                    <FaLocationDot className="w-3 h-3 text-sky-400" /> 地點
                                </span>
                                <input
                                    type="text"
                                    value={editingRecap.location || ""}
                                    onChange={(e) =>
                                        setEditingRecap({ ...editingRecap, location: e.target.value })
                                    }
                                    placeholder="例如：范達林鎮"
                                    className="w-full bg-panel-content text-white text-xs font-bold rounded-xl px-3 py-2 outline-none border border-panel-inactive/60 focus:border-panel-active shadow-inner"
                                />
                            </div>
                        </div>

                        {/* Paper Theme Selector */}
                        <div className="flex flex-col gap-1 shrink-0">
                            <span className="text-[11px] font-bold text-gray-400 ml-1">主題背景</span>
                            <button
                                type="button"
                                onClick={() => {
                                    playClickSound();
                                    setShowThemePicker(prev => !prev);
                                }}
                                className="w-full flex items-center justify-between bg-panel-content text-white text-xs font-bold rounded-xl px-3 py-2 outline-none border border-panel-inactive/60 hover:border-white/20"
                            >
                                <div className="flex items-center gap-2">
                                    <span
                                        style={{
                                            backgroundColor: currentTheme.bg,
                                            color: currentTheme.text
                                        }}
                                        className="w-5 h-5 rounded flex items-center justify-center text-[10px] font-black border border-white/25"
                                    >
                                        字
                                    </span>
                                    <span>{currentTheme.label}</span>
                                </div>
                                {showThemePicker ? (
                                    <FaCaretUp className="w-3.5 h-3.5 text-gray-400" />
                                ) : (
                                    <FaCaretDown className="w-3.5 h-3.5 text-gray-400" />
                                )}
                            </button>

                            {showThemePicker && (
                                <div className="grid grid-cols-2 gap-1.5 p-2 rounded-xl bg-panel-content border border-panel-inactive max-h-28 overflow-y-auto recap-scrollbar mt-0.5">
                                    {Object.entries(LEGACY_THEMES).map(([k, v]) => {
                                        const isSelected = (editingRecap.themeId || "standard") === k;
                                        return (
                                            <button
                                                key={k}
                                                type="button"
                                                onClick={() => {
                                                    playClickSound();
                                                    setEditingRecap({ ...editingRecap, themeId: k });
                                                    setShowThemePicker(false);
                                                }}
                                                className={`flex items-center gap-2 p-1.5 rounded-lg border text-left transition-all outline-none ${
                                                    isSelected
                                                        ? "border-panel-active bg-panel-active/20"
                                                        : "border-transparent hover:bg-panel-inactive/60"
                                                }`}
                                            >
                                                <span
                                                    style={{ backgroundColor: v.bg, color: v.text }}
                                                    className="w-5 h-5 rounded flex items-center justify-center text-[10px] font-black border border-white/25 shrink-0"
                                                >
                                                    字
                                                </span>
                                                <span className="text-[11px] font-bold text-gray-200 truncate">
                                                    {v.label}
                                                </span>
                                            </button>
                                        );
                                    })}
                                </div>
                            )}
                        </div>

                        {/* Content Editor Box Filling Remaining Height Cleanly */}
                        <div className="flex-1 min-h-0 flex flex-col gap-1">
                            <span className="text-[11px] font-bold text-gray-400 ml-1 shrink-0">內文</span>
                            <textarea
                                value={editingRecap.content || ""}
                                onChange={(e) =>
                                    setEditingRecap({ ...editingRecap, content: e.target.value })
                                }
                                placeholder="記錄本次冒險發生的關鍵事件..."
                                className="flex-1 min-h-0 w-full bg-panel-content text-gray-200 text-sm rounded-xl p-3 outline-none resize-none recap-scrollbar scroll-smooth border border-panel-inactive/60 focus:border-panel-active shadow-inner leading-relaxed"
                            />
                        </div>
                    </div>
                )}

                {editTab === "banner" && (
                    <div className="flex flex-col gap-3 mb-3 flex-1 min-h-0 overflow-y-auto recap-scrollbar">
                        <div className="flex items-center gap-2">
                            <button
                                type="button"
                                onClick={handlePickOBRBanner}
                                className="flex-1 flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl bg-panel-content hover:bg-panel-inactive text-xs font-bold text-gray-200 outline-none border border-panel-inactive transition-colors"
                            >
                                <FaCloudArrowUp className="w-4 h-4 text-panel-active" /> 圖庫選圖
                            </button>
                            <button
                                type="button"
                                onClick={() => bgFileInputRef.current?.click()}
                                className="flex-1 flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl bg-panel-content hover:bg-panel-inactive text-xs font-bold text-gray-200 outline-none border border-panel-inactive transition-colors"
                            >
                                <FaImage className="w-4 h-4 text-amber-400" /> 本機上傳
                            </button>
                            {editingRecap.backgroundImageUrl && (
                                <button
                                    type="button"
                                    onClick={() =>
                                        setEditingRecap({
                                            ...editingRecap,
                                            backgroundImageUrl: "",
                                            imageCrop: { ...DEFAULT_IMAGE_CROP }
                                        })
                                    }
                                    className="px-3 py-2.5 rounded-xl bg-panel-content text-xs font-bold text-red-400 hover:text-red-300 outline-none border border-panel-inactive"
                                >
                                    移除
                                </button>
                            )}
                        </div>

                        {editingRecap.backgroundImageUrl ? (
                            <ImageCropper
                                src={editingRecap.backgroundImageUrl}
                                crop={editingRecap.imageCrop}
                                aspectClassName="h-44"
                                onChange={(nextCrop) =>
                                    setEditingRecap({ ...editingRecap, imageCrop: nextCrop })
                                }
                            />
                        ) : (
                            <div className="w-full h-44 rounded-xl bg-panel-content border border-dashed border-panel-inactive flex flex-col items-center justify-center text-gray-500 text-xs font-bold gap-2">
                                <FaImage className="w-6 h-6 opacity-40" />
                                <span>尚未設定前情提要橫幅圖片</span>
                            </div>
                        )}
                    </div>
                )}

                <div className="flex gap-2 shrink-0">
                    <button
                        type="button"
                        className="flex-1 py-2 rounded-xl text-sm font-bold border border-gray-500 text-gray-400 hover:text-white outline-none transition-colors"
                        onClick={() => {
                            playClickSound();
                            setMode("list");
                        }}
                    >
                        取消
                    </button>
                    <button
                        type="button"
                        className="flex-1 py-2 rounded-xl text-sm font-bold bg-panel-active text-white outline-none hover:opacity-85 transition-opacity"
                        onClick={handleSave}
                    >
                        儲存
                    </button>
                </div>
            </div>
        );
    }

    // History Recap List Mode
    if (mode === "list") {
        const sortedRecaps = [...recaps].sort((a, b) =>
            sortOrder === "desc" ? b.createdAt - a.createdAt : a.createdAt - b.createdAt
        );

        return (
            <div className="h-screen w-full flex flex-col p-4 bg-panel-base box-border overflow-hidden">
                {scrollbarStyleTag}
                <div className="flex justify-between items-center mb-4 shrink-0">
                    <h3 className="text-lg font-bold text-white">歷史前情提要</h3>
                    <div className="flex gap-2">
                        <button
                            className="flex items-center justify-center px-3 py-1.5 rounded-full border border-gray-500 text-gray-400 hover:text-white transition-colors outline-none"
                            onClick={() => {
                                playClickSound();
                                setSortOrder(sortOrder === "desc" ? "asc" : "desc");
                            }}
                            title={sortOrder === "desc" ? "目前排序：最新優先" : "目前排序：最舊優先"}
                        >
                            {sortOrder === "desc" ? <FaArrowDownWideShort /> : <FaArrowUpWideShort />}
                        </button>
                        {isGM && (
                            <button
                                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-panel-inactive hover:bg-panel-active text-white rounded-full transition-colors outline-none shadow-sm"
                                onClick={() => openEdit()}
                            >
                                <FaCirclePlus /> 新增
                            </button>
                        )}
                    </div>
                </div>

                <div className="flex-grow overflow-y-auto scroll-smooth flex flex-col gap-3 mb-4 recap-scrollbar pr-0.5">
                    {sortedRecaps.length === 0 ? (
                        <p className="text-gray-500 text-center mt-10 text-sm font-bold">
                            尚無前情提要紀錄
                        </p>
                    ) : (
                        sortedRecaps.map(recap => {
                            const isExpanded = expandedRecaps[recap.id];
                            const themeObj =
                                LEGACY_THEMES[recap.themeId || "standard"] || LEGACY_THEMES.standard;
                            const hasMeta = Boolean(recap.sessionDate || recap.location);

                            return (
                                <div
                                    key={recap.id}
                                    className="rounded-2xl relative cursor-pointer transition-all shadow-md overflow-hidden border border-white/10 shrink-0"
                                    style={{ backgroundColor: themeObj.bg, color: themeObj.text }}
                                    onClick={() =>
                                        setExpandedRecaps(p => ({ ...p, [recap.id]: !isExpanded }))
                                    }
                                >
                                    {recap.backgroundImageUrl && (
                                        <div
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                openGlobalImageViewer(recap.backgroundImageUrl!, recap.title);
                                            }}
                                            title="點擊檢視完整橫幅圖片"
                                            className="relative h-24 w-full overflow-hidden cursor-zoom-in group/banner"
                                        >
                                            <CroppedImage
                                                src={recap.backgroundImageUrl}
                                                alt={recap.title}
                                                crop={recap.imageCrop}
                                                containerClassName="w-full h-full"
                                                imgClassName="brightness-105 transition-transform duration-300 group-hover/banner:scale-105"
                                            />
                                            <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/20 to-transparent pointer-events-none" />
                                            <div className="absolute bottom-2 left-3.5 right-3.5 flex items-end justify-between gap-2">
                                                <h4 className="font-black text-base text-white drop-shadow truncate">
                                                    {recap.title}
                                                </h4>
                                            </div>
                                        </div>
                                    )}

                                    <div className="p-4">
                                        {!recap.backgroundImageUrl ? (
                                            <div className="flex justify-between items-start gap-2">
                                                <div className="min-w-0 flex-1 pr-2">
                                                    <h4 className="font-bold text-base truncate">
                                                        {recap.title}
                                                    </h4>
                                                    {hasMeta && (
                                                        <div className="flex flex-wrap items-center gap-2 mt-1 text-xs font-bold opacity-75">
                                                            {recap.sessionDate && (
                                                                <span className="flex items-center gap-1">
                                                                    <FaCalendarDays className="w-3 h-3" />
                                                                    {recap.sessionDate}
                                                                </span>
                                                            )}
                                                            {recap.sessionDate && recap.location && (
                                                                <span>|</span>
                                                            )}
                                                            {recap.location && (
                                                                <span className="flex items-center gap-1">
                                                                    <FaLocationDot className="w-3 h-3" />
                                                                    {recap.location}
                                                                </span>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>

                                                <div
                                                    className="flex items-center gap-1 shrink-0"
                                                    onClick={e => e.stopPropagation()}
                                                >
                                                    {isGM && (
                                                        <div className="flex gap-0.5 bg-[#1e2235]/90 text-gray-100 border border-white/15 rounded-full px-1.5 py-0.5 shadow-sm">
                                                            <button
                                                                className="p-1.5 text-sky-300 hover:text-white outline-none transition-colors"
                                                                onClick={() => openEdit(recap)}
                                                                title="編輯"
                                                            >
                                                                <FaPen className="w-3 h-3" />
                                                            </button>
                                                            <button
                                                                className={`p-1.5 rounded-full outline-none transition-colors ${
                                                                    confirmDeleteId === recap.id
                                                                        ? "bg-rose-600 text-white"
                                                                        : "text-rose-400 hover:text-rose-200"
                                                                }`}
                                                                onClick={() =>
                                                                    confirmDeleteId === recap.id
                                                                        ? handleDelete(recap.id)
                                                                        : setConfirmDeleteId(recap.id)
                                                                }
                                                                onMouseLeave={() => setConfirmDeleteId(null)}
                                                                title="刪除"
                                                            >
                                                                {confirmDeleteId === recap.id ? (
                                                                    <FaXmark className="w-3 h-3" />
                                                                ) : (
                                                                    <FaTrash className="w-3 h-3" />
                                                                )}
                                                            </button>
                                                        </div>
                                                    )}
                                                    <button
                                                        type="button"
                                                        onClick={() =>
                                                            setExpandedRecaps(p => ({
                                                                ...p,
                                                                [recap.id]: !isExpanded
                                                            }))
                                                        }
                                                        className="p-1 opacity-70 hover:opacity-100 outline-none"
                                                    >
                                                        {isExpanded ? <FaCaretUp /> : <FaCaretDown />}
                                                    </button>
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="flex items-center justify-between gap-2">
                                                <div className="flex flex-wrap items-center gap-2 text-xs font-bold opacity-80 min-w-0">
                                                    {recap.sessionDate && (
                                                        <span className="flex items-center gap-1">
                                                            <FaCalendarDays className="w-3 h-3" />
                                                            {recap.sessionDate}
                                                        </span>
                                                    )}
                                                    {recap.sessionDate && recap.location && <span>|</span>}
                                                    {recap.location && (
                                                        <span className="flex items-center gap-1">
                                                            <FaLocationDot className="w-3 h-3" />
                                                            {recap.location}
                                                        </span>
                                                    )}
                                                    {!hasMeta && (
                                                        <span className="opacity-65">點擊展開內容</span>
                                                    )}
                                                </div>

                                                <div
                                                    className="flex items-center gap-1 shrink-0"
                                                    onClick={e => e.stopPropagation()}
                                                >
                                                    {isGM && (
                                                        <div className="flex gap-0.5 bg-[#1e2235]/90 text-gray-100 border border-white/15 rounded-full px-1.5 py-0.5 shadow-sm">
                                                            <button
                                                                className="p-1.5 text-sky-300 hover:text-white outline-none transition-colors"
                                                                onClick={() => openEdit(recap)}
                                                                title="編輯"
                                                            >
                                                                <FaPen className="w-3 h-3" />
                                                            </button>
                                                            <button
                                                                className={`p-1.5 rounded-full outline-none transition-colors ${
                                                                    confirmDeleteId === recap.id
                                                                        ? "bg-rose-600 text-white"
                                                                        : "text-rose-400 hover:text-rose-200"
                                                                }`}
                                                                onClick={() =>
                                                                    confirmDeleteId === recap.id
                                                                        ? handleDelete(recap.id)
                                                                        : setConfirmDeleteId(recap.id)
                                                                }
                                                                onMouseLeave={() => setConfirmDeleteId(null)}
                                                                title="刪除"
                                                            >
                                                                {confirmDeleteId === recap.id ? (
                                                                    <FaXmark className="w-3 h-3" />
                                                                ) : (
                                                                    <FaTrash className="w-3 h-3" />
                                                                )}
                                                            </button>
                                                        </div>
                                                    )}
                                                    <button
                                                        type="button"
                                                        onClick={() =>
                                                            setExpandedRecaps(p => ({
                                                                ...p,
                                                                [recap.id]: !isExpanded
                                                            }))
                                                        }
                                                        className="p-1 opacity-70 hover:opacity-100 outline-none"
                                                    >
                                                        {isExpanded ? <FaCaretUp /> : <FaCaretDown />}
                                                    </button>
                                                </div>
                                            </div>
                                        )}

                                        {isExpanded && (
                                            <p className="whitespace-pre-wrap break-words mt-3 text-[17px] opacity-95 leading-relaxed font-serif">
                                                {recap.content}
                                            </p>
                                        )}
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>

                <button
                    className="w-full py-2.5 rounded-xl text-sm font-bold bg-panel-active text-white outline-none shadow-sm hover:opacity-85 shrink-0 transition-opacity"
                    onClick={() => {
                        playClickSound();
                        onReady();
                    }}
                >
                    返回
                </button>
            </div>
        );
    }

    // Initial Latest Recap Splash Screen with smooth scrollbar
    const latestRecap: Partial<Recap> =
        recaps.length > 0
            ? recaps[recaps.length - 1]
            : {
                  title: "冒險前情提要",
                  content: "尚無前情提要紀錄...",
                  themeId: "standard"
              };
    const activeTheme = LEGACY_THEMES[latestRecap.themeId || "standard"] || LEGACY_THEMES.standard;
    const hasLatestMeta = Boolean(latestRecap.sessionDate || latestRecap.location);

    return (
        <div className="h-screen w-full flex flex-col p-4 bg-panel-base box-border overflow-hidden">
            {scrollbarStyleTag}
            {latestRecap.backgroundImageUrl ? (
                <div className="shrink-0 mb-3 rounded-2xl overflow-hidden relative shadow-lg border border-white/10">
                    <div
                        onClick={() =>
                            openGlobalImageViewer(
                                latestRecap.backgroundImageUrl!,
                                latestRecap.title
                            )
                        }
                        title="點擊檢視完整橫幅圖片"
                        className="h-36 w-full relative overflow-hidden cursor-zoom-in group/splashbanner"
                    >
                        <CroppedImage
                            src={latestRecap.backgroundImageUrl}
                            alt={latestRecap.title || "前情提要"}
                            crop={latestRecap.imageCrop}
                            containerClassName="w-full h-full"
                            imgClassName="brightness-105 transition-transform duration-300 group-hover/splashbanner:scale-105"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/30 to-transparent pointer-events-none" />
                        <div className="absolute bottom-3 left-4 right-4">
                            <h2 className="text-xl font-black text-white drop-shadow-md break-words leading-snug">
                                {latestRecap.title}
                            </h2>
                            {hasLatestMeta && (
                                <div className="flex flex-wrap items-center gap-2 mt-1.5 text-xs font-bold text-amber-300/95 drop-shadow">
                                    {latestRecap.sessionDate && (
                                        <span className="flex items-center gap-1 bg-black/40 px-2 py-0.5 rounded-full">
                                            <FaCalendarDays className="w-3 h-3" />
                                            {latestRecap.sessionDate}
                                        </span>
                                    )}
                                    {latestRecap.location && (
                                        <span className="flex items-center gap-1 bg-black/40 px-2 py-0.5 rounded-full">
                                            <FaLocationDot className="w-3 h-3 text-sky-300" />
                                            {latestRecap.location}
                                        </span>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            ) : (
                <div className="shrink-0 text-center mb-3.5 mt-2">
                    <FaBookOpen className="text-4xl mx-auto mb-2.5 opacity-90 text-panel-active drop-shadow-md" />
                    <h2 className="text-xl font-bold text-white border-b-2 border-panel-active pb-2 px-4 inline-block max-w-full break-words">
                        {latestRecap.title}
                    </h2>
                    {hasLatestMeta && (
                        <div className="flex flex-wrap items-center justify-center gap-2 mt-2 text-xs font-bold text-gray-300">
                            {latestRecap.sessionDate && (
                                <span className="flex items-center gap-1 bg-panel-content px-2.5 py-1 rounded-full border border-panel-inactive">
                                    <FaCalendarDays className="w-3 h-3 text-amber-400" />
                                    {latestRecap.sessionDate}
                                </span>
                            )}
                            {latestRecap.location && (
                                <span className="flex items-center gap-1 bg-panel-content px-2.5 py-1 rounded-full border border-panel-inactive">
                                    <FaLocationDot className="w-3 h-3 text-sky-400" />
                                    {latestRecap.location}
                                </span>
                            )}
                        </div>
                    )}
                </div>
            )}

            <div
                className="flex-1 min-h-0 overflow-y-auto scroll-smooth p-5 mb-3.5 rounded-2xl shadow-inner font-serif recap-scrollbar"
                style={{ backgroundColor: activeTheme.bg, color: activeTheme.text }}
            >
                <p className="whitespace-pre-wrap break-words leading-relaxed text-[18px] opacity-95">
                    {latestRecap.content}
                </p>
            </div>

            <button
                className="w-full py-3 rounded-2xl text-base font-black bg-panel-active text-white outline-none shadow-md hover:opacity-85 shrink-0 transition-opacity"
                onClick={() => {
                    playClickSound();
                    onReady();
                }}
            >
                {role === "GM" ? "進入 DM 控制台" : "返回待命畫面"}
            </button>
        </div>
    );
};