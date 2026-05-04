import React from 'react';
import type { IconProps } from '../types';

export function DeleteIcon({ size = 24, color = 'currentColor', className, style }: IconProps): React.ReactElement {
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
      <path d="M20 19H8v-2h12v2ZM8 17H6v-2h2v2Zm14 0h-2V7h2v10ZM6 15H4v-2h2v2Zm8 0h-2v-2h2v2Zm4 0h-2v-2h2v2ZM4 13H2v-2h2v2Zm12 0h-2v-2h2v2ZM6 11H4V9h2v2Zm8 0h-2V9h2v2Zm4 0h-2V9h2v2ZM8 9H6V7h2v2Zm12-2H8V5h12v2Z"/>
    </svg>
  );
}
