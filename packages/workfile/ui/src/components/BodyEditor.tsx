import { useEffect, useRef, useState } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import { Kbd } from "@/components/ui/kbd";
import { Textarea } from "@/components/ui/textarea";

interface Conflict {
    theirs: string;
    theirRevision: string;
}

/**
 * Edits a record's Markdown body.
 *
 * A textarea, not an editor framework. `@codemirror/lang-markdown` alone is
 * 187 kB gzip against a 94 kB application — it depends on `lang-html`, which
 * drags in CSS and JavaScript grammars — and the thing that was actually
 * missing was *any* way to change a body from here, not syntax highlighting.
 * The seam is a single component, so replacing it later touches one file.
 *
 * Saving is explicit. Autosave would be wrong here regardless of debounce:
 * every write stamps `updated` and takes a per-record lock, so a keystroke-
 * driven save turns one edit into dozens of revisions other agents must
 * revalidate against.
 */
export function BodyEditor({
    value,
    revision,
    onSave,
    disabled = false
}: {
    value: string;
    revision?: string;
    onSave: (body: string, revision?: string) => Promise<unknown>;
    disabled?: boolean;
}) {
    const [draft, setDraft] = useState(value);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");
    const [conflict, setConflict] = useState<Conflict | null>(null);
    const baseline = useRef(value);

    // Keyed on the incoming value, so a background refresh of an untouched
    // record updates the editor while an edit in progress is left alone.
    useEffect(() => {
        if (draft === baseline.current) {
            baseline.current = value;
            setDraft(value);
        }
    }, [value]);

    const dirty = draft !== baseline.current;

    async function save(body: string, expected?: string) {
        setSaving(true);
        setError("");
        try {
            await onSave(body, expected);
            baseline.current = body;
            setDraft(body);
            setConflict(null);
        } catch (reason) {
            const failure = reason as Error & {
                code?: string;
                details?: { current?: { body?: string; revision?: string } };
            };
            // A conflict is not an error to report and forget: the other
            // version is right here, so offer the choice instead of a banner.
            if (
                failure.code?.endsWith("WRITE_CONFLICT") &&
                failure.details?.current
            ) {
                setConflict({
                    theirs: failure.details.current.body ?? "",
                    theirRevision: failure.details.current.revision ?? ""
                });
            } else {
                setError(failure.message || String(reason));
            }
        } finally {
            setSaving(false);
        }
    }

    const preClassName =
        "mt-1.5 max-h-60 overflow-auto rounded-md border bg-muted p-2 font-mono text-[11px] leading-relaxed whitespace-pre-wrap text-foreground";

    return (
        <div className="flex flex-col gap-2.5">
            <Textarea
                className="min-h-80 field-sizing-fixed resize-y font-mono text-sm"
                value={draft}
                spellCheck={false}
                disabled={disabled || saving}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                    if (
                        (event.metaKey || event.ctrlKey) &&
                        event.key === "Enter"
                    ) {
                        event.preventDefault();
                        void save(draft, revision);
                    }
                }}
                aria-label="Record body"
            />
            <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-[10.5px] text-muted-foreground/70">
                    {dirty ? (
                        <>
                            Unsaved changes · <Kbd>⌘↵</Kbd> to save
                        </>
                    ) : (
                        "Saved"
                    )}
                </span>
                <span className="flex-1" />
                <ButtonGroup>
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={!dirty || saving || disabled}
                        onClick={() => {
                            setDraft(baseline.current);
                            setError("");
                        }}
                    >
                        Discard
                    </Button>
                    <Button
                        type="button"
                        size="sm"
                        disabled={!dirty || saving || disabled}
                        onClick={() => void save(draft, revision)}
                    >
                        {saving ? "Saving…" : "Save"}
                    </Button>
                </ButtonGroup>
            </div>

            {error ? (
                <Alert variant="destructive">
                    <AlertDescription>{error}</AlertDescription>
                </Alert>
            ) : null}

            {conflict ? (
                <Alert variant="destructive">
                    <AlertDescription className="flex w-full flex-col items-stretch gap-2.5">
                        <p className="m-0 text-[12.5px] text-muted-foreground">
                            This record changed on disk while you were editing —
                            another agent, the CLI, or git. Your text is still
                            here.
                        </p>
                        <div className="grid w-full grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-2.5">
                            <section className="min-w-0">
                                <span className="text-[10px] font-medium tracking-wider uppercase text-muted-foreground">
                                    Theirs (on disk now)
                                </span>
                                <pre className={preClassName}>
                                    {conflict.theirs}
                                </pre>
                            </section>
                            <section className="min-w-0">
                                <span className="text-[10px] font-medium tracking-wider uppercase text-muted-foreground">
                                    Yours
                                </span>
                                <pre className={preClassName}>{draft}</pre>
                            </section>
                        </div>
                        <div className="flex w-full flex-wrap justify-end gap-2">
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                    baseline.current = conflict.theirs;
                                    setDraft(conflict.theirs);
                                    setConflict(null);
                                }}
                            >
                                Take theirs
                            </Button>
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                    // Both, in order, with a marker: neither side
                                    // is silently lost, and the result is something
                                    // a person can finish resolving in place.
                                    const merged = `${conflict.theirs.replace(/\s+$/, "")}\n\n<!-- yours -->\n\n${draft.replace(/\s+$/, "")}\n`;
                                    setDraft(merged);
                                    setConflict(null);
                                }}
                            >
                                Keep both
                            </Button>
                            <Button
                                type="button"
                                variant="destructive"
                                size="sm"
                                onClick={() =>
                                    void save(draft, conflict.theirRevision)
                                }
                            >
                                Overwrite with mine
                            </Button>
                        </div>
                    </AlertDescription>
                </Alert>
            ) : null}
        </div>
    );
}
