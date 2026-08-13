import "./Main.css";

import { Box, Button, Tab, Tabs, Typography } from "@mui/material";
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

import { SplashScreen } from "../components/SplashScreen";

// 🌟 保留你原本在 Main.tsx 裡的音效函式
function playClickSound() {
    try { const audio = new Audio('/click.mp3'); audio.volume = 0.15; audio.play().catch(() => { }); } catch (e) { }
}

const MENU_OPTIONS = [
    { label: "Spellbook", icon: <FaBook className="tab-icon" />, component: <SpellBook />, role: "PLAYER" },
    { label: "Current Spell", icon: <FaHatWizard className="tab-icon" />, component: <SpellDetails />, role: "PLAYER" },
    { label: "Custom Spells", icon: <FaPlus className="tab-icon" />, component: <CustomSpells />, role: "GM" },
    { label: "Scene", icon: <FaDisplay className="tab-icon" />, component: <SceneControls />, role: "PLAYER" },
    { label: "Settings", icon: <FaGear className="tab-icon" />, component: <Settings />, role: "PLAYER" },
];

const SPELL_DETAIL_TAB = 1;

export default function Main() {
    const obr = useOBR();
    const [selectedTab, setSelectedTab] = useState(0);
    const [isGM, setIsGM] = useState(false);
    const [role, setRole] = useState<"GM" | "PLAYER" | null>(null);

    const [isAudioUnlocked, setIsAudioUnlocked] = useState(false);
    const [showSplash, setShowSplash] = useState(true);

    useEffect(() => {
        if (!obr.ready || !obr.player?.role) {
            return;
        }
        const currentRole = obr.player.role as "GM" | "PLAYER";
        setRole(currentRole);
        setIsGM(currentRole === "GM");
    }, [obr.ready, obr.player?.role]);

    // 1. 顯示前情提要畫面
    if (showSplash) {
        return (
            <SplashScreen
                role={role}
                isViewingAgain={isAudioUnlocked}
                onReady={() => {
                    setIsAudioUnlocked(true);
                    setShowSplash(false);
                }}
            />
        );
    }

    // 2. 玩家待命畫面
    if (role === "PLAYER") {
        return (
            <Box
                sx={{
                    height: "100vh",
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "center",
                    alignItems: "center",
                    backgroundColor: "#111827",
                    color: "#9ca3af",
                    textAlign: "center",
                    p: 3,
                    boxSizing: "border-box",
                }}
            >
                <Typography sx={{ fontSize: "3.5rem", mb: 1, animation: "pulse 2s infinite" }}>
                    🔥
                </Typography>
                <Typography variant="h6" fontWeight="bold" sx={{ color: "#f3f4f6", mb: 0.5 }}>
                    已準備就緒！
                </Typography>
                <Typography variant="body2" sx={{ mb: 3 }}>
                    你的 DM 正在偷偷凝聚火球術...
                </Typography>

                <Button
                    variant="outlined"
                    color="info"
                    size="small"
                    startIcon={<FaBook />}
                    onClick={() => {
                        playClickSound(); // 🌟 播放音效
                        setShowSplash(true);
                    }}
                    sx={{ borderRadius: 2 }}
                >
                    重看前情提要
                </Button>
            </Box>
        );
    }

    // 3. GM 介面
    return (
        <Box sx={{ minHeight: "100vh", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
            <Box sx={{ flexGrow: 1 }}>
                <Tabs
                    value={selectedTab}
                    sx={{ width: "100%", "& .MuiTabs-flexContainer": { justifyContent: "space-between", px: 2 }, pt: 2 }}
                    onChange={(_, value) => {
                        playClickSound();
                        setSelectedTab(value);
                    }}
                >
                    {MENU_OPTIONS.map((option, index) => {
                        if (option.role == "GM" && !isGM) return;
                        return <Tab key={index + "-option"} value={index} icon={option.icon} iconPosition="start" sx={{ minWidth: "2rem", minHeight: 0, p: 2.5 }} />;
                    })}
                </Tabs>
                <Box sx={{ p: 1.5, overflow: "auto", height: selectedTab === 0 ? "calc(100vh - 7.5rem)" : "calc(100vh - 4rem)", scrollbarWidth: "none", "&::-webkit-scrollbar": { display: "none" } }}>
                    {MENU_OPTIONS[selectedTab].component}
                </Box>
            </Box>

            {selectedTab === 0 && (
                <Box sx={{ overflow: "hidden" }}>
                    <SpellBanner onButtonClick={() => setSelectedTab(SPELL_DETAIL_TAB)} />
                </Box>
            )}
            <MovementHandler />
        </Box>
    );
}