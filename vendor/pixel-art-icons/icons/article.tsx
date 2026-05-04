import React from 'react';
import type { IconProps } from '../types';

export function ArticleIcon({ size = 24, color = 'currentColor', className, style }: IconProps): React.ReactElement {
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
      <path d="M8 2h12v2H8zM6 4h2v16H6zm14 0h2v16h-2zM4 20h16v2H4zm-2-6h2v6H2zm2-2h2v2H4zm6-6h8v4h-8zm0 6h8v2h-8zm0 4h4v2h-4z"/>
    </svg>
  );
}
