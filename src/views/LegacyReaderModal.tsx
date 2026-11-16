// src/views/LegacyReaderModal.tsx
import { useEffect, useState, useRef } from "react";
import OBR from "@owlbear-rodeo/sdk";
import LZString from "lz-string";
import {
    FaPencil,
    FaEye,
    FaEyeSlash,
    FaXmark,
    FaBold,
    FaItalic,
    FaUnderline,
    FaStrikethrough,
    FaHeading,
    FaQuoteLeft,
    FaAlignCenter,
    FaAlignRight,
    FaMinus,
    FaFileLines,
    FaImage,
    FaCloudArrowUp,
    FaMask,
    FaKey,
    FaBookBookmark,
    FaChevronLeft,
    FaChevronRight,
    FaCircleQuestion,
    FaArrowLeft,
    FaTowerBroadcast,
    FaRotateLeft,
    FaRotateRight,
    FaStamp,
    FaCheck
} from "react-icons/fa6";
import { LegacyItem, LegacyAttachment, KeywordItem } from "../components/StoryManager/types";
import { useStoryData } from "../components/StoryManager/store";
import { LEGACY_THEMES } from "../components/StoryManager/constants";
import { WaxSealBadge, WAX_SEAL_OPTIONS, renderWaxSealIcon } from "../components/StoryManager/WaxSeal";
import { compressImageFile } from "../components/StoryManager/ShopTab";
import { ACTIVE_LEGACY_STORAGE_KEY, ACTIVE_LEGACY_EDIT_KEY } from "../components/StoryManager/LegacyTab";
import {
    ImageCropper,
    CroppedImage,
    DEFAULT_IMAGE_CROP,
    LightboxOverlay
} from "../components/StoryManager/ImageCropper";

const RUNE_ALPHABET = "ᚠᚢᚦᚨᚱᚲᚷᚹᚺᚾᛁᛃᛇᛈᛉᛊᛏᛒᛖᛗᛚᛜᛞᛟ◈❖✧⟁⧖☿♃♄";

function playClickSound() {
    try {
        const audio = new Audio("/click.mp3");
        audio.volume = 0.15;
        audio.play().catch(() => {});
    } catch (e) {}
}

function playLegacyOpenSound() {
    try {
        const audio = new Audio("/legacy_open.mp3");
        audio.volume = 0.3;
        audio.play().catch(() => {});
    } catch (e) {}
}

let lastQuestCheckTime = 0;
function playQuestCheckSound() {
    const now = Date.now();
    if (now - lastQuestCheckTime < 220) return;
    lastQuestCheckTime = now;
    try {
        const audio = new Audio("/quest_check.mp3");
        audio.volume = 0.3;
        audio.play().catch(() => {});
    } catch (e) {}
}

let lastMagicTwinkleTime = 0;
function playMagicTwinkleSound() {
    const now = Date.now();
    if (now - lastMagicTwinkleTime < 300) return;
    lastMagicTwinkleTime = now;
    try {
        const audio = new Audio("/magic-twinkle.mp3");
        audio.volume = 0.35;
        audio.play().catch(() => {});
    } catch (e) {}
}

// Convert plaintext into deterministic ancient runic glyphs preserving spaces and line breaks
function encodeToAncientRunes(plainText: string, seedOffset: number = 0): string {
    let result = "";
    for (let i = 0; i < plainText.length; i++) {
        const ch = plainText[i];
        if (ch === "\n" || ch === "\r" || ch === " " || ch === "\t") {
            result += ch;
        } else {
            const code = plainText.charCodeAt(i);
            const idx = Math.abs((code * 31 + i * 17 + seedOffset) % RUNE_ALPHABET.length);
            result += RUNE_ALPHABET[idx];
        }
    }
    return result;
}

