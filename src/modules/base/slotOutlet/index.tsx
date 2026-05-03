/* eslint-disable react-refresh/only-export-components */
/**
 * base.slot-outlet — slot placeholder inside a Visual Component tree.
 *
 * Marks the position where slot content from a parent vcRef instance will
 * be injected at render time. Visually distinct (dashed outline) so the
 * VC author knows it is a slot, not a regular container.
 *
 * The `slotName` identifies which slotContent key this outlet consumes.
 * The publisher substitutes the matching PageNode[] array here (Phase 5).
 *
 * Architecture source: Contribution #619 §8
 */
import React from 'react'
import { type ModuleDefinition, type ModuleComponentProps } from '@core/module-engine/types'
import { registry } from '@core/module-engine/registry'
import { TargetIcon } from 'pixel-art-icons/icons/target'
import styles from './SlotOutlet.module.css'

interface SlotOutletProps extends Record<string, unknown> {
  slotName: string
}

const SlotOutletEditor: React.FC<ModuleComponentProps<SlotOutletProps>> = ({ props }) => {
  const slotName = typeof props.slotName === 'string' && props.slotName ? props.slotName : 'children'

  return (
    <div className={styles.placeholder}>
      <TargetIcon size={12} color="currentColor" aria-hidden="true" />
      <span className={styles.label}>Slot: {slotName}</span>
    </div>
  )
}

export const SlotOutletModule: ModuleDefinition<SlotOutletProps> = {
  id: 'base.slot-outlet',
  name: 'Slot',
  description: 'A slot placeholder for component content',
  category: 'Components',
  version: '1.0.0',
  icon: TargetIcon,
  trusted: true,
  canHaveChildren: false,

  schema: {
    slotName: {
      type: 'text',
      label: 'Slot name',
      placeholder: 'children',
      description: 'camelCase identifier (e.g. children, header, footer)',
    },
  },

  defaults: {
    slotName: 'children',
  },

  component: SlotOutletEditor,

  /**
   * Publisher safety-net: the walker reaches slot-outlet only when
   * instantiateVCAtRef kept the outlet as a placeholder — meaning no slot
   * content was provided AND the slot param has no defaultValue. Return empty
   * HTML so the slot contributes nothing to the published page.
   */
  render: () => ({ html: '', css: '' }),
}

registry.register(SlotOutletModule)
