// src/components/StoryManager/QuestTab.tsx
import { useState, useRef, useEffect } from "react";
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
    FaCircleQuestion,
    FaArrowLeft,
    FaTowerBroadcast,
    FaCompass
} from "react-icons/fa6";
import { Quest, QuestCategory, KeywordItem, QuestStatus } from "./types";
import { useStoryData } from "./store";
import { LEGACY_THEMES } from "./constants";
import { ImageCropper, CroppedImage, DEFAULT_IMAGE_CROP, openGlobalImageViewer } from "./ImageCropper";

const STATUS_CONFIG: Record<QuestStatus, { label: string; badgeClass: string }> = {
    none: { label: "無狀態標籤", badgeClass: "" },
    active: { label: "進行中", badgeClass: "bg-sky-500/20 text-sky-300 border-sky-400/30" },
    important: { label: "重要", badgeClass: "bg-amber-500/20 text-amber-300 border-amber-400/40" },
    completed: { label: "已完成", badgeClass: "bg-emerald-500/20 text-emerald-300 border-emerald-400/30" },
    failed: { label: "已失敗", badgeClass: "bg-rose-500/20 text-rose-300 border-rose-400/30" }
};

function playClickSound() {
    try {
        const audio = new Audio("/click.mp3");
        audio.volume = 0.15;
        audio.play().catch(() => {});
    } catch (e) {}
}

