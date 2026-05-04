import React from 'react';
import type { IconProps } from '../types';

export function BookPlusIcon({ size = 24, color = 'currentColor', className, style }: IconProps): React.ReactElement {
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
      <path d="M6 2h12v2H6zm0 18h6v2H6zM4 4h2v16H4zm14 0h2v10h-2z"/><path d="M8 2h2v10H8zm4 0h2v10h-2zm-2 0h2v8h-2zm6 14h2v6h-2z"/><path d="M14 18h6v2h-6z"/>
    </svg>
  );
}
