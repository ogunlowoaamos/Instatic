import React from 'react';
import type { IconProps } from '../types';

export function PackageIcon({ size = 24, color = 'currentColor', className, style }: IconProps): React.ReactElement {
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
      <path d="M14 18h4v2h-4v2h-4v-2h2v-8h-2v-2h4v8Zm-4 2H6v-2h4v2ZM6 8H4v8h2v2H2V6h4v2Zm16 10h-4v-2h2V8h-2V6h4v12Zm-12-8H6V8h4v2Zm8 0h-4V8h4v2Zm-4-2h-4V6h4v2Zm-4-2H6V4h4v2Zm8 0h-4V4h4v2Zm-4-2h-4V2h4v2Z"/>
    </svg>
  );
}
