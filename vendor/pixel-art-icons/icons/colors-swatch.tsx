import React from 'react';
import type { IconProps } from '../types';

export function ColorsSwatchIcon({ size = 24, color = 'currentColor', className, style }: IconProps): React.ReactElement {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={color}
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={style}
    >
      <path d="M14 20h6v2H4v-2h8v-4H4v-2h2v-2h2v2h4v-4h-2V8h2V4h2v16ZM4 20H2v-4h2v4Zm18 0h-2V4h2v16Zm-4-2h-2v-2h2v2ZM6 12H4V8h2v4Zm4-4H6V6h4v2Zm10-4h-6V2h6v2Z"/>
    </svg>
  );
}
