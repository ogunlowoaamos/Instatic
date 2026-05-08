export interface CssVariableDeclaration {
  name: string
  value: string
}

export function formatCssVariableBlock(
  selector: string,
  variables: ReadonlyArray<CssVariableDeclaration>,
): string {
  if (variables.length === 0) return ''
  return `${selector} {\n${formatCssVariableDeclarations(variables)}\n}`
}

function formatCssVariableDeclarations(
  variables: ReadonlyArray<CssVariableDeclaration>,
): string {
  return variables
    .map((variable) => `  ${variable.name}: ${sanitizeCssTokenValue(variable.value)};`)
    .join('\n')
}

function sanitizeCssTokenValue(value: string): string {
  return value.replace(/<\/style\s*>/gi, '').replace(/[{}]/g, '')
}
