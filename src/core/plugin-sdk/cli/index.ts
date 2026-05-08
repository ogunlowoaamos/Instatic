/**
 * `pb-plugin` CLI entry.
 *
 * Usage:
 *   pb-plugin init <name>
 *   pb-plugin build [<plugin-dir>]
 *   pb-plugin dev   [<plugin-dir>] [--uploads <path>]
 *
 * Run via Bun:
 *   bun run pb-plugin <cmd>
 *
 * The CLI lives inside the SDK so plugin authors get the same code that
 * powers the host's `bun run pb-plugin` script. No HTTP, no auth, no env
 * gate — the dev command writes built files directly into the host's
 * `uploads/plugins/<id>/<version>/` directory.
 */
import { resolve } from 'node:path'
import { buildPlugin } from './build'
import { runPluginDev } from './dev'
import { runPluginInit } from './init'

interface ParsedArgs {
  command: string
  positional: string[]
  flags: Record<string, string | true>
}

function parseArgs(argv: string[]): ParsedArgs {
  const [command = 'help', ...rest] = argv
  const positional: string[] = []
  const flags: Record<string, string | true> = {}
  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i]
    if (arg.startsWith('--')) {
      const key = arg.slice(2)
      const next = rest[i + 1]
      if (next && !next.startsWith('--')) {
        flags[key] = next
        i++
      } else {
        flags[key] = true
      }
    } else {
      positional.push(arg)
    }
  }
  return { command, positional, flags }
}

function printHelp(): void {
  console.log(`pb-plugin — Page Builder plugin CLI

Commands:
  init <name>             Scaffold a new plugin in <name>/
  build [<plugin-dir>]    Build the plugin → dist/ + .plugin.zip
  dev   [<plugin-dir>]    Watch sources, rebuild, and sync into the host CMS

Options for \`dev\`:
  --uploads <path>        Override the host's uploads directory.
                          Falls back to PB_UPLOADS_DIR env var, then to
                          auto-detection (walks up from the plugin folder
                          looking for an uploads/plugins/ directory).

Examples:
  pb-plugin init acme.confetti
  pb-plugin build examples/plugins/showcase
  pb-plugin dev examples/plugins/ui-kit
  pb-plugin dev --uploads ../page-builder/uploads
`)
}

async function main(): Promise<void> {
  const { command, positional, flags } = parseArgs(process.argv.slice(2))

  if (command === 'help' || command === '--help' || command === '-h' || flags.help) {
    printHelp()
    return
  }

  if (command === 'init') {
    const name = positional[0]
    if (!name) {
      console.error('Usage: pb-plugin init <name>')
      process.exit(1)
    }
    const created = await runPluginInit(name)
    console.log(`✓ Created plugin at ${created}`)
    console.log(`  cd ${created.split('/').pop()} && pb-plugin dev`)
    return
  }

  if (command === 'build') {
    const sourceDir = resolve(positional[0] ?? process.cwd())
    const result = await buildPlugin(sourceDir)
    console.log(`✓ Built ${result.pluginId}`)
    console.log(`  dist: ${result.outputDir}`)
    if (result.zipPath) console.log(`  zip:  ${result.zipPath}`)
    return
  }

  if (command === 'dev') {
    const sourceDir = resolve(positional[0] ?? process.cwd())
    await runPluginDev({
      pluginDir: sourceDir,
      uploadsDirFlag: typeof flags.uploads === 'string' ? flags.uploads : undefined,
    })
    return
  }

  console.error(`Unknown command: ${command}`)
  printHelp()
  process.exit(1)
}

if (import.meta.main) {
  main().catch((err) => {
    console.error(`✗ ${err instanceof Error ? err.message : String(err)}`)
    process.exit(1)
  })
}
