/**
 * Re-export the shared `cn` class-name helper.
 * Import from here rather than `@ui/lib/utils` directly.
 *
 * Usage:
 *   import { cn } from './cn'
 *   className={cn('base-class', condition && 'conditional-class')}
 */
export { cn } from './lib/utils'
