import { createHash } from 'node:crypto'
import { readFile, readdir, lstat, writeFile, rename, rm } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { safePath, withProjectLock } from './project-files.js'
import { readRepository, loadRepositoryUnits } from './unit-checkout.js'

export const writerPath = 'suo/writer.json'
export interface WriterIdentity { schemaVersion: 1; tool: 'suo'; version: string; skillDigest: string; runtimeDigest: string }
const hash = (value: string | Buffer) => createHash('sha256').update(value).digest('hex')
export function compareWriterVersions(actual: string, recorded: string): number {
  const parse = (value: string) => { if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(value)) throw new Error('writer version must be stable MAJOR.MINOR.PATCH'); return value.split('.').map(BigInt) }
  const a = parse(actual), b = parse(recorded)
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i]! > b[i]! ? 1 : -1
  return 0
}
export function validateWriter(value: unknown): asserts value is WriterIdentity {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).sort().join(',') !== 'runtimeDigest,schemaVersion,skillDigest,tool,version') throw new Error('unsupported Suo writer record; migrate explicitly')
  const v = value as WriterIdentity
  if (v.schemaVersion !== 1 || v.tool !== 'suo' || typeof v.version !== 'string' || !/^[a-f0-9]{64}$/.test(v.skillDigest) || !/^[a-f0-9]{64}$/.test(v.runtimeDigest)) throw new Error('invalid Suo writer record')
  compareWriterVersions(v.version, v.version)
}
/** Independent of other tools and of the network. Stack traversal includes referenced Skill resources. */
async function directoryDigest(root: string, directory: string, javascriptOnly = false): Promise<string> {
  const stack = [directory], files: Array<[string, string]> = []
  while (stack.length) {
    const path = stack.pop()!
    const actual = await safePath(root, path), stat = await lstat(actual)
    if (stat.isDirectory()) for (const entry of await readdir(actual)) stack.push(`${path}/${entry}`)
    else if (stat.isFile()) { if (!javascriptOnly || path.endsWith('.js')) files.push([path.slice(directory.length + 1), hash(await readFile(actual))]) }
    else throw new Error('writer identity requires regular package files')
  }
  if (!files.length) throw new Error('empty writer identity directory')
  return hash(JSON.stringify(files.sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)))
}
export async function currentWriter(): Promise<WriterIdentity> {
  const root = fileURLToPath(new URL('../', import.meta.url))
  const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'))
  if (pkg.name !== '@stevenlyd/suo') throw new Error('unexpected Suo package identity')
  const writer: WriterIdentity = { schemaVersion: 1, tool: 'suo', version: pkg.version, skillDigest: await directoryDigest(root, 'skills/suo'), runtimeDigest: await directoryDigest(root, 'dist', true) }
  validateWriter(writer); return writer
}
export async function readWriter(root: string, path = writerPath): Promise<WriterIdentity | null> {
  const actual = await safePath(root, path)
  let text: string
  try { text = await readFile(actual, 'utf8') } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null; throw error }
  const writer: unknown = JSON.parse(text); validateWriter(writer); return writer
}
export function requireCompatibleWriter(installed: WriterIdentity, recorded: WriterIdentity | null): 'unrecorded' | 'same' | 'newer' {
  validateWriter(installed)
  if (!recorded) return 'unrecorded'
  validateWriter(recorded)
  const comparison = compareWriterVersions(installed.version, recorded.version)
  if (comparison < 0) throw new Error(`Suo ${installed.version} is older than writer ${recorded.version}; upgrade before writing`)
  if (!comparison && (installed.skillDigest !== recorded.skillDigest || installed.runtimeDigest !== recorded.runtimeDigest)) throw new Error('Suo same-version package identity differs; investigate instead of overwriting')
  return comparison ? 'newer' : 'same'
}
export async function checkWriter(root: string) {
  const installed = await currentWriter(), recorded = await readWriter(root)
  return { installed, recorded, compatibility: requireCompatibleWriter(installed, recorded), path: writerPath, notice: 'Last-writer provenance, not latest-version policy, host-session attestation or migration authorization.' }
}
export const writerContents = (writer: WriterIdentity) => JSON.stringify(writer, null, 2) + '\n'
/** For Skill edits or external renderers. No product replacement, Git commit or other tool record. */
export async function recordWriter(root: string): Promise<void> {
  await withProjectLock(root, async () => {
    const { installed, recorded } = await checkWriter(root)
    const repository = await readRepository(root, 'working-tree')
    await loadRepositoryUnits(repository) // a newer reader must understand the current format
    if (recorded && writerContents(recorded) === writerContents(installed)) return
    const destination = await safePath(root, writerPath), temporary = await safePath(root, `.suo/writer-${randomUUID()}.tmp`)
    try {
      await writeFile(temporary, writerContents(installed), { flag: 'wx' })
      if ((await readRepository(root, 'working-tree')).token !== repository.token) throw new Error('repository changed while recording writer; retry after reviewing')
      await rename(temporary, destination)
    } finally { await rm(temporary, { force: true }) }
  })
}
