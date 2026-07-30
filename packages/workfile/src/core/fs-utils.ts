import { access } from "node:fs/promises";

/** Whether a path exists, without distinguishing why it does not. */
export async function exists(path) {
    try {
        await access(path);
        return true;
    } catch {
        return false;
    }
}
