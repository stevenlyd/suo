import { lstat } from 'node:fs/promises'
import { join } from 'node:path'
export async function assertNoPendingUnitWrite(root: string): Promise<void> {
  try { await lstat(join(root, '.suo/unit-write.json')) } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return; throw error }
  throw new Error('pending Unit transaction: recover before reading/writing working-tree authority')
}
