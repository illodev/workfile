import { Fragment, memo, type ReactNode } from "react";

/**
 * The record-body renderer, extracted from the old Drawer so every surface
 * (inspector, docs pane, triage reading pane) shares one parser.
 *
 * Hand-rolled on purpose: record bodies are this protocol's own Markdown,
 * the subset is small and known, and a real parser dependency would be the
 * largest thing in the bundle. Memoised on `source` — this reparses the whole
 * document, and it used to do so on every render of whatever contained it.
 */

const INLINE_PATTERN =
    /(`[^`]+`|!\[[^\]]*\]\([^)]+\)|\[\[[^\]]+\]\]|\[[^\]]+\]\([^)]+\)|\*\*[^*]+\*\*|\*[^*\n]+\*|_[^_\n]+_)/g;

function InlineMarkdown({
    source,
    id,
    onOpen
}: {
    source: string;
    id: string | number;
    onOpen?: (recordId: string) => void;
}) {
    return (
        <>
            {source.split(INLINE_PATTERN).map((part, index) => {
                const key = `${id}-${index}`;
                if (!part) return null;
                if (part.startsWith("`") && part.endsWith("`"))
                    return <code key={key}>{part.slice(1, -1)}</code>;

                const image = part.match(/^!\[([^\]]*)\]\(([^)]+)\)$/);
                if (image) {
                    // Repository-relative or served assets only: an arbitrary
                    // remote URL in a record body would leak a page view to
                    // whoever wrote it.
                    const src = image[2].trim();
                    if (!/^(https?:)?\/\//.test(src)) {
                        return (
                            <img
                                key={key}
                                src={src}
                                alt={image[1]}
                                loading="lazy"
                            />
                        );
                    }
                    return <Fragment key={key}>{image[1]}</Fragment>;
                }

                const wiki = part.match(/^\[\[([^\]|]+)(?:\|([^\]]+))?\]\]$/);
                if (wiki) {
                    const target = wiki[1].trim();
                    return (
                        <button
                            key={key}
                            type="button"
                            className="wikilink"
                            onClick={() => onOpen?.(target)}
                        >
                            {wiki[2]?.trim() || target}
                        </button>
                    );
                }

                if (part.startsWith("**") && part.endsWith("**"))
                    return <strong key={key}>{part.slice(2, -2)}</strong>;
                if (
                    (part.startsWith("*") && part.endsWith("*")) ||
                    (part.startsWith("_") && part.endsWith("_"))
                ) {
                    return <em key={key}>{part.slice(1, -1)}</em>;
                }

                const link = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
                if (link)
                    return (
                        <a
                            key={key}
                            href={link[2]}
                            target="_blank"
                            rel="noreferrer"
                        >
                            {link[1]}
                        </a>
                    );
                return <Fragment key={key}>{part}</Fragment>;
            })}
        </>
    );
}

function splitTableRow(line: string) {
    return line
        .trim()
        .replace(/^\||\|$/g, "")
        .split("|")
        .map((cell) => cell.trim());
}

export const MarkdownBody = memo(function MarkdownBody({
    source,
    onOpen
}: {
    source: string;
    onOpen?: (recordId: string) => void;
}) {
    const lines = source.split(/\r?\n/);
    const nodes: ReactNode[] = [];
    let list: ReactNode[] = [];
    let orderedList = false;
    let paragraph: string[] = [];
    function flushList() {
        if (!list.length) return;
        const List = orderedList ? "ol" : "ul";
        nodes.push(<List key={`list-${nodes.length}`}>{list}</List>);
        list = [];
    }
    function flushParagraph() {
        if (!paragraph.length) return;
        const text = paragraph.join(" ");
        nodes.push(
            <p key={`paragraph-${nodes.length}`}>
                <InlineMarkdown
                    source={text}
                    id={`p-${nodes.length}`}
                    onOpen={onOpen}
                />
            </p>
        );
        paragraph = [];
    }
    for (let index = 0; index < lines.length; index += 1) {
        const line = lines[index];
        const heading = line.match(/^(#{1,6})\s+(.*)$/);
        const item = line.match(
            /^\s*(?:([-*])|(\d+)\.)\s+(?:\[([ xX])\]\s+)?(.*)$/
        );
        const fence = line.match(/^```(.*)$/);
        const nextLine = lines[index + 1] || "";
        const isTable =
            line.includes("|") &&
            /^\s*\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(
                nextLine
            );
        if (fence) {
            flushParagraph();
            flushList();
            const code: string[] = [];
            index += 1;
            while (index < lines.length && !lines[index].startsWith("```")) {
                code.push(lines[index]);
                index += 1;
            }
            nodes.push(
                <pre key={`code-${index}`}>
                    <code>{code.join("\n")}</code>
                </pre>
            );
        } else if (isTable) {
            flushParagraph();
            flushList();
            const headers = splitTableRow(line);
            const rows: string[][] = [];
            index += 2;
            while (index < lines.length && lines[index].includes("|")) {
                rows.push(splitTableRow(lines[index]));
                index += 1;
            }
            index -= 1;
            nodes.push(
                // A wide table scrolls inside its own box rather than pushing
                // the body sideways.
                <div
                    style={{ width: "100%", overflowX: "auto" }}
                    key={`table-${index}`}
                >
                    <table>
                        <thead>
                            <tr>
                                {headers.map((cell, cellIndex) => (
                                    <th key={cellIndex}>
                                        <InlineMarkdown
                                            source={cell}
                                            id={`th-${index}-${cellIndex}`}
                                        />
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map((row, rowIndex) => (
                                <tr key={rowIndex}>
                                    {headers.map((_, cellIndex) => (
                                        <td key={cellIndex}>
                                            <InlineMarkdown
                                                source={row[cellIndex] || ""}
                                                id={`td-${index}-${rowIndex}-${cellIndex}`}
                                            />
                                        </td>
                                    ))}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            );
        } else if (heading) {
            flushParagraph();
            flushList();
            // Offset by one: a record body starts at `#`, but the surface
            // showing it already owns the page heading.
            const Tag = `h${Math.min(6, heading[1].length + 1)}` as
                | "h2"
                | "h3"
                | "h4"
                | "h5"
                | "h6";
            nodes.push(
                <Tag key={index}>
                    <InlineMarkdown
                        source={heading[2]}
                        id={`h-${index}`}
                        onOpen={onOpen}
                    />
                </Tag>
            );
        } else if (item) {
            flushParagraph();
            const nextOrdered = Boolean(item[2]);
            if (list.length && orderedList !== nextOrdered) flushList();
            orderedList = nextOrdered;
            list.push(
                <li key={index}>
                    {item[3] ? (item[3] === " " ? "☐ " : "☑ ") : ""}
                    <InlineMarkdown
                        source={item[4]}
                        id={`li-${index}`}
                        onOpen={onOpen}
                    />
                </li>
            );
        } else if (line.startsWith(">")) {
            flushParagraph();
            flushList();
            nodes.push(
                <blockquote key={index}>
                    <InlineMarkdown
                        source={line.replace(/^>\s?/, "")}
                        id={`quote-${index}`}
                        onOpen={onOpen}
                    />
                </blockquote>
            );
        } else if (/^\s*---+\s*$/.test(line)) {
            flushParagraph();
            flushList();
            nodes.push(<hr key={index} />);
        } else if (!line.trim()) {
            flushParagraph();
            flushList();
        } else {
            flushList();
            paragraph.push(line.trim());
        }
    }
    flushParagraph();
    flushList();
    return <div className="prose">{nodes}</div>;
});
