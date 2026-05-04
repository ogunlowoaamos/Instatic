import React from 'react';
import type { IconProps } from '../types';

export function TabletIcon({ size = 24, color = 'currentColor', className, style }: IconProps): React.ReactElement {
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
      <path d="M19 22H5v-2h14v2ZM5 20H3V4h2v16Zm16 0h-2V4h2v16Zm-8-2h-2v-2h2v2Zm6-14H5V2h14v2Z"/>
    </svg>
  );
}
