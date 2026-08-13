import React, { useEffect, useState } from "react";
import OBR from "@owlbear-rodeo/sdk";
import { Box, Button, TextField, Typography, Paper } from "@mui/material";
import { FaPen } from "react-icons/fa6";

const SPLASH_METADATA_KEY = "embers-custom/splash-screen";

function playClickSound() {
    try { 
        const audio = new Audio('/click.mp3'); 
        audio.volume = 0.15; 
        audio.play().catch(() => { }); 
    } catch (e) { }
}

export const SplashScreen = ({
    role,
    onReady,
    isViewingAgain = false,
}: {
    role: "GM" | "PLAYER" | null;
    onReady: () => void;
    isViewingAgain?: boolean;
}) => {
    const [title, setTitle] = useState("歡迎來到本週的冒險！");
    const [content, setContent] = useState("前情提要：\n上回我們說到...");
    const [isEditing, setIsEditing] = useState(false);

    useEffect(() => {
        return OBR.onReady(() => {
            // 讀取房間內的前情提要文字
            OBR.room.getMetadata().then((metadata) => {
                const splashData = metadata[SPLASH_METADATA_KEY] as any;
                if (splashData) {
                    if (splashData.title !== undefined) setTitle(splashData.title);
                    if (splashData.content !== undefined) setContent(splashData.content);
                }
            });

            // 監聽 DM 即時修改
            OBR.room.onMetadataChange((metadata) => {
                const splashData = metadata[SPLASH_METADATA_KEY] as any;
                if (splashData) {
                    if (splashData.title !== undefined) setTitle(splashData.title);
                    if (splashData.content !== undefined) setContent(splashData.content);
                }
            });
        });
    }, []);

    const handleSave = () => {
        playClickSound();
        OBR.room.setMetadata({
            [SPLASH_METADATA_KEY]: { title, content },
        });
        setIsEditing(false);
    };

    // ⚙️ DM 編輯模式
    if (role === "GM" && isEditing) {
        return (
            <Box sx={{ height: "100vh", width: "100%", display: "flex", flexDirection: "column", p: 2, bgcolor: "background.paper", boxSizing: "border-box", overflow: "hidden" }}>
                <Typography variant="h6" fontWeight="bold" sx={{ mb: 1.5, flexShrink: 0 }}>⚙️ 編輯前情提要</Typography>
                <TextField label="標題" size="small" variant="outlined" fullWidth value={title} onChange={(e) => setTitle(e.target.value)} sx={{ mb: 1.5, flexShrink: 0 }} />
                <TextField label="內文" variant="outlined" fullWidth multiline value={content} onChange={(e) => setContent(e.target.value)} sx={{ flexGrow: 1, minHeight: 0, mb: 1.5, "& .MuiInputBase-root": { height: "100%", alignItems: "flex-start" }, "& .MuiInputBase-input": { height: "100% !important", overflowY: "auto !important" } }} />
                <Box sx={{ display: "flex", gap: 1, flexShrink: 0 }}>
                    <Button variant="contained" color="success" fullWidth onClick={handleSave}>儲存並發布</Button>
                    <Button variant="outlined" color="inherit" fullWidth onClick={() => { playClickSound(); setIsEditing(false); }}>取消</Button>
                </Box>
            </Box>
        );
    }

    // 📖 玩家觀看 / DM 預覽模式
    return (
        <Box sx={{ height: "100vh", width: "100%", display: "flex", flexDirection: "column", p: 2, bgcolor: "background.default", boxSizing: "border-box", overflow: "hidden", position: "relative" }}>
            <Box sx={{ flexShrink: 0, textAlign: "center", mb: 1.5 }}>
                {role === "GM" && (
                    <Box sx={{ display: "flex", justifyContent: "flex-end", mb: 0.5 }}>
                        <Button size="small" variant="outlined" color="warning" startIcon={<FaPen />} onClick={() => { playClickSound(); setIsEditing(true); }} sx={{ py: 0.2, px: 1, fontSize: "0.75rem" }}>編輯文字</Button>
                    </Box>
                )}
                <Typography sx={{ fontSize: "2rem", lineHeight: 1 }}>📖</Typography>
                <Typography variant="h6" fontWeight="bold" sx={{ mt: 0.5, color: "text.primary", borderBottom: 2, borderColor: "primary.main", pb: 0.8, wordBreak: "break-word", overflowWrap: "anywhere" }}>
                    {title}
                </Typography>
            </Box>

            <Paper elevation={1} sx={{ flexGrow: 1, minHeight: 0, overflowY: "auto", p: 1.5, mb: 2, bgcolor: "background.paper", borderRadius: 1.5, "&::-webkit-scrollbar": { width: "6px" }, "&::-webkit-scrollbar-thumb": { backgroundColor: "rgba(255,255,255,0.2)", borderRadius: "3px" } }}>
                <Typography variant="body2" sx={{ whiteSpace: "pre-wrap", wordBreak: "break-word", overflowWrap: "anywhere", lineHeight: 1.6, color: "text.secondary", fontSize: "0.95rem" }}>
                    {content}
                </Typography>
            </Paper>

            <Button variant="contained" color="primary" size="medium" fullWidth onClick={() => { playClickSound(); onReady(); }} sx={{ py: 1, fontSize: "0.95rem", fontWeight: "bold", borderRadius: 1.5, flexShrink: 0, boxShadow: 1 }}>
                {role === "GM" ? "進入 DM 介面" : isViewingAgain ? "返回待命畫面" : "我準備好了！"}
            </Button>
        </Box>
    );
};