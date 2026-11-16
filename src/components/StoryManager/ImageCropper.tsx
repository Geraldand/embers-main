// src/components/StoryManager/ImageCropper.tsx
import { useState, useRef, useEffect } from "react";
import OBR from "@owlbear-rodeo/sdk";
import { FaArrowsRotate, FaMagnifyingGlassPlus, FaMagnifyingGlassMinus, FaXmark } from "react-icons/fa6";
import { ImageCrop } from "./types";

export const DEFAULT_IMAGE_CROP: ImageCrop = {
    x: 50,
    y: 50,
    scale: 1
};

export const IMAGE_VIEWER_STORAGE_KEY = "eu.armindo.embers/image-viewer-data";
export const IMAGE_VIEWER_MODAL_ID = "eu.armindo.embers/image-viewer";

// Probe natural image dimensions and open a proportional centered OBR modal
export async function openGlobalImageViewer(src: string, title?: string) {
    if (!src) return;
    try {
        const audio = new Audio("/quest_check.mp3");
        audio.volume = 0.25;
        audio.play().catch(() => {});
    } catch (e) {}

    localStorage.setItem(
        IMAGE_VIEWER_STORAGE_KEY,
        JSON.stringify({ src, title: title || "" })
    );

    const dimensions = await new Promise<{ width: number; height: number } | null>((resolve) => {
        const img = new window.Image();
        const timer = window.setTimeout(() => resolve(null), 600);
        img.onload = () => {
            window.clearTimeout(timer);
            if (img.naturalWidth > 0 && img.naturalHeight > 0) {
                resolve({ width: img.naturalWidth, height: img.naturalHeight });
            } else {
                resolve(null);
            }
        };
        img.onerror = () => {
            window.clearTimeout(timer);
            resolve(null);
        };
        img.src = src;
    });

    const [viewWidth, viewHeight] = await Promise.all([
        OBR.viewport.getWidth(),
        OBR.viewport.getHeight()
    ]);

    const maxW = Math.min(1080, Math.max(360, Math.floor(viewWidth * 0.86)));
    const maxH = Math.min(820, Math.max(360, Math.floor(viewHeight * 0.86)));
    const headerAllowance = 48;

    let modalWidth = Math.min(680, maxW);
    let modalHeight = Math.min(680, maxH);

    if (dimensions) {
        const availH = Math.max(260, maxH - headerAllowance);
        const fitScale = Math.min(maxW / dimensions.width, availH / dimensions.height);
        const boundedScale = Math.min(Math.max(fitScale, 0.35), 2.2);
        modalWidth = Math.max(360, Math.min(maxW, Math.round(dimensions.width * boundedScale)));
        modalHeight = Math.max(
            360,
            Math.min(maxH, Math.round(dimensions.height * boundedScale) + headerAllowance)
        );
    }

    await OBR.modal.open({
        id: IMAGE_VIEWER_MODAL_ID,
        url: "/?view=image-viewer",
        width: modalWidth,
        height: modalHeight,
        fullScreen: false
    });
}

// Render an image using saved focal coordinates and zoom scale
export function CroppedImage({
    src,
    alt = "",
    crop,
    containerClassName = "",
    imgClassName = "",
    onClick,
    title
}: {
    src: string;
    alt?: string;
    crop?: ImageCrop;
    containerClassName?: string;
    imgClassName?: string;
    onClick?: (e: React.MouseEvent<HTMLDivElement>) => void;
    title?: string;
}) {
    const safeCrop = crop || DEFAULT_IMAGE_CROP;
    const x = typeof safeCrop.x === "number" ? safeCrop.x : 50;
    const y = typeof safeCrop.y === "number" ? safeCrop.y : 50;
    const scale = typeof safeCrop.scale === "number" && safeCrop.scale >= 1 ? safeCrop.scale : 1;

    return (
        <div
            onClick={onClick}
            title={title}
            className={`overflow-hidden relative ${onClick ? "cursor-zoom-in" : ""} ${containerClassName}`}
        >
            <img
                src={src}
                alt={alt}
                draggable={false}
                style={{
                    objectPosition: `${x}% ${y}%`,
                    transform: `scale(${scale})`,
                    transformOrigin: `${x}% ${y}%`
                }}
                className={`w-full h-full object-cover select-none ${
                    onClick ? "transition-transform duration-200 hover:brightness-110" : ""
                } ${imgClassName}`}
            />
        </div>
    );
}