export default function LegacyReaderModal() {
    const {
        legacies,
        keywords,
        isGM,
        updateLegacyLive,
        broadcastLegacy
    } = useStoryData();

    const params = new URLSearchParams(window.location.search);
    const queryLegacyId = params.get("legacyId") || "";

    const [fallbackLegacy, setFallbackLegacy] = useState<LegacyItem | null>(() => {
        const saved = localStorage.getItem("eu.armindo.embers/current-broadcast-legacy");
        if (!saved) return null;
        try {
            return JSON.parse(saved);
        } catch (e) {
            return null;
        }
    });

    const targetId =
        queryLegacyId ||
        fallbackLegacy?.id ||
        localStorage.getItem(ACTIVE_LEGACY_STORAGE_KEY) ||
        "";

    const liveFromStore = legacies.find(l => l.id === targetId);
    const legacy: LegacyItem | null = liveFromStore || fallbackLegacy;

    const [isEditingMode, setIsEditingMode] = useState<boolean>(() => {
        const flag = localStorage.getItem(ACTIVE_LEGACY_EDIT_KEY) === "1";
        if (flag) {
            localStorage.removeItem(ACTIVE_LEGACY_EDIT_KEY);
        }
        return flag;
    });
    const [currentPage, setCurrentPage] = useState<number>(0);
    const [activePicker, setActivePicker] = useState<"none" | "theme" | "seal">("none");

    // Undo / Redo history stacks for description editing
    const [canUndo, setCanUndo] = useState<boolean>(false);
    const [canRedo, setCanRedo] = useState<boolean>(false);
    const undoStackRef = useRef<string[]>([]);
    const redoStackRef = useRef<string[]>([]);
    const lastSnapshotTimeRef = useRef<number>(0);

    // Inline image insertion modal state
    const [imageInsertOpen, setImageInsertOpen] = useState<boolean>(false);
    const [draftImgUrl, setDraftImgUrl] = useState<string>("");
    const [draftImgCrop, setDraftImgCrop] = useState(DEFAULT_IMAGE_CROP);
    const [draftImgCaption, setDraftImgCaption] = useState<string>("");

    // Cipher insertion modal state
    const [cipherModalOpen, setCipherModalOpen] = useState<boolean>(false);
    const [cipherLang, setCipherLang] = useState<string>("古代精靈語");
    const [cipherPlainText, setCipherPlainText] = useState<string>("");

    // Shared Encyclopedia Keyword popup and Full-Artwork Lightbox
    const [activeKeywordModal, setActiveKeywordModal] = useState<KeywordItem | null>(null);
    const [keywordHistory, setKeywordHistory] = useState<KeywordItem[]>([]);
    const [lightboxImage, setLightboxImage] = useState<{ src: string; title?: string } | null>(null);

    const textareaRef = useRef<HTMLTextAreaElement | null>(null);
    const attachFileInputRef = useRef<HTMLInputElement | null>(null);
    const prevRevealedCountRef = useRef<number | null>(null);
    const prevDecipheredCountRef = useRef<number | null>(null);

    // Refs for slow auto-scrolling marquee bars
    const kwMarqueeRef = useRef<HTMLDivElement | null>(null);
    const isKwMarqueePausedRef = useRef<boolean>(false);
    const kwScrollPosRef = useRef<number>(0);
    const kwScrollDirRef = useRef<1 | -1>(1);

    const bottomMarqueeRef = useRef<HTMLDivElement | null>(null);
    const isBottomMarqueePausedRef = useRef<boolean>(false);
    const bottomScrollPosRef = useRef<number>(0);
    const bottomScrollDirRef = useRef<1 | -1>(1);

    useEffect(() => {
        if (!isGM && isEditingMode) {
            setIsEditingMode(false);
        }
    }, [isGM, isEditingMode]);

    // Play quest_check on secret reveal and magic-twinkle on cipher decipher
    useEffect(() => {
        if (!legacy) return;
        const revCount = (legacy.revealedSecrets || []).length;
        const decCount = (legacy.decipheredCiphers || []).length;

        if (prevRevealedCountRef.current !== null && revCount > prevRevealedCountRef.current) {
            playQuestCheckSound();
        }
        if (prevDecipheredCountRef.current !== null && decCount > prevDecipheredCountRef.current) {
            playMagicTwinkleSound();
        }
        prevRevealedCountRef.current = revCount;
        prevDecipheredCountRef.current = decCount;
    }, [legacy?.revealedSecrets, legacy?.decipheredCiphers]);

    // Drive slow marquee auto-scroll for editor keyword bar
    useEffect(() => {
        if (!isGM || !isEditingMode || keywords.length === 0) return;
        let rafId: number;
        let lastTime = performance.now();
        kwScrollPosRef.current = 0;
        kwScrollDirRef.current = 1;

        const step = (now: number) => {
            const dt = now - lastTime;
            lastTime = now;
            const el = kwMarqueeRef.current;
            if (el) {
                if (!isKwMarqueePausedRef.current) {
                    const maxScroll = el.scrollWidth - el.clientWidth;
                    if (maxScroll > 2) {
                        kwScrollPosRef.current += kwScrollDirRef.current * (dt * 0.02);
                        if (kwScrollPosRef.current >= maxScroll) {
                            kwScrollPosRef.current = maxScroll;
                            kwScrollDirRef.current = -1;
                        } else if (kwScrollPosRef.current <= 0) {
                            kwScrollPosRef.current = 0;
                            kwScrollDirRef.current = 1;
                        }
                        el.scrollLeft = kwScrollPosRef.current;
                    }
                } else {
                    kwScrollPosRef.current = el.scrollLeft;
                }
            }
            rafId = requestAnimationFrame(step);
        };

        rafId = requestAnimationFrame(step);
        return () => cancelAnimationFrame(rafId);
    }, [isGM, isEditingMode, keywords.length]);

    // Drive slow marquee auto-scroll for bottom GM secret & cipher bar
    useEffect(() => {
        if (!isGM) return;
        let rafId: number;
        let lastTime = performance.now();
        bottomScrollPosRef.current = 0;
        bottomScrollDirRef.current = 1;

        const step = (now: number) => {
            const dt = now - lastTime;
            lastTime = now;
            const el = bottomMarqueeRef.current;
            if (el) {
                if (!isBottomMarqueePausedRef.current) {
                    const maxScroll = el.scrollWidth - el.clientWidth;
                    if (maxScroll > 2) {
                        bottomScrollPosRef.current += bottomScrollDirRef.current * (dt * 0.02);
                        if (bottomScrollPosRef.current >= maxScroll) {
                            bottomScrollPosRef.current = maxScroll;
                            bottomScrollDirRef.current = -1;
                        } else if (bottomScrollPosRef.current <= 0) {
                            bottomScrollPosRef.current = 0;
                            bottomScrollDirRef.current = 1;
                        }
                        el.scrollLeft = bottomScrollPosRef.current;
                    }
                } else {
                    bottomScrollPosRef.current = el.scrollLeft;
                }
            }
            rafId = requestAnimationFrame(step);
        };

        rafId = requestAnimationFrame(step);
        return () => cancelAnimationFrame(rafId);
    }, [isGM, legacy?.description]);

    // Listen for direct broadcast updates when opened via FORCE_OPEN_LEGACY
    useEffect(() => {
        if (!queryLegacyId) {
            playLegacyOpenSound();
        }
        let unsub: (() => void) | null = null;
        const bindBroadcast = () => {
            unsub = OBR.broadcast.onMessage("eu.armindo.embers/story-sync", (msg) => {
                let payload = msg.data as any;
                if (typeof payload === "string") {
                    try {
                        payload = JSON.parse(LZString.decompressFromUTF16(payload));
                    } catch (e) {}
                }
                if (!payload) return;
                if (payload.type === "UPDATE_LEGACY_CONTENT" || payload.type === "FORCE_OPEN_LEGACY") {
                    if (payload.legacy) {
                        setFallbackLegacy(payload.legacy);
                        localStorage.setItem(
                            "eu.armindo.embers/current-broadcast-legacy",
                            JSON.stringify(payload.legacy)
                        );
                    }
                }
            });
        };

        if (OBR.isReady) {
            bindBroadcast();
        } else {
            OBR.onReady(bindBroadcast);
        }
        return () => {
            if (unsub) unsub();
        };
    }, [queryLegacyId]);

    // Update modal width without altering URL to prevent iframe reload flicker
    const toggleEditMode = async (nextEdit: boolean) => {
        playClickSound();
        if (legacy) {
            localStorage.setItem(ACTIVE_LEGACY_STORAGE_KEY, legacy.id);
            localStorage.setItem("eu.armindo.embers/current-broadcast-legacy", JSON.stringify(legacy));
        }
        setIsEditingMode(nextEdit);
        setActivePicker("none");

        if (OBR.isReady && legacy) {
            const [vw, vh] = await Promise.all([OBR.viewport.getWidth(), OBR.viewport.getHeight()]);
            const w = nextEdit
                ? Math.min(1260, Math.max(820, Math.floor(vw * 0.94)))
                : Math.min(680, Math.max(460, Math.floor(vw * 0.68)));
            const h = Math.min(820, Math.max(540, Math.floor(vh * 0.9)));

            await OBR.modal.open({
                id: "eu.armindo.embers/legacy-reader",
                url: `/?view=legacy-reader&legacyId=${encodeURIComponent(legacy.id)}`,
                width: w,
                height: h,
                fullScreen: false
            });
        }
    };

    // Apply text update while recording Undo / Redo history snapshots
    const applyDescriptionUpdate = (nextDescription: string, forceSnapshot = false) => {
        if (!legacy) return;
        const prevDescription = legacy.description || "";
        if (nextDescription === prevDescription) return;

        const now = Date.now();
        if (forceSnapshot || now - lastSnapshotTimeRef.current > 700) {
            undoStackRef.current.push(prevDescription);
            if (undoStackRef.current.length > 60) {
                undoStackRef.current.shift();
            }
            redoStackRef.current = [];
            setCanUndo(undoStackRef.current.length > 0);
            setCanRedo(false);
            lastSnapshotTimeRef.current = now;
        }

        updateLegacyLive({ ...legacy, description: nextDescription });
    };

    const handleUndo = () => {
        if (!legacy || undoStackRef.current.length === 0) return;
        playClickSound();
        const previous = undoStackRef.current.pop()!;
        redoStackRef.current.push(legacy.description || "");
        setCanUndo(undoStackRef.current.length > 0);
        setCanRedo(redoStackRef.current.length > 0);
        lastSnapshotTimeRef.current = 0;
        updateLegacyLive({ ...legacy, description: previous });
    };

    const handleRedo = () => {
        if (!legacy || redoStackRef.current.length === 0) return;
        playClickSound();
        const next = redoStackRef.current.pop()!;
        undoStackRef.current.push(legacy.description || "");
        setCanUndo(undoStackRef.current.length > 0);
        setCanRedo(redoStackRef.current.length > 0);
        lastSnapshotTimeRef.current = 0;
        updateLegacyLive({ ...legacy, description: next });
    };

    // Global Ctrl+Z / Ctrl+Y / Cmd+Shift+Z shortcut support in edit mode
    useEffect(() => {
        if (!isGM || !isEditingMode) return;
        const handleKeyDown = (e: KeyboardEvent) => {
            const isMod = e.ctrlKey || e.metaKey;
            if (!isMod) return;
            const key = e.key.toLowerCase();
            if (key === "z" && !e.shiftKey) {
                e.preventDefault();
                handleUndo();
            } else if (key === "y" || (key === "z" && e.shiftKey)) {
                e.preventDefault();
                handleRedo();
            }
        };
        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [isGM, isEditingMode, legacy]);

    // Wrap selected text or insert snippet at current textarea cursor
    const applyFormatting = (prefix: string, suffix: string = "", placeholder: string = "") => {
        if (!legacy) return;
        playClickSound();
        const el = textareaRef.current;
        const currentText = legacy.description || "";

        if (el && typeof el.selectionStart === "number" && typeof el.selectionEnd === "number") {
            const start = el.selectionStart;
            const end = el.selectionEnd;
            const selected = currentText.slice(start, end);
            const inner = selected || placeholder;
            const insertion = `${prefix}${inner}${suffix}`;
            const nextText = currentText.slice(0, start) + insertion + currentText.slice(end);
            applyDescriptionUpdate(nextText, true);

            requestAnimationFrame(() => {
                el.focus();
                const cursorStart = start + prefix.length;
                const cursorEnd = cursorStart + inner.length;
                el.setSelectionRange(cursorStart, cursorEnd);
            });
        } else {
            const insertion = `${prefix}${placeholder}${suffix}`;
            applyDescriptionUpdate(currentText + insertion, true);
        }
    };

    const applyLinePrefix = (linePrefix: string) => {
        if (!legacy) return;
        playClickSound();
        const el = textareaRef.current;
        const currentText = legacy.description || "";

        if (el && typeof el.selectionStart === "number") {
            const start = el.selectionStart;
            const lineStart = currentText.lastIndexOf("\n", start - 1) + 1;
            const nextText =
                currentText.slice(0, lineStart) + linePrefix + currentText.slice(lineStart);
            applyDescriptionUpdate(nextText, true);

            requestAnimationFrame(() => {
                el.focus();
                const pos = start + linePrefix.length;
                el.setSelectionRange(pos, pos);
            });
        } else {
            applyDescriptionUpdate(`${currentText}\n${linePrefix}`, true);
        }
    };

    const handleInsertAttachment = () => {
        if (!legacy || !draftImgUrl) return;
        playClickSound();
        const attId = Date.now().toString(36).slice(-4);
        const nextAttachments: Record<string, LegacyAttachment> = {
            ...(legacy.attachments || {}),
            [attId]: {
                url: draftImgUrl,
                crop: draftImgCrop,
                caption: draftImgCaption.trim()
            }
        };

        const marker = `\n[img:${attId}]\n`;
        const el = textareaRef.current;
        const currentText = legacy.description || "";
        let nextText = currentText + marker;

        if (el && typeof el.selectionStart === "number") {
            const pos = el.selectionStart;
            nextText = currentText.slice(0, pos) + marker + currentText.slice(pos);
        }

        undoStackRef.current.push(currentText);
        redoStackRef.current = [];
        setCanUndo(true);
        setCanRedo(false);

        updateLegacyLive({
            ...legacy,
            attachments: nextAttachments,
            description: nextText
        });
        setImageInsertOpen(false);
        setDraftImgUrl("");
        setDraftImgCaption("");
    };

    const handleInsertCipher = () => {
        if (!legacy || !cipherPlainText.trim()) return;
        const lang = cipherLang.trim() || "古代密文";
        const body = cipherPlainText.trim();
        applyFormatting(`{cipher:${lang}|${body}}`, "", "");
        setCipherModalOpen(false);
        setCipherPlainText("");
    };

    const handlePickAttachmentOBR = async () => {
        try {
            const assets = await OBR.assets.downloadImages(false);
            if (assets && assets.length > 0 && assets[0].image?.url) {
                setDraftImgUrl(assets[0].image.url);
                setDraftImgCrop({ ...DEFAULT_IMAGE_CROP });
            }
        } catch (e) {
            console.warn("Failed to pick OBR asset", e);
        }
    };

    const handleLocalAttachmentUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        try {
            const compressed = await compressImageFile(file, 640, 0.8);
            setDraftImgUrl(compressed);
            setDraftImgCrop({ ...DEFAULT_IMAGE_CROP });
        } catch (err) {
            console.error("Failed to compress attachment", err);
        } finally {
            e.target.value = "";
        }
    };

    const toggleSecretReveal = (secretId: string) => {
        if (!legacy || !isGM) return;
        const current = legacy.revealedSecrets || [];
        const isCurrentlyRevealed = current.includes(secretId);
        if (!isCurrentlyRevealed) {
            playQuestCheckSound();
        } else {
            playClickSound();
        }
        const nextSecrets = isCurrentlyRevealed
            ? current.filter(s => s !== secretId)
            : [...current, secretId];
        updateLegacyLive({ ...legacy, revealedSecrets: nextSecrets });
    };

    const toggleCipherDecipher = (cipherId: string) => {
        if (!legacy || !isGM) return;
        const current = legacy.decipheredCiphers || [];
        const isCurrentlyDeciphered = current.includes(cipherId);
        if (!isCurrentlyDeciphered) {
            playMagicTwinkleSound();
        } else {
            playClickSound();
        }
        const nextCiphers = isCurrentlyDeciphered
            ? current.filter(c => c !== cipherId)
            : [...current, cipherId];
        updateLegacyLive({ ...legacy, decipheredCiphers: nextCiphers });
    };

    const extractInteractiveBlocks = (fullText: string) => {
        const secrets: { id: string; condition: string; content: string }[] = [];
        const ciphers: { id: string; lang: string; content: string }[] = [];
        if (!fullText) return { secrets, ciphers };

        const scanRegex =
            /\{cipher:([^}|]+)\|([^}]+)\}|\{([^}|]+)\|([^}]+)\}|\[([^\]|]+)\|([^\]]+)\]/g;
        let match: RegExpExecArray | null;
        let sIdx = 0;
        let cIdx = 0;

        while ((match = scanRegex.exec(fullText)) !== null) {
            if (match[1] !== undefined && match[2] !== undefined) {
                ciphers.push({
                    id: `cipher-${cIdx++}`,
                    lang: match[1].trim(),
                    content: match[2]
                });
            } else if (match[3] !== undefined && match[4] !== undefined) {
                secrets.push({
                    id: `secret-${sIdx++}`,
                    condition: match[3].trim(),
                    content: match[4]
                });
            } else if (match[5] !== undefined && match[6] !== undefined) {
                const secondTerm = match[6].trim();
                const isKnownKeyword = keywords.some(
                    k => k.keyword.trim().toLowerCase() === secondTerm.toLowerCase()
                );
                if (!isKnownKeyword) {
                    secrets.push({
                        id: `secret-${sIdx++}`,
                        condition: match[5].trim(),
                        content: match[6]
                    });
                }
            }
        }
        return { secrets, ciphers };
    };

    if (!legacy) {
        return (
            <div className="fixed inset-0 w-screen h-screen flex items-center justify-center bg-panel-base text-white">
                <span className="text-sm font-bold text-gray-400">正在展開文件...</span>
            </div>
        );
    }

    const themeObj = LEGACY_THEMES[legacy.themeId || "standard"] || LEGACY_THEMES.standard;
    const accentColor = themeObj.accent || "#b45309";
    const pages = (legacy.description || "").split(/---page---/g);
    const totalPages = Math.max(1, pages.length);
    const safePageIndex = Math.min(currentPage, totalPages - 1);
    const activePageText = pages[safePageIndex] ?? "";

    const priorText = pages.slice(0, safePageIndex).join("\n");
    const priorCounts = extractInteractiveBlocks(priorText);
    const { secrets: allSecrets, ciphers: allCiphers } = extractInteractiveBlocks(legacy.description || "");

    // Render high-contrast secret mask badge for GM so it stands out on any paper color
    const renderGMSecretBadge = (secretId: string, condition: string, secretText: string) => {
        const isRevealed = (legacy.revealedSecrets || []).includes(secretId);
        return (
            <span
                key={secretId}
                onClick={(e) => {
                    e.stopPropagation();
                    toggleSecretReveal(secretId);
                }}
                title={isRevealed ? "點擊重新隱藏" : "點擊對玩家揭露"}
                className={`inline-flex items-center gap-1.5 px-2 py-0.5 mx-0.5 rounded-lg text-xs font-sans font-bold cursor-pointer transition-all shadow-sm border align-baseline ${
                    isRevealed
                        ? "bg-[#0f2e24] text-emerald-200 border-emerald-400/80 hover:brightness-110"
                        : "bg-[#1a1d2e] text-amber-200 border-amber-400/80 hover:brightness-110"
                }`}
            >
                {isRevealed ? (
                    <FaEye className="w-3 h-3 text-emerald-400 shrink-0" />
                ) : (
                    <FaEyeSlash className="w-3 h-3 text-amber-400 shrink-0" />
                )}
                <span
                    className={`px-1 rounded text-[11px] ${
                        isRevealed
                            ? "bg-emerald-500/25 text-emerald-300"
                            : "bg-amber-500/25 text-amber-300"
                    }`}
                >
                    {condition}
                </span>
                <span className="text-white">{secretText}</span>
            </span>
        );
    };

    const renderInlineNodes = (
        segment: string,
        counters: { secret: number; cipher: number },
        insideKeywordModal = false
    ): React.ReactNode[] => {
        if (!segment) return [];
        const inlineRegex =
            /(\{cipher:([^}|]+)\|([^}]+)\}|\{([^}|]+)\|([^}]+)\}|\*\*([^*]+)\*\*|\*([^*]+)\*|__([^_]+)__|~~([^~]+)~~|\[([^\]|]+)(?:\|([^\]]+))?\]|【([^】|]+)(?:\|([^】]+))?】)/g;

        const nodes: React.ReactNode[] = [];
        let lastIdx = 0;
        let match: RegExpExecArray | null;

        while ((match = inlineRegex.exec(segment)) !== null) {
            if (match.index > lastIdx) {
                nodes.push(
                    <span key={`t-${lastIdx}`}>{segment.substring(lastIdx, match.index)}</span>
                );
            }

            if (match[2] !== undefined && match[3] !== undefined) {
                // Multi-language ancient cipher without any border or gray background
                const langLabel = match[2].trim();
                const plainContent = match[3];
                const cipherId = `cipher-${counters.cipher++}`;
                const isDeciphered = (legacy.decipheredCiphers || []).includes(cipherId);
                const encodedRunes = encodeToAncientRunes(plainContent, counters.cipher * 7);

                nodes.push(
                    <span
                        key={cipherId}
                        onClick={(e) => {
                            if (isGM) {
                                e.stopPropagation();
                                toggleCipherDecipher(cipherId);
                            }
                        }}
                        title={
                            isGM
                                ? isDeciphered
                                    ? "點擊重新加密此段文字"
                                    : `點擊解密此段${langLabel}`
                                : isDeciphered
                                ? `已解密：${langLabel}`
                                : `無法辨識的${langLabel}`
                        }
                        style={!isDeciphered ? { color: accentColor } : undefined}
                        className={`inline transition-all duration-700 ${
                            isDeciphered ? "font-serif opacity-100" : "font-mono tracking-wider opacity-95"
                        } ${isGM ? "cursor-pointer hover:brightness-125" : ""}`}
                    >
                        {isDeciphered ? plainContent : encodedRunes}
                    </span>
                );
            } else if (match[4] !== undefined && match[5] !== undefined) {
                // Gradual reveal secret mask
                const condition = match[4].trim();
                const secretText = match[5];
                const secretId = `secret-${counters.secret++}`;
                const isRevealed = (legacy.revealedSecrets || []).includes(secretId);

                if (isGM) {
                    nodes.push(renderGMSecretBadge(secretId, condition, secretText));
                } else {
                    nodes.push(
                        <span
                            key={secretId}
                            className={`inline-block font-bold transition-all duration-[1400ms] ease-in-out ${
                                isRevealed ? "opacity-100 blur-none" : "opacity-0 blur-md select-none"
                            }`}
                        >
                            {secretText}
                        </span>
                    );
                }
            } else if (match[6] !== undefined) {
                nodes.push(
                    <strong key={`b-${match.index}`} className="font-black">
                        {match[6]}
                    </strong>
                );
            } else if (match[7] !== undefined) {
                nodes.push(
                    <em key={`i-${match.index}`} className="italic">
                        {match[7]}
                    </em>
                );
            } else if (match[8] !== undefined) {
                nodes.push(
                    <span key={`u-${match.index}`} className="underline decoration-current/60 underline-offset-4">
                        {match[8]}
                    </span>
                );
            } else if (match[9] !== undefined) {
                nodes.push(
                    <span key={`s-${match.index}`} className="line-through opacity-75">
                        {match[9]}
                    </span>
                );
            } else {
                const first = (match[10] ?? match[12] ?? "").trim();
                const second = (match[11] ?? match[13] ?? "").trim();

                if (second) {
                    const matchedKw = keywords.find(
                        k => k.keyword.trim().toLowerCase() === second.toLowerCase()
                    );
                    if (matchedKw) {
                        nodes.push(
                            <span
                                key={`kw-${match.index}`}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    playQuestCheckSound();
                                    if (insideKeywordModal && activeKeywordModal) {
                                        setKeywordHistory(prev => [...prev, activeKeywordModal]);
                                    } else {
                                        setKeywordHistory([]);
                                    }
                                    setActiveKeywordModal(matchedKw);
                                }}
                                style={{ color: accentColor }}
                                title="點擊查看圖鑑資訊"
                                className="font-extrabold cursor-pointer hover:brightness-125 transition-all duration-150"
                            >
                                {first}
                            </span>
                        );
                    } else {
                        const secretId = `secret-${counters.secret++}`;
                        const isRevealed = (legacy.revealedSecrets || []).includes(secretId);
                        if (isGM) {
                            nodes.push(renderGMSecretBadge(secretId, first, second));
                        } else {
                            nodes.push(
                                <span
                                    key={secretId}
                                    className={`inline-block font-bold transition-all duration-[1400ms] ease-in-out ${
                                        isRevealed ? "opacity-100 blur-none" : "opacity-0 blur-md select-none"
                                    }`}
                                >
                                    {second}
                                </span>
                            );
                        }
                    }
                } else {
                    const matchedKw = keywords.find(
                        k => k.keyword.trim().toLowerCase() === first.toLowerCase()
                    );
                    if (matchedKw) {
                        nodes.push(
                            <span
                                key={`kw-${match.index}`}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    playQuestCheckSound();
                                    if (insideKeywordModal && activeKeywordModal) {
                                        setKeywordHistory(prev => [...prev, activeKeywordModal]);
                                    } else {
                                        setKeywordHistory([]);
                                    }
                                    setActiveKeywordModal(matchedKw);
                                }}
                                style={{ color: accentColor }}
                                title="點擊查看圖鑑資訊"
                                className="font-extrabold cursor-pointer hover:brightness-125 transition-all duration-150"
                            >
                                {first}
                            </span>
                        );
                    } else {
                        nodes.push(<span key={`raw-${match.index}`}>[{first}]</span>);
                    }
                }
            }

            lastIdx = inlineRegex.lastIndex;
        }

        if (lastIdx < segment.length) {
            nodes.push(<span key={`t-${lastIdx}`}>{segment.substring(lastIdx)}</span>);
        }

        return nodes;
    };

    const renderRichParchmentContent = (pageText: string) => {
        const counters = {
            secret: priorCounts.secrets.length,
            cipher: priorCounts.ciphers.length
        };

        const lines = pageText.split("\n");
        const renderedBlocks: React.ReactNode[] = [];

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const trimmed = line.trim();

            if (trimmed === "---") {
                renderedBlocks.push(
                    <hr key={`hr-${i}`} className="my-4 border-current/20" />
                );
                continue;
            }

            const imgMatch = /^\[img:([^\]]+)\]$/.exec(trimmed);
            if (imgMatch) {
                const attId = imgMatch[1].trim();
                const attachment = legacy.attachments?.[attId];
                if (attachment?.url) {
                    renderedBlocks.push(
                        <div key={`img-${i}`} className="my-4 flex flex-col items-center">
                            <CroppedImage
                                src={attachment.url}
                                alt={attachment.caption || "文件插圖"}
                                crop={attachment.crop}
                                title="點擊檢視完整插圖"
                                onClick={() => {
                                    playQuestCheckSound();
                                    setLightboxImage({
                                        src: attachment.url,
                                        title: attachment.caption || legacy.name
                                    });
                                }}
                                containerClassName="w-full max-w-[440px] h-52 rounded-xl border border-current/20 shadow-md bg-black/15"
                            />
                            {attachment.caption && (
                                <span className="text-xs italic opacity-75 mt-1.5">
                                    {attachment.caption}
                                </span>
                            )}
                        </div>
                    );
                }
                continue;
            }

            if (line.startsWith("# ")) {
                renderedBlocks.push(
                    <h3 key={`h1-${i}`} className="text-2xl font-black mt-3 mb-1.5 tracking-wide">
                        {renderInlineNodes(line.slice(2), counters)}
                    </h3>
                );
                continue;
            }

            if (line.startsWith("## ")) {
                renderedBlocks.push(
                    <h4 key={`h2-${i}`} className="text-xl font-bold mt-2.5 mb-1">
                        {renderInlineNodes(line.slice(3), counters)}
                    </h4>
                );
                continue;
            }

            if (line.startsWith("> ")) {
                renderedBlocks.push(
                    <blockquote
                        key={`qt-${i}`}
                        style={{ borderColor: accentColor }}
                        className="my-2 pl-3.5 py-1 border-l-4 bg-black/5 italic opacity-90 rounded-r-lg"
                    >
                        {renderInlineNodes(line.slice(2), counters)}
                    </blockquote>
                );
                continue;
            }

            const centerMatch = /^\[center\]([\s\S]*)\[\/center\]$/.exec(trimmed);
            if (centerMatch) {
                renderedBlocks.push(
                    <div key={`ctr-${i}`} className="text-center my-1">
                        {renderInlineNodes(centerMatch[1], counters)}
                    </div>
                );
                continue;
            }

            const rightMatch = /^\[right\]([\s\S]*)\[\/right\]$/.exec(trimmed);
            if (rightMatch) {
                renderedBlocks.push(
                    <div key={`rgt-${i}`} className="text-right my-1">
                        {renderInlineNodes(rightMatch[1], counters)}
                    </div>
                );
                continue;
            }

            if (line === "") {
                renderedBlocks.push(<div key={`br-${i}`} className="h-3" />);
            } else {
                renderedBlocks.push(
                    <div key={`p-${i}`} className="leading-relaxed">
                        {renderInlineNodes(line, counters)}
                    </div>
                );
            }
        }

        return renderedBlocks;
    };

    const renderParchmentPane = () => (
        <div
            style={{ backgroundColor: themeObj.bg, color: themeObj.text }}
            className="h-full flex flex-col overflow-hidden relative font-serif"
        >
            <div className="flex-1 min-h-0 overflow-y-auto no-scrollbar px-7 sm:px-11 pt-12 pb-8">
                <h2 className="text-2xl sm:text-3xl font-black text-center border-b border-current/20 pb-4 mb-6 tracking-wide break-words">
                    {legacy.name}
                </h2>

                <div
                    className="text-base sm:text-[17px] break-words"
                    style={{ wordBreak: "break-word", overflowWrap: "anywhere" }}
                >
                    {renderRichParchmentContent(activePageText)}
                </div>

                {safePageIndex === totalPages - 1 && (
                    <WaxSealBadge sealType={legacy.sealType} signer={legacy.signer} />
                )}
            </div>

            {totalPages > 1 && (
                <div className="shrink-0 px-6 py-2.5 border-t border-current/15 bg-black/10 flex items-center justify-between text-xs font-sans font-bold">
                    <button
                        type="button"
                        disabled={safePageIndex <= 0}
                        onClick={() => {
                            playClickSound();
                            setCurrentPage(p => Math.max(0, p - 1));
                        }}
                        className="flex items-center gap-1 px-3 py-1 rounded-full bg-black/15 hover:bg-black/25 disabled:opacity-35 outline-none"
                    >
                        <FaChevronLeft className="w-3 h-3" /> 上一頁
                    </button>
                    <span>
                        第 {safePageIndex + 1} 頁 / 共 {totalPages} 頁
                    </span>
                    <button
                        type="button"
                        disabled={safePageIndex >= totalPages - 1}
                        onClick={() => {
                            playClickSound();
                            setCurrentPage(p => Math.min(totalPages - 1, p + 1));
                        }}
                        className="flex items-center gap-1 px-3 py-1 rounded-full bg-black/15 hover:bg-black/25 disabled:opacity-35 outline-none"
                    >
                        下一頁 <FaChevronRight className="w-3 h-3" />
                    </button>
                </div>
            )}
        </div>
    );

    const activeSealConfig = WAX_SEAL_OPTIONS[legacy.sealType || "none"] || WAX_SEAL_OPTIONS.none;

    return (
        <div className="fixed inset-0 w-screen h-screen flex flex-col bg-panel-base text-white overflow-hidden select-none">
            <style>{`
                .legacy-scrollbar::-webkit-scrollbar {
                    height: 5px;
                }
                .legacy-scrollbar::-webkit-scrollbar-track {
                    background: rgba(0, 0, 0, 0.25);
                    border-radius: 9999px;
                }
                .legacy-scrollbar::-webkit-scrollbar-thumb {
                    background: rgba(156, 129, 216, 0.5);
                    border-radius: 9999px;
                }
                .legacy-scrollbar::-webkit-scrollbar-thumb:hover {
                    background: rgba(156, 129, 216, 0.85);
                }
            `}</style>

            <input
                ref={attachFileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleLocalAttachmentUpload}
            />

            {/* Floating Close Button at Top-Right Corner */}
            <button
                type="button"
                onClick={() => OBR.modal.close("eu.armindo.embers/legacy-reader")}
                title="關閉視窗"
                className="fixed top-3 right-3 z-40 w-8 h-8 rounded-full bg-[#1e2235]/85 hover:bg-rose-600 text-gray-200 hover:text-white border border-white/15 shadow-lg backdrop-blur-sm flex items-center justify-center transition-colors outline-none"
            >
                <FaXmark className="w-4 h-4" />
            </button>

            {/* Floating GM Icon Controls at Top-Left in Read Mode */}
            {isGM && !isEditingMode && (
                <div className="fixed top-3 left-3 z-40 flex items-center gap-1.5">
                    <button
                        type="button"
                        onClick={() => toggleEditMode(true)}
                        title="編輯信紙"
                        className="w-8 h-8 rounded-full bg-[#1e2235]/85 hover:bg-panel-active text-white border border-white/15 shadow-lg backdrop-blur-sm flex items-center justify-center transition-colors outline-none"
                    >
                        <FaPencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                        type="button"
                        onClick={() => {
                            playClickSound();
                            broadcastLegacy(legacy.id, ["ALL"]);
                        }}
                        title="廣播推送給全體玩家"
                        className="w-8 h-8 rounded-full bg-[#1e2235]/85 hover:bg-amber-600 text-amber-300 hover:text-white border border-white/15 shadow-lg backdrop-blur-sm flex items-center justify-center transition-colors outline-none"
                    >
                        <FaTowerBroadcast className="w-3.5 h-3.5" />
                    </button>
                </div>
            )}

            {/* Main Stage: Wide Two-Column Live Editor OR Single Parchment Read Mode */}
            <div className="flex-1 min-h-0 flex overflow-hidden relative">
                {isGM && isEditingMode ? (
                    <div className="flex-1 min-h-0 grid grid-cols-12 divide-x divide-panel-inactive overflow-hidden">
                        {/* Left Column: Wide Rich Formatting Editor (6 cols) */}
                        <div className="col-span-6 h-full min-h-0 flex flex-col bg-panel-content p-4 gap-2.5 overflow-hidden">
                            {/* Top Editor Action & Metadata Bar */}
                            <div className="flex items-center gap-2 shrink-0">
                                <button
                                    type="button"
                                    onClick={() => toggleEditMode(false)}
                                    title="完成編輯"
                                    className="w-8 h-8 rounded-full bg-emerald-600 hover:bg-emerald-500 text-white shadow flex items-center justify-center shrink-0 outline-none"
                                >
                                    <FaCheck className="w-3.5 h-3.5" />
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        playClickSound();
                                        broadcastLegacy(legacy.id, ["ALL"]);
                                    }}
                                    title="廣播推送給全體玩家"
                                    className="w-8 h-8 rounded-full bg-amber-500/20 hover:bg-amber-500/35 text-amber-300 border border-amber-500/30 flex items-center justify-center shrink-0 outline-none"
                                >
                                    <FaTowerBroadcast className="w-3.5 h-3.5" />
                                </button>

                                <input
                                    type="text"
                                    value={legacy.name}
                                    onChange={(e) =>
                                        updateLegacyLive({ ...legacy, name: e.target.value })
                                    }
                                    placeholder="文件標題"
                                    className="flex-1 min-w-0 bg-panel-base text-white text-xs font-bold rounded-xl px-3 py-2 outline-none border border-transparent focus:border-panel-active"
                                />

                                <div className="relative group/help shrink-0">
                                    <FaCircleQuestion className="w-4 h-4 text-gray-400 hover:text-white cursor-help" />
                                    <div className="absolute right-0 top-6 w-64 p-3 rounded-xl bg-panel-base border border-panel-inactive text-[11px] font-bold text-gray-200 shadow-2xl opacity-0 pointer-events-none group-hover/help:opacity-100 transition-opacity z-30 leading-relaxed">
                                        選取文字後點擊工具列即可套用格式；支援 Ctrl+Z 復原與 Ctrl+Y 重做，並可插入分頁、插圖、漸顯遮罩、古代密文與圖鑑關鍵詞。
                                    </div>
                                </div>
                            </div>

                            {/* Visual Swatch Selectors & Signer Row */}
                            <div className="grid grid-cols-12 gap-2 shrink-0">
                                <button
                                    type="button"
                                    onClick={() => {
                                        playClickSound();
                                        setActivePicker(prev => (prev === "theme" ? "none" : "theme"));
                                    }}
                                    className={`col-span-4 flex items-center gap-2 px-2.5 py-1.5 rounded-xl bg-panel-base border text-left transition-colors outline-none ${
                                        activePicker === "theme"
                                            ? "border-panel-active"
                                            : "border-transparent hover:border-white/15"
                                    }`}
                                >
                                    <span
                                        style={{ backgroundColor: themeObj.bg, color: themeObj.text }}
                                        className="w-5 h-5 rounded flex items-center justify-center text-[10px] font-black border border-white/25 shrink-0"
                                    >
                                        字
                                    </span>
                                    <span className="text-xs font-bold text-gray-200 truncate">
                                        {themeObj.label}
                                    </span>
                                </button>

                                <button
                                    type="button"
                                    onClick={() => {
                                        playClickSound();
                                        setActivePicker(prev => (prev === "seal" ? "none" : "seal"));
                                    }}
                                    className={`col-span-4 flex items-center gap-2 px-2.5 py-1.5 rounded-xl bg-panel-base border text-left transition-colors outline-none ${
                                        activePicker === "seal"
                                            ? "border-panel-active"
                                            : "border-transparent hover:border-white/15"
                                    }`}
                                >
                                    <span
                                        style={{
                                            backgroundColor:
                                                legacy.sealType && legacy.sealType !== "none"
                                                    ? activeSealConfig.innerColor
                                                    : "#3d4051"
                                        }}
                                        className="w-5 h-5 rounded-full flex items-center justify-center border border-white/25 shrink-0"
                                    >
                                        {legacy.sealType && legacy.sealType !== "none" ? (
                                            renderWaxSealIcon(
                                                legacy.sealType,
                                                activeSealConfig.iconColor,
                                                "w-2.5 h-2.5"
                                            )
                                        ) : (
                                            <FaStamp className="w-2.5 h-2.5 text-gray-400" />
                                        )}
                                    </span>
                                    <span className="text-xs font-bold text-gray-200 truncate">
                                        {activeSealConfig.label}
                                    </span>
                                </button>

                                <input
                                    type="text"
                                    value={legacy.signer || ""}
                                    onChange={(e) =>
                                        updateLegacyLive({ ...legacy, signer: e.target.value })
                                    }
                                    placeholder="信末署名..."
                                    className="col-span-4 bg-panel-base text-gray-200 text-xs font-bold rounded-xl px-3 py-1.5 outline-none border border-transparent focus:border-panel-active"
                                />
                            </div>

                            {/* Expandable Visual Theme Swatch Grid */}
                            {activePicker === "theme" && (
                                <div className="grid grid-cols-3 gap-1.5 p-2 rounded-xl bg-panel-base border border-panel-inactive max-h-36 overflow-y-auto no-scrollbar shrink-0">
                                    {Object.entries(LEGACY_THEMES).map(([k, v]) => {
                                        const isSelected = (legacy.themeId || "standard") === k;
                                        return (
                                            <button
                                                key={k}
                                                type="button"
                                                onClick={() => {
                                                    playClickSound();
                                                    updateLegacyLive({ ...legacy, themeId: k });
                                                    setActivePicker("none");
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

                            {/* Expandable Visual Wax Seal Swatch Grid */}
                            {activePicker === "seal" && (
                                <div className="grid grid-cols-3 gap-1.5 p-2 rounded-xl bg-panel-base border border-panel-inactive max-h-36 overflow-y-auto no-scrollbar shrink-0">
                                    {Object.entries(WAX_SEAL_OPTIONS).map(([k, v]) => {
                                        const isSelected = (legacy.sealType || "none") === k;
                                        return (
                                            <button
                                                key={k}
                                                type="button"
                                                onClick={() => {
                                                    playClickSound();
                                                    updateLegacyLive({ ...legacy, sealType: k });
                                                    setActivePicker("none");
                                                }}
                                                className={`flex items-center gap-2 p-1.5 rounded-lg border text-left transition-all outline-none ${
                                                    isSelected
                                                        ? "border-panel-active bg-panel-active/20"
                                                        : "border-transparent hover:bg-panel-inactive/60"
                                                }`}
                                            >
                                                <span
                                                    style={{
                                                        backgroundColor: k === "none" ? "#3d4051" : v.innerColor
                                                    }}
                                                    className="w-5 h-5 rounded-full flex items-center justify-center border border-white/25 shrink-0"
                                                >
                                                    {k === "none" ? (
                                                        <FaXmark className="w-2.5 h-2.5 text-gray-400" />
                                                    ) : (
                                                        renderWaxSealIcon(k, v.iconColor, "w-2.5 h-2.5")
                                                    )}
                                                </span>
                                                <span className="text-[11px] font-bold text-gray-200 truncate">
                                                    {v.label}
                                                </span>
                                            </button>
                                        );
                                    })}
                                </div>
                            )}

                            {/* Rich Formatting Toolbar with Undo / Redo */}
                            <div className="flex flex-wrap items-center gap-1 p-1.5 rounded-xl bg-panel-base border border-panel-inactive shrink-0">
                                <button
                                    type="button"
                                    disabled={!canUndo}
                                    onMouseDown={(e) => e.preventDefault()}
                                    onClick={handleUndo}
                                    title="復原上一步"
                                    className="p-1.5 rounded-lg hover:bg-panel-inactive text-gray-200 disabled:opacity-35 outline-none"
                                >
                                    <FaRotateLeft className="w-3 h-3" />
                                </button>
                                <button
                                    type="button"
                                    disabled={!canRedo}
                                    onMouseDown={(e) => e.preventDefault()}
                                    onClick={handleRedo}
                                    title="重做下一步"
                                    className="p-1.5 rounded-lg hover:bg-panel-inactive text-gray-200 disabled:opacity-35 outline-none"
                                >
                                    <FaRotateRight className="w-3 h-3" />
                                </button>
                                <div className="w-px h-4 bg-panel-inactive mx-0.5" />
                                <button
                                    type="button"
                                    onMouseDown={(e) => e.preventDefault()}
                                    onClick={() => applyLinePrefix("# ")}
                                    title="大標題"
                                    className="px-2 py-1 rounded-lg hover:bg-panel-inactive text-xs font-black text-gray-200 outline-none"
                                >
                                    H1
                                </button>
                                <button
                                    type="button"
                                    onMouseDown={(e) => e.preventDefault()}
                                    onClick={() => applyLinePrefix("## ")}
                                    title="中標題"
                                    className="px-2 py-1 rounded-lg hover:bg-panel-inactive text-xs font-bold text-gray-200 outline-none"
                                >
                                    <FaHeading className="w-3 h-3" />
                                </button>
                                <button
                                    type="button"
                                    onMouseDown={(e) => e.preventDefault()}
                                    onClick={() => applyFormatting("**", "**", "粗體文字")}
                                    title="粗體"
                                    className="p-1.5 rounded-lg hover:bg-panel-inactive text-gray-200 outline-none"
                                >
                                    <FaBold className="w-3 h-3" />
                                </button>
                                <button
                                    type="button"
                                    onMouseDown={(e) => e.preventDefault()}
                                    onClick={() => applyFormatting("*", "*", "斜體文字")}
                                    title="斜體"
                                    className="p-1.5 rounded-lg hover:bg-panel-inactive text-gray-200 outline-none"
                                >
                                    <FaItalic className="w-3 h-3" />
                                </button>
                                <button
                                    type="button"
                                    onMouseDown={(e) => e.preventDefault()}
                                    onClick={() => applyFormatting("__", "__", "底線文字")}
                                    title="底線"
                                    className="p-1.5 rounded-lg hover:bg-panel-inactive text-gray-200 outline-none"
                                >
                                    <FaUnderline className="w-3 h-3" />
                                </button>
                                <button
                                    type="button"
                                    onMouseDown={(e) => e.preventDefault()}
                                    onClick={() => applyFormatting("~~", "~~", "刪除文字")}
                                    title="刪除線"
                                    className="p-1.5 rounded-lg hover:bg-panel-inactive text-gray-200 outline-none"
                                >
                                    <FaStrikethrough className="w-3 h-3" />
                                </button>
                                <button
                                    type="button"
                                    onMouseDown={(e) => e.preventDefault()}
                                    onClick={() => applyLinePrefix("> ")}
                                    title="引言區塊"
                                    className="p-1.5 rounded-lg hover:bg-panel-inactive text-gray-200 outline-none"
                                >
                                    <FaQuoteLeft className="w-3 h-3" />
                                </button>
                                <button
                                    type="button"
                                    onMouseDown={(e) => e.preventDefault()}
                                    onClick={() => applyFormatting("[center]", "[/center]", "置中段落")}
                                    title="置中對齊"
                                    className="p-1.5 rounded-lg hover:bg-panel-inactive text-gray-200 outline-none"
                                >
                                    <FaAlignCenter className="w-3 h-3" />
                                </button>
                                <button
                                    type="button"
                                    onMouseDown={(e) => e.preventDefault()}
                                    onClick={() => applyFormatting("[right]", "[/right]", "靠右段落")}
                                    title="靠右對齊"
                                    className="p-1.5 rounded-lg hover:bg-panel-inactive text-gray-200 outline-none"
                                >
                                    <FaAlignRight className="w-3 h-3" />
                                </button>
                                <button
                                    type="button"
                                    onMouseDown={(e) => e.preventDefault()}
                                    onClick={() => applyFormatting("\n---\n", "", "")}
                                    title="水平分隔線"
                                    className="p-1.5 rounded-lg hover:bg-panel-inactive text-gray-200 outline-none"
                                >
                                    <FaMinus className="w-3 h-3" />
                                </button>
                                <button
                                    type="button"
                                    onMouseDown={(e) => e.preventDefault()}
                                    onClick={() => applyFormatting("\n---page---\n", "", "")}
                                    title="插入分頁"
                                    className="p-1.5 rounded-lg hover:bg-panel-inactive text-sky-300 outline-none"
                                >
                                    <FaFileLines className="w-3 h-3" />
                                </button>
                                <button
                                    type="button"
                                    onMouseDown={(e) => e.preventDefault()}
                                    onClick={() => {
                                        playClickSound();
                                        setDraftImgUrl("");
                                        setDraftImgCaption("");
                                        setImageInsertOpen(true);
                                    }}
                                    title="插入圖片"
                                    className="p-1.5 rounded-lg hover:bg-panel-inactive text-emerald-300 outline-none"
                                >
                                    <FaImage className="w-3 h-3" />
                                </button>
                                <button
                                    type="button"
                                    onMouseDown={(e) => e.preventDefault()}
                                    onClick={() => applyFormatting("{線索條件|", "}", "隱藏真相")}
                                    title="插入漸顯遮罩"
                                    className="p-1.5 rounded-lg hover:bg-panel-inactive text-amber-300 outline-none"
                                >
                                    <FaMask className="w-3 h-3" />
                                </button>
                                <button
                                    type="button"
                                    onMouseDown={(e) => e.preventDefault()}
                                    onClick={() => {
                                        playClickSound();
                                        setCipherPlainText("");
                                        setCipherModalOpen(true);
                                    }}
                                    title="插入古代密文"
                                    className="p-1.5 rounded-lg hover:bg-panel-inactive text-purple-300 outline-none"
                                >
                                    <FaKey className="w-3 h-3" />
                                </button>
                            </div>

                            {/* Slow Auto-Scrolling Marquee & Wheel-Scrollable Encyclopedia Keyword Bar */}
                            {keywords.length > 0 && (
                                <div className="flex items-center gap-1.5 shrink-0">
                                    <FaBookBookmark className="w-3 h-3 text-amber-400 shrink-0" />
                                    <div
                                        ref={kwMarqueeRef}
                                        onMouseEnter={() => {
                                            isKwMarqueePausedRef.current = true;
                                        }}
                                        onMouseLeave={() => {
                                            isKwMarqueePausedRef.current = false;
                                        }}
                                        onWheel={(e) => {
                                            if (kwMarqueeRef.current && e.deltaY !== 0) {
                                                kwMarqueeRef.current.scrollLeft += e.deltaY;
                                                kwScrollPosRef.current = kwMarqueeRef.current.scrollLeft;
                                            }
                                        }}
                                        className="flex-1 flex items-center gap-1.5 overflow-x-auto legacy-scrollbar pt-0.5 pb-1.5"
                                    >
                                        {keywords.map(kw => (
                                            <button
                                                key={kw.id}
                                                type="button"
                                                onMouseDown={(e) => e.preventDefault()}
                                                onClick={() => applyFormatting(`[${kw.keyword}]`, "", "")}
                                                className="px-2.5 py-0.5 rounded-full bg-panel-base hover:bg-panel-active/30 text-amber-300 border border-amber-500/30 text-[11px] font-bold shrink-0 outline-none transition-colors"
                                            >
                                                +[{kw.keyword}]
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Large Direct Textarea Canvas */}
                            <textarea
                                ref={textareaRef}
                                value={legacy.description}
                                onChange={(e) => applyDescriptionUpdate(e.target.value, false)}
                                placeholder="在此直接書寫信件或古籍內容..."
                                className="flex-1 min-h-0 w-full bg-panel-base text-gray-100 text-sm rounded-2xl p-3.5 outline-none resize-none overflow-y-auto editor-scrollbar border border-transparent focus:border-panel-active leading-relaxed"
                            />
                        </div>

                        {/* Right Column: Live Real-Time Parchment Preview (6 cols) */}
                        <div className="col-span-6 h-full min-h-0 flex flex-col overflow-hidden">
                            {renderParchmentPane()}
                        </div>
                    </div>
                ) : (
                    /* Single-Column Immersive Parchment Read View */
                    <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
                        {renderParchmentPane()}
                    </div>
                )}
            </div>

            {/* Bottom GM Live Reveal & Decipher Marquee Control Strip */}
            {isGM && (allSecrets.length > 0 || allCiphers.length > 0) && (
                <div className="shrink-0 px-4 py-2 bg-panel-content border-t border-panel-inactive z-20">
                    <div
                        ref={bottomMarqueeRef}
                        onMouseEnter={() => {
                            isBottomMarqueePausedRef.current = true;
                        }}
                        onMouseLeave={() => {
                            isBottomMarqueePausedRef.current = false;
                        }}
                        onWheel={(e) => {
                            if (bottomMarqueeRef.current && e.deltaY !== 0) {
                                bottomMarqueeRef.current.scrollLeft += e.deltaY;
                                bottomScrollPosRef.current = bottomMarqueeRef.current.scrollLeft;
                            }
                        }}
                        className="flex items-center gap-2 overflow-x-auto legacy-scrollbar pb-1"
                    >
                        {allSecrets.map(s => {
                            const isRevealed = (legacy.revealedSecrets || []).includes(s.id);
                            return (
                                <button
                                    key={s.id}
                                    type="button"
                                    onClick={() => toggleSecretReveal(s.id)}
                                    className={`shrink-0 max-w-[240px] px-3 py-1 rounded-full text-xs font-bold border transition-all outline-none flex items-center gap-1.5 ${
                                        isRevealed
                                            ? "bg-emerald-600/30 border-emerald-400 text-emerald-200"
                                            : "bg-panel-base border-amber-400/50 text-amber-200 hover:text-white"
                                    }`}
                                >
                                    <FaMask className="w-3 h-3 shrink-0" />
                                    <span className="truncate">
                                        [{s.condition}] {s.content}
                                    </span>
                                </button>
                            );
                        })}

                        {allCiphers.map(c => {
                            const isDeciphered = (legacy.decipheredCiphers || []).includes(c.id);
                            return (
                                <button
                                    key={c.id}
                                    type="button"
                                    onClick={() => toggleCipherDecipher(c.id)}
                                    className={`shrink-0 max-w-[240px] px-3 py-1 rounded-full text-xs font-bold border transition-all outline-none flex items-center gap-1.5 ${
                                        isDeciphered
                                            ? "bg-purple-600/30 border-purple-400 text-purple-200"
                                            : "bg-panel-base border-gray-600 text-gray-300 hover:text-white"
                                    }`}
                                >
                                    <FaKey className="w-3 h-3 shrink-0" />
                                    <span className="truncate">
                                        [{c.lang}] {c.content}
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Inline Image Attachment Insertion Modal */}
            {isGM && imageInsertOpen && (
                <div
                    onClick={() => setImageInsertOpen(false)}
                    className="fixed inset-0 z-[300] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
                >
                    <div
                        onClick={(e) => e.stopPropagation()}
                        className="w-full max-w-[380px] flex flex-col rounded-2xl bg-panel-content text-white p-5 border border-panel-inactive shadow-2xl gap-3"
                    >
                        <div className="flex items-center justify-between">
                            <h3 className="font-bold text-base">插入信件插圖</h3>
                            <button
                                onClick={() => setImageInsertOpen(false)}
                                className="text-gray-400 hover:text-white outline-none"
                            >
                                <FaXmark className="w-4 h-4" />
                            </button>
                        </div>

                        <div className="flex items-center gap-2">
                            <button
                                type="button"
                                onClick={handlePickAttachmentOBR}
                                className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-panel-base hover:bg-panel-inactive text-xs font-bold text-gray-200 outline-none border border-panel-inactive"
                            >
                                <FaCloudArrowUp className="w-3.5 h-3.5 text-panel-active" /> 圖庫選圖
                            </button>
                            <button
                                type="button"
                                onClick={() => attachFileInputRef.current?.click()}
                                className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-panel-base hover:bg-panel-inactive text-xs font-bold text-gray-200 outline-none border border-panel-inactive"
                            >
                                <FaImage className="w-3.5 h-3.5 text-amber-400" /> 本機上傳
                            </button>
                        </div>

                        {draftImgUrl && (
                            <ImageCropper
                                src={draftImgUrl}
                                crop={draftImgCrop}
                                aspectClassName="h-44"
                                onChange={setDraftImgCrop}
                            />
                        )}

                        <input
                            type="text"
                            value={draftImgCaption}
                            onChange={(e) => setDraftImgCaption(e.target.value)}
                            placeholder="圖片說明文字（選填）"
                            className="w-full bg-panel-base text-white text-xs rounded-xl p-2.5 outline-none"
                        />

                        <div className="flex justify-end gap-2">
                            <button
                                onClick={() => setImageInsertOpen(false)}
                                className="px-4 py-1.5 rounded-full text-xs font-bold text-gray-400 hover:text-white outline-none"
                            >
                                取消
                            </button>
                            <button
                                onClick={handleInsertAttachment}
                                disabled={!draftImgUrl}
                                className="px-5 py-1.5 rounded-full text-xs font-bold bg-panel-active text-white outline-none disabled:opacity-50"
                            >
                                插入至游標位置
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Ancient Cipher Insertion Modal */}
            {isGM && cipherModalOpen && (
                <div
                    onClick={() => setCipherModalOpen(false)}
                    className="fixed inset-0 z-[300] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
                >
                    <div
                        onClick={(e) => e.stopPropagation()}
                        className="w-full max-w-[360px] flex flex-col rounded-2xl bg-panel-content text-white p-5 border border-panel-inactive shadow-2xl gap-3"
                    >
                        <div className="flex items-center justify-between">
                            <h3 className="font-bold text-base">插入古代密文</h3>
                            <button
                                onClick={() => setCipherModalOpen(false)}
                                className="text-gray-400 hover:text-white outline-none"
                            >
                                <FaXmark className="w-4 h-4" />
                            </button>
                        </div>

                        <input
                            type="text"
                            value={cipherLang}
                            onChange={(e) => setCipherLang(e.target.value)}
                            placeholder="語言名稱，例如：古代精靈語"
                            className="w-full bg-panel-base text-white text-xs font-bold rounded-xl p-2.5 outline-none"
                        />

                        <textarea
                            autoFocus
                            value={cipherPlainText}
                            onChange={(e) => setCipherPlainText(e.target.value)}
                            placeholder="輸入解密後顯示的原文內容..."
                            className="w-full h-24 bg-panel-base text-gray-200 text-xs rounded-xl p-2.5 outline-none resize-none no-scrollbar"
                        />

                        <div className="flex justify-end gap-2">
                            <button
                                onClick={() => setCipherModalOpen(false)}
                                className="px-4 py-1.5 rounded-full text-xs font-bold text-gray-400 hover:text-white outline-none"
                            >
                                取消
                            </button>
                            <button
                                onClick={handleInsertCipher}
                                disabled={!cipherPlainText.trim()}
                                className="px-5 py-1.5 rounded-full text-xs font-bold bg-panel-active text-white outline-none disabled:opacity-50"
                            >
                                插入密文
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Shared Encyclopedia Keyword Popup Card */}
            {activeKeywordModal && (() => {
                const kwTheme = LEGACY_THEMES[activeKeywordModal.themeId || "standard"] || LEGACY_THEMES.standard;
                return (
                    <div
                        onClick={() => {
                            setActiveKeywordModal(null);
                            setKeywordHistory([]);
                        }}
                        className="fixed inset-0 z-[320] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-in fade-in duration-150"
                    >
                        <div
                            onClick={(e) => e.stopPropagation()}
                            style={{
                                backgroundColor: kwTheme.bg,
                                color: kwTheme.text,
                                borderColor: kwTheme.border || "rgba(255,255,255,0.2)"
                            }}
                            className="w-full max-w-[380px] max-h-[82vh] flex flex-col rounded-2xl border shadow-2xl overflow-hidden font-serif"
                        >
                            {activeKeywordModal.imageUrl && (
                                <CroppedImage
                                    src={activeKeywordModal.imageUrl}
                                    alt={activeKeywordModal.keyword}
                                    crop={activeKeywordModal.imageCrop}
                                    title="點擊檢視完整圖片"
                                    onClick={() => {
                                        playQuestCheckSound();
                                        setLightboxImage({
                                            src: activeKeywordModal.imageUrl!,
                                            title: activeKeywordModal.keyword
                                        });
                                    }}
                                    containerClassName="w-full h-52 bg-black/25 border-b border-current/15 shrink-0"
                                />
                            )}
                            <div className="p-5 overflow-y-auto no-scrollbar flex-1">
                                <div className="flex items-start justify-between gap-2 border-b border-current/20 pb-2.5 mb-3">
                                    <div className="flex items-start gap-2 min-w-0">
                                        {keywordHistory.length > 0 && (
                                            <button
                                                onClick={() => {
                                                    playClickSound();
                                                    const prev = keywordHistory[keywordHistory.length - 1];
                                                    setKeywordHistory(h => h.slice(0, -1));
                                                    setActiveKeywordModal(prev);
                                                }}
                                                className="mt-1 p-1.5 rounded-full bg-black/10 hover:bg-black/20 outline-none shrink-0"
                                            >
                                                <FaArrowLeft className="w-3.5 h-3.5" />
                                            </button>
                                        )}
                                        <div className="min-w-0">
                                            <h3 className="text-xl font-black break-words">
                                                {activeKeywordModal.keyword}
                                            </h3>
                                            {activeKeywordModal.subtitle && (
                                                <span className="inline-block text-xs font-bold opacity-75 mt-0.5">
                                                    {activeKeywordModal.subtitle}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => {
                                            setActiveKeywordModal(null);
                                            setKeywordHistory([]);
                                        }}
                                        className="p-1.5 opacity-60 hover:opacity-100 outline-none shrink-0"
                                    >
                                        <FaXmark className="w-4 h-4" />
                                    </button>
                                </div>
                                <div className="text-[16px] leading-relaxed whitespace-pre-wrap break-words opacity-95">
                                    {activeKeywordModal.description
                                        ? renderInlineNodes(
                                              activeKeywordModal.description,
                                              { secret: 900, cipher: 900 },
                                              true
                                          )
                                        : "尚無詳細劇情紀錄。"}
                                </div>
                            </div>
                        </div>
                    </div>
                );
            })()}

            {/* Full Artwork Lightbox Overlay */}
            <LightboxOverlay
                src={lightboxImage?.src || null}
                title={lightboxImage?.title}
                onClose={() => setLightboxImage(null)}
            />
        </div>
    );
}