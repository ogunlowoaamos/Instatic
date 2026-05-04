import React from 'react';
import type { IconProps } from '../types';

export function SmartphoneIcon({ size = 24, color = 'currentColor', className, style }: IconProps): React.ReactElement {
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
      <path d="M18 22H6v-2h12v2ZM6 20H4V4h2v16Zm14 0h-2V4h2v16Zm-7-1h-2v-2h2v2Zm5-15H6V2h12v2Z"/>
    </svg>
  );
}