// Play sound effect when opening a keyword card
function playKeywordOpenSound() {
    try {
        const audio = new Audio("/quest_check.mp3");
        audio.volume = 0.3;
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
        unreadQuestIds,
        clearUnreadQuest,
        saveSingleQuest,
        deleteSingleQuest,
        reorderQuests,
        saveCategoriesProxy,
        saveKeywords,
        broadcastKeyword
    } = useStoryData();

    const [viewMode, setViewMode] = useState<"quests" | "compendium">("quests");
    const [modalOpen, setModalOpen] = useState(false);
    const [categoryModalOpen, setCategoryModalOpen] = useState(false);
    const [keywordModalOpen, setKeywordModalOpen] = useState(false);
    const [editingQuest, setEditingQuest] = useState<Quest | null>(null);
    const [form, setForm] = useState<Partial<Quest>>({});
    const [categoryForm, setCategoryForm] = useState<QuestCategory[]>([]);
    const [expandedQuests, setExpandedQuests] = useState<Record<string, boolean>>({});
    const [collapsedCategories, setCollapsedCategories] = useState<Record<string, boolean>>({});
    const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

    // Keyword Library and Lore Modal state with navigation stack
    const [editingKeyword, setEditingKeyword] = useState<KeywordItem | null>(null);
    const [keywordForm, setKeywordForm] = useState<Partial<KeywordItem>>({});
    const [confirmDeleteKeywordId, setConfirmDeleteKeywordId] = useState<string | null>(null);
    const [activeKeywordModal, setActiveKeywordModal] = useState<KeywordItem | null>(null);
    const [keywordHistory, setKeywordHistory] = useState<KeywordItem[]>([]);
    const fileInputRef = useRef<HTMLInputElement | null>(null);

    // Refs for cursor-aware keyword insertion
    const titleInputRef = useRef<HTMLInputElement | null>(null);
    const descTextareaRef = useRef<HTMLTextAreaElement | null>(null);
    const activeFieldRef = useRef<"title" | "description">("description");

    // Refs for slow auto-scrolling keyword marquee bar
    const marqueeRef = useRef<HTMLDivElement | null>(null);
    const isMarqueePausedRef = useRef(false);
    const scrollPosRef = useRef(0);
    const scrollDirRef = useRef<1 | -1>(1);

    // Listen for broadcasted keyword popups from GM
    useEffect(() => {
        const handleForceOpenKeyword = (e: any) => {
            if (e.detail) {
                playKeywordOpenSound();
                setKeywordHistory([]);
                setActiveKeywordModal(e.detail);
            }
        };
        window.addEventListener("force-open-keyword", handleForceOpenKeyword);
        return () => window.removeEventListener("force-open-keyword", handleForceOpenKeyword);
    }, []);

    // Keep active keyword modal synchronized when secrets or content update
    useEffect(() => {
        if (activeKeywordModal) {
            const updated = keywords.find(k => k.id === activeKeywordModal.id);
            if (updated) setActiveKeywordModal(updated);
        }
    }, [keywords]);

    // Drive slow marquee auto-scroll while allowing manual scrollbar interaction
    useEffect(() => {
        if (!modalOpen || !isGM || keywords.length === 0) return;
        let animationFrameId: number;
        let lastTime = performance.now();
        scrollPosRef.current = 0;
        scrollDirRef.current = 1;

        const step = (now: number) => {
            const dt = now - lastTime;
            lastTime = now;
            const el = marqueeRef.current;
            if (el) {
                if (!isMarqueePausedRef.current) {
                    const maxScroll = el.scrollWidth - el.clientWidth;
                    if (maxScroll > 2) {
                        scrollPosRef.current += scrollDirRef.current * (dt * 0.022);
                        if (scrollPosRef.current >= maxScroll) {
                            scrollPosRef.current = maxScroll;
                            scrollDirRef.current = -1;
                        } else if (scrollPosRef.current <= 0) {
                            scrollPosRef.current = 0;
                            scrollDirRef.current = 1;
                        }
                        el.scrollLeft = scrollPosRef.current;
                    }
                } else {
                    scrollPosRef.current = el.scrollLeft;
                }
            }
            animationFrameId = requestAnimationFrame(step);
        };

        animationFrameId = requestAnimationFrame(step);
        return () => cancelAnimationFrame(animationFrameId);
    }, [modalOpen, isGM, keywords.length]);

    const openKeywordCard = (target: KeywordItem, fromModal: boolean = false) => {
        playKeywordOpenSound();
        if (fromModal && activeKeywordModal && activeKeywordModal.id !== target.id) {
            setKeywordHistory(prev => [...prev, activeKeywordModal]);
        } else if (!fromModal) {
            setKeywordHistory([]);
        }
        setActiveKeywordModal(target);
    };

    const handleBackKeyword = () => {
        playClickSound();
        if (keywordHistory.length === 0) return;
        const previous = keywordHistory[keywordHistory.length - 1];
        setKeywordHistory(prev => prev.slice(0, -1));
        setActiveKeywordModal(previous);
    };

    const handleSaveQuest = () => {
        playClickSound();
        const status: QuestStatus = form.status || "none";
        const newQuest: Quest = {
            id: editingQuest?.id || Date.now().toString(36),
            title: form.title || "未命名任務",
            description: form.description || "",
            categoryId: form.categoryId || categories[0]?.id || "main",
            isVisible: form.isVisible ?? false,
            isCompleted: status === "completed" || status === "failed",
            status,
            revealedSecrets: editingQuest?.revealedSecrets || [],
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
            setForm({
                ...quest,
                status: quest.status || (quest.isCompleted ? "completed" : "none")
            });
        } else {
            setEditingQuest(null);
            setForm({
                categoryId: categories[0]?.id,
                isVisible: true,
                isCompleted: false,
                status: "none",
                markerStyle: "none"
            });
        }
        setModalOpen(true);
    };

    // Insert text snippet at current cursor position of focused field
    const handleInsertSnippetAtCursor = (snippet: string) => {
        playClickSound();
        const targetField = activeFieldRef.current;
        const el = targetField === "title" ? titleInputRef.current : descTextareaRef.current;
        const currentVal = (targetField === "title" ? form.title : form.description) || "";

        if (el && typeof el.selectionStart === "number" && typeof el.selectionEnd === "number") {
            const start = el.selectionStart;
            const end = el.selectionEnd;
            const nextVal = currentVal.slice(0, start) + snippet + currentVal.slice(end);
            setForm(prev => ({ ...prev, [targetField]: nextVal }));

            requestAnimationFrame(() => {
                el.focus();
                const newPos = start + snippet.length;
                el.setSelectionRange(newPos, newPos);
            });
        } else {
            setForm(prev => ({
                ...prev,
                [targetField]: currentVal + snippet
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
            imageCrop: { ...DEFAULT_IMAGE_CROP },
            themeId: "standard",
            isVisible: true
        });
    };

    const startEditKeyword = (item: KeywordItem) => {
        playClickSound();
        setEditingKeyword(item);
        setKeywordForm({
            ...item,
            imageCrop: item.imageCrop || { ...DEFAULT_IMAGE_CROP },
            isVisible: item.isVisible ?? true
        });
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
            imageCrop: keywordForm.imageCrop || { ...DEFAULT_IMAGE_CROP },
            themeId: keywordForm.themeId || "standard",
            isVisible: keywordForm.isVisible ?? true,
            revealedSecrets: [],
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
                setKeywordForm(prev => ({
                    ...prev,
                    imageUrl: assets[0].image.url,
                    imageCrop: { ...DEFAULT_IMAGE_CROP }
                }));
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
            setKeywordForm(prev => ({
                ...prev,
                imageUrl: compressedDataUrl,
                imageCrop: { ...DEFAULT_IMAGE_CROP }
            }));
        } catch (err) {
            console.error("Failed to compress image", err);
        } finally {
            e.target.value = "";
        }
    };

    // Parse keyword links in quest and lore descriptions
    const renderFormattedText = (
        text: string,
        accentColor: string,
        options?: {
            insideModal?: boolean;
        }
    ) => {
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
                        if (matchedEntry) {
                            openKeywordCard(matchedEntry, options?.insideModal);
                        } else if (isGM) {
                            playClickSound();
                            setActiveKeywordModal(null);
                            setKeywordModalOpen(true);
                            setEditingKeyword(null);
                            setKeywordForm({
                                keyword: targetKey,
                                subtitle: "",
                                description: "",
                                imageCrop: { ...DEFAULT_IMAGE_CROP },
                                themeId: "standard",
                                isVisible: true
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
    const visibleKeywords = isGM ? keywords : keywords.filter(k => k.isVisible !== false);

    return (
        <div className="relative px-1">
            <style>{`
                .keyword-scrollbar::-webkit-scrollbar {
                    height: 5px;
                }
                .keyword-scrollbar::-webkit-scrollbar-track {
                    background: rgba(0, 0, 0, 0.25);
                    border-radius: 9999px;
                }
                .keyword-scrollbar::-webkit-scrollbar-thumb {
                    background: rgba(156, 129, 216, 0.45);
                    border-radius: 9999px;
                }
                .keyword-scrollbar::-webkit-scrollbar-thumb:hover {
                    background: rgba(156, 129, 216, 0.85);
                }
            `}</style>
            <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleLocalImageUpload}
            />

            {/* Top Navigation and Action Bar */}
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => {
                            playClickSound();
                            setViewMode("quests");
                        }}
                        className={`text-sm font-bold px-2.5 py-1 rounded-full transition-colors outline-none ${
                            viewMode === "quests"
                                ? "bg-panel-active text-white shadow-sm"
                                : "text-gray-400 hover:text-white"
                        }`}
                    >
                        還記得...
                    </button>
                    <button
                        onClick={() => {
                            playClickSound();
                            setViewMode("compendium");
                        }}
                        className={`flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-full transition-colors outline-none ${
                            viewMode === "compendium"
                                ? "bg-panel-active text-white shadow-sm"
                                : "text-gray-400 hover:text-white bg-panel-inactive/60"
                        }`}
                    >
                        <FaCompass className="w-3 h-3" /> 情報圖鑑
                    </button>
                </div>

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
                    {viewMode === "quests" && (
                        <button
                            onClick={() => openEditModal()}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-panel-inactive hover:bg-panel-active text-white rounded-full transition-colors shadow-sm outline-none"
                        >
                            <FaCirclePlus className="w-3.5 h-3.5" /> 新增任務
                        </button>
                    )}
                </div>
            </div>

            {/* Lore Compendium View Mode */}
            {viewMode === "compendium" && (
                <div className="flex flex-col gap-2.5 pb-6">
                    {visibleKeywords.length === 0 ? (
                        <p className="text-xs font-bold text-gray-500 text-center py-10">
                            目前尚無已公開的情報詞條
                        </p>
                    ) : (
                        <div className="grid grid-cols-1 gap-2.5">
                            {visibleKeywords.map(item => {
                                const kwTheme = LEGACY_THEMES[item.themeId || "standard"] || LEGACY_THEMES.standard;
                                return (
                                    <div
                                        key={item.id}
                                        onClick={() => openKeywordCard(item, false)}
                                        style={{
                                            backgroundColor: kwTheme.bg,
                                            color: kwTheme.text,
                                            borderColor: kwTheme.border || "rgba(255, 255, 255, 0.12)"
                                        }}
                                        className="group relative flex items-center gap-3 p-3 rounded-xl border shadow-sm cursor-pointer transition-all hover:brightness-105 font-serif"
                                    >
                                        {item.imageUrl && (
                                            <CroppedImage
                                                src={item.imageUrl}
                                                alt={item.keyword}
                                                crop={item.imageCrop}
                                                containerClassName="w-12 h-12 rounded-xl shrink-0 border border-black/20"
                                            />
                                        )}
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-baseline gap-2">
                                                <h4 className="font-bold text-[17px] shrink-0">
                                                    {item.keyword}
                                                </h4>
                                                {item.subtitle && (
                                                    <span className="text-xs opacity-75 truncate">
                                                        {item.subtitle}
                                                    </span>
                                                )}
                                                {isGM && item.isVisible === false && (
                                                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-black/30 text-white font-sans font-bold shrink-0">
                                                        隱藏
                                                    </span>
                                                )}
                                            </div>
                                            <p className="text-sm opacity-85 line-clamp-1 mt-0.5">
                                                {item.description}
                                            </p>
                                        </div>

                                        {isGM && (
                                            <div
                                                onClick={(e) => e.stopPropagation()}
                                                className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity bg-panel-base/90 text-gray-200 px-1.5 py-1 rounded-full shadow-md shrink-0 font-sans"
                                            >
                                                <button
                                                    onClick={() => {
                                                        playClickSound();
                                                        broadcastKeyword(item.id);
                                                    }}
                                                    title="推送情報卡至所有玩家畫面"
                                                    className="p-1 text-amber-400 hover:text-white outline-none"
                                                >
                                                    <FaTowerBroadcast className="w-3.5 h-3.5" />
                                                </button>
                                                <button
                                                    onClick={() => {
                                                        playClickSound();
                                                        saveKeywords(
                                                            keywords.map(k =>
                                                                k.id === item.id
                                                                    ? { ...k, isVisible: k.isVisible === false ? true : false }
                                                                    : k
                                                            )
                                                        );
                                                    }}
                                                    title={item.isVisible === false ? "對玩家隱藏中" : "對玩家公開中"}
                                                    className={`p-1 outline-none ${
                                                        item.isVisible === false
                                                            ? "text-gray-400 hover:text-white"
                                                            : "text-panel-active"
                                                    }`}
                                                >
                                                    {item.isVisible === false ? (
                                                        <FaEyeSlash className="w-3.5 h-3.5" />
                                                    ) : (
                                                        <FaEye className="w-3.5 h-3.5" />
                                                    )}
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            )}

            {/* Quests List View Mode */}
            {viewMode === "quests" &&
                categories
                    .filter(c => isGM || c.isVisible !== false)
                    .map(cat => {
                        const rawList = visibleQuests.filter(q => q.categoryId === cat.id);
                        // Sort active/important quests first, completed/failed quests last
                        const list = [...rawList].sort((a, b) => {
                            const aDone = a.status === "completed" || a.status === "failed" ? 1 : 0;
                            const bDone = b.status === "completed" || b.status === "failed" ? 1 : 0;
                            return aDone - bDone;
                        });

                        const themeKey = cat.themeId || "panel";
                        const themeObj = LEGACY_THEMES[themeKey] || LEGACY_THEMES.panel;
                        const isCustomTheme = themeKey !== "panel";
                        const accentColor = themeObj.accent || "#c084fc";
                        const headerColor = themeObj.headerColor || "#9c81d8";
                        const isCollapsed = collapsedCategories[cat.id] ?? false;

                        return (
                            <div key={cat.id} className="mb-5">
                                <div
                                    onClick={() => {
                                        playClickSound();
                                        setCollapsedCategories(prev => ({
                                            ...prev,
                                            [cat.id]: !prev[cat.id]
                                        }));
                                    }}
                                    className="flex items-center justify-between border-b border-panel-inactive pb-1 mb-2 cursor-pointer select-none group/cat"
                                >
                                    <div className="flex items-center gap-2">
                                        <h4
                                            className="text-base font-bold px-1"
                                            style={{ color: headerColor }}
                                        >
                                            {cat.name}
                                        </h4>
                                        <span className="text-xs font-bold text-gray-500">
                                            {list.length}
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-1">
                                        {isGM && (
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    saveCategoriesProxy(
                                                        categories.map(c =>
                                                            c.id === cat.id
                                                                ? { ...c, isVisible: c.isVisible === false ? true : false }
                                                                : c
                                                        )
                                                    );
                                                }}
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
                                        <span className="p-1 text-gray-500 group-hover/cat:text-gray-300">
                                            {isCollapsed ? (
                                                <FaCaretDown className="w-3.5 h-3.5" />
                                            ) : (
                                                <FaCaretUp className="w-3.5 h-3.5" />
                                            )}
                                        </span>
                                    </div>
                                </div>

                                {!isCollapsed && (
                                    <>
                                        {list.length === 0 && (
                                            <p className="text-xs font-bold text-gray-500 px-1">無任務</p>
                                        )}
                                        <div className="flex flex-col gap-2.5">
                                            {list.map((quest, qIdx) => {
                                                const isExpanded = expandedQuests[quest.id];
                                                const statusKey: QuestStatus = quest.status || "none";
                                                const statusInfo = STATUS_CONFIG[statusKey];
                                                const isResolved = statusKey === "completed" || statusKey === "failed";
                                                const hasUnreadUpdate = !isGM && Boolean(unreadQuestIds[quest.id]);

                                                return (
                                                    <div
                                                        key={quest.id}
                                                        onClick={() => {
                                                            if (hasUnreadUpdate) {
                                                                clearUnreadQuest(quest.id);
                                                            }
                                                        }}
                                                        style={{
                                                            backgroundColor: themeObj.bg,
                                                            color: themeObj.text,
                                                            borderColor: themeObj.border || "rgba(255, 255, 255, 0.08)"
                                                        }}
                                                        className={`relative p-3.5 rounded-xl border transition-all shadow-sm group hover:brightness-105 ${
                                                            isCustomTheme ? "font-serif" : ""
                                                        } ${isResolved ? "opacity-60 hover:opacity-90" : ""}`}
                                                    >
                                                        <div className="flex items-start">
                                                            <div className="flex-1 min-w-0">
                                                                <div className="flex items-start justify-between gap-2">
                                                                    <div className="flex items-center gap-2 flex-wrap min-w-0 pr-1">
                                                                        {hasUnreadUpdate && (
                                                                            <span
                                                                                title="任務有新更新"
                                                                                className="w-2.5 h-2.5 rounded-full bg-amber-400 shadow-[0_0_8px_#fbbf24] animate-pulse shrink-0"
                                                                            />
                                                                        )}
                                                                        {statusKey !== "none" && (
                                                                            <span
                                                                                className={`text-[11px] font-sans font-bold px-2 py-0.5 rounded-full border shrink-0 ${statusInfo.badgeClass}`}
                                                                            >
                                                                                {statusInfo.label}
                                                                            </span>
                                                                        )}
                                                                        <h5
                                                                            className={`font-bold text-[18px] leading-snug break-words ${
                                                                                statusKey === "failed" ? "line-through" : ""
                                                                            }`}
                                                                        >
                                                                            {renderFormattedText(quest.title, accentColor)}
                                                                        </h5>
                                                                    </div>

                                                                    {/* Hover-only action bar */}
                                                                    <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 pointer-events-none group-hover:pointer-events-auto transition-opacity bg-panel-base/90 text-gray-200 px-1.5 py-0.5 rounded-full shadow-md shrink-0 font-sans">
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
                                                                        onClick={() => {
                                                                            if (hasUnreadUpdate) {
                                                                                clearUnreadQuest(quest.id);
                                                                            }
                                                                            setExpandedQuests(p => ({
                                                                                ...p,
                                                                                [quest.id]: !p[quest.id]
                                                                            }));
                                                                        }}
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
                                    </>
                                )}
                            </div>
                        );
                    })}

            {/* Centered Lore Floating Modal with Nested Navigation */}
            {activeKeywordModal && (() => {
                const modalTheme = LEGACY_THEMES[activeKeywordModal.themeId || "standard"] || LEGACY_THEMES.standard;
                const modalAccent = modalTheme.accent || "#b45309";
                return (
                    <div
                        onClick={() => {
                            setActiveKeywordModal(null);
                            setKeywordHistory([]);
                        }}
                        className="fixed inset-0 z-[250] flex items-center justify-center bg-black/65 backdrop-blur-sm p-4 animate-in fade-in duration-200"
                    >
                        <div
                            onClick={(e) => e.stopPropagation()}
                            style={{
                                backgroundColor: modalTheme.bg,
                                color: modalTheme.text,
                                borderColor: modalTheme.border || "rgba(255, 255, 255, 0.15)"
                            }}
                            className="w-full max-w-[380px] max-h-[82vh] flex flex-col rounded-2xl border shadow-2xl overflow-hidden font-serif animate-in zoom-in-95 duration-200"
                        >
                            {activeKeywordModal.imageUrl && (
                                <CroppedImage
                                    src={activeKeywordModal.imageUrl}
                                    alt={activeKeywordModal.keyword}
                                    crop={activeKeywordModal.imageCrop}
                                    title="點擊檢視完整圖片"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        openGlobalImageViewer(
                                            activeKeywordModal.imageUrl!,
                                            activeKeywordModal.keyword
                                        );
                                    }}
                                    containerClassName="w-full h-52 bg-black/20 border-b border-black/15 shrink-0"
                                />
                            )}
                            <div className="p-5 overflow-y-auto no-scrollbar flex-1">
                                <div className="flex items-start justify-between gap-2 border-b border-current/20 pb-2.5 mb-3">
                                    <div className="flex items-start gap-2 min-w-0">
                                        {keywordHistory.length > 0 && (
                                            <button
                                                onClick={handleBackKeyword}
                                                title="返回上一頁"
                                                className="mt-1 p-1.5 rounded-full bg-black/10 hover:bg-black/20 outline-none shrink-0 transition-colors"
                                            >
                                                <FaArrowLeft className="w-3.5 h-3.5" />
                                            </button>
                                        )}
                                        <div className="min-w-0">
                                            <h3 className="text-xl font-black tracking-wide break-words">
                                                {activeKeywordModal.keyword}
                                            </h3>
                                            {activeKeywordModal.subtitle && (
                                                <span className="inline-block text-xs font-bold opacity-75 mt-0.5">
                                                    {activeKeywordModal.subtitle}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-1 shrink-0">
                                        {isGM && (
                                            <button
                                                onClick={() => {
                                                    playClickSound();
                                                    broadcastKeyword(activeKeywordModal.id);
                                                }}
                                                title="推送此情報卡給所有玩家"
                                                className="p-1.5 opacity-70 hover:opacity-100 outline-none"
                                            >
                                                <FaTowerBroadcast className="w-4 h-4" />
                                            </button>
                                        )}
                                        <button
                                            onClick={() => {
                                                setActiveKeywordModal(null);
                                                setKeywordHistory([]);
                                            }}
                                            className="p-1.5 opacity-60 hover:opacity-100 outline-none"
                                        >
                                            <FaXmark className="w-4 h-4" />
                                        </button>
                                    </div>
                                </div>
                                <div className="text-[16px] leading-relaxed whitespace-pre-wrap break-words opacity-95">
                                    {activeKeywordModal.description
                                        ? renderFormattedText(activeKeywordModal.description, modalAccent, {
                                              insideModal: true
                                          })
                                        : "尚無詳細劇情紀錄。"}
                                </div>
                            </div>
                        </div>
                    </div>
                );
            })()}

            {/* Category and Theme Management Modal */}
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
                                    <div className="absolute left-0 top-6 w-64 p-2.5 rounded-xl bg-panel-base border border-panel-inactive text-[11px] font-bold text-gray-200 shadow-xl opacity-0 pointer-events-none group-hover/help:opacity-100 transition-opacity z-30 leading-relaxed">
                                        在任務或詞條中以 [關鍵詞] 或 [顯示文字|關鍵詞] 包覆即可觸發彈窗。
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

                                    <div className="flex items-center gap-2">
                                        <select
                                            value={keywordForm.themeId || "standard"}
                                            onChange={(e) =>
                                                setKeywordForm({ ...keywordForm, themeId: e.target.value })
                                            }
                                            className="flex-1 bg-panel-content text-white text-xs font-bold rounded-lg p-2 outline-none border border-transparent focus:border-panel-active"
                                        >
                                            {Object.entries(LEGACY_THEMES).map(([k, v]) => (
                                                <option key={k} value={k}>
                                                    彈窗風格：{v.label}
                                                </option>
                                            ))}
                                        </select>
                                        <button
                                            type="button"
                                            onClick={() =>
                                                setKeywordForm(prev => ({
                                                    ...prev,
                                                    isVisible: prev.isVisible === false ? true : false
                                                }))
                                            }
                                            className={`px-2.5 py-2 rounded-lg text-xs font-bold outline-none border shrink-0 flex items-center gap-1 ${
                                                keywordForm.isVisible !== false
                                                    ? "bg-panel-active/20 border-panel-active text-panel-active"
                                                    : "bg-panel-content border-transparent text-gray-400"
                                            }`}
                                        >
                                            {keywordForm.isVisible !== false ? (
                                                <>
                                                    <FaEye className="w-3 h-3" /> 圖鑑公開
                                                </>
                                            ) : (
                                                <>
                                                    <FaEyeSlash className="w-3 h-3" /> 圖鑑隱藏
                                                </>
                                            )}
                                        </button>
                                    </div>

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
                                        <ImageCropper
                                            src={keywordForm.imageUrl}
                                            crop={keywordForm.imageCrop}
                                            aspectClassName="h-40"
                                            onChange={(nextCrop) =>
                                                setKeywordForm({ ...keywordForm, imageCrop: nextCrop })
                                            }
                                        />
                                    )}

                                    <textarea
                                        value={keywordForm.description || ""}
                                        onChange={(e) =>
                                            setKeywordForm({ ...keywordForm, description: e.target.value })
                                        }
                                        placeholder="輸入背景故事... 支援 [其他關鍵詞] 跳轉"
                                        className="w-full h-24 bg-panel-content text-gray-200 text-xs rounded-lg p-2 outline-none resize-none overflow-y-auto editor-scrollbar border border-transparent focus:border-panel-active"
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
                                                onClick={() => openKeywordCard(item, false)}
                                                className="flex items-center gap-2.5 min-w-0 flex-1 cursor-pointer"
                                            >
                                                {item.imageUrl && (
                                                    <CroppedImage
                                                        src={item.imageUrl}
                                                        alt={item.keyword}
                                                        crop={item.imageCrop}
                                                        containerClassName="w-9 h-9 rounded-lg shrink-0 border border-white/10"
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
                                                    onClick={() => {
                                                        playClickSound();
                                                        broadcastKeyword(item.id);
                                                    }}
                                                    className="p-1.5 text-amber-400 hover:text-white outline-none"
                                                    title="推送此情報卡至所有玩家畫面"
                                                >
                                                    <FaTowerBroadcast className="w-3.5 h-3.5" />
                                                </button>
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

            {/* Quest Create and Edit Modal */}
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
                                placeholder={isGM ? "任務名稱，可用 [關鍵詞] 包覆" : "任務名稱"}
                                className="w-full bg-panel-base text-white text-sm font-bold rounded-xl p-2.5 outline-none border border-transparent focus:border-panel-active shadow-inner"
                            />
                            <textarea
                                ref={descTextareaRef}
                                value={form.description || ""}
                                onFocus={() => {
                                    activeFieldRef.current = "description";
                                }}
                                onChange={(e) => setForm({ ...form, description: e.target.value })}
                                placeholder={
                                    isGM
                                        ? "任務說明... 可輸入 [關鍵詞] 標記劇情詞條"
                                        : "任務說明..."
                                }
                                className="w-full h-28 bg-panel-base text-gray-300 text-xs rounded-xl p-2.5 outline-none border border-transparent focus:border-panel-active resize-none overflow-y-auto editor-scrollbar shadow-inner"
                            />

                            {/* GM-Only Cursor-aware Marquee Keyword Insertion Bar */}
                            {isGM && keywords.length > 0 && (
                                <div className="flex flex-col gap-1.5">
                                    <div className="flex items-center justify-between">
                                        <span className="text-[11px] font-bold text-gray-400">
                                            點擊插入關鍵詞至游標位置：
                                        </span>
                                    </div>
                                    <div
                                        ref={marqueeRef}
                                        onMouseEnter={() => {
                                            isMarqueePausedRef.current = true;
                                        }}
                                        onMouseLeave={() => {
                                            isMarqueePausedRef.current = false;
                                        }}
                                        className="flex items-center gap-1.5 overflow-x-auto keyword-scrollbar pt-0.5 pb-2"
                                    >
                                        {keywords.map(kw => (
                                            <button
                                                key={kw.id}
                                                type="button"
                                                onMouseDown={(e) => e.preventDefault()}
                                                onClick={() => handleInsertSnippetAtCursor(`[${kw.keyword}]`)}
                                                className="px-2.5 py-0.5 rounded-full bg-panel-base hover:bg-panel-active/30 text-amber-400 border border-amber-500/30 text-[11px] font-bold shrink-0 outline-none transition-colors"
                                            >
                                                +[{kw.keyword}]
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}

                            <div className="flex items-center gap-2">
                                <select
                                    value={form.categoryId || categories[0]?.id}
                                    onChange={(e) => setForm({ ...form, categoryId: e.target.value })}
                                    className="flex-1 bg-panel-base text-white text-xs font-bold rounded-xl p-2.5 outline-none border border-transparent focus:border-panel-active"
                                >
                                    {categories.map(c => (
                                        <option key={c.id} value={c.id}>
                                            {c.name}
                                        </option>
                                    ))}
                                </select>
                                <select
                                    value={form.status || "none"}
                                    onChange={(e) =>
                                        setForm({ ...form, status: e.target.value as QuestStatus })
                                    }
                                    className="w-32 bg-panel-base text-white text-xs font-bold rounded-xl p-2.5 outline-none border border-transparent focus:border-panel-active"
                                >
                                    {Object.entries(STATUS_CONFIG).map(([k, v]) => (
                                        <option key={k} value={k}>
                                            {v.label}
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