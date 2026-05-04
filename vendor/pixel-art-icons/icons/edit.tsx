import React from 'react';
import type { IconProps } from '../types';

export function EditIcon({ size = 24, color = 'currentColor', className, style }: IconProps): React.ReactElement {
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
      <path d="M4 20h4v2H2v-6h2v4Zm6 0H8v-2h2v2Zm2-2h-2v-2h2v2Zm-6-2H4v-2h2v2Zm8 0h-2v-2h2v2Zm-6-2H6v-2h2v2Zm8 0h-2v-2h2v2Zm-6-2H8v-2h2v2Zm8 0h-2v-2h2v2Zm-6-2h-2V8h2v2Zm4 0h-2V8h2v2Zm4 0h-2V8h2v2Zm-6-2h-2V6h2v2Zm8 0h-2V6h2v2Zm-6-2h-2V4h2v2Zm4 0h-2V4h2v2Zm-2-2h-2V2h2v2Z"/>
    </svg>
  );
}
