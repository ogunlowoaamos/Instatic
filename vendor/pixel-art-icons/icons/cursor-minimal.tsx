import React from 'react';
import type { IconProps } from '../types';

export function CursorMinimalIcon({ size = 24, color = 'currentColor', className, style }: IconProps): React.ReactElement {
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
      <path d="M10 6H8v12h2v2H6V4h4v2Zm2 12h-2v-2h2v2Zm6-2h-6v-2h4v-2h2v4Zm-2-4h-2v-2h2v2Zm-2-2h-2V8h2v2Zm-2-2h-2V6h2v2Z"/>
    </svg>
  );
}
