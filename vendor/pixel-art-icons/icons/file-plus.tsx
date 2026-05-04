import React from 'react';
import type { IconProps } from '../types';

export function FilePlusIcon({ size = 24, color = 'currentColor', className, style }: IconProps): React.ReactElement {
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
      <path d="M8 18h2v2H8v2H6v-2H4v-2h2v-2h2v2Zm10 4h-6v-2h6v2ZM16 4h-2v4h4V6h2v14h-2V10h-6V4H6V2h10v2ZM6 14H4V4h2v10Zm12-8h-2V4h2v2Z"/>
    </svg>
  );
}
