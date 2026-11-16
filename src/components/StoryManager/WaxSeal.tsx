// src/components/StoryManager/WaxSeal.tsx
import {
    FaCrown,
    FaCoins,
    FaCompass,
    FaLeaf,
    FaSkull,
    FaFeatherPointed,
    FaAnchor,
    FaShieldHalved,
    FaHeart,
    FaSun,
    FaMoon,
    FaFireFlameCurved,
    FaHammer,
    FaScroll
} from "react-icons/fa6";

export interface WaxSealConfig {
    label: string;
    outerColor: string;
    innerColor: string;
    rimColor: string;
    iconColor: string;
    ringStyle: "double" | "dashed" | "octagonal" | "ornate";
}

export const WAX_SEAL_OPTIONS: Record<string, WaxSealConfig> = {
    none: {
        label: "無火漆印章",
        outerColor: "transparent",
        innerColor: "transparent",
        rimColor: "transparent",
        iconColor: "transparent",
        ringStyle: "double"
    },
    crimson: {
        label: "赤紅皇室蠟印",
        outerColor: "#7f1d1d",
        innerColor: "#b91c1c",
        rimColor: "#450a0a",
        iconColor: "#fca5a5",
        ringStyle: "ornate"
    },
    gold: {
        label: "鎏金商會蠟印",
        outerColor: "#92400e",
        innerColor: "#d97706",
        rimColor: "#451a03",
        iconColor: "#fef08a",
        ringStyle: "double"
    },
    arcane: {
        label: "幽紫秘法符印",
        outerColor: "#4c1d95",
        innerColor: "#7c3aed",
        rimColor: "#2e1065",
        iconColor: "#ddd6fe",
        ringStyle: "octagonal"
    },
    emerald: {
        label: "翡翠森境徽印",
        outerColor: "#064e3b",
        innerColor: "#059669",
        rimColor: "#022c22",
        iconColor: "#a7f3d0",
        ringStyle: "ornate"
    },
    obsidian: {
        label: "墨黑密令火漆",
        outerColor: "#18181b",
        innerColor: "#3f3f46",
        rimColor: "#09090b",
        iconColor: "#e4e4e7",
        ringStyle: "dashed"
    },
    quill: {
        label: "古銅學者印記",
        outerColor: "#78350f",
        innerColor: "#b45309",
        rimColor: "#451a03",
        iconColor: "#fde68a",
        ringStyle: "double"
    },
    navy: {
        label: "深藍海軍將印",
        outerColor: "#1e3a8a",
        innerColor: "#2563eb",
        rimColor: "#172554",
        iconColor: "#bfdbfe",
        ringStyle: "dashed"
    },
    silver: {
        label: "霜銀騎士紋章",
        outerColor: "#334155",
        innerColor: "#64748b",
        rimColor: "#0f172a",
        iconColor: "#f1f5f9",
        ringStyle: "octagonal"
    },
    rose: {
        label: "緋櫻貴族家徽",
        outerColor: "#881337",
        innerColor: "#be123c",
        rimColor: "#4c0519",
        iconColor: "#fecdd3",
        ringStyle: "ornate"
    },
    sunburst: {
        label: "烈陽聖殿聖印",
        outerColor: "#9a3412",
        innerColor: "#ea580c",
        rimColor: "#431407",
        iconColor: "#fed7aa",
        ringStyle: "dashed"
    },
    moonlight: {
        label: "銀月隱修密印",
        outerColor: "#312e81",
        innerColor: "#4f46e5",
        rimColor: "#1e1b4b",
        iconColor: "#c7d2fe",
        ringStyle: "octagonal"
    },
    dragon: {
        label: "龍血戰團徽記",
        outerColor: "#991b1b",
        innerColor: "#dc2626",
        rimColor: "#450a0a",
        iconColor: "#fde047",
        ringStyle: "ornate"
    },
    iron: {
        label: "鑄鐵工匠印信",
        outerColor: "#292524",
        innerColor: "#57534e",
        rimColor: "#1c1917",
        iconColor: "#d6d3d1",
        ringStyle: "dashed"
    },
    jade: {
        label: "蒼玉古國玉璽",
        outerColor: "#115e59",
        innerColor: "#0d9488",
        rimColor: "#042f2e",
        iconColor: "#ccfbf1",
        ringStyle: "octagonal"
    }
};

