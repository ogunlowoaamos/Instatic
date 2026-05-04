import React from 'react';
import type { IconProps } from '../types';

export function DragAndDropIcon({ size = 24, color = 'currentColor', className, style }: IconProps): React.ReactElement {
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
      <path d="M11 21H9v-2h2v2Zm10 0h-2v-2h2v2ZM9 19H7V9h2v10Zm10-4h-2v2h-2v2h-2v-6h6v2Zm0 4h-2v-2h2v2ZM5 17H3v-2h2v2Zm0-4H3v-2h2v2Zm16-2h-2V9h2v2ZM5 9H3V7h2v2Zm14 0H9V7h10v2ZM5 5H3V3h2v2Zm4 0H7V3h2v2Zm4 0h-2V3h2v2Zm4 0h-2V3h2v2Z"/>
    </svg>
  );
}