// Instant full-artwork lightbox overlay with wheel zoom and GPU-accelerated drag pan
export function LightboxOverlay({
    src,
    title,
    onClose
}: {
    src: string | null;
    title?: string;
    onClose: () => void;
}) {
    const [zoom, setZoom] = useState(1);
    const [offset, setOffset] = useState({ x: 0, y: 0 });
    const [isPanning, setIsPanning] = useState(false);
    const imgRef = useRef<HTMLImageElement | null>(null);
    const offsetRef = useRef({ x: 0, y: 0 });
    const panStartRef = useRef<{ clientX: number; clientY: number; startX: number; startY: number } | null>(null);
    const hasDraggedRef = useRef(false);

    useEffect(() => {
        setZoom(1);
        offsetRef.current = { x: 0, y: 0 };
        setOffset({ x: 0, y: 0 });
        hasDraggedRef.current = false;
    }, [src]);

    useEffect(() => {
        if (!src) return;
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                e.stopPropagation();
                onClose();
            }
        };
        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [src, onClose]);

    if (!src) return null;

    const clampZoom = (val: number) => Math.max(0.5, Math.min(4, Number(val.toFixed(2))));

    const applyZoom = (updater: (prev: number) => number) => {
        setZoom(prev => {
            const next = updater(prev);
            if (next <= 1) {
                offsetRef.current = { x: 0, y: 0 };
                setOffset({ x: 0, y: 0 });
            }
            return next;
        });
    };

    const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();
        const delta = e.deltaY < 0 ? 0.15 : -0.15;
        applyZoom(prev => clampZoom(prev + delta));
    };

    const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
        hasDraggedRef.current = false;
        if (zoom <= 1) return;
        e.preventDefault();
        e.stopPropagation();
        e.currentTarget.setPointerCapture(e.pointerId);
        setIsPanning(true);
        panStartRef.current = {
            clientX: e.clientX,
            clientY: e.clientY,
            startX: offsetRef.current.x,
            startY: offsetRef.current.y
        };
    };

    const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
        if (!isPanning || !panStartRef.current) return;
        const dx = e.clientX - panStartRef.current.clientX;
        const dy = e.clientY - panStartRef.current.clientY;
        if (Math.abs(dx) > 4 || Math.abs(dy) > 4) {
            hasDraggedRef.current = true;
        }
        const nextX = panStartRef.current.startX + dx;
        const nextY = panStartRef.current.startY + dy;
        offsetRef.current = { x: nextX, y: nextY };
        if (imgRef.current) {
            imgRef.current.style.transform = `translate3d(${nextX}px, ${nextY}px, 0) scale(${zoom})`;
        }
    };

    const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
        if (isPanning) {
            e.currentTarget.releasePointerCapture(e.pointerId);
            setIsPanning(false);
            panStartRef.current = null;
            setOffset({ ...offsetRef.current });
        }
    };

    const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
        e.stopPropagation();
        if (hasDraggedRef.current) {
            hasDraggedRef.current = false;
            return;
        }
        onClose();
    };

    return (
        <div
            onClick={handleBackdropClick}
            onWheel={handleWheel}
            className="fixed inset-0 z-[400] flex flex-col bg-black/85 backdrop-blur-md animate-in fade-in duration-150 select-none"
        >
            {/* Top Toolbar */}
            <div
                onClick={(e) => e.stopPropagation()}
                className="flex items-center justify-between px-5 py-3 bg-black/50 border-b border-white/10 text-white shrink-0 z-10"
            >
                <span className="font-black text-sm sm:text-base truncate pr-4">
                    {title || "檢視完整圖片"}
                </span>

                <div className="flex items-center gap-1.5 shrink-0">
                    <button
                        type="button"
                        onClick={() => applyZoom(prev => clampZoom(prev - 0.25))}
                        title="縮小"
                        className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-gray-200 outline-none"
                    >
                        <FaMagnifyingGlassMinus className="w-3.5 h-3.5" />
                    </button>
                    <span className="text-xs font-mono font-bold w-12 text-center text-gray-300">
                        {Math.round(zoom * 100)}%
                    </span>
                    <button
                        type="button"
                        onClick={() => applyZoom(prev => clampZoom(prev + 0.25))}
                        title="放大"
                        className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-gray-200 outline-none"
                    >
                        <FaMagnifyingGlassPlus className="w-3.5 h-3.5" />
                    </button>
                    <button
                        type="button"
                        onClick={() => {
                            setZoom(1);
                            offsetRef.current = { x: 0, y: 0 };
                            setOffset({ x: 0, y: 0 });
                        }}
                        title="重置比例"
                        className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-gray-200 outline-none"
                    >
                        <FaArrowsRotate className="w-3.5 h-3.5" />
                    </button>
                    <button
                        type="button"
                        onClick={onClose}
                        title="關閉檢視"
                        className="p-2 ml-1 rounded-full bg-white/15 hover:bg-rose-500/80 text-white transition-colors outline-none"
                    >
                        <FaXmark className="w-4 h-4" />
                    </button>
                </div>
            </div>

            {/* Centered Full Artwork Stage */}
            <div
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerCancel={handlePointerUp}
                className={`flex-1 min-h-0 flex items-center justify-center p-4 overflow-hidden ${
                    zoom > 1 ? (isPanning ? "cursor-grabbing" : "cursor-grab") : "cursor-default"
                }`}
            >
                <img
                    ref={imgRef}
                    src={src}
                    alt={title || "完整美術圖"}
                    draggable={false}
                    onClick={(e) => e.stopPropagation()}
                    style={{
                        transform: `translate3d(${offset.x}px, ${offset.y}px, 0) scale(${zoom})`,
                        willChange: "transform"
                    }}
                    className="max-w-full max-h-full object-contain rounded-xl shadow-2xl"
                />
            </div>
        </div>
    );
}

