import "./index.css";

import { Box, CssBaseline, ThemeProvider } from "@mui/material";
import { BrowserRouter, Route, Routes, useSearchParams } from "react-router";
import { StrictMode, useEffect, useMemo, useState } from "react";
import { darkTheme, lightTheme } from "./config/theme.ts";

import { BaseOBRProvider } from "./react-obr/providers/BaseOBRProvider.tsx";
import Docs from "./views/Docs.tsx";
import Listings from "./views/Listings.tsx";
import Main from "./views/Main.tsx";
import NewSpellModal from "./views/NewSpellModal.tsx";
import OBR from "@owlbear-rodeo/sdk";
import SpellSelectionPopover from "./views/SpellSelectionPopover.tsx";
import Tutorials from "./views/Tutorials.tsx";
import { createRoot } from "react-dom/client";
import { log_error } from "./logging.ts";
import { setupAudioUnlock } from "./utils.ts";
import LegacyReaderModal from "./views/LegacyReaderModal.tsx";

const params = new URLSearchParams(window.location.search);

// 攔截 OBR Modal 廣播視窗，直接渲染，不經過 Router
if (params.get("view") === "legacy-reader") {
    createRoot(document.getElementById("root")!).render(
        <ThemeProvider theme={darkTheme}>
            <CssBaseline />
            <LegacyReaderModal />
        </ThemeProvider>
    );
} else {
    createRoot(document.getElementById("root")!).render(
        <StrictMode>
            <BrowserRouter>
                <ExtensionMultiplexer />
            </BrowserRouter>
        </StrictMode>
    );
}
function ExtensionMultiplexer() {
    const [searchParams] = useSearchParams();
    const [ready, setReady] = useState(false);
    const [themeMode, setThemeMode] = useState<"DARK" | "LIGHT">("DARK");
    if (searchParams.get("view") === "legacy-reader") {
        return <LegacyReaderModal />;
    }
    useEffect(() => {
        if (!ready) return;
        try {
            OBR.theme.getTheme().then((theme) => {
                setThemeMode(theme.mode);
            });
            OBR.theme.onChange((theme) => {
                setThemeMode(theme.mode);
            });
        } catch (error) {
            log_error(error);
            // TODO: Handle the error gracefully
            // current error: "Uncaught (in promise) Error: Unable to send message: not ready"
            setReady(false);
        }
    }, [searchParams, ready]);

    useEffect(() => {
        // Mount audio unlock listener on init
        setupAudioUnlock();
        
        return OBR.onReady(() => {
            setReady(true);
        });
    }, []);
    const children = useMemo(() => {
        if (searchParams.get("obrref")) {
            return (
                <BaseOBRProvider>
                    <ThemeProvider
                        theme={themeMode === "DARK" ? darkTheme : lightTheme}
                    >
                        <CssBaseline />
                        <Box sx={{ height: "100vh" }}>
                            <Routes>
                                <Route index element={<Main />} />
                                <Route
                                    path="spell-selection-popover"
                                    element={<SpellSelectionPopover />}
                                />
                                <Route
                                    path="new-spell-modal/:spellID?"
                                    element={<NewSpellModal />}
                                />
                                
                            </Routes>
                        </Box>
                    </ThemeProvider>
                </BaseOBRProvider>
            );
        }
        return (
            <Routes>
                <Route index element={<Docs />} />
                <Route path="tutorials" element={<Tutorials />} />
                <Route path="listings" element={<Listings />} />
                <Route element={<LegacyReaderModal />} path="legacy-reader" />
            </Routes>
        );
    }, [searchParams, themeMode]);

    return children;
}

createRoot(document.getElementById("root")!).render(
    <StrictMode>
        <BrowserRouter>
            <ExtensionMultiplexer />
        </BrowserRouter>
    </StrictMode>
);
