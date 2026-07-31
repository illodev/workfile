import { useState } from "react";
import { X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
    InputGroup,
    InputGroupAddon,
    InputGroupButton,
    InputGroupInput
} from "@/components/ui/input-group";
import {
    NativeSelect,
    NativeSelectOption
} from "@/components/ui/native-select";

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
            <div className="flex flex-wrap gap-1">
                {value.map((entry) => (
                    <Badge
                        key={entry}
                        variant="secondary"
                        className="font-mono text-[10px] font-normal"
                    >
                        {entry}
                    </Badge>
                ))}
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-1">
            {value.length > 0 ? (
                <div className="flex flex-wrap gap-1">
                    {value.map((entry) => (
                        <Badge
                            key={entry}
                            asChild
                            variant="secondary"
                            className="cursor-pointer font-mono text-[10px] font-normal hover:bg-secondary/70"
                        >
                            <button
                                type="button"
                                aria-label={`Remove ${entry}`}
                                title={`Remove ${entry}`}
                                onClick={() =>
                                    onChange(
                                        value.filter((item) => item !== entry)
                                    )
                                }
                            >
                                {entry}
                                <X aria-hidden="true" className="size-2.5" />
                            </button>
                        </Badge>
                    ))}
                </div>
            ) : null}
            <Input
                id={inputId}
                className="h-8 text-xs md:text-xs"
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
        <FieldGroup className="gap-2.5">
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
                    <Field key={key} className="gap-1.5">
                        <FieldLabel
                            htmlFor={controlId}
                            className="max-w-full min-w-0 gap-1.5 text-xs"
                        >
                            <span className="min-w-0 truncate" title={key}>
                                {key}
                            </span>
                            {known.has(key) ? null : (
                                <Badge
                                    variant="outline"
                                    className="px-1.5 py-0 text-[10px] font-normal text-muted-foreground"
                                    title="Not part of the runtime schema; preserved as written"
                                >
                                    custom
                                </Badge>
                            )}
                        </FieldLabel>

                        {definition.kind === "enum" && definition.options ? (
                            <NativeSelect
                                id={controlId}
                                size="sm"
                                className="text-xs"
                                value={String(value ?? "")}
                                disabled={locked}
                                onChange={(event) =>
                                    onChange(key, event.target.value)
                                }
                            >
                                <NativeSelectOption value="">
                                    —
                                </NativeSelectOption>
                                {definition.options.map((option) => (
                                    <NativeSelectOption
                                        key={option}
                                        value={option}
                                    >
                                        {option}
                                    </NativeSelectOption>
                                ))}
                            </NativeSelect>
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
                            <Input
                                id={controlId}
                                className="h-8 text-xs md:text-xs"
                                type="date"
                                value={String(value ?? "")}
                                disabled={locked}
                                onChange={(event) =>
                                    onChange(key, event.target.value)
                                }
                            />
                        ) : definition.kind === "reference" && locked ? (
                            <div className="flex">
                                <Button
                                    id={controlId}
                                    type="button"
                                    variant="link"
                                    className="h-auto w-fit justify-start p-0 font-mono text-xs"
                                    onClick={() =>
                                        onOpenReference?.(String(value ?? ""))
                                    }
                                >
                                    {String(value ?? "") || "—"}
                                </Button>
                            </div>
                        ) : definition.kind === "reference" ? (
                            <InputGroup className="h-8">
                                <InputGroupInput
                                    id={controlId}
                                    className="font-mono text-xs md:text-xs"
                                    type="text"
                                    value={String(value ?? "")}
                                    onChange={(event) =>
                                        onChange(key, event.target.value)
                                    }
                                />
                                {String(value ?? "").trim() ? (
                                    <InputGroupAddon align="inline-end">
                                        <InputGroupButton
                                            title={`Open ${String(value)}`}
                                            onClick={() =>
                                                onOpenReference?.(
                                                    String(value ?? "").trim()
                                                )
                                            }
                                        >
                                            Open
                                        </InputGroupButton>
                                    </InputGroupAddon>
                                ) : null}
                            </InputGroup>
                        ) : (
                            <Input
                                id={controlId}
                                className="h-8 text-xs md:text-xs"
                                type="text"
                                value={String(value ?? "")}
                                disabled={locked}
                                aria-invalid={
                                    key === "title" &&
                                    !String(value ?? "").trim()
                                        ? true
                                        : undefined
                                }
                                onChange={(event) =>
                                    onChange(key, event.target.value)
                                }
                            />
                        )}
                    </Field>
                );
            })}
        </FieldGroup>
    );
}

export { cardProperties, inferKind } from "./property-model";
export type { PropertyDefinition, PropertyKind } from "./property-model";
