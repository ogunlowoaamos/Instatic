import React from 'react';
import type { IconProps } from '../types';

export function DatabaseIcon({ size = 24, color = 'currentColor', className, style }: IconProps): React.ReactElement {
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
      <path d="M16 20v2H8v-2h8Zm-8 0H4v-2h4v2Zm12 0h-4v-2h4v2ZM4 10h4v2H4v2h4v2H4v2H2V6h2v4Zm18 8h-2v-2h-4v2H8v-2h8v-2h4v-2h-4v2H8v-2h8v-2h4V6h2v12ZM8 6H4V4h4v2Zm12 0h-4V4h4v2Zm-4-2H8V2h8v2Z"/>
    </svg>
  );
}