export function renderWaxSealIcon(sealType: string, color: string, sizeClass = "w-5 h-5") {
    switch (sealType) {
        case "crimson":
            return <FaCrown className={sizeClass} style={{ color }} />;
        case "gold":
            return <FaCoins className={sizeClass} style={{ color }} />;
        case "arcane":
            return <FaCompass className={sizeClass} style={{ color }} />;
        case "emerald":
            return <FaLeaf className={sizeClass} style={{ color }} />;
        case "obsidian":
            return <FaSkull className={sizeClass} style={{ color }} />;
        case "navy":
            return <FaAnchor className={sizeClass} style={{ color }} />;
        case "silver":
            return <FaShieldHalved className={sizeClass} style={{ color }} />;
        case "rose":
            return <FaHeart className={sizeClass} style={{ color }} />;
        case "sunburst":
            return <FaSun className={sizeClass} style={{ color }} />;
        case "moonlight":
            return <FaMoon className={sizeClass} style={{ color }} />;
        case "dragon":
            return <FaFireFlameCurved className={sizeClass} style={{ color }} />;
        case "iron":
            return <FaHammer className={sizeClass} style={{ color }} />;
        case "jade":
            return <FaScroll className={sizeClass} style={{ color }} />;
        default:
            return <FaFeatherPointed className={sizeClass} style={{ color }} />;
    }
}

export function WaxSealBadge({
    sealType = "none",
    signer
}: {
    sealType?: string;
    signer?: string;
}) {
    const hasSeal = Boolean(sealType && sealType !== "none" && WAX_SEAL_OPTIONS[sealType]);
    const hasSigner = Boolean(signer && signer.trim() !== "");

    if (!hasSeal && !hasSigner) return null;

    const config = WAX_SEAL_OPTIONS[sealType || "crimson"] || WAX_SEAL_OPTIONS.crimson;

    return (
        <div className="mt-8 pt-4 border-t border-current/15 flex items-center justify-end gap-4 select-none">
            {hasSigner && (
                <div className="text-right">
                    <span className="text-xs opacity-65 block tracking-widest mb-0.5">署名</span>
                    <span className="text-lg font-black italic tracking-wider">{signer}</span>
                </div>
            )}

            {hasSeal && (
                <div className="relative w-16 h-16 flex items-center justify-center shrink-0 drop-shadow-md">
                    <svg viewBox="0 0 100 100" className="w-full h-full">
                        <defs>
                            <radialGradient id={`wax-grad-${sealType}`} cx="35%" cy="35%" r="65%">
                                <stop offset="0%" stopColor={config.innerColor} />
                                <stop offset="75%" stopColor={config.outerColor} />
                                <stop offset="100%" stopColor={config.rimColor} />
                            </radialGradient>
                        </defs>
                        <path
                            d="M50 4 C62 3, 73 9, 82 17 C91 25, 97 37, 96 50 C95 63, 89 74, 80 83 C71 92, 60 97, 48 96 C35 95, 24 89, 15 80 C7 71, 3 59, 4 47 C5 34, 12 22, 21 14 C30 6, 39 5, 50 4 Z"
                            fill={`url(#wax-grad-${sealType})`}
                        />

                        {config.ringStyle === "octagonal" ? (
                            <polygon
                                points="50,15 74,25 85,50 74,74 50,85 25,74 15,50 25,25"
                                fill="none"
                                stroke={config.iconColor}
                                strokeOpacity="0.4"
                                strokeWidth="2.2"
                            />
                        ) : config.ringStyle === "dashed" ? (
                            <circle
                                cx="50"
                                cy="50"
                                r="33"
                                fill="none"
                                stroke={config.iconColor}
                                strokeOpacity="0.45"
                                strokeWidth="2.5"
                                strokeDasharray="5 4"
                            />
                        ) : (
                            <circle
                                cx="50"
                                cy="50"
                                r="33"
                                fill="none"
                                stroke={config.iconColor}
                                strokeOpacity="0.38"
                                strokeWidth="2.5"
                            />
                        )}

                        <circle
                            cx="50"
                            cy="50"
                            r="28"
                            fill="none"
                            stroke={config.rimColor}
                            strokeOpacity="0.45"
                            strokeWidth="1.5"
                        />
                    </svg>
                    <div className="absolute inset-0 flex items-center justify-center opacity-95">
                        {renderWaxSealIcon(sealType || "crimson", config.iconColor, "w-5 h-5")}
                    </div>
                </div>
            )}
        </div>
    );
}