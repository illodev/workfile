#!/usr/bin/env node
/**
 * Writes the generated half of `site/`.
 *
 * The site deploys as plain static files with no build step (`site/vercel.json`),
 * so what a crawler or an agent reads there is exactly what is committed. Three
 * kinds of content would drift the first time they were copied by hand, and
 * this script is the only writer of each:
 *
 * - `/docs/*` — one HTML page and one Markdown twin per `packages/workfile/docs/*.md`.
 * - `/vs/*.html` — rendered from the hand-written `site/vs/*.md` beside them,
 *   which are served as their own twins.
 * - `sitemap.xml`, `llms.txt`, `llms-full.txt`, and every region of the landing
 *   page fenced by `<!-- generated:NAME -->`: the MCP inventory as the built
 *   server reports it, the list of docs, and what the page costs to read.
 *
 * `--check` writes nothing and exits 1 when a committed file differs from what
 * this would write. `pnpm run check` runs it, so a doc edited without
 * regenerating the site fails there instead of on the live page.
 */
import { execFileSync } from "node:child_process";
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { Marked, type Tokens } from "marked";

const check = process.argv.includes("--check");
const root = fileURLToPath(new URL("..", import.meta.url));
const site = join(root, "site");
const docsSource = join(root, "packages/workfile/docs");

const ORIGIN = "https://workfile.illodev.com";
const REPO = "https://github.com/illodev/workfile";
const NPM = "https://www.npmjs.com/package/@illodev/workfile";

/**
 * Git for Windows checks text files out with CRLF, and CI runs there as well
 * as on Linux and macOS. Everything is read and compared as LF, or the check
 * fails on one runner and passes on the other two.
 */
async function read(path: string): Promise<string> {
    return (await readFile(path, "utf8")).replaceAll("\r\n", "\n");
}

async function readIfExists(path: string): Promise<string | undefined> {
    try {
        return await read(path);
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
        throw error;
    }
}

async function listIfExists(path: string): Promise<string[]> {
    try {
        return (await readdir(path)).sort();
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
        throw error;
    }
}

const escapeHtml = (value: string) =>
    value
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;");

/** JSON-LD sits inside a script element, where `</script>` would end it. */
const jsonLd = (value: unknown) => JSON.stringify(value).replaceAll("<", "\\u003c");

/**
 * Bytes over four, rounded to tens. The pages print this figure and say how
 * it was reached: it is an estimate, and no tokenizer is shared by every
 * agent that will read them.
 */
const tokens = (text: string) => Math.round(Buffer.byteLength(text, "utf8") / 40) * 10;
const figure = (value: number) => value.toLocaleString("en-US");

/**
 * The inventory as the built server reports it, through the same command a
 * user would run. The landing states these numbers, and 0.11.0 showed what a
 * hand-typed count turns into: two tools shipped and every page kept saying 30.
 */
const inventory = JSON.parse(
    execFileSync(
        process.execPath,
        [join(root, "packages/workfile/dist/bin/workfile.js"), "mcp", "inspect", "--json"],
        { cwd: root, encoding: "utf8" }
    )
) as {
    tools: { name: string; title: string; mutating: boolean }[];
    resources: string[];
    prompts: string[];
};

// Docs ------------------------------------------------------------------------

/** Reading order on the site. A doc missing here is appended, never dropped. */
const DOC_ORDER = ["getting-started", "cli", "mcp", "http-api", "ui", "security", "spec"];

const docFiles = new Map(
    (await readdir(docsSource))
        .filter((name) => name.endsWith(".md"))
        .map((name) => [name.slice(0, -3).toLowerCase(), name])
);
const docSlugs = [
    ...DOC_ORDER.filter((slug) => docFiles.has(slug)),
    ...[...docFiles.keys()].filter((slug) => !DOC_ORDER.includes(slug)).sort()
];

/**
 * A doc links its siblings as `cli.md`, which is right on GitHub and a 404
 * here. A sibling becomes a site route — the page for a page, the twin for a
 * twin — and any other relative link resolves against the file's place in the
 * repository, which is where it exists.
 */
