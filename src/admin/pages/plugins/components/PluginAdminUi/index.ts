/**
 * Curated UI namespace handed to plugin admin apps.
 *
 * The components themselves live in `PluginAdminUiComponents.tsx` so React
 * Fast Refresh works (only-component-exports rule). This file just
 * assembles the named-export wrappers into a single record matching the
 * `PluginAdminUi` shape from the SDK.
 */
import type { PluginAdminUi } from '@core/plugin-sdk'
import {
  PluginAlert,
  PluginButton,
  PluginCard,
  PluginCheckbox,
  PluginCode,
  PluginEmptyState,
  PluginHeading,
  PluginInput,
  PluginSearchBar,
  PluginSelect,
  PluginSeparator,
  PluginStack,
  PluginSwitch,
  PluginText,
  PluginTextarea,
} from './PluginAdminUiComponents'

export const pluginAdminUi: PluginAdminUi = {
  Button: PluginButton,
  Input: PluginInput,
  Textarea: PluginTextarea,
  Select: PluginSelect,
  Switch: PluginSwitch,
  Checkbox: PluginCheckbox,
  SearchBar: PluginSearchBar,
  Stack: PluginStack,
  Card: PluginCard,
  Heading: PluginHeading,
  Text: PluginText,
  Separator: PluginSeparator,
  EmptyState: PluginEmptyState,
  Alert: PluginAlert,
  Code: PluginCode,
}
