import React from 'react';
import type { IconProps } from '../types';

export function AiBoxIcon({ size = 24, color = 'currentColor', className, style }: IconProps): React.ReactElement {
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
      <path d="M4 2h16v2H4zm0 18h8v2H4zM2 4h2v16H2zm18 0h2v8h-2zm-2 10h2v2h-2zm0 8h2v2h-2zm-4-4h2v2h-2zm8 0h2v2h-2zm-6-2h2v2h-2zm4 0h2v2h-2zm0 4h2v2h-2zm-4 0h2v2h-2z"/>
    </svg>
  );
}
