// src/components/StoryManager/QuestTab.tsx
import { useState, useRef } from "react";
import OBR from "@owlbear-rodeo/sdk";
import {
    FaCirclePlus,
    FaPencil,
    FaEye,
    FaEyeSlash,
    FaTrash,
    FaGear,
    FaXmark,
    FaCaretUp,
    FaCaretDown,
    FaBookBookmark,
    FaImage,
    FaCloudArrowUp,
    FaCircleQuestion
} from "react-icons/fa6";
import { Quest, QuestCategory, KeywordItem } from "./types";
import { useStoryData } from "./store";
import { LEGACY_THEMES } from "./constants";

function playClickSound() {
    try {
        const audio = new Audio("/click.mp3");
        audio.volume = 0.15;
        audio.play().catch(() => {});
    } catch (e) {}
}

// Resize and compress local image file into lightweight WebP data URL
function compressImageFile(file: File, maxDimension = 520, quality = 0.78): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                let { width, height } = img;
                if (width > maxDimension || height > maxDimension) {
                    if (width > height) {
                        height = Math.round((height * maxDimension) / width);
                        width = maxDimension;
                    } else {
                        width = Math.round((width * maxDimension) / height);
                        height = maxDimension;
                    }
                }
                const canvas = document.createElement("canvas");
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext("2d");
                if (!ctx) {
                    reject(new Error("Canvas context unavailable"));
                    return;
                }
                ctx.drawImage(img, 0, 0, width, height);
                resolve(canvas.toDataURL("image/webp", quality));
            };
            img.onerror = reject;
            img.src = e.target?.result as string;
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

