import React from 'react';
import type { IconProps } from '../types';

export function Grid2x22Icon({ size = 24, color = 'currentColor', className, style }: IconProps): React.ReactElement {
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
      <path d="M20 4h-7v7h7V4h2v16h-2v-7h-7v7h7v2H4v-2h7v-7H4v7H2V4h2v7h7V4H4V2h16v2Z"/>
    </svg>
  );
}
