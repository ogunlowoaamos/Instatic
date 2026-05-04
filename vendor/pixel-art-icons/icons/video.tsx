import React from 'react';
import type { IconProps } from '../types';

export function VideoIcon({ size = 24, color = 'currentColor', className, style }: IconProps): React.ReactElement {
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
      <path d="M16 19H4v-2h12v2ZM4 17H2V7h2v10Zm14-8h2V7h2v10h-2v-2h-2v2h-2V7h2v2Zm-2-2H4V5h12v2Z"/>
    </svg>
  );
}
