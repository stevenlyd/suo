import { lstat } from 'node:fs/promises';
import { join } from 'node:path';
export async function assertNoPendingUnitWrite(root) {
    try {
        await lstat(join(root, '.suo/unit-write.json'));
    }
    catch (error) {
        if (error.code === 'ENOENT')
            return;
        throw error;
    }
    throw new Error('pending Unit transaction: recover before reading/writing working-tree authority');
}
//# sourceMappingURL=unit-transaction.js.map