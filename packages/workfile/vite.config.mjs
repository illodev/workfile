import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const pkg = JSON.parse(
    readFileSync(resolve(import.meta.dirname, "package.json"), "utf8")
);

export default defineConfig(({ mode }) => {
    const demo = mode === "demo";
    return {
        root: resolve(import.meta.dirname, "ui"),
        plugins: [react(), tailwindcss()],
        resolve: {
            alias: {
                "@": resolve(import.meta.dirname, "ui/src")
            }
        },
        // Inlined as a constant so the unused API backend — and the demo
        // snapshot in regular builds — is dropped from the bundle.
        define: {
            "import.meta.env.VITE_DEMO": JSON.stringify(demo ? "1" : "0"),
            // The version chip in the top bar; inlined so the UI needs no
            // runtime endpoint to know what it is.
            "import.meta.env.VITE_APP_VERSION": JSON.stringify(pkg.version)
        },
        build: {
            // Separate outputs. Sharing one directory with `emptyOutDir: false`
            // meant a local `build:demo` left the demo bundle — with a 187 kB
            // snapshot of someone else's workspace embedded — sitting in
            // `dist/ui`, ready to be published as if it were the real UI.
            outDir: resolve(import.meta.dirname, demo ? "dist/demo" : "dist/ui"),
            emptyOutDir: true,
            assetsDir: "static",
            // Vite's default is broad enough to transpile syntax Node 22 and
            // every browser this runs in support natively.
            target: "es2022",
            rollupOptions: {
                output: {
                    // React and the primitives change on their own release
                    // cadence, not with the application. Splitting them keeps a
                    // routine UI edit from invalidating ~180 kB of cached vendor
                    // code in every visitor's browser.
                    manualChunks(id) {
                        if (!id.includes("node_modules")) return;
                        if (/[\\/]node_modules[\\/](react|react-dom|scheduler)[\\/]/.test(id))
                            return "react";
                        if (/[\\/]node_modules[\\/](@radix-ui|radix-ui|lucide-react)[\\/]/.test(id))
                            return "ui-primitives";
                    }
                }
            }
        }
    };
});
