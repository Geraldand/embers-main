import { ASSET_LOCATION } from "../../config";
import { NumberContent, OptionsContent, Parameter, ReplicationType, SpellInstance } from "../../types/spells";
import { useCallback } from "react";
import AssetPicker from "../AssetPicker";
import Checkbox from "../Checkbox";
import { getSpell } from "../../effects/spells";

function replicationValue(replicationValue: ReplicationType) {
    if (replicationValue === "no") return "無";
    if (replicationValue === "all") return "全部";
    if (replicationValue === "first_to_all") return "起點至其餘目標";
    return "未知";
}

function copyValue(copyDelay: number) {
    if (copyDelay < 0) return "無";
    if (copyDelay === 0) return "立即";
    if (copyDelay > 0) return `延遲 ${copyDelay} 毫秒`;
    return "未知";
}

function DetailRow({ label, value }: { label: string; value: string }) {
    return (
        <div className="flex items-center justify-between text-sm py-1">
            <p className="font-bold text-gray-400">{label}</p>
            <p className="text-white">{value}</p>
        </div>
    );
}

function ParameterRow({
    parameter,
    value,
    onChange
}: {
    parameter: Parameter;
    value: any;
    onChange: (val: any) => void;
}) {
    const setValidatedParameterValue = useCallback(
        (val: string) => {
            const content = parameter.content as NumberContent;
            let intValue = parseInt(val ?? "0");
            if (isNaN(intValue)) return;

            if (content.min && intValue < content.min) intValue = content.min;
            else if (content.max && intValue > content.max) intValue = content.max;
            onChange(intValue);
        },
        [parameter.content, onChange]
    );

    return (
        <div className="flex items-center justify-between text-sm py-2 border-b border-panel-inactive last:border-0">
            <p className="font-bold text-gray-300">{parameter.name}</p>
            {parameter.type === "options" && (
                <select
                    className="bg-panel-base text-white outline-none rounded-lg px-2 py-1 border border-panel-inactive focus:border-panel-active"
                    value={value ?? (parameter.defaultValue as string)}
                    onChange={(e) => onChange(e.target.value)}
                >
                    {(parameter.content as OptionsContent).map((option, index) => (
                        <option key={`${option.value}-${index}`} value={option.value}>
                            {option.label}
                        </option>
                    ))}
                </select>
            )}
            {parameter.type === "number" && (
                <input
                    className="bg-panel-base text-white outline-none rounded-lg px-2 py-1 w-20 text-center border border-panel-inactive focus:border-panel-active"
                    type="number"
                    value={value ?? (parameter.defaultValue as number)}
                    min={(parameter.content as NumberContent)?.min}
                    max={(parameter.content as NumberContent)?.max}
                    onChange={(e) => setValidatedParameterValue(e.currentTarget.value)}
                />
            )}
            {parameter.type === "boolean" && (
                <Checkbox
                    checked={value ?? (parameter.defaultValue as boolean | undefined) ?? false}
                    setChecked={(val) => onChange(val)}
                />
            )}
            {parameter.type === "asset" && (
                <AssetPicker value={value ?? []} setValue={onChange} />
            )}
        </div>
    );
}

export default function SpellDetails({
    spellInstance,
    isGM,
    onUpdate
}: {
    spellInstance: SpellInstance | null;
    isGM: boolean;
    onUpdate: (updatedInstance: SpellInstance) => void;
}) {
    if (!spellInstance) {
        return <div className="p-4 text-center text-gray-400">載入中...</div>;
    }

    const baseSpell = getSpell(spellInstance.baseSpellId, isGM);

    if (!baseSpell) {
        return <div className="p-4 text-red-500 text-sm font-bold text-center">找不到基礎法術資料。</div>;
    }

    return (
        <div className="flex flex-col gap-4">
            <h3 className="text-base font-black text-white px-1">法術細節</h3>

            <div className="flex flex-col gap-3">
                <div className="flex items-center gap-4 bg-panel-base p-3 rounded-2xl border border-panel-inactive shadow-inner">
                    <img
                        className="w-12 h-12 object-contain drop-shadow-sm shrink-0"
                        src={`${ASSET_LOCATION}/${baseSpell.thumbnail}`}
                        alt={baseSpell.name}
                    />
                    <div className="flex flex-col flex-1 gap-1 min-w-0">
                        <input 
                            type="text"
                            value={spellInstance.customName || baseSpell.name}
                            onChange={(e) => onUpdate({ ...spellInstance, customName: e.target.value })}
                            className="bg-transparent text-white font-bold text-sm outline-none border-b border-panel-inactive focus:border-panel-active transition-colors pb-1 w-full truncate"
                            placeholder="自訂法術名稱..."
                        />
                        <span className="text-[10px] text-gray-500 font-mono truncate">{spellInstance.baseSpellId}</span>
                    </div>
                </div>

                <div className="flex flex-col gap-1 bg-panel-base p-3 rounded-2xl border border-panel-inactive shadow-inner">
                    {baseSpell.minTargets != undefined && <DetailRow label="最少目標數量" value={baseSpell.minTargets.toString()} />}
                    {baseSpell.maxTargets != undefined && <DetailRow label="最多目標數量" value={baseSpell.maxTargets.toString()} />}
                    {baseSpell.replicate && <DetailRow label="複製模式" value={replicationValue(baseSpell.replicate)} />}
                    {baseSpell.copy != undefined && <DetailRow label="拷貝模式" value={copyValue(baseSpell.copy)} />}
                </div>

                {baseSpell.parameters && baseSpell.parameters.length > 0 && (
                    <div className="flex flex-col bg-panel-base p-3 rounded-2xl border border-panel-inactive shadow-inner">
                        <h4 className="text-xs font-bold text-gray-500 mb-2">參數設定</h4>
                        {baseSpell.parameters.map((parameter) => (
                            <ParameterRow
                                key={parameter.id}
                                parameter={parameter}
                                value={spellInstance.parameters[parameter.id]}
                                onChange={(val) => onUpdate({
                                    ...spellInstance,
                                    parameters: { ...spellInstance.parameters, [parameter.id]: val }
                                })}
                            />
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}