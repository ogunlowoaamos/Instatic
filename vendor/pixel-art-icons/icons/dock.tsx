import React from 'react';
import type { IconProps } from '../types';

export function DockIcon({ size = 24, color = 'currentColor', className, style }: IconProps): React.ReactElement {
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
      <path d="M20 20H4v-2h16v2ZM4 8h16V6h2v12h-2v-8H4v8H2V6h2v2Zm14 8H6v-2h12v2Zm2-10H4V4h16v2Z"/>
    </svg>
  );
}
