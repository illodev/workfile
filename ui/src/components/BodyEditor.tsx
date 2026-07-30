import { useEffect, useRef, useState } from "react";

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

    const preStyle = {
        margin: "6px 0 0",
        maxHeight: 240,
        overflow: "auto",
        border: "1px solid var(--line)",
        borderRadius: 6,
        background: "var(--panel)",
        padding: 8,
        fontSize: 11,
        lineHeight: 1.6,
        whiteSpace: "pre-wrap"
    } as const;

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <textarea
                className="textarea"
                style={{ minHeight: 320 }}
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
            <div
                style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    flexWrap: "wrap"
                }}
            >
                <span className="mono faint" style={{ fontSize: 10.5 }}>
                    {dirty ? "Unsaved changes · ⌘↵ to save" : "Saved"}
                </span>
                <span style={{ flex: 1 }} />
                <button
                    type="button"
                    className="btn"
                    disabled={!dirty || saving || disabled}
                    onClick={() => {
                        setDraft(baseline.current);
                        setError("");
                    }}
                >
                    Discard
                </button>
                <button
                    type="button"
                    className="btn-accent"
                    disabled={!dirty || saving || disabled}
                    onClick={() => void save(draft, revision)}
                >
                    {saving ? "Saving…" : "Save"}
                </button>
            </div>

            {error ? (
                <div className="callout callout-error" style={{ margin: 0 }}>
                    {error}
                </div>
            ) : null}

            {conflict ? (
                <div
                    className="callout callout-error"
                    style={{
                        margin: 0,
                        flexDirection: "column",
                        alignItems: "stretch",
                        gap: 10
                    }}
                >
                    <p
                        style={{
                            margin: 0,
                            fontSize: 12.5,
                            color: "var(--fg-2)"
                        }}
                    >
                        This record changed on disk while you were editing —
                        another agent, the CLI, or git. Your text is still here.
                    </p>
                    <div
                        style={{
                            display: "grid",
                            gridTemplateColumns:
                                "repeat(auto-fit, minmax(200px, 1fr))",
                            gap: 10
                        }}
                    >
                        <section style={{ minWidth: 0 }}>
                            <span className="overline">
                                Theirs (on disk now)
                            </span>
                            <pre className="mono" style={preStyle}>
                                {conflict.theirs}
                            </pre>
                        </section>
                        <section style={{ minWidth: 0 }}>
                            <span className="overline">Yours</span>
                            <pre className="mono" style={preStyle}>
                                {draft}
                            </pre>
                        </section>
                    </div>
                    <div
                        style={{
                            display: "flex",
                            justifyContent: "flex-end",
                            gap: 8,
                            flexWrap: "wrap"
                        }}
                    >
                        <button
                            type="button"
                            className="btn"
                            onClick={() => {
                                baseline.current = conflict.theirs;
                                setDraft(conflict.theirs);
                                setConflict(null);
                            }}
                        >
                            Take theirs
                        </button>
                        <button
                            type="button"
                            className="btn"
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
                        </button>
                        <button
                            type="button"
                            className="btn-accent"
                            onClick={() =>
                                void save(draft, conflict.theirRevision)
                            }
                        >
                            Overwrite with mine
                        </button>
                    </div>
                </div>
            ) : null}
        </div>
    );
}
