/* eslint-disable react-refresh/only-export-components */
/**
 * base.visual-component-ref — reference to a Visual Component.
 *
 * Drops a named VC instance onto a page or inside another VC.
 * The editor canvas renders the VC tree inline by instantiating it with
 * propOverrides substituted from per-param overrides. Double-click enters
 * the VC's own canvas for editing.
 * The publisher emits a comment marker; full emit is Phase 5.
 *
 * Architecture source: Contribution #619 §8
 */
import React, { useCallback } from 'react'
import { type ModuleDefinition, type ModuleComponentProps } from '@core/module-engine/types'
import { registry } from '@core/module-engine/registry'
import { useEditorStore } from '@core/editor-store/store'
import { instantiateVCAtRef } from '@core/visualComponents/instantiate'
import type { VCNode } from '@core/visualComponents/types'
import { BracesIcon } from 'pixel-art-icons/icons/braces'
import { VCInlineTree } from './VCInlineTree'
import styles from './VisualComponentRef.module.css'

interface VisualComponentRefProps extends Record<string, unknown> {
  componentId: string
  /** Per-param value overrides — keyed by VCParam.id (stable across renames) */
  propOverrides: Record<string, unknown>
  slotContent: Record<string, unknown[]>
}

const VisualComponentRefEditor: React.FC<ModuleComponentProps<VisualComponentRefProps>> = ({
  props,
  nodeId,
}) => {
  const componentId = typeof props.componentId === 'string' ? props.componentId : ''
  const propOverrides =
    props.propOverrides && typeof props.propOverrides === 'object' && !Array.isArray(props.propOverrides)
      ? (props.propOverrides as Record<string, unknown>)
      : {}
  const slotContent =
    props.slotContent && typeof props.slotContent === 'object' && !Array.isArray(props.slotContent)
      ? (props.slotContent as Record<string, VCNode[]>)
      : {}

  const vc = useEditorStore(
    useCallback(
      (s) => s.site?.visualComponents?.find((v) => v.id === componentId) ?? null,
      [componentId],
    ),
  )

  if (!vc) {
    return (
      <div className={styles.unknown}>
        <BracesIcon size={12} color="currentColor" aria-hidden="true" />
        <span>{componentId ? `Unknown component: ${componentId}` : 'No component selected'}</span>
      </div>
    )
  }

  const { nodes, rootNodeId } = instantiateVCAtRef(vc, propOverrides, slotContent, nodeId)

  return <VCInlineTree nodes={nodes} rootNodeId={rootNodeId} />
}

export const VisualComponentRefModule: ModuleDefinition<VisualComponentRefProps> = {
  id: 'base.visual-component-ref',
  name: 'Component',
  description: 'A reference to a Visual Component',
  category: 'Components',
  version: '1.0.0',
  icon: BracesIcon,
  trusted: true,
  canHaveChildren: false,

  // Props are not panel-edited — PropertiesPanel branches on moduleId and
  // renders ComponentRefView instead (Contribution #619 §8.5).
  schema: {},

  defaults: {
    componentId: '',
    propOverrides: {},
    slotContent: {},
  },

  component: VisualComponentRefEditor,

  /**
   * Defense-in-depth fallback: the publisher walker intercepts
   * base.visual-component-ref nodes via renderVisualComponentRef() in
   * render.ts before this method is ever called. This implementation is
   * intentionally unreachable under normal operation.
   */
  render: () => ({ html: '', css: '' }),
}

registry.register(VisualComponentRefModule)
