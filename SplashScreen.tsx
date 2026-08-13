import React, { useEffect, useState } from "react";
import OBR from "@owlbear-rodeo/sdk";

// 定義存在房間 Metadata 中的資料格式與 Key
const SPLASH_METADATA_KEY = "embers-custom/splash-screen";

export const SplashScreen = ({ onReady }: { onReady: () => void }) => {
    const [role, setRole] = useState<string>("PLAYER");
    const [title, setTitle] = useState("歡迎來到本週的冒險！");
    const [content, setContent] = useState("前情提要：\n上回我們說到...");
    const [isEditing, setIsEditing] = useState(false);
    const [hasInteracted, setHasInteracted] = useState(false);

    useEffect(() => {
        if (OBR.isReady) {
            // 獲取當前使用者身分 (GM 或 PLAYER)
            OBR.player.getRole().then((currentRole) => {
                setRole(currentRole);
            });

            // 讀取房間內儲存的標題與內文
            OBR.room.getMetadata().then((metadata) => {
                const splashData = metadata[SPLASH_METADATA_KEY] as any;
                if (splashData) {
                    if (splashData.title) setTitle(splashData.title);
                    if (splashData.content) setContent(splashData.content);
                }
            });

            // 監聽 DM 是否有即時修改文字，讓玩家畫面跟著變
            OBR.room.onMetadataChange((metadata) => {
                const splashData = metadata[SPLASH_METADATA_KEY] as any;
                if (splashData) {
                    if (splashData.title) setTitle(splashData.title);
                    if (splashData.content) setContent(splashData.content);
                }
            });
        }
    }, []);

    // DM 儲存文字的函數
    const handleSave = () => {
        OBR.room.setMetadata({
            [SPLASH_METADATA_KEY]: { title, content }
        });
        setIsEditing(false);
    };

    // 玩家或 DM 按下準備好的函數
    const handleReady = () => {
        setHasInteracted(true);
        onReady(); // 呼叫上層元件，告訴系統已經解鎖音效限制了
    };

    // 如果已經互動過了，就隱藏這個畫面（或者 DM 可以選擇隨時切喚回來）
    if (hasInteracted && role === "PLAYER") {
        return null; // 玩家按過之後就完全隱藏
    }

    return (
        <div style={styles.overlay}>
            {/* 如果是 DM 且正在編輯模式 */}
            {role === "GM" && isEditing ? (
                <div style={styles.container}>
                    <h3>⚙️ DM 編輯前情提要</h3>
                    <input 
                        style={styles.input} 
                        value={title} 
                        onChange={(e) => setTitle(e.target.value)} 
                        placeholder="請輸入標題"
                    />
                    <textarea 
                        style={styles.textarea} 
                        value={content} 
                        onChange={(e) => setContent(e.target.value)} 
                        placeholder="請輸入前情提要..."
                    />
                    <button style={styles.button} onClick={handleSave}>儲存並發布給玩家</button>
                    <button style={{...styles.button, background: "#888"}} onClick={() => setIsEditing(false)}>取消</button>
                </div>
            ) : (
                /* 玩家看到的畫面，以及 DM 的預覽畫面 */
                <div style={styles.container}>
                    {role === "GM" && (
                        <button style={styles.editButton} onClick={() => setIsEditing(true)}>
                            ✏️ 編輯文字
                        </button>
                    )}
                    <h2 style={{ color: "#ffd700", borderBottom: "1px solid #555", paddingBottom: "10px" }}>{title}</h2>
                    <p style={{ whiteSpace: "pre-wrap", lineHeight: "1.6", fontSize: "16px" }}>{content}</p>
                    
                    {!hasInteracted && (
                        <button style={styles.readyButton} onClick={handleReady}>
                            ⚔️ 我準備好了！
                        </button>
                    )}
                    
                    {/* 給 DM 關閉預覽的按鈕 */}
                    {role === "GM" && hasInteracted && (
                         <button style={styles.button} onClick={() => setHasInteracted(true)}>關閉預覽</button>
                    )}
                </div>
            )}
        </div>
    );
};

// 簡單的 CSS 樣式 (你可以依據你的專案風格自行替換成 CSS 檔案)
const styles: { [key: string]: React.CSSProperties } = {
    overlay: {
        position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
        backgroundColor: "rgba(20, 20, 20, 0.95)",
        zIndex: 9999, display: "flex", justifyContent: "center", alignItems: "center",
        padding: "20px", color: "white"
    },
    container: {
        background: "#2a2a2a", padding: "30px", borderRadius: "10px",
        width: "100%", maxWidth: "500px", textAlign: "center", position: "relative",
        boxShadow: "0 0 20px rgba(0,0,0,0.8)"
    },
    input: {
        width: "100%", padding: "10px", marginBottom: "15px", borderRadius: "5px", border: "none", fontSize: "18px"
    },
    textarea: {
        width: "100%", padding: "10px", height: "150px", marginBottom: "15px", borderRadius: "5px", border: "none", fontSize: "16px"
    },
    button: {
        width: "100%", padding: "12px", background: "#4CAF50", color: "white", border: "none", borderRadius: "5px", fontSize: "16px", cursor: "pointer", marginBottom: "10px"
    },
    readyButton: {
        marginTop: "20px", padding: "15px 30px", background: "#e53935", color: "white", border: "none", borderRadius: "8px", fontSize: "20px", fontWeight: "bold", cursor: "pointer", boxShadow: "0 4px 6px rgba(0,0,0,0.3)"
    },
    editButton: {
        position: "absolute", top: "10px", right: "10px", background: "#ff9800", border: "none", padding: "5px 10px", borderRadius: "5px", cursor: "pointer", color: "white"
    }
};