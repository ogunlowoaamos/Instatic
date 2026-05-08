/**
 * base.link — anchor element.
 *
 * Emits a bare `<a>` with no default class or default CSS.
 * Visual styling is opt-in via user classes (mcClassName / multi-class system).
 */
import type { ModuleDefinition } from '@core/module-engine/types'
import { registry } from '@core/module-engine/registry'
import { LinkIcon } from 'pixel-art-icons/icons/link'
import { safeUrl } from '@modules/base/utils/escape'
import { LinkEditor } from './LinkEditor'

interface LinkProps extends Record<string, unknown> {
  href: string
  text: string
  target: '_blank' | '_self' | '_parent'
}

export const LinkModule: ModuleDefinition<LinkProps> = {
  id: 'base.link',
  name: 'Link',
  description: 'An anchor element.',
  category: 'Interactive',
  version: '2.0.0',
  icon: LinkIcon,
  trusted: true,
  canHaveChildren: true,

  schema: {
    href: { type: 'url', label: 'URL' },
    text: { type: 'text', label: 'Link text', placeholder: 'Displayed when no children' },
    target: {
      type: 'select',
      label: 'Target',
      options: [
        { label: 'Same tab', value: '_self' },
        { label: 'New tab', value: '_blank' },
        { label: 'Parent', value: '_parent' },
      ],
    },
  },

  defaults: {
    href: '#',
    text: 'Click here',
    target: '_self',
  },

  component: LinkEditor,

  htmlTag: 'a',

  render: (props, renderedChildren) => {
    const href = safeUrl(props.href)
    const rel = props.target === '_blank' ? ' rel="noopener noreferrer"' : ''
    const targetAttr = ` target="${String(props.target)}"`
    const content = renderedChildren.length > 0 ? renderedChildren.join('') : String(props.text ?? '')
    return {
      html: `<a href="${href}"${targetAttr}${rel}>${content}</a>`,
    }
  },
}

registry.registerOrReplace(LinkModule)
