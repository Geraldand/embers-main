// src/components/StoryManager/LegacyTab.tsx
import { useState, useEffect, useRef } from "react";
import OBR from "@owlbear-rodeo/sdk";
import {
    FaCirclePlus,
    FaPencil,
    FaEye,
    FaEyeSlash,
    FaTrash,
    FaBookOpenReader,
    FaTowerBroadcast,
    FaXmark,
    FaImage,
    FaCloudArrowUp,
    FaStamp
} from "react-icons/fa6";
import { LegacyItem } from "./types";
import { useStoryData } from "./store";
import { LEGACY_THEMES } from "./constants";
import { WAX_SEAL_OPTIONS, renderWaxSealIcon } from "./WaxSeal";
import { compressImageFile } from "./ShopTab";
import {
    ImageCropper,
    CroppedImage,
    DEFAULT_IMAGE_CROP,
    openGlobalImageViewer
} from "./ImageCropper";

export const ACTIVE_LEGACY_STORAGE_KEY = "eu.armindo.embers/active-legacy-id";
export const ACTIVE_LEGACY_EDIT_KEY = "eu.armindo.embers/active-legacy-edit";

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

// Strip formatting markers for clean single-line preview in sidebar
function getCleanPreviewText(raw: string): string {
    if (!raw) return "";
    return raw
        .replace(/---page---/g, " ")
        .replace(/\[img:[^\]]+\]/g, "[插圖]")
        .replace(/\{cipher:([^|]+)\|([^}]+)\}/g, "[$1密文]")
        .replace(/\{([^}|]+)\|([^}]+)\}/g, "[$1]")
        .replace(/\[([^\]|]+)\|([^\]]+)\]/g, "$1")
        .replace(/\[\/?(?:center|right)\]/g, "")
        .replace(/[*_~#>]/g, "")
        .trim();
}

export default function LegacyTab() {
    const { legacies, isGM, saveLegacies, broadcastLegacy } = useStoryData();
    const [modalOpen, setModalOpen] = useState(false);
    const [editModalTab, setEditModalTab] = useState<"basic" | "banner">("basic");
    const [pickerSection, setPickerSection] = useState<"none" | "theme" | "seal">("none");
    const [broadcastModalOpen, setBroadcastModalOpen] = useState(false);
    const [legacyToBroadcast, setLegacyToBroadcast] = useState<string | null>(null);
    const [editingLegacy, setEditingLegacy] = useState<LegacyItem | null>(null);
    const [form, setForm] = useState<Partial<LegacyItem>>({});
    const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
    const [party, setParty] = useState<any[]>([]);
    const [selectedTargets, setSelectedTargets] = useState<string[]>(["ALL"]);

    const bgFileInputRef = useRef<HTMLInputElement | null>(null);

    useEffect(() => {
        if (!isGM) return;
        OBR.party.getPlayers().then(setParty);
        const unsub = OBR.party.onChange(setParty);
        return () => unsub();
    }, [isGM]);

    const openCentralLegacyReader = async (legacy: LegacyItem, startInEditMode = false) => {
        playLegacyOpenSound();
        localStorage.setItem(ACTIVE_LEGACY_STORAGE_KEY, legacy.id);
        localStorage.setItem("eu.armindo.embers/current-broadcast-legacy", JSON.stringify(legacy));
        if (startInEditMode) {
            localStorage.setItem(ACTIVE_LEGACY_EDIT_KEY, "1");
        } else {
            localStorage.removeItem(ACTIVE_LEGACY_EDIT_KEY);
        }

        const [viewWidth, viewHeight] = await Promise.all([
            OBR.viewport.getWidth(),
            OBR.viewport.getHeight()
        ]);
        const targetWidth = startInEditMode
            ? Math.min(1260, Math.max(820, Math.floor(viewWidth * 0.94)))
            : Math.min(680, Math.max(460, Math.floor(viewWidth * 0.68)));
        const targetHeight = Math.min(820, Math.max(540, Math.floor(viewHeight * 0.9)));

        await OBR.modal.open({
            id: "eu.armindo.embers/legacy-reader",
            url: `/?view=legacy-reader&legacyId=${encodeURIComponent(legacy.id)}`,
            width: targetWidth,
            height: targetHeight,
            fullScreen: false
        });
    };

    useEffect(() => {
        const handler = (e: any) => {
            const legacy = legacies.find(l => l.id === e.detail);
            if (legacy) {
                openCentralLegacyReader(legacy, false);
            }
        };
        window.addEventListener("force-open-legacy", handler);
        return () => window.removeEventListener("force-open-legacy", handler);
    }, [legacies]);

    const handleSave = () => {
        playClickSound();
        const isCreating = !editingLegacy;
        const newItem: LegacyItem = {
            id: editingLegacy?.id || Date.now().toString(36),
            name: form.name || "未知文件",
            description: editingLegacy?.description ?? form.description ?? "",
            themeId: form.themeId || "standard",
            backgroundImageUrl: form.backgroundImageUrl || "",
            imageCrop: form.imageCrop || { ...DEFAULT_IMAGE_CROP },
            sealType: form.sealType || "none",
            signer: form.signer || "",
            attachments: editingLegacy?.attachments || {},
            decipheredCiphers: editingLegacy?.decipheredCiphers || [],
            partyNotes: editingLegacy?.partyNotes || "",
            isVisible: form.isVisible ?? false,
            revealedSecrets: editingLegacy?.revealedSecrets || [],
            createdAt: editingLegacy?.createdAt || Date.now()
        };
        saveLegacies(
            editingLegacy ? legacies.map(l => (l.id === editingLegacy.id ? newItem : l)) : [...legacies, newItem]
        );
        setModalOpen(false);
        if (isCreating) {
            openCentralLegacyReader(newItem, true);
        }
    };

    const handlePickOBRBanner = async () => {
        try {
            const assets = await OBR.assets.downloadImages(false);
            if (assets && assets.length > 0 && assets[0].image?.url) {
                setForm(prev => ({
                    ...prev,
                    backgroundImageUrl: assets[0].image.url,
                    imageCrop: { ...DEFAULT_IMAGE_CROP }
                }));
            }
        } catch (e) {
            console.warn("Failed to pick banner asset", e);
        }
    };

    const handleLocalBannerUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        try {
            const compressed = await compressImageFile(file, 800, 0.82);
            setForm(prev => ({
                ...prev,
                backgroundImageUrl: compressed,
                imageCrop: { ...DEFAULT_IMAGE_CROP }
            }));
        } catch (err) {
            console.error("Failed to compress banner image", err);
        } finally {
            e.target.value = "";
        }
    };

    const handleBroadcastSubmit = () => {
        if (!legacyToBroadcast) return;
        playClickSound();
        broadcastLegacy(legacyToBroadcast, selectedTargets);
        setBroadcastModalOpen(false);
        setLegacyToBroadcast(null);
    };

    const visibleLegacies = isGM ? legacies : legacies.filter(l => l.isVisible);

    return (
        <div className="relative px-1">
            <input
                ref={bgFileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleLocalBannerUpload}
            />

            <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-bold text-gray-300">發現的遺留物</h3>
                {isGM && (
                    <button
                        onClick={() => {
                            setEditingLegacy(null);
                            setEditModalTab("basic");
                            setPickerSection("none");
                            setForm({
                                isVisible: false,
                                themeId: "standard",
                                sealType: "crimson",
                                signer: "",
                                backgroundImageUrl: "",
                                imageCrop: { ...DEFAULT_IMAGE_CROP }
                            });
                            setModalOpen(true);
                            playClickSound();
                        }}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-panel-inactive hover:bg-panel-active text-white rounded-full transition-colors outline-none"
                    >
                        <FaCirclePlus className="w-3.5 h-3.5" /> 新增遺留物
                    </button>
                )}
            </div>

            <div className="flex flex-col gap-3.5 pb-10">
                {visibleLegacies.length === 0 && (
                    <p className="text-xs font-bold text-gray-500 text-center py-10">
                        目前尚無已公開的遺留物
                    </p>
                )}

                {visibleLegacies.map(legacy => {
                    const themeObj = LEGACY_THEMES[legacy.themeId || "standard"] || LEGACY_THEMES.standard;
                    const previewSummary = getCleanPreviewText(legacy.description);

                    return (
                        <div
                            key={legacy.id}
                            style={{
                                backgroundColor: themeObj.bg,
                                color: themeObj.text,
                                borderColor: themeObj.border || "rgba(255, 255, 255, 0.12)"
                            }}
                            className={`flex flex-col rounded-2xl border shadow-md overflow-hidden transition-all ${
                                !legacy.isVisible ? "opacity-85" : ""
                            }`}
                        >
                            {/* Sidebar Banner Image (Click to inspect full banner artwork) */}
                            {legacy.backgroundImageUrl && (
                                <div
                                    onClick={() => openGlobalImageViewer(legacy.backgroundImageUrl!, legacy.name)}
                                    title="點擊檢視完整橫幅圖片"
                                    className="relative h-24 w-full overflow-hidden cursor-zoom-in group/banner"
                                >
                                    <CroppedImage
                                        src={legacy.backgroundImageUrl}
                                        alt={legacy.name}
                                        crop={legacy.imageCrop}
                                        containerClassName="w-full h-full"
                                        imgClassName="brightness-105 transition-transform duration-300 group-hover/banner:scale-105"
                                    />
                                    <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/15 to-transparent pointer-events-none" />
                                    <div className="absolute bottom-2 left-3 right-3 flex items-center justify-between gap-2">
                                        <h4 className="font-black text-base text-white drop-shadow truncate">
                                            {legacy.name}
                                        </h4>
                                        {isGM && !legacy.isVisible && (
                                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-600 text-white shadow-sm shrink-0">
                                                未公開
                                            </span>
                                        )}
                                    </div>
                                </div>
                            )}

                            <div className="p-3 flex items-center justify-between gap-2">
                                <div
                                    onClick={() => openCentralLegacyReader(legacy, false)}
                                    className="flex-1 min-w-0 cursor-pointer group/read"
                                >
                                    {!legacy.backgroundImageUrl && (
                                        <div className="flex items-center gap-2 mb-1">
                                            <span className="p-1.5 rounded-full bg-[#1e2235]/85 text-white flex items-center justify-center shrink-0 shadow-sm">
                                                <FaBookOpenReader className="w-3.5 h-3.5" />
                                            </span>
                                            <h4 className="font-black text-base truncate group-hover/read:underline">
                                                {legacy.name}
                                            </h4>
                                            {isGM && !legacy.isVisible && (
                                                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#1e2235]/90 text-gray-200 shrink-0 shadow-sm">
                                                    未公開
                                                </span>
                                            )}
                                        </div>
                                    )}

                                    <p
                                        className={`text-xs opacity-85 truncate ${
                                            !legacy.backgroundImageUrl ? "pl-8" : ""
                                        }`}
                                    >
                                        {previewSummary || "點擊開啟閱讀信件內容..."}
                                    </p>
                                </div>

                                {isGM && (
                                    <div
                                        onClick={(e) => e.stopPropagation()}
                                        className="flex items-center gap-0.5 bg-[#1e2235]/95 text-gray-100 border border-white/15 rounded-full px-1.5 py-1 shadow-md shrink-0"
                                    >
                                        <button
                                            onClick={() => {
                                                playClickSound();
                                                setLegacyToBroadcast(legacy.id);
                                                setSelectedTargets(["ALL"]);
                                                setBroadcastModalOpen(true);
                                            }}
                                            className="p-1.5 text-amber-400 hover:text-amber-200 outline-none transition-colors"
                                            title="廣播推送給玩家"
                                        >
                                            <FaTowerBroadcast className="w-3 h-3" />
                                        </button>
                                        <button
                                            onClick={() => {
                                                playClickSound();
                                                saveLegacies(
                                                    legacies.map(l =>
                                                        l.id === legacy.id ? { ...l, isVisible: !l.isVisible } : l
                                                    )
                                                );
                                            }}
                                            className={`p-1.5 outline-none transition-colors ${
                                                legacy.isVisible
                                                    ? "text-[#bb99ff] hover:text-white"
                                                    : "text-gray-400 hover:text-white"
                                            }`}
                                            title={legacy.isVisible ? "對玩家公開中" : "對玩家隱藏中"}
                                        >
                                            {legacy.isVisible ? (
                                                <FaEye className="w-3 h-3" />
                                            ) : (
                                                <FaEyeSlash className="w-3 h-3" />
                                            )}
                                        </button>
                                        <button
                                            onClick={() => {
                                                playClickSound();
                                                setEditingLegacy(legacy);
                                                setEditModalTab("basic");
                                                setPickerSection("none");
                                                setForm(legacy);
                                                setModalOpen(true);
                                            }}
                                            className="p-1.5 text-sky-300 hover:text-white outline-none transition-colors"
                                            title="設定外觀與橫幅"
                                        >
                                            <FaPencil className="w-3 h-3" />
                                        </button>
                                        <button
                                            onClick={() =>
                                                confirmDeleteId === legacy.id
                                                    ? saveLegacies(legacies.filter(l => l.id !== legacy.id))
                                                    : setConfirmDeleteId(legacy.id)
                                            }
                                            onMouseLeave={() => setConfirmDeleteId(null)}
                                            className={`p-1.5 rounded-full outline-none transition-colors ${
                                                confirmDeleteId === legacy.id
                                                    ? "bg-rose-600 text-white"
                                                    : "text-rose-400 hover:text-rose-200"
                                            }`}
                                            title="刪除遺留物"
                                        >
                                            {confirmDeleteId === legacy.id ? (
                                                <FaXmark className="w-3 h-3" />
                                            ) : (
                                                <FaTrash className="w-3 h-3" />
                                            )}
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Broadcast Target Selection Modal */}
            {broadcastModalOpen && (
                <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in">
                    <div className="w-full max-w-[300px] flex flex-col shadow-2xl rounded-2xl bg-panel-content p-5 border border-panel-inactive">
                        <h3 className="font-bold text-white mb-4">選擇廣播對象</h3>
                        <div className="flex flex-col gap-2 mb-6 max-h-[30vh] overflow-y-auto no-scrollbar">
                            <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer p-2 hover:bg-panel-inactive rounded transition-colors">
                                <input
                                    type="checkbox"
                                    checked={selectedTargets.includes("ALL")}
                                    onChange={() => setSelectedTargets(["ALL"])}
                                    className="accent-panel-active"
                                />
                                所有人
                            </label>
                            {party.map(p => (
                                <label
                                    key={p.id}
                                    className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer p-2 hover:bg-panel-inactive rounded transition-colors"
                                >
                                    <input
                                        type="checkbox"
                                        checked={selectedTargets.includes(p.id)}
                                        onChange={(e) => {
                                            if (e.target.checked)
                                                setSelectedTargets(prev => [
                                                    ...prev.filter(t => t !== "ALL"),
                                                    p.id
                                                ]);
                                            else
                                                setSelectedTargets(prev => prev.filter(t => t !== p.id));
                                        }}
                                        className="accent-panel-active"
                                    />
                                    {p.name}
                                </label>
                            ))}
                        </div>
                        <div className="flex justify-end gap-2">
                            <button
                                onClick={() => setBroadcastModalOpen(false)}
                                className="px-4 py-1.5 rounded-full text-xs font-bold text-gray-400 hover:text-white outline-none"
                            >
                                取消
                            </button>
                            <button
                                onClick={handleBroadcastSubmit}
                                disabled={selectedTargets.length === 0}
                                className="px-4 py-1.5 rounded-full text-xs font-bold bg-panel-active text-white outline-none disabled:opacity-50"
                            >
                                廣播
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Create / Edit Legacy Appearance & Sidebar Banner Modal */}
            {modalOpen && (
                <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/65 backdrop-blur-sm p-4 animate-in fade-in">
                    <div className="w-full max-w-[390px] max-h-[88vh] flex flex-col shadow-2xl rounded-2xl bg-panel-content p-5 border border-panel-inactive overflow-hidden">
                        <div className="flex items-center justify-between mb-3 shrink-0">
                            <h3 className="font-bold text-white text-base">
                                {editingLegacy ? "遺留物外觀設定" : "建立新遺留物"}
                            </h3>
                            <button
                                onClick={() => setModalOpen(false)}
                                className="text-gray-400 hover:text-white outline-none"
                            >
                                <FaXmark className="w-4 h-4" />
                            </button>
                        </div>

                        <div className="flex bg-panel-base/90 rounded-2xl p-1.5 mb-4 shadow-inner shrink-0">
                            <button
                                type="button"
                                onClick={() => {
                                    playClickSound();
                                    setEditModalTab("basic");
                                }}
                                className={`flex-1 py-1.5 text-xs font-bold rounded-xl transition-all outline-none border ${
                                    editModalTab === "basic"
                                        ? "bg-panel-inactive text-[#bb99ff] shadow-sm border-white/10"
                                        : "text-gray-400 hover:text-gray-200 border-transparent"
                                }`}
                            >
                                紙張與印章
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    playClickSound();
                                    setEditModalTab("banner");
                                }}
                                className={`flex-1 py-1.5 text-xs font-bold rounded-xl transition-all outline-none border ${
                                    editModalTab === "banner"
                                        ? "bg-panel-inactive text-[#bb99ff] shadow-sm border-white/10"
                                        : "text-gray-400 hover:text-gray-200 border-transparent"
                                }`}
                            >
                                列表橫幅圖
                            </button>
                        </div>

                        {editModalTab === "basic" && (
                            <div className="flex-1 min-h-0 overflow-y-auto no-scrollbar flex flex-col gap-3 pr-0.5">
                                <input
                                    autoFocus
                                    type="text"
                                    value={form.name || ""}
                                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                                    placeholder="信件或文件標題"
                                    className="w-full bg-panel-base text-white text-sm font-bold rounded-xl p-2.5 outline-none border border-transparent focus:border-panel-active shadow-inner"
                                />

                                {/* Visual Swatch Trigger Buttons */}
                                <div className="grid grid-cols-2 gap-2">
                                    <button
                                        type="button"
                                        onClick={() => {
                                            playClickSound();
                                            setPickerSection(prev => (prev === "theme" ? "none" : "theme"));
                                        }}
                                        className={`flex items-center gap-2 p-2.5 rounded-xl bg-panel-base border text-left transition-colors outline-none ${
                                            pickerSection === "theme"
                                                ? "border-panel-active"
                                                : "border-transparent hover:border-white/15"
                                        }`}
                                    >
                                        <span
                                            style={{
                                                backgroundColor:
                                                    (LEGACY_THEMES[form.themeId || "standard"] || LEGACY_THEMES.standard).bg,
                                                color:
                                                    (LEGACY_THEMES[form.themeId || "standard"] || LEGACY_THEMES.standard).text
                                            }}
                                            className="w-6 h-6 rounded-lg flex items-center justify-center text-[11px] font-black border border-white/20 shrink-0"
                                        >
                                            字
                                        </span>
                                        <div className="min-w-0 flex-1">
                                            <span className="text-[10px] text-gray-400 block">信紙風格</span>
                                            <span className="text-xs font-bold text-white truncate block">
                                                {(LEGACY_THEMES[form.themeId || "standard"] || LEGACY_THEMES.standard).label}
                                            </span>
                                        </div>
                                    </button>

                                    <button
                                        type="button"
                                        onClick={() => {
                                            playClickSound();
                                            setPickerSection(prev => (prev === "seal" ? "none" : "seal"));
                                        }}
                                        className={`flex items-center gap-2 p-2.5 rounded-xl bg-panel-base border text-left transition-colors outline-none ${
                                            pickerSection === "seal"
                                                ? "border-panel-active"
                                                : "border-transparent hover:border-white/15"
                                        }`}
                                    >
                                        <span
                                            style={{
                                                backgroundColor:
                                                    form.sealType && form.sealType !== "none"
                                                        ? (WAX_SEAL_OPTIONS[form.sealType] || WAX_SEAL_OPTIONS.crimson).innerColor
                                                        : "#3d4051"
                                            }}
                                            className="w-6 h-6 rounded-full flex items-center justify-center border border-white/20 shrink-0"
                                        >
                                            {form.sealType && form.sealType !== "none" ? (
                                                renderWaxSealIcon(
                                                    form.sealType,
                                                    (WAX_SEAL_OPTIONS[form.sealType] || WAX_SEAL_OPTIONS.crimson).iconColor,
                                                    "w-3 h-3"
                                                )
                                            ) : (
                                                <FaStamp className="w-3 h-3 text-gray-400" />
                                            )}
                                        </span>
                                        <div className="min-w-0 flex-1">
                                            <span className="text-[10px] text-gray-400 block">火漆印章</span>
                                            <span className="text-xs font-bold text-white truncate block">
                                                {(WAX_SEAL_OPTIONS[form.sealType || "none"] || WAX_SEAL_OPTIONS.none).label}
                                            </span>
                                        </div>
                                    </button>
                                </div>

                                {/* Visual Paper Theme Grid */}
                                {pickerSection === "theme" && (
                                    <div className="grid grid-cols-2 gap-1.5 p-2 rounded-xl bg-panel-base border border-panel-inactive max-h-44 overflow-y-auto no-scrollbar">
                                        {Object.entries(LEGACY_THEMES).map(([k, v]) => {
                                            const active = (form.themeId || "standard") === k;
                                            return (
                                                <button
                                                    key={k}
                                                    type="button"
                                                    onClick={() => {
                                                        playClickSound();
                                                        setForm({ ...form, themeId: k });
                                                        setPickerSection("none");
                                                    }}
                                                    className={`flex items-center gap-2 p-1.5 rounded-lg border text-left transition-all outline-none ${
                                                        active
                                                            ? "border-panel-active bg-panel-active/20"
                                                            : "border-transparent hover:bg-panel-inactive/60"
                                                    }`}
                                                >
                                                    <span
                                                        style={{ backgroundColor: v.bg, color: v.text }}
                                                        className="w-5 h-5 rounded flex items-center justify-center text-[10px] font-black border border-white/20 shrink-0"
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

                                {/* Visual Wax Seal Grid */}
                                {pickerSection === "seal" && (
                                    <div className="grid grid-cols-2 gap-1.5 p-2 rounded-xl bg-panel-base border border-panel-inactive max-h-44 overflow-y-auto no-scrollbar">
                                        {Object.entries(WAX_SEAL_OPTIONS).map(([k, v]) => {
                                            const active = (form.sealType || "none") === k;
                                            return (
                                                <button
                                                    key={k}
                                                    type="button"
                                                    onClick={() => {
                                                        playClickSound();
                                                        setForm({ ...form, sealType: k });
                                                        setPickerSection("none");
                                                    }}
                                                    className={`flex items-center gap-2 p-1.5 rounded-lg border text-left transition-all outline-none ${
                                                        active
                                                            ? "border-panel-active bg-panel-active/20"
                                                            : "border-transparent hover:bg-panel-inactive/60"
                                                    }`}
                                                >
                                                    <span
                                                        style={{
                                                            backgroundColor: k === "none" ? "#3d4051" : v.innerColor
                                                        }}
                                                        className="w-5 h-5 rounded-full flex items-center justify-center border border-white/20 shrink-0"
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

                                <input
                                    type="text"
                                    value={form.signer || ""}
                                    onChange={(e) => setForm({ ...form, signer: e.target.value })}
                                    placeholder="信末署名（選填）"
                                    className="w-full bg-panel-base text-white text-xs font-bold rounded-xl p-2.5 outline-none border border-transparent focus:border-panel-active"
                                />
                            </div>
                        )}

                        {editModalTab === "banner" && (
                            <div className="flex flex-col gap-3">
                                <div className="flex items-center gap-2">
                                    <button
                                        type="button"
                                        onClick={handlePickOBRBanner}
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
                                    {form.backgroundImageUrl && (
                                        <button
                                            type="button"
                                            onClick={() =>
                                                setForm({
                                                    ...form,
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

                                {form.backgroundImageUrl ? (
                                    <ImageCropper
                                        src={form.backgroundImageUrl}
                                        crop={form.imageCrop}
                                        aspectClassName="h-36"
                                        onChange={(nextCrop) => setForm({ ...form, imageCrop: nextCrop })}
                                    />
                                ) : (
                                    <div className="w-full h-36 rounded-xl bg-panel-base border border-dashed border-panel-inactive flex flex-col items-center justify-center text-gray-500 text-xs font-bold gap-2">
                                        <FaImage className="w-6 h-6 opacity-40" />
                                        <span>尚未設定列表橫幅圖</span>
                                    </div>
                                )}
                            </div>
                        )}

                        <div className="flex justify-end gap-2 mt-4 pt-3 border-t border-panel-base shrink-0">
                            <button
                                onClick={() => {
                                    playClickSound();
                                    setModalOpen(false);
                                }}
                                className="px-4 py-1.5 rounded-full text-xs font-bold text-gray-400 hover:text-white outline-none"
                            >
                                取消
                            </button>
                            <button
                                onClick={handleSave}
                                disabled={!form.name?.trim()}
                                className="px-5 py-1.5 rounded-full text-xs font-bold bg-panel-active text-white outline-none disabled:opacity-50"
                            >
                                {editingLegacy ? "儲存設定" : "建立並開始編輯"}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}