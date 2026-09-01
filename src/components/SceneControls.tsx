import "./SceneControls.css";

import {
    FaArrowPointer,
    FaEye,
    FaEyeSlash,
    FaLink,
    FaLinkSlash,
    FaSquareMinus,
} from "react-icons/fa6";
import OBR, { Item, Player } from "@owlbear-rodeo/sdk";
import { destroySpell, getSpell } from "../effects/spells";
import { effectMetadataKey, spellMetadataKey } from "../effects/effects";
import { useCallback, useEffect, useMemo, useState } from "react";

import { MessageType } from "../types/messageListener";
import { Spell } from "../types/spells";
import { useOBR } from "../react-obr/providers";
import { Typography } from "@mui/material";

function SpellDisplay({
    spellID,
    effectID,
    item,
    caster,
}: {
    spellID?: string;
    effectID?: string;
    item: Item;
    caster: Player;
}) {
    const obr = useOBR();
    const [spell, setSpell] = useState<Spell>();
    const [attachedToName, setAttachedToName] = useState<string>();
    const [isGM, setIsGM] = useState<boolean>(false);

    const selectItem = useCallback(() => {
        OBR.player.select([item.id], false);
    }, [item]);

    const toggleItemVisibility = useCallback(() => {
        OBR.scene.items.updateItems([item], (items) => {
            for (const itemDraft of items) {
                itemDraft.visible = !item.visible;
            }
        });
    }, [item]);

    const toggleItemDisableHit = useCallback(() => {
        OBR.scene.items.updateItems([item], (items) => {
            for (const itemDraft of items) {
                itemDraft.disableHit = !item.disableHit;
            }
        });
    }, [item]);

    const deleteItem = useCallback(() => {
        if (
            spellID != undefined &&
            spell?.onDestroyBlueprints &&
            spell.onDestroyBlueprints.length > 0
        ) {
            destroySpell(spellID, caster.id, [item]);
        }
        OBR.scene.items.deleteItems([item.id]);
    }, [item, spellID, spell?.onDestroyBlueprints, caster.id]);

    useEffect(() => {
        if (!obr.ready || !obr.player?.role) {
            return;
        }
        if (obr.player.role != "GM" && isGM) {
            setIsGM(false);
        } else if (obr.player.role == "GM" && !isGM) {
            setIsGM(true);
        }
    }, [obr.ready, obr.player?.role, isGM]);

    useEffect(() => {
        if (spellID == undefined) {
            return;
        }
        setSpell(getSpell(spellID, isGM));
    }, [spellID, isGM]);

    useEffect(() => {
        if (item.attachedTo != undefined) {
            OBR.scene.items
                .getItems([item.attachedTo])
                .then((item) => setAttachedToName(item[0]?.name));
        }
    }, [item.attachedTo]);

    // 即使找不到法術詳細定義，也顯示備用名稱，確保不會在列表中被隱藏
    const displayName = spell?.name || spellID || item.name || "持續型法術";

    return (
        <div className="scene-spell-display-item">
            <p
                title={`法術名稱：${
                    displayName
                }\n特效 ID：${effectID}\n附加於：${
                    attachedToName ?? "無"
                }\n施法者：${caster.name}`}
            >
                {" "}
                {displayName}
            </p>
            <div className="scene-spell-display-controls">
                <div
                    className="scene-spell-display-control-button"
                    onClick={selectItem}
                    title="選取此特效"
                >
                    <FaArrowPointer />
                </div>
                <div
                    className="scene-spell-display-control-button"
                    onClick={toggleItemDisableHit}
                    title={item.disableHit ? "允許選取" : "禁止選取"}
                >
                    {item.disableHit ? <FaLinkSlash /> : <FaLink />}
                </div>
                <div
                    className="scene-spell-display-control-button"
                    onClick={toggleItemVisibility}
                    title={item.visible ? "隱藏特效" : "顯示特效"}
                >
                    {item.visible ? <FaEye /> : <FaEyeSlash />}
                </div>
                <div
                    className="scene-spell-display-control-button"
                    onClick={deleteItem}
                    title="刪除此特效"
                >
                    <FaSquareMinus />
                </div>
            </div>
        </div>
    );
}

