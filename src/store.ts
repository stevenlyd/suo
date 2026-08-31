import { lstat, mkdir, open, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import type { Proposal, SuoSnapshot } from './model.js'
import { findProjectRoot, loadAuthority, saveAuthority } from './source.js'
import { assertValidSnapshot } from './validation.js'

export const workspaceDir = (root: string) => join(root, '.suo')
const stagedProposalPath = (root: string) => join(workspaceDir(root), 'staged', 'proposals.json')
const writeLockPath = (root: string) => join(workspaceDir(root), 'write.lock')

interface PreparedStagedWrite {
  commit(): Promise<void>
  cleanup(): Promise<void>
}

export async function loadSnapshot(start = process.cwd()): Promise<SuoSnapshot> {
  const root = await findProjectRoot(start)
  const authority = await loadAuthority(root)
  const authorityProposalIds = new Set(authority.proposals.map(value => value.id))
  const staged = (await loadStagedProposals(root)).filter(value => !authorityProposalIds.has(value.id))
  const snapshot = { ...authority, proposals: [...authority.proposals, ...staged] }
  assertValidSnapshot(snapshot)
  return snapshot
}

export async function saveSnapshot(snapshot: SuoSnapshot, start = process.cwd(), options: { initialize?: boolean } = {}): Promise<void> {
  assertValidSnapshot(snapshot)
  const root = await findProjectRoot(start, options.initialize === true)
  await withWriteLock(root, async () => {
    const canonical = authorityProjection(snapshot)
    const requestedPending = snapshot.proposals.filter(proposal => proposal.status === 'pending')
    const current = options.initialize ? undefined : await loadAuthority(root)
    const pending = options.initialize
      ? requestedPending
      : mergePending(await loadStagedProposals(root), requestedPending, new Set(canonical.proposals.map(value => value.id)))
    const prepared = await prepareStagedWrite(root, pending)
    try {
      if (options.initialize) {
        await saveAuthority(canonical, root)
        await prepared.commit()
        return
      }

      if (!current) throw new Error('current authority is unavailable')
      if (snapshot.revision === current.revision) {
        if (stable(canonical) !== stable(authorityProjection(current))) throw new Error('authority changes require an explicit revision commit')
        await prepared.commit()
        return
      }
      if (snapshot.revision !== current.revision + 1) throw new Error(`stale Suo revision: expected ${current.revision.toString()} -> ${(current.revision + 1).toString()}, received ${snapshot.revision.toString()}`)

      await saveAuthority(canonical, root)
      try {
        await prepared.commit()
      } catch (error) {
        await saveAuthority(current, root)
        throw error
      }
    } finally {
      await prepared.cleanup()
    }
  })
}

export async function projectRoot(start = process.cwd()): Promise<string> {
  return findProjectRoot(start)
}

async function loadStagedProposals(root: string): Promise<Proposal[]> {
  try {
    const value: unknown = JSON.parse(await readFile(stagedProposalPath(root), 'utf8'))
    if (!Array.isArray(value)) throw new Error('staged proposals must be an array')
    return value as Proposal[]
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
    throw error
  }
}

async function prepareStagedWrite(root: string, proposals: Proposal[]): Promise<PreparedStagedWrite> {
  const path = stagedProposalPath(root)
  await mkdir(dirname(path), { recursive: true })
  try {
    if ((await lstat(path)).isDirectory()) throw new Error(`staged proposal path is a directory: ${path}`)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
  }

  if (!proposals.length) return {
    commit: async () => { await rm(path, { force: true }) },
    cleanup: async () => {},
  }

  const temporary = `${path}.${process.pid.toString()}.${Date.now().toString()}.tmp`
  await writeFile(temporary, `${JSON.stringify(proposals, null, 2)}\n`, 'utf8')
  let committed = false
  return {
    commit: async () => { await rename(temporary, path); committed = true },
    cleanup: async () => { if (!committed) await rm(temporary, { force: true }) },
  }
}

function authorityProjection(snapshot: SuoSnapshot): SuoSnapshot {
  return {
    ...structuredClone(snapshot),
    proposals: snapshot.proposals
      .filter(proposal => proposal.status !== 'pending')
      .map(proposal => ({ ...structuredClone(proposal), operations: [] })),
  }
}

function stable(snapshot: SuoSnapshot): string {
  return JSON.stringify(snapshot)
}

function mergePending(current: Proposal[], requested: Proposal[], committedIds: Set<string>): Proposal[] {
  const merged = new Map<string, Proposal>()
  for (const proposal of [...current, ...requested]) {
    if (committedIds.has(proposal.id)) continue
    const existing = merged.get(proposal.id)
    if (existing && JSON.stringify(existing) !== JSON.stringify(proposal)) throw new Error(`conflicting staged proposal: ${proposal.id}`)
    merged.set(proposal.id, proposal)
  }
  return [...merged.values()].sort((a, b) => a.id.localeCompare(b.id))
}

async function withWriteLock<T>(root: string, operation: () => Promise<T>): Promise<T> {
  const path = writeLockPath(root)
  await mkdir(dirname(path), { recursive: true })
  let handle
  try {
    handle = await open(path, 'wx')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') throw new Error(`another Suo writer holds ${path}`)
    throw error
  }
  try {
    return await operation()
  } finally {
    try { await handle.close() } finally { await rm(path, { force: true }) }
  }
}
