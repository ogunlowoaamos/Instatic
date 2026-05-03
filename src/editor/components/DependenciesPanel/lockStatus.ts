/**
 * Dependency lock status — compares the requested `packageJson.dependencies`
 * against the resolved `siteRuntime.dependencyLock.packages` so the UI can
 * tell when a (re-)resolve is needed.
 *
 * Pure logic only. The resolve flow itself is the only writer of the lock.
 *
 * Lives in its own module (rather than alongside `DepsSection`) so that
 * Vite's react-refresh plugin can fast-refresh the component file — mixing
 * component and non-component exports breaks Fast Refresh.
 */
import type { SitePackageJson } from '@core/site-dependencies/manifest'
import type { LockedSiteDependency } from '@core/site-runtime'

export type DependencyLockStatus =
  | { kind: 'in-sync' }
  | { kind: 'unresolved'; missing: string[] }
  | { kind: 'stale'; missing: string[]; mismatched: string[]; orphan: string[] }

export function evaluateDependencyLockStatus(
  packageJson: SitePackageJson,
  lockedPackages: Record<string, LockedSiteDependency>,
): DependencyLockStatus {
  const requested = packageJson.dependencies
  const requestedNames = Object.keys(requested)

  if (requestedNames.length === 0) return { kind: 'in-sync' }

  const missing: string[] = []
  const mismatched: string[] = []
  for (const name of requestedNames) {
    const locked = lockedPackages[name]
    if (!locked) {
      missing.push(name)
      continue
    }
    if (locked.requested !== requested[name]) {
      mismatched.push(name)
    }
  }

  const orphan = Object.keys(lockedPackages).filter((name) => !(name in requested))

  if (missing.length > 0 && mismatched.length === 0 && orphan.length === 0) {
    // No lock entries at all yet, or only newly-added packages — call this
    // "unresolved" so the prompt is "Resolve runtime" rather than "Re-resolve",
    // which would imply prior state.
    if (Object.keys(lockedPackages).length === 0) {
      return { kind: 'unresolved', missing }
    }
  }

  if (missing.length === 0 && mismatched.length === 0 && orphan.length === 0) {
    return { kind: 'in-sync' }
  }

  return { kind: 'stale', missing, mismatched, orphan }
}

export function describeLockStatus(status: DependencyLockStatus): string {
  if (status.kind === 'in-sync') return ''
  if (status.kind === 'unresolved') {
    return status.missing.length === 1
      ? `1 package needs to be resolved before it will run.`
      : `${status.missing.length} packages need to be resolved before they will run.`
  }

  const parts: string[] = []
  if (status.missing.length > 0) {
    parts.push(`${status.missing.length} new`)
  }
  if (status.mismatched.length > 0) {
    parts.push(`${status.mismatched.length} changed`)
  }
  if (status.orphan.length > 0) {
    parts.push(`${status.orphan.length} removed`)
  }
  return `Lock is out of sync (${parts.join(', ')}). Re-resolve to update.`
}
