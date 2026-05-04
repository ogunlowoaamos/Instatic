import React from 'react';
import type { IconProps } from '../types';

export function ExternalLinkIcon({ size = 24, color = 'currentColor', className, style }: IconProps): React.ReactElement {
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
      <path d="M17 21H5v-2h12v2ZM5 19H3V7h2v12Zm14 0h-2v-6h2v6Zm-8-4H9v-2h2v2Zm2-2h-2v-2h2v2Zm2-2h-2V9h2v2Zm6 0h-2V7h-2V5h-4V3h8v8Zm-4-2h-2V7h2v2Zm-6-2H5V5h6v2Z"/>
    </svg>
  );
}
