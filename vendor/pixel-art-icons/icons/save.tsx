import React from 'react';
import type { IconProps } from '../types';

export function SaveIcon({ size = 24, color = 'currentColor', className, style }: IconProps): React.ReactElement {
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
      <path d="M20 22H4v-2h2v-6h2v6h8v-6h2v6h2v2ZM4 20H2V4h2v16Zm18 0h-2V6h2v14Zm-6-6H8v-2h8v2Zm-4-4H6V6h6v4Zm8-4h-2V4h2v2Zm-2-2H4V2h14v2Z"/>
    </svg>
  );
}
