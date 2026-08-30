import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { assertValidSnapshot } from './validation.js';
export const workspaceDir = (root = process.cwd()) => join(root, '.intent-loop');
export const snapshotPath = (root = process.cwd()) => join(workspaceDir(root), 'intent-loop.json');
export async function loadSnapshot(root = process.cwd()) {
    const raw = JSON.parse(await readFile(snapshotPath(root), 'utf8'));
    assertValidSnapshot(raw);
    return raw;
}
export async function saveSnapshot(snapshot, root = process.cwd()) {
    assertValidSnapshot(snapshot);
    const target = snapshotPath(root);
    await mkdir(dirname(target), { recursive: true });
    try {
        const current = JSON.parse(await readFile(target, 'utf8'));
        const expected = snapshot.revision - 1;
        if (current.revision !== expected)
            throw new Error(`stale IntentLoop revision: expected ${String(current.revision)} -> ${expected}`);
    }
    catch (error) {
        const code = error.code;
        if (code !== 'ENOENT')
            throw error;
        if (snapshot.revision !== 0)
            throw new Error(`cannot create workspace at revision ${snapshot.revision}`);
    }
    const temporary = `${target}.${process.pid}.tmp`;
    await writeFile(temporary, `${JSON.stringify(snapshot, null, 2)}
`, 'utf8');
    await rename(temporary, target);
}
//# sourceMappingURL=store.js.map