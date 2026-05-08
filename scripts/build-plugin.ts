/**
 * Plugin build CLI (skeletal — to be expanded into `pb-plugin build` in PR 2).
 *
 *   bun run scripts/build-plugin.ts <plugin-source-dir>
 *
 * Reads `<dir>/pb-plugin.config.ts`, evaluates it via `import()` (Bun
 * transpiles TypeScript natively), and writes the runtime zip layout that
 * the host package installer expects:
 *
 *   <dir>/dist/
 *     plugin.json
 *     modules/index.js
 *     pack/site.json
 *     server/index.js              (when source has server/index.{ts,js})
 *     editor/index.js              (when source has editor/index.{ts,js})
 *     frontend/tracker.js          (when source has frontend/tracker.{ts,js})
 *     admin/<entry>.js             (per declared admin app entry)
 *
 * Then zips `dist/` into `<dir-parent>/<plugin-id>.plugin.zip`.
 *
 * Bundling: each entrypoint is bundled with `Bun.build()` as ESM, with the
 * SDK marked external (the host runtime provides the SDK via re-bundling on
 * the editor side, and ignores it on the server). Plugin authors get one
 * bundle per entrypoint with no node_modules in the zip.
 *
 * Plugin authors don't need this script directly — the upcoming
 * `pb-plugin` CLI will wrap it. It's exposed here so first-party example
 * plugins (`examples/plugins/*`) can build with `bun run plugin:build`.
 */