function rewriteHref(href: string, twin: boolean): string {
    const sibling = href.match(/^(?:\.\/)?([A-Za-z0-9_-]+)\.md(#.*)?$/);
    if (sibling && docFiles.has(sibling[1].toLowerCase())) {
        return `/docs/${sibling[1].toLowerCase()}${twin ? ".md" : ""}${sibling[2] ?? ""}`;
    }
    if (/^(?:[a-z][a-z0-9+.-]*:|#|\/)/i.test(href)) return href;
    return new URL(href, `${REPO}/blob/main/packages/workfile/docs/`).href;
}

/** The same rewrite over raw Markdown, outside fences and code spans. */
function rewriteMarkdownLinks(source: string): string {
    let fence: string | undefined;
    return source
        .split("\n")
        .map((line) => {
            const marker = line.match(/^\s*(`{3,}|~{3,})/);
            if (marker) {
                if (!fence) fence = marker[1][0];
                else if (marker[1][0] === fence) fence = undefined;
                return line;
            }
            if (fence) return line;
            return line
                .split(/(`+[^`]*`+)/)
                .map((part, index) =>
                    index % 2
                        ? part
                        : part.replace(/\]\(([^)\s]+)\)/g, (_, href: string) => `](${rewriteHref(href, true)})`)
                )
                .join("");
        })
        .join("\n");
}

/** GitHub's anchors, so a `#section` link copied from the repository still lands. */
function slugger() {
    const seen = new Map<string, number>();
    return (text: string) => {
        const base = text
            .toLowerCase()
            .replace(/[^\p{L}\p{N}\s_-]/gu, "")
            .trim()
            .replace(/\s/g, "-");
        const times = seen.get(base) ?? 0;
        seen.set(base, times + 1);
        return times ? `${base}-${times}` : base;
    };
}

function render(markdown: string) {
    const slug = slugger();
    const outline: { id: string; html: string }[] = [];
    const marked = new Marked({ gfm: true });
    marked.use({
        renderer: {
            heading({ tokens: inline, depth, text }: Tokens.Heading) {
                const id = slug(text);
                const html = this.parser.parseInline(inline);
                if (depth === 2) outline.push({ id, html });
                const hash =
                    depth === 1
                        ? ""
                        : `<a class="hash" href="#${id}" aria-hidden="true" tabindex="-1">${"#".repeat(depth)}</a> `;
                return `<h${depth} id="${id}">${hash}${html}</h${depth}>\n`;
            },
            link({ href, title, tokens: inline }: Tokens.Link) {
                const target = rewriteHref(href, false);
                const titled = title ? ` title="${escapeHtml(title)}"` : "";
                return `<a href="${escapeHtml(target)}"${titled}>${this.parser.parseInline(inline)}</a>`;
            },
            code({ text, lang }: Tokens.Code) {
                const language = lang?.split(/\s/)[0];
                const labelled = language ? ` data-lang="${escapeHtml(language)}"` : "";
                return `<pre class="code"${labelled}><code>${escapeHtml(text)}</code></pre>\n`;
            }
        }
    });
    const html = (marked.parse(markdown) as string)
        .replaceAll("<table>", '<div class="table"><table>')
        .replaceAll("</table>", "</table></div>");
    return { html, outline };
}

function titleOf(markdown: string): string {
    const heading = new Marked()
        .lexer(markdown)
        .find((token) => token.type === "heading" && token.depth === 1) as Tokens.Heading | undefined;
    return (heading?.text ?? "").replaceAll("`", "");
}

/** The first paragraph as plain text, cut at a word before 155 characters. */
function describe(markdown: string): string {
    const paragraph = new Marked()
        .lexer(markdown)
        .find((token) => token.type === "paragraph") as Tokens.Paragraph | undefined;
    const plain = (paragraph?.text ?? "")
        .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
        .replace(/[*`]/g, "")
        .replace(/\s+/g, " ")
        .trim();
    if (plain.length <= 155) return plain;
    return `${plain.slice(0, plain.lastIndexOf(" ", 152))}…`;
}

/** Hand-written pages carry `key: value` frontmatter; nothing nested. */
function frontmatter(source: string) {
    const block = source.match(/^---\n([\s\S]*?)\n---\n/);
    if (!block) return { data: {} as Record<string, string>, body: source };
    const data: Record<string, string> = {};
    for (const line of block[1].split("\n")) {
        const pair = line.match(/^([A-Za-z_]+):\s*(.*)$/);
        if (pair) data[pair[1]] = pair[2].replace(/^"(.*)"$/, "$1");
    }
    return { data, body: source.slice(block[0].length) };
}

interface Page {
    slug: string;
    path: string;
    twin: string;
    title: string;
    /** Shorter than the title, for the side navigation. */
    label?: string;
    description: string;
    markdown: string;
    source: { label: string; url: string };
}

const docs: Page[] = [];
for (const slug of docSlugs) {
    const file = docFiles.get(slug)!;
    const source = await read(join(docsSource, file));
    docs.push({
        slug,
        path: `/docs/${slug}`,
        twin: `/docs/${slug}.md`,
        title: titleOf(source),
        description: describe(source),
        markdown: rewriteMarkdownLinks(source),
        source: {
            label: `packages/workfile/docs/${file}`,
            url: `${REPO}/blob/main/packages/workfile/docs/${file}`
        }
    });
}

// Generated regions ----------------------------------------------------------------

const reads = inventory.tools.filter((tool) => !tool.mutating);
const writes = inventory.tools.filter((tool) => tool.mutating);
const regions: Record<string, { html: string; md: string }> = {
    "tool-count": { html: String(inventory.tools.length), md: String(inventory.tools.length) },
    "read-count": { html: String(reads.length), md: String(reads.length) },
    "write-count": { html: String(writes.length), md: String(writes.length) },
    "resource-count": { html: String(inventory.resources.length), md: String(inventory.resources.length) },
    "prompt-count": { html: String(inventory.prompts.length), md: String(inventory.prompts.length) },
    tools: {
        html: `\n${inventory.tools
            .map(
                (tool) =>
                    `<li class="tool${tool.mutating ? " w" : ""}"><code>${tool.name}</code><span>${escapeHtml(tool.title)}</span><i>${tool.mutating ? "writes" : "reads"}</i></li>`
            )
            .join("\n")}\n`,
        md: `\n${inventory.tools.map((tool) => `- \`${tool.name}\` — ${tool.title} (${tool.mutating ? "writes" : "reads"})`).join("\n")}\n`
    },
    resources: {
        html: inventory.resources.map((uri) => `<code>${escapeHtml(uri)}</code>`).join(" "),
        md: inventory.resources.map((uri) => `\`${uri}\``).join(", ")
    },
    prompts: {
        html: inventory.prompts.map((name) => `<code>${escapeHtml(name)}</code>`).join(" "),
        md: inventory.prompts.map((name) => `\`${name}\``).join(", ")
    },
    "docs-list": {
        html: `\n${docs.map((page) => `<li><a href="${page.twin}"><code>${page.twin}</code></a><span>${escapeHtml(page.title)}</span></li>`).join("\n")}\n`,
        md: `\n${docs.map((page) => `- [${page.twin}](${ORIGIN}${page.twin}) — ${page.title}`).join("\n")}\n`
    }
};

// Comparisons -------------------------------------------------------------------

const comparisons: (Page & { body: string; checked: string })[] = [];
for (const name of (await listIfExists(join(site, "vs"))).filter((entry) => entry.endsWith(".md"))) {
    const slug = name.slice(0, -3);
    // A comparison states Workfile's tool count too, and is its own twin, so
    // the regions are filled in the file itself.
    const markdown = Object.entries(regions).reduce(
        (text, [region, content]) => fill(text, `site/vs/${name}`, region, content.md, false),
        await read(join(site, "vs", name))
    );
    const { data, body } = frontmatter(markdown);
    for (const key of ["title", "description", "checked"]) {
        if (!data[key]) throw new Error(`site/vs/${name} has no ${key} in its frontmatter`);
    }
    comparisons.push({
        slug,
        path: `/vs/${slug}`,
        twin: `/vs/${slug}.md`,
        title: data.title,
        label: data.label,
        description: data.description,
        checked: data.checked,
        markdown,
        body,
        source: { label: `site/vs/${name}`, url: `${REPO}/blob/main/site/vs/${name}` }
    });
}

// Shell -------------------------------------------------------------------------

const MARK = `<svg viewBox="0 0 96 96" fill="none" aria-hidden="true"><rect x="10" y="10" width="76" height="76" rx="22" stroke="currentColor" stroke-width="8"/><line x1="30" y1="36" x2="66" y2="36" stroke="currentColor" stroke-width="8" stroke-linecap="round"/><line x1="42" y1="48" x2="66" y2="48" stroke="currentColor" stroke-width="8" stroke-linecap="round"/><line x1="30" y1="60" x2="66" y2="60" stroke="currentColor" stroke-width="8" stroke-linecap="round"/></svg>`;
const FAVICON = `data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 96 96%22 fill=%22none%22><rect x=%2210%22 y=%2210%22 width=%2276%22 height=%2276%22 rx=%2222%22 stroke=%22%233149D4%22 stroke-width=%228%22/><line x1=%2230%22 y1=%2236%22 x2=%2266%22 y2=%2236%22 stroke=%22%233149D4%22 stroke-width=%228%22 stroke-linecap=%22round%22/><line x1=%2242%22 y1=%2248%22 x2=%2266%22 y2=%2248%22 stroke=%22%233149D4%22 stroke-width=%228%22 stroke-linecap=%22round%22/><line x1=%2230%22 y1=%2260%22 x2=%2266%22 y2=%2260%22 stroke=%22%233149D4%22 stroke-width=%228%22 stroke-linecap=%22round%22/></svg>`;

const SOFTWARE = {
    "@type": "SoftwareApplication",
    "@id": `${ORIGIN}/#software`,
    name: "Workfile",
    url: `${ORIGIN}/`
};

function sideNav(current: string, outline: { id: string; html: string }[]): string {
    const entry = (page: Page) => {
        const here = page.path === current;
        const children =
            here && outline.length
                ? `<ol>${outline.map((item) => `<li><a href="#${item.id}">${item.html}</a></li>`).join("")}</ol>`
                : "";
        return `<li><a href="${page.path}"${here ? ' aria-current="page"' : ""}>${escapeHtml(page.label ?? page.title)}</a>${children}</li>`;
    };
    const compare = comparisons.length
        ? `<p class="side-label">&lt;compare&gt;</p><ol>${comparisons.map(entry).join("")}</ol>`
        : "";
    return `<p class="side-label">&lt;docs&gt;</p><ol>${docs.map(entry).join("")}</ol>${compare}`;
}

function shell(page: Page, options: { kind: "docs" | "compare"; body: string; outline: { id: string; html: string }[] }): string {
    // A comparison's title is written for search; a doc's is its H1.
    const title = options.kind === "docs" ? `${page.title} — Workfile docs` : page.title;
    const graph = {
        "@context": "https://schema.org",
        "@graph": [
            {
                "@type": options.kind === "docs" ? "TechArticle" : "Article",
                headline: page.title,
                description: page.description,
                url: `${ORIGIN}${page.path}`,
                inLanguage: "en",
                about: { "@id": SOFTWARE["@id"] },
                isPartOf: { "@type": "WebSite", name: "Workfile", url: `${ORIGIN}/` }
            },
            SOFTWARE,
            {
                "@type": "BreadcrumbList",
                itemListElement: [
                    { "@type": "ListItem", position: 1, name: "Workfile", item: `${ORIGIN}/` },
                    {
                        "@type": "ListItem",
                        position: 2,
                        name: options.kind === "docs" ? "Docs" : "Compare",
                        item: `${ORIGIN}${options.kind === "docs" ? docs[0].path : comparisons[0].path}`
                    },
                    { "@type": "ListItem", position: 3, name: page.title, item: `${ORIGIN}${page.path}` }
                ]
            }
        ]
    };
    const compareLink = comparisons.length ? `<a href="${comparisons[0].path}">compare</a>` : "";
    return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<title>${escapeHtml(title)}</title>
<meta name="description" content="${escapeHtml(page.description)}">
<link rel="canonical" href="${ORIGIN}${page.path}">
<link rel="alternate" type="text/markdown" href="${page.twin}" title="This page as Markdown">
<meta property="og:type" content="article">
<meta property="og:site_name" content="Workfile">
<meta property="og:title" content="${escapeHtml(title)}">
<meta property="og:description" content="${escapeHtml(page.description)}">
<meta property="og:url" content="${ORIGIN}${page.path}">
<meta property="og:image" content="${ORIGIN}/assets/social.png">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="${FAVICON}">
<link rel="preload" href="/assets/geist-mono-latin-wght-normal.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="/assets/site.css">
<script type="application/ld+json">${jsonLd(graph)}</script>
</head>
<body>
<a class="skip" href="#main">Skip to content</a>
<header class="bar"><div class="bar-in">
<a class="brand" href="/">${MARK}<span>workfile</span></a>
<nav class="bar-nav" aria-label="Site"><a href="${docs[0].path}"${options.kind === "docs" ? ' aria-current="page"' : ""}>docs</a>${compareLink.replace(">compare", options.kind === "compare" ? ' aria-current="page">compare' : ">compare")}<a href="${REPO}">github</a><a href="${NPM}">npm</a></nav>
</div></header>
<div class="page-grid">
<nav class="side" aria-label="Pages">${sideNav(page.path, options.outline)}</nav>
<main id="main" class="page-main">
<p class="twin"><span>GET ${page.path}</span><span>Accept: text/markdown</span><span>→ <a href="${page.twin}">${page.twin}</a></span><span>≈${figure(tokens(page.markdown))} tokens</span></p>
<article class="prose">
${options.body}</article>
<p class="source">Generated from <a href="${page.source.url}">${page.source.label}</a>.</p>
</main>
</div>
<footer class="foot"><div class="foot-in"><span>MIT © illodev — the repository is the database</span><a href="/">home</a><a href="/llms.txt">llms.txt</a><a href="${REPO}">github</a><a href="${NPM}">npm</a></div></footer>
</body>
</html>
`;
}

// Outputs -----------------------------------------------------------------------

const outputs = new Map<string, string>();

for (const page of docs) {
    const { html, outline } = render(page.markdown);
    outputs.set(`docs/${page.slug}.html`, shell(page, { kind: "docs", body: html, outline }));
    outputs.set(
        `docs/${page.slug}.md`,
        `<!-- ${ORIGIN}${page.path} · generated from ${page.source.label} -->\n\n${page.markdown}`
    );
}

for (const page of comparisons) {
    const { html, outline } = render(page.body);
    const note = `<p class="checked">Every claim about a third party below links its source and was checked on <time datetime="${page.checked}">${page.checked}</time>.</p>\n`;
    const body = html.replace("</h1>\n", `</h1>\n${note}`);
    outputs.set(`vs/${page.slug}.html`, shell(page, { kind: "compare", body, outline }));
    outputs.set(`vs/${page.slug}.md`, page.markdown);
}

/**
 * Regions of a hand-written file that this script owns. `required` regions
 * must exist: a landing page that lost its tool count should fail here, not
 * go on stating nothing.
 */
function fill(source: string, file: string, name: string, content: string, required = true): string {
    const pattern = new RegExp(`(<!-- generated:${name} -->)[\\s\\S]*?(<!-- /generated:${name} -->)`, "g");
    if (!pattern.test(source)) {
        if (required) throw new Error(`${file} has no <!-- generated:${name} --> region`);
        return source;
    }
    pattern.lastIndex = 0;
    return source.replace(pattern, (_, open: string, close: string) => `${open}${content}${close}`);
}

let landingMd = await read(join(site, "index.md"));
let landingHtml = await read(join(site, "index.html"));
for (const [name, content] of Object.entries(regions)) {
    const required = name === "tool-count" || name === "tools";
    landingMd = fill(landingMd, "site/index.md", name, content.md, required);
    landingHtml = fill(landingHtml, "site/index.html", name, content.html, required);
}
landingHtml = fill(landingHtml, "site/index.html", "tokens-md", figure(tokens(landingMd)));
// The page states its own size, and stating it changes it. Rounded to tens,
// this settles in one or two passes.
for (let pass = 0; pass < 5; pass += 1) {
    const next = fill(landingHtml, "site/index.html", "tokens-html", figure(tokens(landingHtml)));
    if (next === landingHtml) break;
    landingHtml = next;
}
outputs.set("index.md", landingMd);
outputs.set("index.html", landingHtml);

const pages = [
    { path: "/", title: "Workfile", twin: "/index.md" },
    ...docs,
    ...comparisons
];

outputs.set(
    "sitemap.xml",
    `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${pages.map((page) => `  <url><loc>${ORIGIN}${page.path}</loc></url>`).join("\n")}
</urlset>
`
);

outputs.set(
    "llms.txt",
    [
        "# Workfile",
        "",
        `> Tasks, docs, changelog and decisions as Markdown files in a repository's \`.project/\`, shared by humans and AI coding agents. A CLI, a local web UI, an HTTP API and an MCP server with ${inventory.tools.length} tools read and write them. MIT, Node.js 22 or later.`,
        "",
        "Every HTML page on this site has a Markdown twin: request the page with `Accept: text/markdown`, or add `.md` to its path (`/index.md` for the home page).",
        "",
        "## Start here",
        "",
        `- [Workfile, addressed to the agent evaluating it](${ORIGIN}/index.md): what it stores, what it refuses, how to install it and when not to`,
        "",
        "## Docs",
        "",
        ...docs.map((page) => `- [${page.title}](${ORIGIN}${page.twin}): ${page.description}`),
        "",
        ...(comparisons.length
            ? ["## Comparisons", "", ...comparisons.map((page) => `- [${page.title}](${ORIGIN}${page.twin}): ${page.description}`), ""]
            : []),
        "## Optional",
        "",
        `- [Every page above in one file](${ORIGIN}/llms-full.txt)`,
        `- [Source code](${REPO})`,
        `- [npm package](${NPM})`,
        ""
    ].join("\n")
);

outputs.set(
    "llms-full.txt",
    `${[
        { path: "/", markdown: landingMd },
        ...docs,
        ...comparisons
    ]
        .map((page) => `<!-- ${ORIGIN}${page.path} -->\n\n${page.markdown.trim()}\n`)
        .join("\n---\n\n")}`
);

// Write or check ------------------------------------------------------------------

const stale: string[] = [];
for (const [relative, content] of outputs) {
    const path = join(site, ...relative.split("/"));
    if ((await readIfExists(path)) === content) continue;
    stale.push(relative);
    if (!check) {
        await mkdir(dirname(path), { recursive: true });
        await writeFile(path, content);
    }
}

// `docs/` is wholly generated; in `vs/` only the HTML is.
const orphans = [
    ...(await listIfExists(join(site, "docs"))).map((name) => `docs/${name}`),
    ...(await listIfExists(join(site, "vs"))).filter((name) => name.endsWith(".html")).map((name) => `vs/${name}`)
].filter((relative) => !outputs.has(relative));
for (const relative of orphans) {
    stale.push(`${relative} (no source any more)`);
    if (!check) await rm(join(site, ...relative.split("/")));
}

if (check) {
    if (stale.length) {
        process.stderr.write(
            `site/ is out of date with its sources:\n${stale.map((entry) => `  ${entry}`).join("\n")}\nRun \`pnpm run site\` and commit the result.\n`
        );
        process.exitCode = 1;
    } else {
        process.stdout.write(`site/ matches its sources (${outputs.size} generated files)\n`);
    }
} else {
    process.stdout.write(`${stale.length} of ${outputs.size} generated files rewritten in site/\n`);
}
