import { Plus, Trash2 } from "lucide-react";
import type { CSSProperties } from "react";
import type { AppConfig } from "../../../types";
import { ensureProviderConfig } from "../../../utils/providerConfig";

interface ProviderSelectorProps {
    config: AppConfig;
    onChangeId: (id: string) => void;
    onAdd: () => void;
    onRemove: () => void;
    inputStyle: CSSProperties;
}

export function ProviderSelector({
    config,
    onChangeId,
    onAdd,
    onRemove,
    inputStyle,
}: ProviderSelectorProps) {
    const normalizedConfig = ensureProviderConfig(config);

    return (
        <div className="grid grid-cols-[1fr_auto_auto] gap-2 items-end">
            <div>
                <label
                    className="block text-sm font-medium mb-1"
                    style={{ color: "var(--color-text-secondary)" }}
                >
                    当前供应商
                </label>
                <select
                    value={normalizedConfig.selected_provider_id}
                    onChange={(event) => onChangeId(event.target.value)}
                    className="w-full px-3 py-2 rounded-lg focus:outline-none focus:ring-2"
                    style={
                        {
                            ...inputStyle,
                            "--tw-ring-color": "var(--color-accent)",
                        } as CSSProperties
                    }
                >
                    {normalizedConfig.providers.map((provider) => (
                        <option key={provider.id} value={provider.id}>
                            {provider.name || provider.id}
                        </option>
                    ))}
                </select>
            </div>

            <button
                type="button"
                onClick={onAdd}
                className="h-[42px] px-3 rounded-lg cursor-pointer transition-colors flex items-center gap-1"
                style={{ border: "1px solid var(--color-border)", color: "var(--color-text-secondary)" }}
            >
                <Plus size={14} />
                新增
            </button>

            <button
                type="button"
                onClick={onRemove}
                disabled={normalizedConfig.providers.length <= 1}
                className="h-[42px] px-3 rounded-lg cursor-pointer transition-colors flex items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
                style={{ border: "1px solid var(--color-border)", color: "var(--color-text-secondary)" }}
            >
                <Trash2 size={14} />
                删除
            </button>
        </div>
    );
}
