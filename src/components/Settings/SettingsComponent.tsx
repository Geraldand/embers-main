import { Box, Button, Checkbox, Dialog, DialogContent, DialogTitle, Fade, Typography } from "@mui/material";
import OBR, { GridScale, Theme, isImage } from "@owlbear-rodeo/sdk";
import { useCallback, useEffect, useRef, useState } from "react";
import { getGlobalSettingsValue, getSettingsValue, GLOBAL_STORAGE_KEYS, GRID_UNIT_FACTORS, LOCAL_STORAGE_KEYS, setGlobalSettingsValue, setSettingsValue, SETTINGS_CHANNEL } from "./settings";
import { useOBR } from "../../react-obr/providers";
import { SimplifiedItem } from "../../types/misc";

type ModalType = "choose-caster-type";

function parseGridScale(raw: string): GridScale {
    const regexMatch = raw.match(/(\d*)(\.\d*)?([a-zA-Z]*)/);
    if (regexMatch) {
        const multiplier = parseFloat(regexMatch[1]);
        const digits = parseFloat(regexMatch[2]);
        const unit = regexMatch[3] || "";
        if (!isNaN(multiplier) && !isNaN(digits)) {
            return {
                raw,
                parsed: {
                    multiplier: multiplier + digits,
                    unit,
                    digits: regexMatch[2].length - 1
                }
            };
        }
        if (!isNaN(multiplier) && isNaN(digits)) {
            return { raw, parsed: { multiplier, unit, digits: 0 } };
        }
    }
    return { raw, parsed: { multiplier: 1, unit: "", digits: 0 } };
}

function tryComputeGridScaling(gridScale: GridScale | null) {
    if (gridScale == null) {
        return null;
    }
    const gridScaleFactor = gridScale.parsed.multiplier;
    const unitFactor = GRID_UNIT_FACTORS[gridScale.parsed.unit] ?? 1;
    return 5 / (gridScaleFactor * unitFactor);
}

