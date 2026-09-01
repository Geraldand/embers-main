import { APP_KEY, ASSET_LOCATION } from "../config";
import { FaCaretDown, FaCaretUp, FaCirclePlus, FaDownload, FaFloppyDisk, FaPencil, FaTrash, FaUpload, FaGear } from "react-icons/fa6";
import OBR from "@owlbear-rodeo/sdk";
import { downloadFileFromString, loadJSONFile } from "../utils";
import { getAllSpellNames, getSpell, spellIDs } from "../effects/spells";
import { toolID } from "../effectsTool";
import { useCallback, useEffect, useRef, useState } from "react";

import { SpellInstance } from "../types/spells";
import { useOBR } from "../react-obr/providers";
import SpellDetails from "./SpellDetails";
import Settings from "./Settings";
import { safeJsonParse } from "../utils";

type ModalType = "create-spell-group" | "add-spell" | "delete-spell-group" | "change-group-name";
export const playerMetadataSpellbookKey = `${APP_KEY}/spellbook`;

function playClickSound() {
    try { const audio = new Audio('/click.mp3'); audio.volume = 0.15; audio.play().catch(() => { }); } catch (e) { }
}

export default function SpellBook() {
    const obr = useOBR();
    const [groups, _setGroups] = useState<Record<string, SpellInstance[]>>({});
    const [modalOpened, setModalOpened] = useState<ModalType | null>(null);
    const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});

    const [detailsModalOpen, setDetailsModalOpen] = useState(false);
    const [settingsModalOpen, setSettingsModalOpen] = useState(false);
    const [selectedInstance, setSelectedInstance] = useState<{ groupName: string, instance: SpellInstance } | null>(null);

    const [groupName, setGroupName] = useState<string>("");
    const [newGroupName, setNewGroupName] = useState<string>("");
    const [selectedSpellID, setSelectedSpellID] = useState<string>("");
    const [allSpellIDs, setAllSpellIDs] = useState<string[]>(spellIDs);
    const [editing, setEditing] = useState(false);
    const [isGM, setIsGM] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const [tokenSpells, setTokenSpells] = useState<any[]>([]);
    const [selectedTokenName, setSelectedTokenName] = useState<string | null>(null);

    // ======== 新增：Token 專用的過濾狀態 ========
    const [tokenTab, setTokenTab] = useState<"action" | "spell">("action");
    const [actionFilter, setActionFilter] = useState<string>("all");
    const [spellFilter, setSpellFilter] = useState<string>("all");
    // ============================================

    const verifyAndMigrateGroups = useCallback((json: unknown): Record<string, SpellInstance[]> | null => {
        if (typeof json !== "object" || Array.isArray(json) || json == null) return null;
        const migrated: Record<string, SpellInstance[]> = {};

        for (const [key, value] of Object.entries(json)) {
            if (typeof key !== "string" || !Array.isArray(value)) return null;
            migrated[key] = value.map((item: any) => {
                if (typeof item === "string") {
                    const oldParamsStr = localStorage.getItem(`${APP_KEY}/spell-parameters/${item}`);
                    const parameters = safeJsonParse<Record<string, any>>(oldParamsStr, {});
                    return {
                        instanceId: `${item}-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`,
                        baseSpellId: item,
                        parameters
                    } as SpellInstance;
                }
                if (typeof item === "object" && item !== null && "instanceId" in item && "baseSpellId" in item) {
                    return item as SpellInstance;
                }
                return null;
            }).filter(Boolean) as SpellInstance[];
        }
        return migrated;
    }, []);

    const setGroups = useCallback((value: Record<string, SpellInstance[]> | null) => {
        if (value == null) {
            OBR.notification.show("無效的法術書 JSON", "ERROR");
            return;
        }
        localStorage.setItem(`${playerMetadataSpellbookKey}/${OBR.room.id}`, JSON.stringify(value));
        _setGroups(value);
    }, []);

    const closeModal = () => setModalOpened(null);
    const toggleGroup = (name: string) => setExpandedGroups(prev => ({ ...prev, [name]: prev[name] === undefined ? false : !prev[name] }));

    const confirmGroupName = useCallback((gName: string) => {
        if (gName.length == 0 || Object.keys(groups).includes(gName)) return;
        setGroups({ ...groups, [gName]: [] });
        closeModal();
    }, [groups, setGroups]);

    const editGroupName = useCallback((oldName: string, newName: string) => {
        if (newName.length == 0 || Object.keys(groups).includes(newName)) return;
        setGroups({
            ...Object.fromEntries(Object.entries(groups).filter(([k]) => k != oldName)),
            [newName]: groups[oldName] ?? [],
        });
        closeModal();
    }, [groups, setGroups]);

    const deleteSpellGroup = useCallback((gName: string) => {
        setGroups(Object.fromEntries(Object.entries(groups).filter(([k]) => k != gName)));
        closeModal();
    }, [groups, setGroups]);

    const addSpellToGroup = useCallback((gName: string, baseId: string) => {
        const baseSpell = getSpell(baseId, isGM);
        const defaultParams: Record<string, any> = {};
        if (baseSpell?.parameters) {
            baseSpell.parameters.forEach(p => {
                if (p.defaultValue !== undefined) defaultParams[p.id] = p.defaultValue;
            });
        }
        const newInstance: SpellInstance = {
            instanceId: `${baseId}-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`,
            baseSpellId: baseId,
            customName: baseSpell?.name,
            parameters: defaultParams
        };
        setGroups({ ...groups, [gName]: [...(groups[gName] ?? []), newInstance] });
        closeModal();
    }, [groups, setGroups, isGM]);

    const updateSpellInstance = useCallback((gName: string, updatedInstance: SpellInstance) => {
        setGroups({
            ...groups,
            [gName]: groups[gName].map(s => s.instanceId === updatedInstance.instanceId ? updatedInstance : s)
        });
    }, [groups, setGroups]);

    const deleteSpellFromGroup = useCallback((gName: string, instanceId: string) => {
        setGroups({ ...groups, [gName]: groups[gName].filter(s => s.instanceId !== instanceId) });
    }, [groups, setGroups]);

    const moveSpellGroup = useCallback((oldIndex: number, newIndex: number) => {
        const entries = Object.entries(groups);
        const newEntries = Object.entries(groups);
        newEntries.splice(oldIndex, 1, entries[newIndex]);
        newEntries.splice(newIndex, 1, entries[oldIndex]);
        setGroups(Object.fromEntries(newEntries));
    }, [groups, setGroups]);

    const openSpellDetails = useCallback((gName: string, instance: SpellInstance) => {
        playClickSound();
        setSelectedInstance({ groupName: gName, instance });
        setDetailsModalOpen(true);
    }, []);

    const castSpell = useCallback(async (instance: SpellInstance) => {
        playClickSound();
        await OBR.player.setMetadata({
            [`${APP_KEY}/selected-spell`]: instance.baseSpellId,
            [`${APP_KEY}/spell-parameters`]: instance.parameters || {}
        });
        await OBR.tool.activateTool(toolID);
    }, []);

    const castTokenSpell = async (spellData: any) => {
        playClickSound();
        await OBR.player.setMetadata({
            [`${APP_KEY}/selected-spell`]: spellData.embersId,
            [`${APP_KEY}/spell-parameters`]: spellData.variants || {}
        });
        await OBR.tool.activateTool(toolID);
    };

    const clearTokenSpellbook = () => {
        playClickSound();
        setSelectedTokenName(null);
        setTokenSpells([]);
    };

    useEffect(() => {
        if (!obr.ready) return;

        let currentSelection: string[] = [];

        const updateTokenSpells = async (selection?: string[] | null) => {
            currentSelection = selection || [];
            if (currentSelection.length !== 1) {
                setTokenSpells([]);
                setSelectedTokenName(null);
                return;
            }

            const items = await OBR.scene.items.getItems([currentSelection[0]]);
            if (items.length === 0) {
                setTokenSpells([]);
                setSelectedTokenName(null);
                return;
            }

            const item = items[0];
            const tokenName = (item as any).text?.plainText || item.name || "未命名 Token";
            
            // 🌟 修正點：使用 Map 透過 ID 去重，確保新資料覆寫舊陣列資料
            const availableSpellsMap = new Map<string, any>();

            const processSpellOrAction = (entry: any, defaultType: "spell" | "action") => {
                if (!entry) return;
                let embersId = entry.embersId || (typeof entry === "string" ? entry : null);

                if (!embersId || typeof embersId !== "string" || embersId.trim() === "") return;

                const spellDef = getSpell(embersId, isGM);
                if (!spellDef) return;

                const name = entry.name || entry.title || entry.label || spellDef.name || embersId;
                const variants = entry.embersVariants || entry.variants || {};
                
                // ======== 新增分類萃取邏輯 ========
                let baseType = defaultType;
                let subType = "other";
                let level = 0;

                if (entry.type && ["action", "bonus_action", "reaction", "free_action", "feature"].includes(entry.type)) {
                    baseType = "action";
                    subType = entry.type;
                } else {
                    baseType = "spell";
                    level = entry.level !== undefined ? Number(entry.level) : (spellDef.level || 0);
                    subType = level.toString();
                }
                // ===================================

                // 優先使用 entry.id，確保精準覆寫舊資料
                const uniqueKey = entry.id || `${baseType}-${embersId}-${name}`;
                
                availableSpellsMap.set(uniqueKey, { 
                    type: baseType, 
                    subType, 
                    level, 
                    name, 
                    embersId, 
                    variants 
                });
            };

            for (const [key, rawValue] of Object.entries(item.metadata || {})) {
                if (rawValue === undefined || rawValue === null) continue; // 🌟 修正點：直接過濾已刪除或為空的欄位

                let val = rawValue;
                if (typeof val === "string") {
                    if (val.startsWith("{") || val.startsWith("[")) {
                        try { val = JSON.parse(val); } catch (e) { }
                    } else if (key.includes("equipped-spell") || key.includes("spell")) {
                        processSpellOrAction({ embersId: val }, "spell");
                    }
                }

                if (Array.isArray(val)) {
                    val.forEach(itemEntry => processSpellOrAction(itemEntry, key.includes("action") ? "action" : "spell"));
                } else if (val && typeof val === "object") {
                    const obj = val as Record<string, any>;

                    if (Array.isArray(obj.actions)) obj.actions.forEach((act: any) => processSpellOrAction(act, "action"));
                    else if (obj.actions && typeof obj.actions === "object") Object.values(obj.actions).forEach((act: any) => processSpellOrAction(act, "action"));

                    if (Array.isArray(obj.spells)) obj.spells.forEach((sp: any) => processSpellOrAction(sp, "spell"));
                    else if (obj.spells && typeof obj.spells === "object") Object.values(obj.spells).forEach((sp: any) => processSpellOrAction(sp, "spell"));

                    if (obj["equipped-spell"]) {
                        const eq = obj["equipped-spell"];
                        if (Array.isArray(eq)) eq.forEach(sp => processSpellOrAction(sp, "spell"));
                        else processSpellOrAction({ embersId: eq }, "spell");
                    }

                    if (obj.embersId) {
                        const defaultType = key.includes("action") ? "action" : "spell";
                        processSpellOrAction(obj, defaultType);
                    }
                }
            }

            const finalSpells = Array.from(availableSpellsMap.values());

            if (finalSpells.length > 0) {
                setSelectedTokenName(tokenName);
                setTokenSpells(finalSpells);
            } else {
                setTokenSpells([]);
                setSelectedTokenName(null);
            }
        };

        OBR.player.getSelection().then(updateTokenSpells);

        let playerTimeoutId: number;
        const unsubPlayer = OBR.player.onChange((player) => {
            clearTimeout(playerTimeoutId);
            playerTimeoutId = window.setTimeout(() => updateTokenSpells(player.selection || []), 100);
        });

        let itemTimeoutId: number;
        const unsubItems = OBR.scene.items.onChange(() => {
            if (currentSelection?.length === 1) {
                clearTimeout(itemTimeoutId);
                itemTimeoutId = window.setTimeout(() => updateTokenSpells(currentSelection), 200);
            }
        });

        return () => { clearTimeout(playerTimeoutId); clearTimeout(itemTimeoutId); unsubPlayer(); unsubItems(); };
    }, [obr.ready, isGM]);

    useEffect(() => {
        if (!obr.ready) return;
        const spellbookJSON = localStorage.getItem(`${playerMetadataSpellbookKey}/${OBR.room.id}`);
        const parsedJSON = safeJsonParse<any>(spellbookJSON, {});
        const migrated = verifyAndMigrateGroups(parsedJSON);
        if (migrated) _setGroups(migrated);
    }, [obr.ready, verifyAndMigrateGroups]);

    useEffect(() => {
        if (!obr.ready || !obr.player?.role) return;
        setIsGM(obr.player.role === "GM");
    }, [obr.ready, obr.player?.role]);

    useEffect(() => {
        if (!obr.ready || !obr.sceneReady) return;
        getAllSpellNames().then(setAllSpellIDs);
        return OBR.scene.onMetadataChange(() => getAllSpellNames().then(setAllSpellIDs));
    }, [obr.ready, obr.sceneReady]);

    if (tokenSpells.length > 0) {
        // ======== 實作動態篩選 ========
        const displayedSpells = tokenSpells.filter(s => {
            if (s.type !== tokenTab) return false;
            if (tokenTab === "action" && actionFilter !== "all") return s.subType === actionFilter;
            if (tokenTab === "spell" && spellFilter !== "all") return s.subType === spellFilter;
            return true;
        });

        return (
            <div className="spellbook-container px-2">
                <div className="flex items-center justify-between mb-4">
                    <h3 className="text-sm font-bold text-white truncate">
                        {selectedTokenName} 的動作與法術
                    </h3>
                    <button
                        onClick={clearTokenSpellbook}
                        className="px-3 py-1 text-[11px] font-bold rounded-full border border-panel-inactive text-gray-300 hover:bg-panel-inactive transition-colors outline-none shrink-0"
                    >
                        返回主法術書
                    </button>
                </div>

                {/* 動作與法術的大分類 Tab */}
                <div className="flex bg-panel-inactive p-1 rounded-lg mb-3 shadow-sm">
                    <button onClick={() => { playClickSound(); setTokenTab("action"); }} className={`flex-1 text-[13px] font-bold py-1.5 rounded-md transition-all outline-none ${tokenTab === "action" ? "bg-panel-active text-white shadow-sm" : "text-gray-400 hover:text-white"}`}>動作</button>
                    <button onClick={() => { playClickSound(); setTokenTab("spell"); }} className={`flex-1 text-[13px] font-bold py-1.5 rounded-md transition-all outline-none ${tokenTab === "spell" ? "bg-panel-active text-white shadow-sm" : "text-gray-400 hover:text-white"}`}>法術</button>
                </div>

                {/* 子分類下拉選單 */}
                <div className="mb-4">
                    {tokenTab === "action" ? (
                        <select value={actionFilter} onChange={(e) => setActionFilter(e.target.value)} className="w-full bg-panel-base text-white text-xs font-bold rounded-xl p-2.5 outline-none border border-transparent focus:border-panel-active shadow-inner appearance-none cursor-pointer">
                            <option value="all">所有動作</option>
                            <option value="action">主要動作</option>
                            <option value="bonus_action">附贈動作</option>
                            <option value="reaction">反應</option>
                            <option value="free_action">自由動作</option>
                            <option value="feature">職業特性</option>
                        </select>
                    ) : (
                        <select value={spellFilter} onChange={(e) => setSpellFilter(e.target.value)} className="w-full bg-panel-base text-white text-xs font-bold rounded-xl p-2.5 outline-none border border-transparent focus:border-panel-active shadow-inner appearance-none cursor-pointer">
                            <option value="all">所有環數</option>
                            <option value="0">戲法 (0環)</option>
                            {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(l => <option key={l} value={l.toString()}>第 {l} 環</option>)}
                        </select>
                    )}
                </div>

                <div className="grid grid-cols-2 gap-3">
                    {displayedSpells.length === 0 && (
                        <div className="col-span-2 text-center text-xs font-bold text-gray-500 py-6">
                            此分類下尚無任何項目。
                        </div>
                    )}
                    {displayedSpells.map((s, idx) => {
                        const spellDef = getSpell(s.embersId, isGM);
                        const thumbnail = spellDef?.thumbnail ? `${ASSET_LOCATION}/${spellDef.thumbnail}` : `${ASSET_LOCATION}/default.png`;
                        return (
                            <div
                                key={idx}
                                onClick={() => castTokenSpell(s)}
                                className={`cursor-pointer rounded-2xl overflow-hidden flex flex-col transition-all bg-panel-content shadow-sm hover:shadow-md hover:scale-[1.03] border border-transparent ${s.type === "action" ? "hover:border-red-500/50" : "hover:border-panel-active/50"}`}
                            >
                                <img src={thumbnail} alt={s.name} className="w-full h-16 object-cover" />
                                <div className="p-2 text-xs font-bold text-center text-white truncate bg-panel-content">
                                    {s.name}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        );
    }

    return (
        <div className="spellbook-container px-2">
            <div className="flex items-center justify-between mb-4">
                <input
                    ref={fileInputRef}
                    style={{ display: "none" }}
                    accept=".json"
                    type="file"
                    onChange={(event) => loadJSONFile(event, (json) => {
                        const migrated = verifyAndMigrateGroups(json);
                        if (migrated) setGroups(migrated);
                    })}
                />
                <h3 className="text-base font-black tracking-tight text-white">法術書</h3>
                <div className="flex items-center gap-1 bg-panel-content rounded-full p-1 shadow-sm">
                    {editing && (
                        <>
                            <button title="新增法術組" onClick={() => { setGroupName(""); setModalOpened("create-spell-group"); }} className="p-1.5 rounded-full text-gray-400 hover:text-panel-active transition-colors outline-none">
                                <FaCirclePlus className="w-3.5 h-3.5" />
                            </button>
                            <button title="匯入法術書" onClick={() => fileInputRef.current?.click()} className="p-1.5 rounded-full text-gray-400 hover:text-panel-active transition-colors outline-none">
                                <FaUpload className="w-3.5 h-3.5" />
                            </button>
                            <button title="下載法術書" onClick={() => downloadFileFromString(JSON.stringify(groups), "spellbook.json")} className="p-1.5 rounded-full text-gray-400 hover:text-panel-active transition-colors outline-none">
                                <FaDownload className="w-3.5 h-3.5" />
                            </button>
                        </>
                    )}
                    <button title={editing ? "儲存變更" : "編輯法術書"} onClick={() => { playClickSound(); setEditing(!editing); }} className={`p-1.5 rounded-full transition-colors outline-none ${editing ? "bg-panel-active text-white shadow-sm" : "text-gray-400 hover:text-white"}`}>
                        {editing ? <FaFloppyDisk className="w-3.5 h-3.5" /> : <FaPencil className="w-3.5 h-3.5" />}
                    </button>
                    <button title="開啟設定" onClick={() => { playClickSound(); setSettingsModalOpen(true); }} className="p-1.5 rounded-full text-gray-400 hover:text-white transition-colors outline-none">
                        <FaGear className="w-3.5 h-3.5" />
                    </button>
                </div>
            </div>

            <div className="flex flex-col gap-3">
                {Object.entries(groups).map(([gName, spells], index) => {
                    const isExpanded = expandedGroups[gName] !== false;
                    return (
                        <div key={index} className="flex flex-col bg-transparent">
                            <div className="flex items-center justify-between w-full py-1 mb-1 cursor-pointer" onClick={() => toggleGroup(gName)}>
                                <span className="font-bold text-sm text-gray-300">{gName}</span>
                                <div className="flex items-center gap-2">
                                    {editing && (
                                        <div className="flex items-center gap-1">
                                            <button title="新增法術至此組" onClick={(e) => { e.stopPropagation(); setGroupName(gName); setModalOpened("add-spell"); }} className="p-1 text-gray-400 hover:text-panel-active outline-none"><FaCirclePlus className="w-3 h-3" /></button>
                                            <button title="修改此組名稱" onClick={(e) => { e.stopPropagation(); setGroupName(gName); setNewGroupName(gName); setModalOpened("change-group-name"); }} className="p-1 text-gray-400 hover:text-panel-active outline-none"><FaPencil className="w-3 h-3" /></button>
                                            <button title="刪除此法術組" onClick={(e) => { e.stopPropagation(); if (spells.length === 0) { deleteSpellGroup(gName); } else { setGroupName(gName); setModalOpened("delete-spell-group"); } }} className="p-1 text-gray-400 hover:text-red-500 outline-none"><FaTrash className="w-3 h-3" /></button>
                                            {index !== 0 && <button title="向上移動" onClick={(e) => { e.stopPropagation(); moveSpellGroup(index, index - 1); }} className="p-1 text-gray-400 hover:text-panel-active outline-none"><FaCaretUp className="w-3 h-3" /></button>}
                                            {index !== Object.keys(groups).length - 1 && <button title="向下移動" onClick={(e) => { e.stopPropagation(); moveSpellGroup(index, index + 1); }} className="p-1 text-gray-400 hover:text-panel-active outline-none"><FaCaretDown className="w-3 h-3" /></button>}
                                        </div>
                                    )}
                                    {isExpanded ? <FaCaretUp className="text-gray-500 w-3 h-3" /> : <FaCaretDown className="text-gray-500 w-3 h-3" />}
                                </div>
                            </div>

                            {isExpanded && (
                                <div className="grid grid-cols-2 gap-3 mt-1">
                                    {spells.map((spellInstance) => {
                                        const spellDef = getSpell(spellInstance.baseSpellId, isGM);
                                        if (!spellDef) return null;
                                        const displayName = spellInstance.customName || spellDef.name || spellInstance.baseSpellId;

                                        return (
                                            <div
                                                key={spellInstance.instanceId}
                                                className="relative flex flex-col p-2.5 rounded-2xl bg-panel-content hover:bg-panel-inactive cursor-pointer shadow-sm border border-transparent hover:border-panel-active transition-colors group"
                                                onClick={() => editing ? null : castSpell(spellInstance)}
                                            >
                                                <div className="flex items-center gap-2.5 min-w-0">
                                                    <img
                                                        className="w-7 h-7 object-contain drop-shadow-sm shrink-0"
                                                        src={`${ASSET_LOCATION}/${spellDef.thumbnail}`}
                                                        alt=""
                                                    />
                                                    <span className="text-[13px] font-bold text-white truncate">
                                                        {displayName}
                                                    </span>
                                                </div>

                                                <div className="absolute right-2 top-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                    {!editing && (
                                                        <button
                                                            title="設定法術參數"
                                                            className="p-1 text-gray-400 hover:text-white bg-panel-base rounded-full outline-none transition-colors shadow-sm"
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                openSpellDetails(gName, spellInstance);
                                                            }}
                                                        >
                                                            <FaGear className="w-3 h-3" />
                                                        </button>
                                                    )}
                                                    {editing && (
                                                        <button
                                                            title="移除此法術"
                                                            className="p-1 text-gray-400 hover:text-red-500 bg-panel-base rounded-full outline-none transition-colors shadow-sm"
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                deleteSpellFromGroup(gName, spellInstance.instanceId);
                                                            }}
                                                        >
                                                            <FaTrash className="w-3 h-3" />
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>

            {Object.keys(groups).length < 1 && (
                <div className="text-center mt-10">
                    <span className="text-sm font-bold text-gray-500">未找到法術組。</span><br />
                    <button className="text-xs font-bold text-panel-active hover:text-white mt-2 outline-none" onClick={() => setModalOpened("create-spell-group")}>新增一個法術組</button>
                </div>
            )}

            {detailsModalOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
                    <div className="w-full max-w-[380px] max-h-[85vh] flex flex-col shadow-2xl rounded-[1.5rem] bg-panel-content overflow-hidden animate-in zoom-in-95 border border-panel-inactive">
                        <div className="flex-1 overflow-y-auto p-4 scroll-smooth">
                            <SpellDetails
                                spellInstance={selectedInstance?.instance || null}
                                isGM={isGM}
                                onUpdate={(updatedInstance) => {
                                    if (selectedInstance) {
                                        updateSpellInstance(selectedInstance.groupName, updatedInstance);
                                        setSelectedInstance({ ...selectedInstance, instance: updatedInstance });
                                    }
                                }}
                            />
                        </div>
                        <div className="flex-none bg-panel-inactive/30 border-t border-panel-base p-3 flex justify-end gap-2 px-4">
                            <button onClick={() => { playClickSound(); setDetailsModalOpen(false); }} className="px-4 py-1.5 rounded-full text-xs font-bold text-gray-400 hover:text-white transition-colors outline-none">
                                關閉
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {settingsModalOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
                    <div className="w-full max-w-[380px] max-h-[85vh] flex flex-col shadow-2xl rounded-[1.5rem] bg-panel-content overflow-hidden animate-in zoom-in-95 border border-panel-inactive">
                        <div className="flex-1 overflow-y-auto p-4 scroll-smooth">
                            <Settings />
                        </div>
                        <div className="flex-none bg-panel-inactive/30 border-t border-panel-base p-3 flex justify-end gap-2 px-4">
                            <button onClick={() => { playClickSound(); setSettingsModalOpen(false); }} className="px-5 py-1.5 rounded-full text-xs font-bold bg-panel-active text-white shadow-sm hover:opacity-80 transition-opacity outline-none border-none">
                                關閉設定
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {modalOpened === "create-spell-group" && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
                    <div className="w-full max-w-[300px] flex flex-col shadow-2xl rounded-2xl bg-panel-content p-5 animate-in zoom-in-95 border border-panel-inactive">
                        <h3 className="font-bold text-white mb-2">建立新法術組</h3>
                        <p className="text-xs text-gray-400 mb-4">請輸入此法術組的名稱：</p>
                        <input autoFocus type="text" value={groupName} onChange={(e) => setGroupName(e.target.value)} placeholder="法術組名稱" className="w-full bg-panel-base text-white text-sm rounded-xl p-2.5 outline-none mb-6 border border-transparent focus:border-panel-active transition-colors" />
                        <div className="flex justify-end gap-2">
                            <button onClick={closeModal} className="px-4 py-1.5 rounded-full text-xs font-bold text-gray-400 hover:text-white outline-none">取消</button>
                            <button onClick={() => confirmGroupName(groupName)} className="px-4 py-1.5 rounded-full text-xs font-bold bg-panel-active text-white outline-none">確認</button>
                        </div>
                    </div>
                </div>
            )}

            {modalOpened === "change-group-name" && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
                    <div className="w-full max-w-[300px] flex flex-col shadow-2xl rounded-2xl bg-panel-content p-5 animate-in zoom-in-95 border border-panel-inactive">
                        <h3 className="font-bold text-white mb-2">編輯法術組名稱</h3>
                        <p className="text-xs text-gray-400 mb-4">請輸入此法術組的新名稱：</p>
                        <input autoFocus type="text" value={newGroupName} onChange={(e) => setNewGroupName(e.target.value)} placeholder="法術組名稱" className="w-full bg-panel-base text-white text-sm rounded-xl p-2.5 outline-none mb-6 border border-transparent focus:border-panel-active transition-colors" />
                        <div className="flex justify-end gap-2">
                            <button onClick={closeModal} className="px-4 py-1.5 rounded-full text-xs font-bold text-gray-400 hover:text-white outline-none">取消</button>
                            <button onClick={() => editGroupName(groupName, newGroupName)} className="px-4 py-1.5 rounded-full text-xs font-bold bg-panel-active text-white outline-none">確認</button>
                        </div>
                    </div>
                </div>
            )}

            {modalOpened === "delete-spell-group" && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
                    <div className="w-full max-w-[300px] flex flex-col shadow-2xl rounded-2xl bg-panel-content p-5 animate-in zoom-in-95 border border-panel-inactive">
                        <h3 className="font-bold text-white mb-2">刪除法術組</h3>
                        <p className="text-xs text-gray-400 mb-6">確定要刪除此法術組嗎？</p>
                        <div className="flex justify-end gap-2">
                            <button onClick={closeModal} className="px-4 py-1.5 rounded-full text-xs font-bold text-gray-400 hover:text-white outline-none">取消</button>
                            <button onClick={() => deleteSpellGroup(groupName)} className="px-4 py-1.5 rounded-full text-xs font-bold bg-red-500 text-white outline-none">是的，刪除它</button>
                        </div>
                    </div>
                </div>
            )}

            {modalOpened === "add-spell" && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
                    <div className="w-full max-w-[300px] flex flex-col shadow-2xl rounded-2xl bg-panel-content p-5 animate-in zoom-in-95 border border-panel-inactive">
                        <h3 className="font-bold text-white mb-2">選擇要新增的基礎法術：</h3>
                        <div className="mb-6 mt-2">
                            <select value={selectedSpellID} onChange={(e) => setSelectedSpellID(e.target.value)} className="w-full bg-panel-base text-white text-sm rounded-xl p-2.5 outline-none appearance-none cursor-pointer border border-transparent focus:border-panel-active transition-colors">
                                <option disabled value="">選擇法術</option>
                                {allSpellIDs.sort((a, b) => a.localeCompare(b)).map((spellID) => {
                                    const spell = getSpell(spellID, isGM);
                                    if (!spell) return null;
                                    return <option key={spellID} value={spellID}>{spell.name}</option>;
                                })}
                            </select>
                        </div>
                        <div className="flex justify-end gap-2">
                            <button onClick={closeModal} className="px-4 py-1.5 rounded-full text-xs font-bold text-gray-400 hover:text-white outline-none">取消</button>
                            <button onClick={() => addSpellToGroup(groupName, selectedSpellID)} className="px-4 py-1.5 rounded-full text-xs font-bold bg-panel-active text-white outline-none">新增並設定</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}