export default function QuestTab() {
    const {
        categories,
        quests,
        keywords,
        isGM,
        saveSingleQuest,
        deleteSingleQuest,
        reorderQuests,
        saveCategoriesProxy,
        saveKeywords
    } = useStoryData();

    const [modalOpen, setModalOpen] = useState(false);
    const [categoryModalOpen, setCategoryModalOpen] = useState(false);
    const [keywordModalOpen, setKeywordModalOpen] = useState(false);
    const [editingQuest, setEditingQuest] = useState<Quest | null>(null);
    const [form, setForm] = useState<Partial<Quest>>({});
    const [categoryForm, setCategoryForm] = useState<QuestCategory[]>([]);
    const [expandedQuests, setExpandedQuests] = useState<Record<string, boolean>>({});
    const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

    // Keyword Library & Lore Modal state
    const [editingKeyword, setEditingKeyword] = useState<KeywordItem | null>(null);
    const [keywordForm, setKeywordForm] = useState<Partial<KeywordItem>>({});
    const [confirmDeleteKeywordId, setConfirmDeleteKeywordId] = useState<string | null>(null);
    const [activeKeywordModal, setActiveKeywordModal] = useState<KeywordItem | null>(null);
    const fileInputRef = useRef<HTMLInputElement | null>(null);

    // Refs for cursor-aware keyword insertion
    const titleInputRef = useRef<HTMLInputElement | null>(null);
    const descTextareaRef = useRef<HTMLTextAreaElement | null>(null);
    const activeFieldRef = useRef<"title" | "description">("description");

    const handleSaveQuest = () => {
        playClickSound();
        const newQuest: Quest = {
            id: editingQuest?.id || Date.now().toString(36),
            title: form.title || "未命名任務",
            description: form.description || "",
            categoryId: form.categoryId || categories[0]?.id || "main",
            isVisible: form.isVisible ?? false,
            isCompleted: false,
            markerStyle: "none",
            createdAt: editingQuest?.createdAt || Date.now()
        };
        saveSingleQuest(newQuest);
        setModalOpen(false);
    };

    const handleSaveCategories = () => {
        playClickSound();
        saveCategoriesProxy(categoryForm);
        setCategoryModalOpen(false);
    };

    const handleDelete = (id: string) => {
        playClickSound();
        deleteSingleQuest(id);
        setConfirmDeleteId(null);
    };

    const openEditModal = (quest?: Quest) => {
        playClickSound();
        activeFieldRef.current = "description";
        if (quest) {
            setEditingQuest(quest);
            setForm(quest);
        } else {
            setEditingQuest(null);
            setForm({
                categoryId: categories[0]?.id,
                isVisible: true,
                isCompleted: false,
                markerStyle: "none"
            });
        }
        setModalOpen(true);
    };

    // Insert keyword tag at the current cursor position of the focused input
    const handleInsertKeywordAtCursor = (kwText: string) => {
        playClickSound();
        const tag = `[${kwText}]`;
        const targetField = activeFieldRef.current;
        const el = targetField === "title" ? titleInputRef.current : descTextareaRef.current;

        const currentVal = (targetField === "title" ? form.title : form.description) || "";

        if (el && typeof el.selectionStart === "number" && typeof el.selectionEnd === "number") {
            const start = el.selectionStart;
            const end = el.selectionEnd;
            const nextVal = currentVal.slice(0, start) + tag + currentVal.slice(end);
            setForm(prev => ({ ...prev, [targetField]: nextVal }));

            requestAnimationFrame(() => {
                el.focus();
                const newPos = start + tag.length;
                el.setSelectionRange(newPos, newPos);
            });
        } else {
            setForm(prev => ({
                ...prev,
                [targetField]: currentVal + tag
            }));
        }
    };

    // Move quest up or down within its category
    const handleMoveQuest = (categoryId: string, questId: string, direction: "up" | "down") => {
        playClickSound();
        const visibleList = isGM ? quests : quests.filter(q => q.isVisible);
        const categoryQuests = visibleList.filter(q => q.categoryId === categoryId);
        const currentIndex = categoryQuests.findIndex(q => q.id === questId);
        if (currentIndex === -1) return;

        const targetIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;
        if (targetIndex < 0 || targetIndex >= categoryQuests.length) return;

        const firstId = categoryQuests[currentIndex].id;
        const secondId = categoryQuests[targetIndex].id;

        const globalIndexA = quests.findIndex(q => q.id === firstId);
        const globalIndexB = quests.findIndex(q => q.id === secondId);
        if (globalIndexA === -1 || globalIndexB === -1) return;

        const nextQuests = [...quests];
        const temp = nextQuests[globalIndexA];
        nextQuests[globalIndexA] = nextQuests[globalIndexB];
        nextQuests[globalIndexB] = temp;

        reorderQuests(nextQuests);
    };

    // Move category up or down in category modal
    const handleMoveCategory = (index: number, direction: "up" | "down") => {
        const targetIndex = direction === "up" ? index - 1 : index + 1;
        if (targetIndex < 0 || targetIndex >= categoryForm.length) return;
        const nextCats = [...categoryForm];
        const temp = nextCats[index];
        nextCats[index] = nextCats[targetIndex];
        nextCats[targetIndex] = temp;
        setCategoryForm(nextCats);
    };

    // Keyword Library handlers
    const startCreateKeyword = () => {
        playClickSound();
        setEditingKeyword(null);
        setKeywordForm({
            keyword: "",
            subtitle: "",
            description: "",
            imageUrl: "",
            themeId: "standard"
        });
    };

    const startEditKeyword = (item: KeywordItem) => {
        playClickSound();
        setEditingKeyword(item);
        setKeywordForm({ ...item });
    };

    const handleSaveKeyword = () => {
        if (!keywordForm.keyword?.trim()) return;
        playClickSound();
        const newItem: KeywordItem = {
            id: editingKeyword?.id || Date.now().toString(36),
            keyword: keywordForm.keyword.trim(),
            subtitle: keywordForm.subtitle?.trim() || "",
            description: keywordForm.description || "",
            imageUrl: keywordForm.imageUrl || "",
            themeId: keywordForm.themeId || "standard",
            createdAt: editingKeyword?.createdAt || Date.now()
        };
        const exists = keywords.some(k => k.id === newItem.id);
        const nextKeywords = exists
            ? keywords.map(k => (k.id === newItem.id ? newItem : k))
            : [...keywords, newItem];
        saveKeywords(nextKeywords);
        setEditingKeyword(null);
        setKeywordForm({});
    };

    const handleDeleteKeyword = (id: string) => {
        playClickSound();
        saveKeywords(keywords.filter(k => k.id !== id));
        setConfirmDeleteKeywordId(null);
        if (editingKeyword?.id === id) {
            setEditingKeyword(null);
            setKeywordForm({});
        }
    };

    const handlePickOBRAsset = async () => {
        try {
            const assets = await OBR.assets.downloadImages(false);
            if (assets && assets.length > 0 && assets[0].image?.url) {
                setKeywordForm(prev => ({ ...prev, imageUrl: assets[0].image.url }));
            }
        } catch (e) {
            console.warn("Failed to pick OBR image asset", e);
        }
    };

    const handleLocalImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        try {
            const compressedDataUrl = await compressImageFile(file);
            setKeywordForm(prev => ({ ...prev, imageUrl: compressedDataUrl }));
        } catch (err) {
            console.error("Failed to compress image", err);
        } finally {
            e.target.value = "";
        }
    };

    // Parse wrapped syntax like [黑蜘蛛] or [顯示文字|黑蜘蛛]
    const renderFormattedText = (text: string, accentColor: string) => {
        if (!text) return null;
        const regex = /(?:\[([^\]|]+)(?:\|([^\]]+))?\]|【([^】|]+)(?:\|([^】]+))?】)/g;
        const parts: React.ReactNode[] = [];
        let lastIndex = 0;
        let match: RegExpExecArray | null;

        while ((match = regex.exec(text)) !== null) {
            if (match.index > lastIndex) {
                parts.push(
                    <span key={`txt-${lastIndex}`}>{text.substring(lastIndex, match.index)}</span>
                );
            }

            const rawFirst = (match[1] ?? match[3] ?? "").trim();
            const rawSecond = (match[2] ?? match[4] ?? "").trim();
            const displayLabel = rawFirst;
            const targetKey = rawSecond || rawFirst;

            const matchedEntry = keywords.find(
                k => k.keyword.trim().toLowerCase() === targetKey.toLowerCase()
            );

            parts.push(
                <span
                    key={`kw-${match.index}`}
                    onClick={(e) => {
                        e.stopPropagation();
                        playClickSound();
                        if (matchedEntry) {
                            setActiveKeywordModal(matchedEntry);
                        } else if (isGM) {
                            setKeywordModalOpen(true);
                            setEditingKeyword(null);
                            setKeywordForm({
                                keyword: targetKey,
                                subtitle: "",
                                description: "",
                                themeId: "standard"
                            });
                        }
                    }}
                    style={{
                        color: accentColor
                    }}
                    title={matchedEntry ? "點擊查看劇情資訊" : isGM ? "點擊新增此關鍵詞設定" : undefined}
                    className="font-extrabold transition-all duration-150 cursor-pointer hover:brightness-125"
                >
                    {displayLabel}
                </span>
            );

            lastIndex = regex.lastIndex;
        }

        if (lastIndex < text.length) {
            parts.push(<span key={`txt-${lastIndex}`}>{text.substring(lastIndex)}</span>);
        }

        return parts;
    };

    const visibleQuests = isGM ? quests : quests.filter(q => q.isVisible);

    return (
        <div className="relative px-1">
            <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleLocalImageUpload}
            />

            <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-bold text-gray-300">還記得...</h3>
                <div className="flex items-center gap-1.5">
                    {isGM && (
                        <>
                            <button
                                onClick={() => {
                                    playClickSound();
                                    setEditingKeyword(null);
                                    setKeywordForm({});
                                    setKeywordModalOpen(true);
                                }}
                                title="管理劇情關鍵詞庫"
                                className="p-1.5 text-amber-400 hover:text-white bg-panel-inactive rounded-full transition-colors outline-none"
                            >
                                <FaBookBookmark className="w-3.5 h-3.5" />
                            </button>
                            <button
                                onClick={() => {
                                    setCategoryForm(categories.map(c => ({ ...c, themeId: c.themeId || "panel" })));
                                    setCategoryModalOpen(true);
                                    playClickSound();
                                }}
                                title="管理任務分類與外觀"
                                className="p-1.5 text-gray-400 hover:text-white bg-panel-inactive rounded-full transition-colors outline-none"
                            >
                                <FaGear className="w-3.5 h-3.5" />
                            </button>
                        </>
                    )}
                    <button
                        onClick={() => openEditModal()}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-panel-inactive hover:bg-panel-active text-white rounded-full transition-colors shadow-sm outline-none"
                    >
                        <FaCirclePlus className="w-3.5 h-3.5" /> 新增任務
                    </button>
                </div>
            </div>

            {categories
                .filter(c => isGM || c.isVisible !== false)
                .map(cat => {
                    const list = visibleQuests.filter(q => q.categoryId === cat.id);
                    const themeKey = cat.themeId || "panel";
                    const themeObj = LEGACY_THEMES[themeKey] || LEGACY_THEMES.panel;
                    const isCustomTheme = themeKey !== "panel";
                    const accentColor = themeObj.accent || "#c084fc";
                    const headerColor = themeObj.headerColor || "#9c81d8";

                    return (
                        <div key={cat.id} className="mb-5">
                            <div className="flex items-center justify-between border-b border-panel-inactive pb-1 mb-2">
                                <div className="flex items-center gap-2">
                                    <h4
                                        className="text-base font-bold px-1"
                                        style={{ color: headerColor }}
                                    >
                                        {cat.name}
                                    </h4>
                                </div>
                                {isGM && (
                                    <button
                                        onClick={() =>
                                            saveCategoriesProxy(
                                                categories.map(c =>
                                                    c.id === cat.id
                                                        ? { ...c, isVisible: c.isVisible === false ? true : false }
                                                        : c
                                                )
                                            )
                                        }
                                        className={`p-1.5 outline-none rounded-full transition-colors ${
                                            cat.isVisible === false
                                                ? "text-gray-500 hover:text-white"
                                                : "text-panel-active hover:text-white"
                                        }`}
                                        title={cat.isVisible === false ? "此分類對玩家隱藏" : "此分類公開"}
                                    >
                                        {cat.isVisible === false ? (
                                            <FaEyeSlash className="w-4 h-4" />
                                        ) : (
                                            <FaEye className="w-4 h-4" />
                                        )}
                                    </button>
                                )}
                            </div>
                            {list.length === 0 && (
                                <p className="text-xs font-bold text-gray-500 px-1">無任務</p>
                            )}
                            <div className="flex flex-col gap-2.5">
                                {list.map((quest, qIdx) => {
                                    const isExpanded = expandedQuests[quest.id];
                                    return (
                                        <div
                                            key={quest.id}
                                            style={{
                                                backgroundColor: themeObj.bg,
                                                color: themeObj.text,
                                                borderColor: themeObj.border || "rgba(255, 255, 255, 0.08)"
                                            }}
                                            className={`relative p-3.5 rounded-xl border transition-all shadow-sm group hover:brightness-105 ${
                                                isCustomTheme ? "font-serif" : ""
                                            }`}
                                        >
                                            <div className="flex items-start">
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-start justify-between gap-2">
                                                        <h5 className="font-bold text-[18px] leading-snug break-words pr-1">
                                                            {renderFormattedText(quest.title, accentColor)}
                                                        </h5>

                                                        {/* Hover-only action bar for both GM and players */}
                                                        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 pointer-events-none group-hover:pointer-events-auto transition-opacity bg-panel-base/90 text-gray-200 px-1.5 py-0.5 rounded-full shadow-md shrink-0">
                                                            {qIdx > 0 && (
                                                                <button
                                                                    onClick={() => handleMoveQuest(cat.id, quest.id, "up")}
                                                                    title="上移任務"
                                                                    className="p-1 text-gray-400 hover:text-white outline-none"
                                                                >
                                                                    <FaCaretUp className="w-3.5 h-3.5" />
                                                                </button>
                                                            )}
                                                            {qIdx < list.length - 1 && (
                                                                <button
                                                                    onClick={() => handleMoveQuest(cat.id, quest.id, "down")}
                                                                    title="下移任務"
                                                                    className="p-1 text-gray-400 hover:text-white outline-none"
                                                                >
                                                                    <FaCaretDown className="w-3.5 h-3.5" />
                                                                </button>
                                                            )}
                                                            {isGM && (
                                                                <button
                                                                    onClick={() => {
                                                                        playClickSound();
                                                                        saveSingleQuest({
                                                                            ...quest,
                                                                            isVisible: !quest.isVisible
                                                                        });
                                                                    }}
                                                                    title={quest.isVisible ? "對玩家公開中" : "對玩家隱藏中"}
                                                                    className={`p-1 outline-none ${
                                                                        quest.isVisible
                                                                            ? "text-panel-active"
                                                                            : "text-gray-400 hover:text-white"
                                                                    }`}
                                                                >
                                                                    {quest.isVisible ? (
                                                                        <FaEye className="w-3.5 h-3.5" />
                                                                    ) : (
                                                                        <FaEyeSlash className="w-3.5 h-3.5" />
                                                                    )}
                                                                </button>
                                                            )}
                                                            <button
                                                                onClick={() => openEditModal(quest)}
                                                                title="編輯任務"
                                                                className="p-1 text-gray-400 hover:text-white outline-none"
                                                            >
                                                                <FaPencil className="w-3 h-3" />
                                                            </button>
                                                            <button
                                                                onClick={() =>
                                                                    confirmDeleteId === quest.id
                                                                        ? handleDelete(quest.id)
                                                                        : setConfirmDeleteId(quest.id)
                                                                }
                                                                onMouseLeave={() => setConfirmDeleteId(null)}
                                                                title="刪除任務"
                                                                className={`p-1 outline-none ${
                                                                    confirmDeleteId === quest.id
                                                                        ? "text-red-500"
                                                                        : "text-gray-400 hover:text-red-500"
                                                                }`}
                                                            >
                                                                {confirmDeleteId === quest.id ? (
                                                                    <FaXmark className="w-3.5 h-3.5" />
                                                                ) : (
                                                                    <FaTrash className="w-3 h-3" />
                                                                )}
                                                            </button>
                                                        </div>
                                                    </div>

                                                    {quest.description && (
                                                        <div
                                                            onClick={() =>
                                                                setExpandedQuests(p => ({
                                                                    ...p,
                                                                    [quest.id]: !p[quest.id]
                                                                }))
                                                            }
                                                            className={`mt-1.5 text-[17px] opacity-90 cursor-pointer whitespace-pre-wrap break-words leading-relaxed transition-all ${
                                                                isExpanded ? "" : "line-clamp-2"
                                                            }`}
                                                        >
                                                            {renderFormattedText(quest.description, accentColor)}
                                                        </div>
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

            {/* Centered Lore Floating Modal */}
            {activeKeywordModal && (() => {
                const modalTheme = LEGACY_THEMES[activeKeywordModal.themeId || "standard"] || LEGACY_THEMES.standard;
                return (
                    <div
                        onClick={() => setActiveKeywordModal(null)}
                        className="fixed inset-0 z-[250] flex items-center justify-center bg-black/65 backdrop-blur-sm p-4 animate-in fade-in duration-200"
                    >
                        <div
                            onClick={(e) => e.stopPropagation()}
                            onMouseLeave={() => setActiveKeywordModal(null)}
                            style={{
                                backgroundColor: modalTheme.bg,
                                color: modalTheme.text,
                                borderColor: modalTheme.border || "rgba(255, 255, 255, 0.15)"
                            }}
                            className="w-full max-w-[380px] max-h-[82vh] flex flex-col rounded-2xl border shadow-2xl overflow-hidden font-serif animate-in zoom-in-95 duration-200"
                        >
                            {activeKeywordModal.imageUrl && (
                                <div className="relative w-full max-h-52 bg-black/20 overflow-hidden border-b border-black/15 shrink-0 flex items-center justify-center">
                                    <img
                                        src={activeKeywordModal.imageUrl}
                                        alt={activeKeywordModal.keyword}
                                        className="w-full max-h-52 object-cover"
                                    />
                                </div>
                            )}
                            <div className="p-5 overflow-y-auto no-scrollbar flex-1">
                                <div className="flex items-start justify-between gap-2 border-b border-current/20 pb-2.5 mb-3">
                                    <div>
                                        <h3 className="text-xl font-black tracking-wide">
                                            {activeKeywordModal.keyword}
                                        </h3>
                                        {activeKeywordModal.subtitle && (
                                            <span className="inline-block text-xs font-bold opacity-75 mt-0.5">
                                                {activeKeywordModal.subtitle}
                                            </span>
                                        )}
                                    </div>
                                    <button
                                        onClick={() => setActiveKeywordModal(null)}
                                        className="p-1 opacity-60 hover:opacity-100 outline-none"
                                    >
                                        <FaXmark className="w-4 h-4" />
                                    </button>
                                </div>
                                <div className="text-[16px] leading-relaxed whitespace-pre-wrap break-words opacity-95">
                                    {activeKeywordModal.description || "尚無詳細劇情紀錄。"}
                                </div>
                            </div>
                        </div>
                    </div>
                );
            })()}

            {/* Category & Theme Management Modal */}
            {categoryModalOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in">
                    <div className="w-full max-w-[380px] flex flex-col shadow-2xl rounded-2xl bg-panel-content p-5 border border-panel-inactive">
                        <h3 className="font-bold text-white mb-4">管理任務分類與外觀風格</h3>
                        <div className="flex flex-col gap-3 mb-4 max-h-[55vh] overflow-y-auto no-scrollbar pr-1">
                            {categoryForm.map((cat, idx) => (
                                <div
                                    key={cat.id}
                                    className="flex flex-col gap-2 p-2.5 rounded-xl bg-panel-base/60 border border-panel-inactive"
                                >
                                    <div className="flex items-center gap-1.5">
                                        <input
                                            value={cat.name}
                                            onChange={(e) => {
                                                const nc = [...categoryForm];
                                                nc[idx] = { ...nc[idx], name: e.target.value };
                                                setCategoryForm(nc);
                                            }}
                                            placeholder="分類名稱"
                                            className="flex-1 bg-panel-content text-white text-xs font-bold rounded-lg p-2 outline-none border border-transparent focus:border-panel-active"
                                        />
                                        {idx > 0 && (
                                            <button
                                                onClick={() => handleMoveCategory(idx, "up")}
                                                className="p-1.5 text-gray-400 hover:text-white outline-none"
                                                title="上移分類"
                                            >
                                                <FaCaretUp className="w-3.5 h-3.5" />
                                            </button>
                                        )}
                                        {idx < categoryForm.length - 1 && (
                                            <button
                                                onClick={() => handleMoveCategory(idx, "down")}
                                                className="p-1.5 text-gray-400 hover:text-white outline-none"
                                                title="下移分類"
                                            >
                                                <FaCaretDown className="w-3.5 h-3.5" />
                                            </button>
                                        )}
                                        <button
                                            onClick={() =>
                                                setCategoryForm(categoryForm.filter(c => c.id !== cat.id))
                                            }
                                            className="p-1.5 text-gray-500 hover:text-red-500 outline-none"
                                            title="刪除分類"
                                        >
                                            <FaTrash className="w-3.5 h-3.5" />
                                        </button>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <span className="text-[11px] font-bold text-gray-400 shrink-0">
                                            外觀風格
                                        </span>
                                        <select
                                            value={cat.themeId || "panel"}
                                            onChange={(e) => {
                                                const nc = [...categoryForm];
                                                nc[idx] = { ...nc[idx], themeId: e.target.value };
                                                setCategoryForm(nc);
                                            }}
                                            className="flex-1 bg-panel-content text-white text-xs font-bold rounded-lg p-1.5 outline-none border border-transparent focus:border-panel-active"
                                        >
                                            {Object.entries(LEGACY_THEMES).map(([k, v]) => (
                                                <option key={k} value={k}>
                                                    {v.label}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                </div>
                            ))}
                            <button
                                onClick={() =>
                                    setCategoryForm([
                                        ...categoryForm,
                                        {
                                            id: Date.now().toString(36),
                                            name: "新分類",
                                            isVisible: true,
                                            themeId: "panel"
                                        }
                                    ])
                                }
                                className="text-xs text-panel-active font-bold py-2 mt-1 border border-dashed border-panel-inactive rounded-xl hover:border-panel-active outline-none transition-colors"
                            >
                                新增分類
                            </button>
                        </div>
                        <div className="flex justify-end gap-2">
                            <button
                                onClick={() => setCategoryModalOpen(false)}
                                className="px-4 py-1.5 rounded-full text-xs font-bold text-gray-400 hover:text-white outline-none"
                            >
                                取消
                            </button>
                            <button
                                onClick={handleSaveCategories}
                                className="px-4 py-1.5 rounded-full text-xs font-bold bg-panel-active text-white outline-none"
                            >
                                儲存設定
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* DM Keyword Library Modal */}
            {keywordModalOpen && (
                <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/65 backdrop-blur-sm p-4 animate-in fade-in">
                    <div className="w-full max-w-[400px] max-h-[85vh] flex flex-col shadow-2xl rounded-2xl bg-panel-content p-5 border border-panel-inactive overflow-hidden">
                        {/* Fixed Header */}
                        <div className="flex items-center justify-between mb-3 shrink-0">
                            <div className="flex items-center gap-2 relative">
                                <h3 className="font-bold text-white text-base">劇情關鍵詞庫</h3>
                                <div className="relative group/help flex items-center">
                                    <FaCircleQuestion className="w-3.5 h-3.5 text-gray-400 hover:text-white cursor-help transition-colors" />
                                    <div className="absolute left-0 top-6 w-60 p-2.5 rounded-xl bg-panel-base border border-panel-inactive text-[11px] font-bold text-gray-200 shadow-xl opacity-0 pointer-events-none group-hover/help:opacity-100 transition-opacity z-30 leading-relaxed">
                                        在任務標題或內文中以 [關鍵詞] 或 [顯示文字|關鍵詞] 包覆即可突顯並觸發彈窗。
                                    </div>
                                </div>
                            </div>
                            <button
                                onClick={startCreateKeyword}
                                className="flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-bold bg-panel-active text-white outline-none shrink-0"
                            >
                                <FaCirclePlus className="w-3 h-3" /> 新增詞條
                            </button>
                        </div>

                        {/* Unified Scrollable Middle Content */}
                        <div className="flex-1 min-h-0 overflow-y-auto no-scrollbar flex flex-col gap-2.5 pr-1">
                            {/* Keyword Editor Form */}
                            {(editingKeyword !== null || keywordForm.keyword !== undefined) && (
                                <div className="flex flex-col gap-2.5 p-3 rounded-xl bg-panel-base border border-panel-inactive shrink-0">
                                    <div className="flex gap-2">
                                        <input
                                            autoFocus
                                            type="text"
                                            value={keywordForm.keyword || ""}
                                            onChange={(e) =>
                                                setKeywordForm({ ...keywordForm, keyword: e.target.value })
                                            }
                                            placeholder="關鍵詞名稱，例如：黑蜘蛛"
                                            className="flex-1 min-w-0 bg-panel-content text-white text-xs font-bold rounded-lg p-2 outline-none border border-transparent focus:border-panel-active"
                                        />
                                        <input
                                            type="text"
                                            value={keywordForm.subtitle || ""}
                                            onChange={(e) =>
                                                setKeywordForm({ ...keywordForm, subtitle: e.target.value })
                                            }
                                            placeholder="副標題或頭銜"
                                            className="w-28 bg-panel-content text-gray-300 text-xs font-bold rounded-lg p-2 outline-none border border-transparent focus:border-panel-active"
                                        />
                                    </div>

                                    <select
                                        value={keywordForm.themeId || "standard"}
                                        onChange={(e) =>
                                            setKeywordForm({ ...keywordForm, themeId: e.target.value })
                                        }
                                        className="w-full bg-panel-content text-white text-xs font-bold rounded-lg p-2 outline-none border border-transparent focus:border-panel-active"
                                    >
                                        {Object.entries(LEGACY_THEMES).map(([k, v]) => (
                                            <option key={k} value={k}>
                                                彈窗風格：{v.label}
                                            </option>
                                        ))}
                                    </select>

                                    <div className="flex items-center gap-2">
                                        <button
                                            type="button"
                                            onClick={handlePickOBRAsset}
                                            className="flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-lg bg-panel-content hover:bg-panel-inactive text-xs font-bold text-gray-200 outline-none border border-panel-inactive transition-colors"
                                        >
                                            <FaCloudArrowUp className="w-3.5 h-3.5 text-panel-active" /> 圖庫選圖
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => fileInputRef.current?.click()}
                                            className="flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-lg bg-panel-content hover:bg-panel-inactive text-xs font-bold text-gray-200 outline-none border border-panel-inactive transition-colors"
                                        >
                                            <FaImage className="w-3.5 h-3.5 text-amber-400" /> 本機上傳壓縮
                                        </button>
                                        {keywordForm.imageUrl && (
                                            <button
                                                type="button"
                                                onClick={() =>
                                                    setKeywordForm({ ...keywordForm, imageUrl: "" })
                                                }
                                                className="p-1.5 text-red-400 hover:text-red-300 text-xs font-bold outline-none shrink-0"
                                                title="移除圖片"
                                            >
                                                移除
                                            </button>
                                        )}
                                    </div>

                                    {keywordForm.imageUrl && (
                                        <div className="w-full h-24 rounded-lg overflow-hidden bg-black/30 flex items-center justify-center shrink-0">
                                            <img
                                                src={keywordForm.imageUrl}
                                                alt="預覽"
                                                className="h-full object-contain"
                                            />
                                        </div>
                                    )}

                                    <textarea
                                        value={keywordForm.description || ""}
                                        onChange={(e) =>
                                            setKeywordForm({ ...keywordForm, description: e.target.value })
                                        }
                                        placeholder="輸入角色的背景故事、外觀描述或相關情報..."
                                        className="w-full h-24 bg-panel-content text-gray-200 text-xs rounded-lg p-2 outline-none resize-none no-scrollbar border border-transparent focus:border-panel-active"
                                    />

                                    <div className="flex justify-end gap-2">
                                        <button
                                            onClick={() => {
                                                setEditingKeyword(null);
                                                setKeywordForm({});
                                            }}
                                            className="px-3 py-1 rounded-full text-xs font-bold text-gray-400 hover:text-white outline-none"
                                        >
                                            取消編輯
                                        </button>
                                        <button
                                            onClick={handleSaveKeyword}
                                            disabled={!keywordForm.keyword?.trim()}
                                            className="px-3.5 py-1 rounded-full text-xs font-bold bg-panel-active text-white outline-none disabled:opacity-50"
                                        >
                                            儲存詞條
                                        </button>
                                    </div>
                                </div>
                            )}

                            {/* Existing Keywords List */}
                            <div className="flex flex-col gap-2">
                                {keywords.length === 0 ? (
                                    <p className="text-xs text-gray-500 text-center py-6 font-bold">
                                        尚無關鍵詞，請點擊右上角新增詞條
                                    </p>
                                ) : (
                                    keywords.map(item => (
                                        <div
                                            key={item.id}
                                            className="flex items-center justify-between p-2.5 rounded-xl bg-panel-base border border-panel-inactive hover:border-gray-600 transition-colors"
                                        >
                                            <div
                                                onClick={() => setActiveKeywordModal(item)}
                                                className="flex items-center gap-2.5 min-w-0 flex-1 cursor-pointer"
                                            >
                                                {item.imageUrl && (
                                                    <img
                                                        src={item.imageUrl}
                                                        alt={item.keyword}
                                                        className="w-9 h-9 rounded-lg object-cover shrink-0 border border-white/10"
                                                    />
                                                )}
                                                <div className="min-w-0 flex-1">
                                                    <div className="flex items-baseline gap-2 min-w-0">
                                                        <span className="font-bold text-sm text-amber-400 shrink-0">
                                                            [{item.keyword}]
                                                        </span>
                                                        {item.subtitle && (
                                                            <span className="text-[11px] text-gray-400 truncate min-w-0 flex-1">
                                                                {item.subtitle}
                                                            </span>
                                                        )}
                                                    </div>
                                                    <p className="text-xs text-gray-400 truncate mt-0.5">
                                                        {item.description || "無說明"}
                                                    </p>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-1 shrink-0 ml-2">
                                                <button
                                                    onClick={() => startEditKeyword(item)}
                                                    className="p-1.5 text-gray-400 hover:text-white outline-none"
                                                    title="編輯詞條"
                                                >
                                                    <FaPencil className="w-3.5 h-3.5" />
                                                </button>
                                                <button
                                                    onClick={() =>
                                                        confirmDeleteKeywordId === item.id
                                                            ? handleDeleteKeyword(item.id)
                                                            : setConfirmDeleteKeywordId(item.id)
                                                    }
                                                    onMouseLeave={() => setConfirmDeleteKeywordId(null)}
                                                    className={`p-1.5 outline-none ${
                                                        confirmDeleteKeywordId === item.id
                                                            ? "text-red-500"
                                                            : "text-gray-400 hover:text-red-500"
                                                    }`}
                                                    title="刪除詞條"
                                                >
                                                    {confirmDeleteKeywordId === item.id ? (
                                                        <FaXmark className="w-3.5 h-3.5" />
                                                    ) : (
                                                        <FaTrash className="w-3.5 h-3.5" />
                                                    )}
                                                </button>
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>

                        {/* Fixed Footer */}
                        <button
                            onClick={() => setKeywordModalOpen(false)}
                            className="mt-3 w-full py-2 rounded-full text-xs font-bold bg-panel-inactive text-white hover:bg-panel-active outline-none shrink-0"
                        >
                            關閉詞庫
                        </button>
                    </div>
                </div>
            )}

            {/* Quest Create / Edit Modal */}
            {modalOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in">
                    <div className="w-full max-w-[360px] flex flex-col shadow-2xl rounded-2xl bg-panel-content p-5 border border-panel-inactive">
                        <h3 className="font-bold text-white mb-4">
                            {editingQuest ? "編輯任務" : "新增任務"}
                        </h3>
                        <div className="flex flex-col gap-3 mb-5">
                            <input
                                ref={titleInputRef}
                                autoFocus
                                type="text"
                                value={form.title || ""}
                                onFocus={() => {
                                    activeFieldRef.current = "title";
                                }}
                                onChange={(e) => setForm({ ...form, title: e.target.value })}
                                placeholder="任務名稱，可用 [關鍵詞] 包覆"
                                className="w-full bg-panel-base text-white text-sm font-bold rounded-xl p-2.5 outline-none border border-transparent focus:border-panel-active shadow-inner"
                            />
                            <textarea
                                ref={descTextareaRef}
                                value={form.description || ""}
                                onFocus={() => {
                                    activeFieldRef.current = "description";
                                }}
                                onChange={(e) => setForm({ ...form, description: e.target.value })}
                                placeholder="任務說明... 可輸入 [黑蜘蛛] 或 [顯示文字|黑蜘蛛] 標記關鍵詞"
                                className="w-full h-28 bg-panel-base text-gray-300 text-xs rounded-xl p-2.5 outline-none border border-transparent focus:border-panel-active resize-none no-scrollbar shadow-inner"
                            />

                            {/* Cursor-aware Quick Keyword Insertion Bar */}
                            {keywords.length > 0 && (
                                <div className="flex flex-col gap-1">
                                    <span className="text-[11px] font-bold text-gray-400">
                                        點擊插入至游標位置：
                                    </span>
                                    <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
                                        {keywords.map(kw => (
                                            <button
                                                key={kw.id}
                                                type="button"
                                                onMouseDown={(e) => e.preventDefault()}
                                                onClick={() => handleInsertKeywordAtCursor(kw.keyword)}
                                                className="px-2 py-0.5 rounded-full bg-panel-base hover:bg-panel-active/30 text-amber-400 border border-amber-500/30 text-[11px] font-bold shrink-0 outline-none transition-colors"
                                            >
                                                +[{kw.keyword}]
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}

                            <div className="flex items-center">
                                <select
                                    value={form.categoryId || categories[0]?.id}
                                    onChange={(e) => setForm({ ...form, categoryId: e.target.value })}
                                    className="w-full bg-panel-base text-white text-xs font-bold rounded-xl p-2.5 outline-none border border-transparent focus:border-panel-active"
                                >
                                    {categories.map(c => (
                                        <option key={c.id} value={c.id}>
                                            {c.name}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            {isGM && (
                                <button
                                    onClick={() => setForm({ ...form, isVisible: !form.isVisible })}
                                    className={`flex items-center justify-center gap-1.5 w-full h-9 rounded-xl text-xs font-bold outline-none border shadow-sm ${
                                        form.isVisible
                                            ? "bg-panel-active/20 border-panel-active text-panel-active"
                                            : "bg-panel-base border-transparent text-gray-400 hover:text-white"
                                    }`}
                                >
                                    {form.isVisible ? (
                                        <>
                                            <FaEye className="w-3.5 h-3.5" /> 所有人可見
                                        </>
                                    ) : (
                                        <>
                                            <FaEyeSlash className="w-3.5 h-3.5" /> 隱藏任務
                                        </>
                                    )}
                                </button>
                            )}
                        </div>
                        <div className="flex justify-end gap-2">
                            <button
                                onClick={() => {
                                    playClickSound();
                                    setModalOpen(false);
                                }}
                                className="px-4 py-1.5 rounded-full text-xs font-bold text-gray-400 hover:text-white outline-none transition-colors"
                            >
                                取消
                            </button>
                            <button
                                onClick={handleSaveQuest}
                                disabled={!form.title}
                                className="px-4 py-1.5 rounded-full text-xs font-bold bg-panel-active text-white outline-none disabled:opacity-50 transition-opacity"
                            >
                                儲存
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}