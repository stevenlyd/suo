import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { cp, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { checkDistribution } from '../scripts/distribution.mjs'

const temporary = await realpath(await mkdtemp(join(tmpdir(), 'suo-package-')))
const repository = resolve('.')
const pkg = JSON.parse(await readFile(join(repository, 'package.json'), 'utf8'))
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm'
const env = { ...process.env, npm_config_cache: join(temporary, 'cache'), npm_config_userconfig: join(temporary, 'npmrc'), npm_config_audit: 'false', npm_config_fund: 'false' }
await writeFile(env.npm_config_userconfig, '')
try {
  checkDistribution(repository)
  const packed = JSON.parse(execFileSync(npm, ['pack', '--json', '--pack-destination', temporary], { cwd: repository, env, encoding: 'utf8' }))[0]
  const paths = packed.files.map(file => file.path)
  const lock = JSON.parse(await readFile(join(repository, 'distribution-lock.json'), 'utf8'))
  for (const path of [...Object.keys(lock.files), 'distribution-lock.json']) assert(paths.includes(path), `Tarball missing ${path}`)
  assert(!paths.some(path => path.startsWith('src/') || path.startsWith('node_modules/') || path.startsWith('test/')), 'Source/dev tree leaked into package')
  const prefix = join(temporary, 'runtime')
  execFileSync(npm, ['install', '--prefix', prefix, '--omit=dev', '--no-save', '--no-package-lock', join(temporary, packed.filename)], { cwd: temporary, env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
  const installed = join(prefix, 'node_modules', '@stevenlyd/suo')
  checkDistribution(installed)
  const cli = join(installed, 'dist/cli.js')
  const version = execFileSync(process.execPath, [cli, '--version'], { cwd: temporary, env, encoding: 'utf8' }).trim()
  assert.equal(version, pkg.version)
  assert.match(execFileSync(process.execPath, [cli, '--help'], { cwd: temporary, env, encoding: 'utf8' }), /suo --version/)
  execFileSync(process.execPath, [join(repository, 'test/cli-e2e.mjs')], { cwd: temporary, env: { ...env, SUO_TEST_CLI: cli, TMPDIR: temporary }, stdio: 'inherit' })
  // Exercise the documented npm Git source without relying on an unpublished
  // remote branch or a dev tree. The fixture contains only the packed payload.
  const gitSource = join(temporary, 'git-source')
  await cp(installed, gitSource, { recursive: true })
  const git = (...args) => execFileSync('git', args, { cwd: gitSource, env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
  git('init'); git('add', '.')
  git('-c', 'user.name=Suo Package Test', '-c', 'user.email=test@example.invalid', '-c', 'commit.gpgsign=false', 'commit', '-m', 'packed source fixture')
  const sha = git('rev-parse', 'HEAD').trim()
  const gitPrefix = join(temporary, 'git-runtime')
  execFileSync(npm, ['install', '--prefix', gitPrefix, '--omit=dev', '--no-save', '--no-package-lock', `git+${pathToFileURL(gitSource).href}#${sha}`], { cwd: temporary, env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
  const gitInstalled = join(gitPrefix, 'node_modules', '@stevenlyd/suo')
  checkDistribution(gitInstalled)
  assert.equal(execFileSync(process.execPath, [join(gitInstalled, 'dist/cli.js'), '--version'], { cwd: temporary, env, encoding: 'utf8' }).trim(), pkg.version)
  if (process.platform !== 'win32') {
    assert.equal(execFileSync(join(gitPrefix, 'node_modules/.bin/suo'), ['--version'], { cwd: temporary, env, encoding: 'utf8' }).trim(), pkg.version)
  }
  const pnpmPrefix = join(temporary, 'pnpm-runtime')
  await mkdir(pnpmPrefix)
  await writeFile(join(pnpmPrefix, 'package.json'), JSON.stringify({private:true}))
  await writeFile(join(pnpmPrefix, 'pnpm-workspace.yaml'), 'onlyBuiltDependencies:\n  - esbuild\n')
  execFileSync(process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm', ['add', '--prod', `git+${pathToFileURL(gitSource).href}#${sha}`], {cwd:pnpmPrefix,env,encoding:'utf8',stdio:['ignore','pipe','pipe']})
  const pnpmCli = join(pnpmPrefix, 'node_modules/@stevenlyd/suo/dist/cli.js')
  assert.equal(execFileSync(process.execPath, [pnpmCli, '--version'], {cwd:temporary,env,encoding:'utf8'}).trim(),pkg.version)
  execFileSync(process.execPath, [join(repository, 'test/cli-e2e.mjs')], {cwd:temporary,env:{...env,SUO_TEST_CLI:pnpmCli,TMPDIR:temporary},stdio:'inherit'})
  console.log('pnpm pinned Git install passed without granting Suo preparation-script permission')
  console.log('Git package install passed from pinned commit, with no src/ or build step')
  console.log(`Package E2E passed: ${pkg.name}@${version}, ${paths.length} files; production-only runtime and native metadata verified`)
} finally {
  await rm(temporary, { recursive: true, force: true })
}
