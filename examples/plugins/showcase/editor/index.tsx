/**
 * Showcase plugin — editor entrypoint.
 *
 * Demonstrates every editor-side SDK surface:
 *   - register a command
 *   - add a toolbar button
 *   - register a left-sidebar panel (`editor.panels`) using a real React
 *     component with JSX, hooks, and the host design system.
 *
 * The plugin's bundle externalizes `react`, `@pagebuilder/host-ui`,
 * `@pagebuilder/host-hooks`, and `@pagebuilder/plugin-sdk`. The host's
 * import map (in `index.html`) resolves those bare specifiers to its own
 * React instance + design-system primitives at mount time.
 */
import { useState } from 'react'
import {
  Button,
  Card,
  Stack,
  Text,
} from '@pagebuilder/host-ui'
import {
  useCanvasNodeRect,
  useEditorStore,
} from '@pagebuilder/host-hooks'
import {
  definePluginCanvasOverlay,
  definePluginPanel,
  type EditorPluginApi,
  type EditorPluginModule,
} from '@pagebuilder/plugin-sdk'

function ShowcasePanel() {
  const [count, setCount] = useState(0)
  // Host renders the panel header (title + close button) — your component
  // emits the body only. Compose freely with host-ui primitives + any
  // React patterns you like.
  return (
    <Stack gap={12}>
      <Text variant="muted">Demo panel registered via editor.panels.</Text>
      <Card>
        <Stack gap={8}>
          <Text>Click count: {count}</Text>
          <Button variant="primary" onClick={() => setCount(count + 1)}>
            Increment
          </Button>
        </Stack>
      </Card>
    </Stack>
  )
}

const reviewPanel = definePluginPanel({
  id: 'acme.showcase.review',
  label: 'Showcase',
  iconName: 'box-stack',
  accent: 'mint',
  component: ShowcasePanel,
})

/**
 * Sample canvas overlay — paints a subtle pin above the currently
 * selected node. Demonstrates how plugins use `useCanvasNodeRect` to
 * position children relative to canvas-rendered nodes regardless of
 * pan/zoom.
 */
function SelectedNodePin() {
  const selectedId = useEditorStore((s) => s.selectedNodeId)
  const rect = useCanvasNodeRect(selectedId)
  if (!rect) return null
  return (
    <div
      style={{
        position: 'absolute',
        top: rect.top - 22,
        left: rect.left + rect.width / 2 - 6,
        width: 12,
        height: 12,
        borderRadius: 999,
        background: '#8ee6c8',
        boxShadow: '0 0 0 2px rgba(0, 0, 0, 0.6), 0 0 8px rgba(142, 230, 200, 0.5)',
        pointerEvents: 'none',
      }}
      aria-hidden="true"
    />
  )
}

const selectionPin = definePluginCanvasOverlay({
  id: 'acme.showcase.selection-pin',
  component: SelectedNodePin,
})

const mod: EditorPluginModule = {
  activate(api: EditorPluginApi) {
    api.editor.commands.register({
      id: 'acme.showcase.ping',
      label: 'Showcase Ping',
      run: () => ({ message: 'Showcase command fired' }),
    })

    api.editor.toolbar.addButton({
      id: 'acme.showcase.ping',
      label: 'Showcase',
      command: 'acme.showcase.ping',
    })

    api.editor.panels.register(reviewPanel)
    api.editor.canvas.registerOverlay(selectionPin)
  },
}

export default mod
export const activate = mod.activate!
