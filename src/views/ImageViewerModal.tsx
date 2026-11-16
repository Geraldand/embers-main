// src/views/ImageViewerModal.tsx
import { useEffect, useState } from "react";
import OBR from "@owlbear-rodeo/sdk";
import { IMAGE_VIEWER_STORAGE_KEY, IMAGE_VIEWER_MODAL_ID, LightboxOverlay } from "../components/StoryManager/ImageCropper";

export default function ImageViewerModal() {
    const [imageData, setImageData] = useState<{ src: string; title?: string } | null>(() => {
        const raw = localStorage.getItem(IMAGE_VIEWER_STORAGE_KEY);
        if (!raw) return null;
        try {
            return JSON.parse(raw);
        } catch (e) {
            return null;
        }
    });

    useEffect(() => {
        const handleStorage = (e: StorageEvent) => {
            if (e.key === IMAGE_VIEWER_STORAGE_KEY && e.newValue) {
                try {
                    setImageData(JSON.parse(e.newValue));
                } catch (err) {}
            }
        };
        window.addEventListener("storage", handleStorage);
        return () => window.removeEventListener("storage", handleStorage);
    }, []);

    const handleClose = () => {
        if (OBR.isReady) {
            OBR.modal.close(IMAGE_VIEWER_MODAL_ID);
        }
    };

    if (!imageData?.src) {
        return (
            <div className="fixed inset-0 w-screen h-screen flex items-center justify-center bg-panel-base text-white">
                <span className="text-xs font-bold text-gray-400">無法載入圖片</span>
            </div>
        );
    }

    return (
        <LightboxOverlay
            src={imageData.src}
            title={imageData.title}
            onClose={handleClose}
        />
    );
}