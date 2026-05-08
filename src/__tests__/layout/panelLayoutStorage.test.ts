import { beforeEach, describe, expect, it } from 'bun:test'
import {
  EDITOR_LAYOUT_STORAGE_KEY,
  readEditorLayout,
  readStoredPanelPosition,
  writeStoredPanelPosition,
} from '@site/layout/panelLayoutStorage'

beforeEach(() => {
  localStorage.clear()
})

describe('panelLayoutStorage', () => {
  it('stores floating panel positions in the unified editor layout record', () => {
    writeStoredPanelPosition('agent', { x: 640, y: 120 })

    expect(readStoredPanelPosition('agent')).toEqual({ x: 640, y: 120 })
    expect(readEditorLayout()?.panels?.agent?.position).toEqual({ x: 640, y: 120 })
  })

  it('preserves existing open state when updating a panel position', () => {
    localStorage.setItem(
      EDITOR_LAYOUT_STORAGE_KEY,
      JSON.stringify({
        version: 1,
        panels: {
          agent: { open: true },
        },
      }),
    )

    writeStoredPanelPosition('agent', { x: 420, y: 240 })

    expect(readEditorLayout()?.panels?.agent).toEqual({
      open: true,
      position: { x: 420, y: 240 },
    })
  })

  it('does not write retired per-panel localStorage keys', () => {
    writeStoredPanelPosition('agent', { x: 24, y: 180 })

    expect(localStorage.getItem('pb-agent-panel-pos')).toBeNull()
  })
})
