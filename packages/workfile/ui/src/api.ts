import { demoApi } from "./api.demo";
import { httpApi } from "./api.http";

export type ProjectApi = typeof httpApi;

/** Demo builds (VITE_DEMO=1) replay a workspace snapshot with in-memory
 *  mutations; the flag is inlined at build time so the unused backend —
 *  and the snapshot itself in regular builds — is tree-shaken away. */
export const api: ProjectApi =
    import.meta.env.VITE_DEMO === "1" ? demoApi : httpApi;

/**
 * A marker only a demo bundle carries.
 *
 * It rides the same inlined flag as the API selection, so the constant folds
 * away entirely in a production build and survives minification in a demo one.
 * `scripts/prepare-bin.ts` greps `dist/ui` for it: publishing a demo bundle as
 * the real UI would show every user a snapshot of someone else's workspace,
 * and nothing about the file would look wrong.
 */
export const BUILD_KIND =
    import.meta.env.VITE_DEMO === "1" ? "__PROJECT_DEMO_SNAPSHOT__" : "release";
document.documentElement.dataset.build = BUILD_KIND;
