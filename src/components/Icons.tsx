import type { SVGProps } from 'react'

const base = (p: SVGProps<SVGSVGElement>, size = 16) => ({
  width: size,
  height: size,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
  ...p,
})

export const XIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p, 14)}><path d="M18 6 6 18M6 6l12 12" /></svg>
)
export const PlusIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><path d="M12 5v14M5 12h14" /></svg>
)
export const SearchIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p, 15)}><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
)
export const SunIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
  </svg>
)
export const MoonIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" /></svg>
)
export const CalendarIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p, 12)}><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></svg>
)
export const ChecklistIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p, 12)}><path d="m4 12 5 5L20 6" /></svg>
)
export const TrashIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p, 15)}><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6" /></svg>
)
export const SaveIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p, 15)}><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2Z" /><path d="M17 21v-8H7v8M7 3v5h8" /></svg>
)
export const DownloadIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p, 15)}><path d="M12 3v12M7 10l5 5 5-5M5 21h14" /></svg>
)
export const UploadIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p, 15)}><path d="M12 15V3M7 8l5-5 5 5M5 21h14" /></svg>
)
export const BoardIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p, 15)}><rect x="3" y="3" width="7" height="18" rx="1.5" /><rect x="14" y="3" width="7" height="11" rx="1.5" /></svg>
)
