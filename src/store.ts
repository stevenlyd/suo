import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import type { SuoSnapshot } from './model.js'
import { assertValidSnapshot } from './validation.js'

export const workspaceDir = (root = process.cwd()) => join(root, '.suo')
export const snapshotPath = (root = process.cwd()) => join(workspaceDir(root), 'suo.json')

export async function loadSnapshot(root = process.cwd()): Promise<SuoSnapshot> {
  const value: unknown = JSON.parse(await readFile(snapshotPath(root), 'utf8'))
  assertValidSnapshot(value)
  return value
}

export async function saveSnapshot(snapshot: SuoSnapshot, root = process.cwd()): Promise<void> {
  assertValidSnapshot(snapshot)
  const path = snapshotPath(root)
  await mkdir(dirname(path), { recursive: true })
  try {
    const current: unknown = JSON.parse(await readFile(path, 'utf8'))
    assertValidSnapshot(current)
    const expected = snapshot.revision - 1
    if (current.revision !== expected) throw new Error(`stale Suo revision: expected ${String(current.revision)} -> ${expected}`)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
  }
  const temporary = `${path}.${process.pid}.tmp`
  await writeFile(temporary, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8')
  await rename(temporary, path)
}
