import { mkdir, open, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";

export async function writeFileAtomic(path, content) {
    await mkdir(dirname(path), { recursive: true });
    const temporary = join(dirname(path), `.${randomUUID()}.tmp`);
    try {
        await writeFile(temporary, content, { encoding: "utf8", flag: "wx" });
        await rename(temporary, path);
    } finally {
        await rm(temporary, { force: true }).catch(() => undefined);
    }
}

export async function createFileExclusive(path, content) {
    await mkdir(dirname(path), { recursive: true });
    const handle = await open(path, "wx");
    try {
        await handle.writeFile(content, "utf8");
    } finally {
        await handle.close();
    }
}
