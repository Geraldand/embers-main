import "./Main.css";

import { Box, Tab, Tabs } from "@mui/material";
import {
    FaBook,
    FaDisplay,
    FaGear,
    FaHatWizard,
    FaPlus,
} from "react-icons/fa6";
import OBR from "@owlbear-rodeo/sdk";
import { useEffect, useState } from "react";

import CustomSpells from "../components/CustomSpells";
import MovementHandler from "../components/MovementHandler";
import SceneControls from "../components/SceneControls";
import Settings from "../components/Settings";
import SpellBanner from "../components/SpellDetails/SpellBanner";
import SpellBook from "../components/SpellBook";
import SpellDetails from "../components/SpellDetails";
import { useOBR } from "../react-obr/providers";

function playClickSound() {
    try { const audio = new Audio('/click.mp3'); audio.volume = 0.15; audio.play().catch(() => { }); } catch (e) { }
}
const MENU_OPTIONS = [
    {
        label: "Spellbook",
        icon: <FaBook className="tab-icon" />,
        component: <SpellBook />,
        role: "PLAYER",
    },
    {
        label: "Current Spell",
        icon: <FaHatWizard className="tab-icon" />,
        component: <SpellDetails />,
        role: "PLAYER",
    },
    {
        label: "Custom Spells",
        icon: <FaPlus className="tab-icon" />,
        component: <CustomSpells />,
        role: "GM",
    },
    {
        label: "Scene",
        icon: <FaDisplay className="tab-icon" />,
        component: <SceneControls />,
        role: "PLAYER",
    },
    {
        label: "Settings",
        icon: <FaGear className="tab-icon" />,
        component: <Settings />,
        role: "PLAYER",
    },
];

const SPELL_DETAIL_TAB = 1;

export default function Main() {
    const obr = useOBR();
    const [selectedTab, setSelectedTab] = useState(0);
    const [isGM, setIsGM] = useState(false);
    const [role, setRole] = useState<"GM" | "PLAYER" | null>(null);

    useEffect(() => {
        if (!obr.ready || !obr.player?.role) {
            return;
        }

        // 🚀 修復 1：補上 setRole，確保能正確辨識 PLAYER 身分
        const currentRole = obr.player.role as "GM" | "PLAYER";
        setRole(currentRole);
        setIsGM(currentRole === "GM");
    }, [obr.ready, obr.player?.role]);

    // 🚀 修復 2：已移除原本的 OBR.tool.onToolChange 自動跳轉邏輯，防止切換工具時跳轉至 Current Spell

    // 🛡️ 玩家權限攔截：PLAYER 只能看到提示畫面
    if (role === "PLAYER") {
        return (
            <div style={{ height: "100vh", display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", backgroundColor: "#111827", color: "#9ca3af", textAlign: "center", padding: "2rem" }}>
                <div style={{ fontSize: "4rem", marginBottom: "1rem", animation: "pulse 2s infinite" }}>🔥</div>
                <h2 style={{ fontSize: "1.5rem", fontWeight: "bold", color: "#f3f4f6", margin: "0 0 0.5rem 0" }}>你的 DM 正在偷偷凝聚火球術...</h2>
                <p style={{ fontSize: "1rem", margin: 0 }}>做好準備</p>
            </div>
        );
    }

    return (
        <Box
            sx={{
                minHeight: "100vh",
                display: "flex",
                flexDirection: "column",
                justifyContent: "space-between",
            }}
        >
            <Box sx={{ flexGrow: 1 }}>
                <Tabs
                    value={selectedTab}
                    sx={{
                        width: "100%",
                        "& .MuiTabs-flexContainer": {
                            justifyContent: "space-between",
                            px: 2,
                        },
                        pt: 2,
                    }}
                    // 👇 2. 修改這裡的 onChange 👇
                    onChange={(_, value) => {
                        playClickSound(); // 切換分頁時播放音效
                        setSelectedTab(value);
                    }}
                >
                    {MENU_OPTIONS.map((option, index) => {
                        if (option.role == "GM" && !isGM) return;
                        return (
                            <Tab
                                key={index + "-option"}
                                value={index}
                                icon={option.icon}
                                iconPosition="start"
                                sx={{
                                    minWidth: "2rem",
                                    minHeight: 0,
                                    p: 2.5,
                                }}
                            />
                        );
                    })}
                </Tabs>
                <Box
                    sx={{
                        p: 1.5,
                        overflow: "auto",
                        height:
                            selectedTab === 0
                                ? "calc(100vh - 7.5rem)"
                                : "calc(100vh - 4rem)",
                        scrollbarWidth: "none",
                        "&::-webkit-scrollbar": {
                            display: "none",
                        },
                    }}
                >
                    {MENU_OPTIONS[selectedTab].component}
                </Box>
            </Box>

            {selectedTab === 0 && (
                <Box sx={{ overflow: "hidden" }}>
                    <SpellBanner
                        onButtonClick={() => {
                            setSelectedTab(SPELL_DETAIL_TAB);
                        }}
                    />
                </Box>
            )}
            <MovementHandler />
        </Box>
    );
}