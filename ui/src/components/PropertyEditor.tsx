import { useState } from "react";
import { X } from "lucide-react";

import {
    PROTOCOL_OWNED,
    inferKind,
    type PropertyDefinition
} from "./property-model";

function TagInput({
    inputId,
    value,
    onChange,
    disabled
}: {
    inputId?: string;
    value: string[];
    onChange: (next: string[]) => void;
    disabled?: boolean;
}) {
    const [draft, setDraft] = useState("");
    const commit = () => {
        const entry = draft.trim();
        if (!entry) return;
        if (!value.includes(entry)) onChange([...value, entry]);
        setDraft("");
    };

    // A read-only list keeps its chips but has nothing to type into, so the
    // input would only render an empty box.
    if (disabled) {
        return (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                {value.map((entry) => (
                    <span key={entry} className="chip-version">
                        {entry}
                    </span>
                ))}
            </div>
        );
    }

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {value.length > 0 ? (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                    {value.map((entry) => (
                        <button
                            key={entry}
                            type="button"
                            className="chip"
                            aria-label={`Remove ${entry}`}
                            title={`Remove ${entry}`}
                            onClick={() =>
                                onChange(value.filter((item) => item !== entry))
                            }
                        >
                            {entry}
                            <X
                                aria-hidden="true"
                                style={{ width: 10, height: 10 }}
                            />
                        </button>
                    ))}
                </div>
            ) : null}
            <input
                id={inputId}
                className="input"
                value={draft}
                placeholder="Add…"
                onChange={(event) => setDraft(event.target.value)}
                onBlur={commit}
                onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === ",") {
                        event.preventDefault();
                        commit();
                    } else if (
                        event.key === "Backspace" &&
                        !draft &&
                        value.length
                    ) {
                        onChange(value.slice(0, -1));
                    }
                }}
            />
        </div>
    );
}

/**
 * Frontmatter as typed properties, the way Obsidian presents them.
 *
 * The control comes from the runtime schema where the schema knows the key —
 * statuses, kinds and collections are configuration, not constants — and from
 * the value's shape otherwise. Unknown keys are editable rather than hidden:
 * the codec round-trips them, so refusing to show them would be the interface
 * losing data the format kept.
 */
export function PropertyEditor({
    values,
    definitions,
    onChange,
    onOpenReference,
    disabled = false
}: {
    values: Record<string, unknown>;
    definitions: PropertyDefinition[];
    onChange: (key: string, value: unknown) => void;
    onOpenReference?: (id: string) => void;
    disabled?: boolean;
}) {
    const known = new Map(definitions.map((entry) => [entry.key, entry]));
    const keys = [
        ...definitions.map((entry) => entry.key).filter((key) => key in values),
        ...Object.keys(values).filter((key) => !known.has(key))
    ];

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
            {keys.map((key) => {
                const value = values[key];
                const definition =
                    known.get(key) ??
                    ({
                        key,
                        kind: inferKind(key, value),
                        readOnly: PROTOCOL_OWNED.has(key)
                    } as PropertyDefinition);
                const locked = disabled || definition.readOnly;
                const controlId = `property-${key}`;

                return (
                    <div key={key} className="field">
                        <label
                            className="field-label"
                            htmlFor={controlId}
                            style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 6,
                                minWidth: 0
                            }}
                        >
                            <span className="truncate" title={key}>
                                {key}
                            </span>
                            {known.has(key) ? null : (
                                <span
                                    className="chip-version"
                                    style={{
                                        textTransform: "none",
                                        letterSpacing: 0
                                    }}
                                    title="Not part of the runtime schema; preserved as written"
                                >
                                    custom
                                </span>
                            )}
                        </label>

                        {definition.kind === "enum" && definition.options ? (
                            <select
                                id={controlId}
                                className="select"
                                value={String(value ?? "")}
                                disabled={locked}
                                onChange={(event) =>
                                    onChange(key, event.target.value)
                                }
                            >
                                <option value="">—</option>
                                {definition.options.map((option) => (
                                    <option key={option} value={option}>
                                        {option}
                                    </option>
                                ))}
                            </select>
                        ) : definition.kind === "list" ? (
                            <TagInput
                                inputId={controlId}
                                value={(Array.isArray(value) ? value : []).map(
                                    String
                                )}
                                disabled={locked}
                                onChange={(next) => onChange(key, next)}
                            />
                        ) : definition.kind === "date" ? (
                            <input
                                id={controlId}
                                className="input"
                                type="date"
                                value={String(value ?? "")}
                                disabled={locked}
                                onChange={(event) =>
                                    onChange(key, event.target.value)
                                }
                            />
                        ) : definition.kind === "reference" && locked ? (
                            <button
                                id={controlId}
                                type="button"
                                className="mono"
                                style={{
                                    border: 0,
                                    background: "none",
                                    padding: 0,
                                    fontSize: 12,
                                    color: "var(--accent)",
                                    cursor: "pointer",
                                    textAlign: "left",
                                    width: "fit-content"
                                }}
                                onClick={() =>
                                    onOpenReference?.(String(value ?? ""))
                                }
                            >
                                {String(value ?? "") || "—"}
                            </button>
                        ) : definition.kind === "reference" ? (
                            <div
                                style={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 6
                                }}
                            >
                                <input
                                    id={controlId}
                                    className="input mono"
                                    type="text"
                                    style={{ fontSize: 12 }}
                                    value={String(value ?? "")}
                                    onChange={(event) =>
                                        onChange(key, event.target.value)
                                    }
                                />
                                {String(value ?? "").trim() ? (
                                    <button
                                        type="button"
                                        className="btn"
                                        style={{ flex: "0 0 auto" }}
                                        title={`Open ${String(value)}`}
                                        onClick={() =>
                                            onOpenReference?.(
                                                String(value ?? "").trim()
                                            )
                                        }
                                    >
                                        Open
                                    </button>
                                ) : null}
                            </div>
                        ) : (
                            <input
                                id={controlId}
                                className="input"
                                type="text"
                                value={String(value ?? "")}
                                disabled={locked}
                                onChange={(event) =>
                                    onChange(key, event.target.value)
                                }
                            />
                        )}
                    </div>
                );
            })}
        </div>
    );
}

export { cardProperties, inferKind } from "./property-model";
export type { PropertyDefinition, PropertyKind } from "./property-model";
