import { lstat, mkdir, open, rm } from 'node:fs/promises'
import { join, relative, resolve, sep } from 'node:path'

export async function withProjectLock<T>(root: string, operation: () => Promise<T>): Promise<T> {
  await safePath(root, '.suo')
  await mkdir(join(root, '.suo'), { recursive: true })
  const path = await safePath(root, '.suo/write.lock')
  let handle
  try { handle = await open(path, 'wx') } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') throw new Error('another Suo writer holds the project lock; after a crash, verify no writer is running before removing .suo/write.lock')
    throw error
  }
  try { return await operation() } finally { await handle.close(); await rm(path, { force: true }) }
}
export async function safePath(root: string, path: string): Promise<string> {
  const absolute = resolve(root, path)
  const local = relative(resolve(root), absolute)
  if (!local || local === '..' || local.startsWith(`..${sep}`) || resolve(root, local) !== absolute) throw new Error('path must stay inside the project')
  let current = resolve(root)
  for (const part of local.split(sep)) {
    current = join(current, part)
    try { if ((await lstat(current)).isSymbolicLink()) throw new Error(`symlink paths are not supported: ${path}`) }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }
  }
  return absolute
}