export default function SceneControls() {
    const obr = useOBR();
    const [party, setParty] = useState<Player[]>([]);
    const [player, setPlayer] = useState<Player | null>(null);
    const [globalSpellItems, _setGlobalSpellItems] = useState<Item[]>([]);

    const spellEffectsPresent = useMemo(() => {
        const playerIDs = [player, ...party]
            .map((player) => player?.id)
            .filter((player) => player != undefined);
        for (const item of globalSpellItems) {
            const caster = (
                item.metadata[spellMetadataKey] as MessageType["spellData"]
            )?.caster;
            if (caster != undefined && playerIDs.includes(caster)) {
                return true;
            }
        }
        return false;
    }, [player, party, globalSpellItems]);

    const setGlobalSpellItems = useCallback(
        (items: Item[]) =>
            _setGlobalSpellItems(
                items.filter(
                    (item) =>
                        item.metadata[effectMetadataKey] != undefined ||
                        item.metadata[spellMetadataKey] != undefined
                )
            ),
        []
    );

    const PlayerEffects = useCallback(
        ({ player }: { player: Player }) => {
            const playerItems = globalSpellItems.filter(
                (item) =>
                    (
                        item.metadata[
                            spellMetadataKey
                        ] as MessageType["spellData"]
                    )?.caster === player.id &&
                    (
                        item.metadata[
                            spellMetadataKey
                        ] as MessageType["spellData"]
                    )?.name != undefined
            );

            if (playerItems.length === 0) {
                return null;
            }

            return (
                <div>
                    <p className="bold">{player.name}</p>
                    <ul className="scene-spell-list">
                        {playerItems.map((item) => (
                            <SpellDisplay
                                key={item.id}
                                spellID={
                                    (
                                        item.metadata[
                                            spellMetadataKey
                                        ] as MessageType["spellData"]
                                    )?.name
                                }
                                effectID={
                                    item.metadata[effectMetadataKey] as string
                                }
                                item={item}
                                caster={player}
                            />
                        ))}
                    </ul>
                </div>
            );
        },
        [globalSpellItems]
    );

    useEffect(() => {
        if (!obr.ready || !obr.sceneReady || obr.player?.role !== "GM") {
            setParty([]);
            return;
        }
        setParty(obr.party);
    }, [obr.ready, obr.sceneReady, obr.party, obr.player?.role]);

    useEffect(() => {
        if (!obr.ready || !obr.sceneReady) {
            setPlayer(null);
            return;
        }
        setPlayer(obr.player);
    }, [obr.ready, obr.sceneReady, obr.player]);

    useEffect(() => {
        if (!obr.ready || !obr.sceneReady) {
            return;
        }

        // 效能優化：Active Effects 列表降低更新頻率 (每 500ms 最多更新一次)
        let timeoutId: number;
        const unmountGlobal = OBR.scene.items.onChange((items) => {
            clearTimeout(timeoutId);
            timeoutId = window.setTimeout(() => {
                setGlobalSpellItems(items);
            }, 500);
        });

        OBR.scene.items.getItems().then((globalItems) => {
            setGlobalSpellItems(globalItems);
        });

        return () => {
            clearTimeout(timeoutId);
            unmountGlobal();
        };
    }, [obr.ready, obr.sceneReady, setGlobalSpellItems]);

    return (
        <div>
            {player ? (
                <>
                    <Typography variant="h6" className="subtitle">
                        運行中的法術
                    </Typography>
                    {[player, ...party].map((player) => (
                        <PlayerEffects key={player.id} player={player} />
                    ))}
                    {!spellEffectsPresent && (
                        <p>此場景中沒有運行中的法術特效。</p>
                    )}
                </>
            ) : (
                <p>未選擇場景。</p>
            )}
        </div>
    );
}
