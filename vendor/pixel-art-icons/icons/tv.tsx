import React from 'react';
import type { IconProps } from '../types';

export function TvIcon({ size = 24, color = 'currentColor', className, style }: IconProps): React.ReactElement {
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
      <path d="M11 17v2h2v-2h-2Zm-7-2H2V5h2v10Zm18 0h-2V5h2v10ZM20 5H4V3h16v2Zm-5 14h3v2H6v-2h3v-2H4v-2h16v2h-5v2Z"/>
    </svg>
  );
}
