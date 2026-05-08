
import { appendFileSync } from 'node:fs'
const MARKER = "/Users/davidbabinec/Documents/Projekty/page-builder/.tmp/upgrade-test-marker.log"
function mark(line) {
  try { appendFileSync(MARKER, line + '\n') } catch (e) {}
}
export function migrate(ctx) {
  mark('v2.migrate fromVersion=' + ctx.fromVersion)
}
export function activate() { mark('v2.activate') }
export function deactivate() { mark('v2.deactivate') }
