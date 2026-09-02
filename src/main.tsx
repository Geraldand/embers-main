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
import { createRoot, Root } from "react-dom/client";
import { log_error } from "./logging.ts";
import { setupAudioUnlock } from "./utils.ts";
import LegacyReaderModal from "./views/LegacyReaderModal.tsx";

let root: Root | null = null;

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
            setReady(false);
        }
    }, [searchParams, ready]);

    useEffect(() => {
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

const params = new URLSearchParams(window.location.search);
const rootElement = document.getElementById("root") as HTMLElement;

if (!root) {
    root = createRoot(rootElement);
}

if (params.get("view") === "legacy-reader") {
    root.render(
        <ThemeProvider theme={darkTheme}>
            <CssBaseline />
            <LegacyReaderModal />
        </ThemeProvider>
    );
} else {
    root.render(
        <StrictMode>
            <BrowserRouter>
                <ExtensionMultiplexer />
            </BrowserRouter>
        </StrictMode>
    );
}