// Interactive frame for dragging focal position and adjusting zoom scale
export function ImageCropper({
    src,
    crop,
    onChange,
    aspectClassName = "h-44"
}: {
    src: string;
    crop?: ImageCrop;
    onChange: (nextCrop: ImageCrop) => void;
    aspectClassName?: string;
}) {
    const currentCrop: ImageCrop = {
        x: crop?.x ?? 50,
        y: crop?.y ?? 50,
        scale: crop?.scale ?? 1
    };

    const frameRef = useRef<HTMLDivElement | null>(null);
    const [dragging, setDragging] = useState(false);
    const dragStartRef = useRef<{
        clientX: number;
        clientY: number;
        startX: number;
        startY: number;
    } | null>(null);

    const clamp = (val: number, min: number, max: number) => Math.max(min, Math.min(max, val));

    const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        setDragging(true);
        dragStartRef.current = {
            clientX: e.clientX,
            clientY: e.clientY,
            startX: currentCrop.x,
            startY: currentCrop.y
        };
    };

    const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
        if (!dragging || !dragStartRef.current || !frameRef.current) return;
        const rect = frameRef.current.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) return;

        const dx = e.clientX - dragStartRef.current.clientX;
        const dy = e.clientY - dragStartRef.current.clientY;
        const sensitivity = 100 / Math.max(1, currentCrop.scale * 0.75);

        const nextX = clamp(
            Number((dragStartRef.current.startX - (dx / rect.width) * sensitivity).toFixed(1)),
            0,
            100
        );
        const nextY = clamp(
            Number((dragStartRef.current.startY - (dy / rect.height) * sensitivity).toFixed(1)),
            0,
            100
        );

        onChange({
            ...currentCrop,
            x: nextX,
            y: nextY
        });
    };

    const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
        if (dragging) {
            e.currentTarget.releasePointerCapture(e.pointerId);
            setDragging(false);
            dragStartRef.current = null;
        }
    };

    const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
        e.preventDefault();
        const delta = e.deltaY < 0 ? 0.1 : -0.1;
        const nextScale = clamp(Number((currentCrop.scale + delta).toFixed(2)), 1, 3);
        onChange({
            ...currentCrop,
            scale: nextScale
        });
    };

    return (
        <div className="flex flex-col gap-2">
            <div
                ref={frameRef}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerCancel={handlePointerUp}
                onWheel={handleWheel}
                className={`w-full ${aspectClassName} rounded-xl overflow-hidden bg-black/40 border border-panel-inactive relative select-none touch-none ${
                    dragging ? "cursor-grabbing" : "cursor-grab"
                }`}
            >
                <img
                    src={src}
                    alt="預覽框"
                    draggable={false}
                    style={{
                        objectPosition: `${currentCrop.x}% ${currentCrop.y}%`,
                        transform: `scale(${currentCrop.scale})`,
                        transformOrigin: `${currentCrop.x}% ${currentCrop.y}%`
                    }}
                    className="w-full h-full object-cover pointer-events-none"
                />

                <div className="absolute inset-0 pointer-events-none border border-white/15 rounded-xl">
                    <div className="w-full h-full grid grid-cols-3 grid-rows-3">
                        <div className="border-r border-b border-white/10" />
                        <div className="border-r border-b border-white/10" />
                        <div className="border-b border-white/10" />
                        <div className="border-r border-b border-white/10" />
                        <div className="border-r border-b border-white/10" />
                        <div className="border-b border-white/10" />
                        <div className="border-r border-white/10" />
                        <div className="border-r border-white/10" />
                        <div />
                    </div>
                </div>

                <div className="absolute bottom-2 left-2.5 px-2 py-0.5 rounded-full bg-black/65 text-[10px] font-bold text-gray-200 pointer-events-none">
                    拖曳畫面調整位置
                </div>
            </div>

            <div className="flex items-center gap-2.5 bg-panel-base px-3 py-1.5 rounded-xl border border-panel-inactive">
                <FaMagnifyingGlassPlus className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                <input
                    type="range"
                    min="1"
                    max="3"
                    step="0.05"
                    value={currentCrop.scale}
                    onChange={(e) =>
                        onChange({
                            ...currentCrop,
                            scale: parseFloat(e.target.value)
                        })
                    }
                    className="flex-1 accent-[#bb99ff] cursor-pointer h-1.5 bg-panel-inactive rounded-lg"
                />
                <span className="text-[11px] font-mono font-bold text-gray-300 w-10 text-right shrink-0">
                    {Math.round(currentCrop.scale * 100)}%
                </span>
                <button
                    type="button"
                    onClick={() => onChange({ ...DEFAULT_IMAGE_CROP })}
                    title="重置位置與縮放"
                    className="p-1 text-gray-400 hover:text-white outline-none transition-colors shrink-0"
                >
                    <FaArrowsRotate className="w-3 h-3" />
                </button>
            </div>
        </div>
    );
}