import { existsSync, readdirSync } from 'node:fs'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { basename, dirname, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { spawn } from 'node:child_process'
import type { PluginDefinition } from '@core/plugin-sdk'

interface PluginBuildResult {
  pluginId: string
  outputDir: string
  zipPath: string
}

async function readDefinition(sourceDir: string): Promise<PluginDefinition> {
  const configPath = join(sourceDir, 'pb-plugin.config.ts')
  if (!existsSync(configPath)) {
    throw new Error(`pb-plugin.config.ts not found at ${configPath}`)
  }
  const mod = await import(pathToFileURL(configPath).href + `?ts=${Date.now()}`) as { default: PluginDefinition }
  if (!mod.default || typeof mod.default !== 'object') {
    throw new Error(`pb-plugin.config.ts must default-export a definePlugin() result`)
  }
  return mod.default
}

async function bundleEntrypoint(
  sourcePath: string,
  outFile: string,
): Promise<void> {
  // First-party plugins in this monorepo import the SDK as `@core/plugin-sdk`
  // (resolved via tsconfig paths). Bundle the SDK into the plugin output so
  // the resulting JS file is self-contained when loaded by the host at
  // runtime — it doesn't matter what import alias the source uses.
  //
  // External plugins (eventually shipping `@pagebuilder/plugin-sdk` from
  // npm) will use a different config path in PR 2's CLI.
  const result = await Bun.build({
    entrypoints: [sourcePath],
    target: 'browser',
    format: 'esm',
    splitting: false,
    minify: false,
  })
  if (!result.success) {
    const messages = result.logs.map((l) => l.message).join('\n')
    throw new Error(`Failed to bundle ${sourcePath}:\n${messages}`)
  }
  const built = result.outputs[0]
  if (!built) throw new Error(`No output from Bun.build for ${sourcePath}`)
  const text = await built.text()
  await mkdir(dirname(outFile), { recursive: true })
  await writeFile(outFile, text, 'utf-8')
}

async function findEntrypoint(sourceDir: string, basename: string): Promise<string | null> {
  for (const ext of ['ts', 'tsx', 'js', 'mjs']) {
    const candidate = join(sourceDir, `${basename}.${ext}`)
    if (existsSync(candidate)) return candidate
  }
  // Try `<name>/index.{ts,...}`.
  for (const ext of ['ts', 'tsx', 'js', 'mjs']) {
    const candidate = join(sourceDir, basename, `index.${ext}`)
    if (existsSync(candidate)) return candidate
  }
  return null
}

async function bundleAdminApps(
  sourceDir: string,
  outputDir: string,
  definition: PluginDefinition,
): Promise<void> {
  for (const page of definition.manifest.adminPages) {
    if (page.content.kind !== 'app') continue
    const entry = page.content.entry
    const sourceCandidate = join(sourceDir, entry)
    const sourceTs = sourceCandidate.replace(/\.js$/, '.ts')
    const sourcePath = existsSync(sourceTs) ? sourceTs : sourceCandidate
    if (!existsSync(sourcePath)) {
      throw new Error(`Admin app entry "${entry}" not found at ${sourcePath}`)
    }
    const outFile = join(outputDir, entry)
    await bundleEntrypoint(sourcePath, outFile)
  }
}

async function zipDirectory(sourceDir: string, zipPath: string): Promise<void> {
  await rm(zipPath, { force: true })
  await new Promise<void>((resolveZip, rejectZip) => {
    const child = spawn('zip', ['-qr', zipPath, '.'], {
      cwd: sourceDir,
      stdio: 'inherit',
    })
    child.on('exit', (code) => {
      if (code === 0) resolveZip()
      else rejectZip(new Error(`zip exited with code ${code}`))
    })
    child.on('error', rejectZip)
  })
}

export async function buildPlugin(sourceDir: string): Promise<PluginBuildResult> {
  const absoluteSource = resolve(sourceDir)
  const definition = await readDefinition(absoluteSource)
  const distDir = join(absoluteSource, 'dist')

  await rm(distDir, { recursive: true, force: true })
  await mkdir(distDir, { recursive: true })

  // 1. Manifest — build entrypoint paths from what we'll emit.
  const entrypoints: NonNullable<typeof definition.manifest.entrypoints> = {}
  if (definition.modules.length > 0) {
    entrypoints.modules = 'modules/index.js'
  }
  const editorSource = await findEntrypoint(absoluteSource, 'editor')
  if (editorSource) entrypoints.editor = 'editor/index.js'
  const serverSource = await findEntrypoint(absoluteSource, 'server')
  if (serverSource) entrypoints.server = 'server/index.js'

  // Frontend entry. Authors can ship either a top-level `frontend.{ts,js}`
  // (or `frontend/index.{ts,js}`) — both bundle to `frontend/index.js` —
  // or the conventional `frontend/tracker.{ts,js}` which bundles to
  // `frontend/tracker.js`. Pick the source AND its destination together
  // so the manifest entrypoint and the bundled file always match.
  let frontendSource: string | null = await findEntrypoint(absoluteSource, 'frontend')
  let frontendOutputPath: string | null = null
  if (frontendSource) {
    entrypoints.frontend = 'frontend/index.js'
    frontendOutputPath = 'frontend/index.js'
  } else {
    const trackerSource = await findEntrypoint(absoluteSource, 'frontend/tracker')
    if (trackerSource) {
      frontendSource = trackerSource
      entrypoints.frontend = 'frontend/tracker.js'
      frontendOutputPath = 'frontend/tracker.js'
    }
  }

  const finalManifest = {
    ...definition.manifest,
    entrypoints,
    ...(definition.pack ? { pack: { path: 'pack/site.json' } } : {}),
  }
  await writeFile(join(distDir, 'plugin.json'), JSON.stringify(finalManifest, null, 2), 'utf-8')

  // 2. Modules entrypoint — bundle a generated facade that re-exports
  //    every defined module via a default-exported array. The facade
  //    is written next to the plugin source (not under dist/) so its
  //    relative imports of `./modules/<file>` resolve correctly.
  if (definition.modules.length > 0) {
    const modulesFacade = generateModulesFacade(absoluteSource)
    const modulesFacadePath = join(absoluteSource, '__modules-facade.ts')
    await writeFile(modulesFacadePath, modulesFacade, 'utf-8')
    try {
      await bundleEntrypoint(modulesFacadePath, join(distDir, 'modules', 'index.js'))
    } finally {
      await rm(modulesFacadePath, { force: true })
    }
  }

  // 3. Editor / server / frontend entrypoints — passthrough bundle.
  if (editorSource) await bundleEntrypoint(editorSource, join(distDir, 'editor', 'index.js'))
  if (serverSource) await bundleEntrypoint(serverSource, join(distDir, 'server', 'index.js'))
  if (frontendSource && frontendOutputPath) {
    await bundleEntrypoint(frontendSource, join(distDir, frontendOutputPath))
  }

  // 4. Admin apps — one bundle per declared app entry.
  await bundleAdminApps(absoluteSource, distDir, definition)

  // 5. Pack.
  if (definition.pack) {
    await mkdir(join(distDir, 'pack'), { recursive: true })
    await writeFile(
      join(distDir, 'pack', 'site.json'),
      JSON.stringify(definition.pack, null, 2),
      'utf-8',
    )
  }

  // 6. Zip.
  const zipPath = join(dirname(absoluteSource), `${basename(absoluteSource)}.plugin.zip`)
  await zipDirectory(distDir, zipPath)

  return {
    pluginId: definition.manifest.id,
    outputDir: distDir,
    zipPath,
  }
}

/**
 * Generate a tiny facade module that imports each module file in `<src>/modules/`,
 * collects the default exports, and re-exports them as a single array. The
 * facade is what gets bundled into `dist/modules/index.js`.
 *
 * Convention: every `.ts` file directly under `<src>/modules/` whose default
 * export is a `PluginModuleDefinition` becomes a registered module.
 */
function generateModulesFacade(sourceDir: string): string {
  const modulesDir = join(sourceDir, 'modules')
  if (!existsSync(modulesDir)) {
    throw new Error(`Plugin declares modules but ${modulesDir} does not exist`)
  }
  const files = readdirSync(modulesDir)
  const moduleFiles = files.filter((f) => /\.(ts|tsx|js|mjs)$/.test(f) && !f.startsWith('index.'))
  if (moduleFiles.length === 0) {
    throw new Error(`No module files found under ${modulesDir}`)
  }
  const imports = moduleFiles
    .map((file, idx) => `import m${idx} from './modules/${file.replace(/\.(tsx?|m?js)$/, '')}'`)
    .join('\n')
  const defaultExport = `export default [${moduleFiles.map((_, idx) => `m${idx}`).join(', ')}]`
  return `${imports}\n${defaultExport}\n`
}

if (import.meta.main) {
  const sourceDir = process.argv[2]
  if (!sourceDir) {
    console.error('Usage: bun run scripts/build-plugin.ts <plugin-source-dir>')
    process.exit(1)
  }
  buildPlugin(sourceDir)
    .then((result) => {
      console.log(`✓ Built ${result.pluginId}`)
      console.log(`  dist: ${result.outputDir}`)
      console.log(`  zip:  ${result.zipPath}`)
    })
    .catch((err) => {
      console.error('✗ Plugin build failed:', err)
      process.exit(1)
    })
}