export default function Settings() {
    const obr = useOBR();

    const [mostRecentSize, _setMostRecentSize] = useState<number | null>(null);
    const [gridScalingFactor, _setGridScalingFactor] = useState<number | null | undefined>(undefined);
    const [keepTargets, setKeepTargets] = useState<boolean | null>(null);
    const [playersCastSpells, setPlayersCastSpells] = useState<boolean | null>(null);
    const [summonedEntities, setSummonedEntities] = useState<string | null>(null);
    const [gridScale, setGridScale] = useState<GridScale | null>(null);
    const [defaultCaster, setDefaultCaster] = useState<SimplifiedItem[] | null>(null);
    const [animationRate, _setAnimationRate] = useState<number | null>(null);
    const [modalOpened, setModalOpened] = useState<ModalType | null>(null);
    const [theme, setTheme] = useState<Theme>();
    const mainDiv = useRef<HTMLDivElement>(null);

    const setMostRecentSize = useCallback((size: string) => {
        const recentSize = parseInt(size);
        if (isNaN(recentSize)) {
            _setMostRecentSize(null);
            return;
        }
        _setMostRecentSize(recentSize);
    }, []);

    const setGridScalingFactor = useCallback((factor: string) => {
        const scaleFactor = parseFloat(factor);
        if (isNaN(scaleFactor)) {
            _setGridScalingFactor(null);
            return;
        }
        _setGridScalingFactor(scaleFactor);
    }, []);

    const setAnimationRate = useCallback((rate: string) => {
        const intRate = parseInt(rate);
        if (isNaN(intRate)) {
            _setAnimationRate(null);
            return;
        }
        _setAnimationRate(intRate);
    }, []);

    const handleAssetPicker = useCallback(() => {
        OBR.assets.downloadImages(true).then(selection => {
            if (selection.length > 0) {
                setDefaultCaster(selection);
            }
        })
    }, []);

    const handleSetCasterFromSelection = useCallback(() => {
        OBR.player.getSelection().then(itemIDs => {
            OBR.scene.items.getItems(itemIDs).then(items => {
                const selection = items.filter(item => isImage(item));
                if (selection.length > 0) {
                    setDefaultCaster(selection.map(selected => ({ ...selected, type: "CHARACTER" })));
                }
            })
        });
    }, []);

    const reloadSettings = useCallback(() => {
        _setMostRecentSize(getSettingsValue(LOCAL_STORAGE_KEYS.MOST_RECENT_SPELLS_LIST_SIZE));
        _setGridScalingFactor(getSettingsValue(LOCAL_STORAGE_KEYS.GRID_SCALING_FACTOR));
        _setAnimationRate(getSettingsValue(LOCAL_STORAGE_KEYS.ANIMATION_UPDATE_RATE));
        setKeepTargets(getSettingsValue(LOCAL_STORAGE_KEYS.KEEP_SELECTED_TARGETS));
        setDefaultCaster(getSettingsValue(LOCAL_STORAGE_KEYS.DEFAULT_CASTER));
    }, []);

    const closeModal = () => {
        setModalOpened(null);
    };

    useEffect(() => {
        if (!obr.ready) {
            return;
        }

        OBR.theme.getTheme().then(theme => setTheme(theme));
        return OBR.theme.onChange(theme => setTheme(theme));
    }, [obr.ready]);

    useEffect(() => {
        reloadSettings();
    }, [reloadSettings]);

    useEffect(() => {
        if (!obr.ready || !obr.sceneReady) {
            return;
        }
        getGlobalSettingsValue(GLOBAL_STORAGE_KEYS.PLAYERS_CAN_CAST_SPELLS).then(value => setPlayersCastSpells(value as boolean));
        getGlobalSettingsValue(GLOBAL_STORAGE_KEYS.SUMMONED_ENTITIES_RULE).then(value => setSummonedEntities(value as string));
    }, [obr.ready, obr.sceneReady]);

    useEffect(() => {
        if (!obr.ready || !obr.sceneReady) {
            return;
        }
        const handler = OBR.scene.grid.onChange(grid => {
            const parsedGridScale = parseGridScale(grid.scale);
            setGridScale(parsedGridScale);
        });
        OBR.scene.grid.getScale().then(scale => setGridScale(scale));

        return handler;
    }, [obr.ready, obr.sceneReady]);

    useEffect(() => {
        if (!obr.ready || !obr.sceneReady) {
            return;
        }

        return OBR.broadcast.onMessage(SETTINGS_CHANNEL, () => {
            reloadSettings();
        });
    }, [obr.ready, obr.sceneReady, reloadSettings]);

    useEffect(() => {
        if (mostRecentSize == null) {
            return;
        }
        if (isNaN(mostRecentSize) || mostRecentSize <= 0) {
            setSettingsValue(LOCAL_STORAGE_KEYS.MOST_RECENT_SPELLS_LIST_SIZE, null);
            return;
        }
        setSettingsValue(LOCAL_STORAGE_KEYS.MOST_RECENT_SPELLS_LIST_SIZE, mostRecentSize);
    }, [mostRecentSize]);

    useEffect(() => {
        if (gridScalingFactor === undefined) return;
         if (gridScalingFactor == null || isNaN(gridScalingFactor) || gridScalingFactor <= 0) {
            setSettingsValue(LOCAL_STORAGE_KEYS.GRID_SCALING_FACTOR, null);
            return;
        }
        setSettingsValue(LOCAL_STORAGE_KEYS.GRID_SCALING_FACTOR, gridScalingFactor);
    }, [gridScalingFactor]);

    useEffect(() => {
        if (keepTargets == null) {
            return;
        }
        setSettingsValue(LOCAL_STORAGE_KEYS.KEEP_SELECTED_TARGETS, keepTargets);
    }, [keepTargets]);

    useEffect(() => {
        if (defaultCaster == null) {
            return;
        }
        setSettingsValue(LOCAL_STORAGE_KEYS.DEFAULT_CASTER, defaultCaster);
    }, [defaultCaster]);

    useEffect(() => {
        if (animationRate == null) {
            return;
        }
        if (isNaN(animationRate) || animationRate <= 0) {
            setSettingsValue(LOCAL_STORAGE_KEYS.ANIMATION_UPDATE_RATE, null);
            return;
        }
        setSettingsValue(LOCAL_STORAGE_KEYS.ANIMATION_UPDATE_RATE, animationRate);
    }, [animationRate]);

    useEffect(() => {
        if (playersCastSpells == null) {
            return;
        }
        setGlobalSettingsValue(GLOBAL_STORAGE_KEYS.PLAYERS_CAN_CAST_SPELLS, playersCastSpells);
    }, [playersCastSpells]);

    useEffect(() => {
        if (summonedEntities == null) {
            return;
        }
        setGlobalSettingsValue(GLOBAL_STORAGE_KEYS.SUMMONED_ENTITIES_RULE, summonedEntities);
    }, [summonedEntities]);

    return <div ref={mainDiv}>
        <Typography
            mb={"0.5rem"}
            variant="h6"
            className="title spellbook-options"
        >
            設定
        </Typography>
        <div className="settings-menu">
            <div>
                <p className="subtitle" title="這些設定僅適用於您個人。">本地端設定</p>
                <div className="settings-item" title="設定後，部分法術的第一個目標將自動選擇此代幣。">
                    <label>
                        <p>預設施法者</p>
                    </label>
                    <div style={{ maxWidth: "15rem" }}>
                        <Button
                            onClick={() => setModalOpened("choose-caster-type")}
                            variant="outlined"
                            color="primary"
                        >
                            {
                                (defaultCaster == null || defaultCaster.length == 0) ?
                                    "請選擇" :
                                    defaultCaster.map(image => image.name).join(", ")
                            }
                        </Button>
                    </div>
                </div>
                <div className="settings-item">
                    <label htmlFor="grid-scaling-factor" title="特效的縮放比例，法術的寬度與高度將乘上此數值。">
                        <p>網格縮放比例</p>
                    </label>
                    <input
                        name="grid-scaling-factor"
                        min="0"
                        step="0.1"
                        type="number"
                        placeholder={(tryComputeGridScaling(gridScale) ?? 1).toString()}
                        className="settings-input"
                        value={gridScalingFactor ?? ""}
                        onChange={event => setGridScalingFactor(event.target.value)}
                    />
                </div>
                <div className="settings-item" title="施法後或取消選取工具後，是否保留已選擇的目標。">
                    <label htmlFor="keep-selected-targets">
                        <p>保留已選目標</p>
                    </label>
                    <Checkbox checked={keepTargets ?? false} onChange={(event) => { setKeepTargets(event.currentTarget.checked) }} />
                </div>
                <div className="settings-item">
                    <label htmlFor="recent-spells-list-size" title="最近法術清單的顯示數量。">
                        <p>最近法術清單大小</p>
                    </label>
                    <input
                        name="recent-spells-list-size"
                        min="0"
                        type="number"
                        className="settings-input"
                        value={mostRecentSize ?? ""}
                        onChange={event => setMostRecentSize(event.target.value)}
                    />
                </div>
                <div className="settings-item">
                    <label htmlFor="animation-update-rate" title="動畫物品時每秒的更新次數。">
                        <p>動畫更新頻率</p>
                    </label>
                    <input
                        name="animation-update-rate"
                        min="0"
                        type="number"
                        className="settings-input"
                        value={animationRate ?? ""}
                        onChange={event => setAnimationRate(event.target.value)}
                    />
                </div>
            </div>
            {
                obr.player?.role === "GM" && <>
                    <hr style={{ margin: "0.5rem 0" }}></hr>
                    <div>
                        <p className="subtitle" title="這些設定適用於所有玩家，且僅能由遊戲主持者修改。">遊戲主持者設定</p>
                        <div className="settings-item">
                            <label htmlFor="players-cast-spells" title="若取消勾選，則僅有遊戲主持者可以施法。">
                                <p>允許玩家施法</p>
                            </label>
                            <Checkbox checked={playersCastSpells ?? false} onChange={(event) => { setPlayersCastSpells(event.currentTarget.checked) }} />
                        </div>
                        <div className="settings-item" title={"設定由誰擁有召喚物。「施法者」代表由施放該法術的玩家擁有，而「僅限遊戲主持者」代表無論誰施法，都由主持者擁有。"}>
                            <label htmlFor="summoned-entities-rule">
                                <p>召喚物所有權規則</p>
                            </label>
                            <select className="settings-select" onChange={event => setSummonedEntities(event.target.value)} value={summonedEntities ?? ""} >
                                <option value="gm-only">僅限遊戲主持者</option>
                                <option value="caster">施法者</option>
                            </select>
                        </div>
                    </div>
                </>
            }
        </div>
        <Dialog
            open={modalOpened === "choose-caster-type"}
            onClose={closeModal}
            slots={{ transition: Fade }}
            slotProps={{ transition: { timeout: 300 }, paper: { sx: { backgroundColor: theme?.background?.paper } } }}
            fullWidth
            maxWidth="sm"
        >
            <DialogTitle>
                設定預設施法者
            </DialogTitle>

            <DialogContent>
                <Typography variant="body1" gutterBottom>
                    請選擇一或多個資源，或點擊 <strong>使用當前選取</strong> 以套用您目前在場景中選取的代幣。
                </Typography>

                <Typography variant="body1">
                    <strong>已選擇</strong>：
                    {defaultCaster == null || defaultCaster.length === 0
                        ? "無"
                        : defaultCaster.map((image) => image.name).join(", ")}
                </Typography>
            </DialogContent>

            <Box sx={{ alignItems: "center", padding: "2rem", display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                <Button
                    onClick={() => { handleAssetPicker(); closeModal(); }}
                    variant="outlined"
                    color="primary"
                >
                    開啟資源
                </Button>
                <Button
                    onClick={() => { handleSetCasterFromSelection(); closeModal(); }}
                    variant="outlined"
                    color="primary"
                >
                    使用當前選取
                </Button>
                <Button
                    onClick={() => { setDefaultCaster([]); closeModal(); }}
                    variant="outlined"
                    color="primary"
                >
                    清除選取
                </Button>
            </Box>
        </Dialog>
    </div>;
}
