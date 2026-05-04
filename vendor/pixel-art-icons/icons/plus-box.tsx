import React from 'react';
import type { IconProps } from '../types';

export function PlusBoxIcon({ size = 24, color = 'currentColor', className, style }: IconProps): React.ReactElement {
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
      <path d="M20 22H4v-2h16v2ZM4 20H2V4h2v16Zm18 0h-2V4h2v16Zm-9-9h4v2h-4v4h-2v-4H7v-2h4V7h2v4Zm7-7H4V2h16v2Z"/>
    </svg>
  );
}
