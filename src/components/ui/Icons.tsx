import type { ReactNode } from 'react'

export interface IconProps {
  size?: number
  color?: string
  className?: string
}

function strokeProps(color: string) {
  return {
    stroke: color,
    strokeWidth: 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  }
}

function IconShell({
  size = 22,
  className,
  children,
}: IconProps & {
  children: ReactNode
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  )
}

type IconChildren = (color: string) => ReactNode

function renderIcon(props: IconProps, children: IconChildren) {
  const { size = 22, color = 'currentColor', className } = props

  return (
    <IconShell size={size} className={className}>
      {children(color)}
    </IconShell>
  )
}

export function MountainIcon(props: IconProps) {
  return renderIcon(props, (color) => (
    <>
      <path d="M4 17L9.8 8.2a1 1 0 0 1 1.7 0L20 17" {...strokeProps(color)} />
      <path d="M7 17h10" {...strokeProps(color)} />
    </>
  ))
}

export function ArchiveIcon(props: IconProps) {
  return renderIcon(props, (color) => (
    <>
      <path
        d="M5.5 5.5h11A1.5 1.5 0 0 1 18 7v11.5l-3-1.6-3 1.6-3-1.6-3 1.6V7a1.5 1.5 0 0 1 1.5-1.5z"
        {...strokeProps(color)}
      />
      <path d="M9 10.5h6M9 13.5h4" {...strokeProps(color)} />
    </>
  ))
}

export function PrepIcon(props: IconProps) {
  return renderIcon(props, (color) => (
    <>
      <path d="M7 19V7.5A1.5 1.5 0 0 1 8.5 6h7A1.5 1.5 0 0 1 17 7.5V19" {...strokeProps(color)} />
      <path d="M9 6.5C9 5.1 10.1 4 11.5 4h1C13.9 4 15 5.1 15 6.5M9.5 11.5h5" {...strokeProps(color)} />
    </>
  ))
}

export function RecordIcon(props: IconProps) {
  return renderIcon(props, (color) => (
    <>
      <path d="M11 5h2M12 5v11M8.5 20h7" {...strokeProps(color)} />
      <path d="M8 8.5c1.5.5 3 1.7 4 3.5 1.2-1.8 2.5-3 4-3.5" {...strokeProps(color)} />
    </>
  ))
}

export function CommunityIcon(props: IconProps) {
  return renderIcon(props, (color) => (
    <>
      <circle cx="9" cy="9" r="2" {...strokeProps(color)} />
      <circle cx="15" cy="9" r="2" {...strokeProps(color)} />
      <path d="M6 16.5c0-1.6 1.4-3 3-3s3 1.4 3 3M12 16.5c0-1.6 1.4-3 3-3s3 1.4 3 3" {...strokeProps(color)} />
    </>
  ))
}

export function MeIcon(props: IconProps) {
  return renderIcon(props, (color) => (
    <>
      <circle cx="12" cy="8.5" r="3" {...strokeProps(color)} />
      <path d="M6.5 18c1.6-2.4 3.7-3.6 5.5-3.6S15.9 15.6 17.5 18" {...strokeProps(color)} />
    </>
  ))
}

export function BackIcon(props: IconProps) {
  return renderIcon(props, (color) => <path d="M15 6l-6 6 6 6" {...strokeProps(color)} />)
}

export function ShareIcon(props: IconProps) {
  return renderIcon(props, (color) => (
    <path d="M12 4v12M7 9l5-5 5 5M5 14v4a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-4" {...strokeProps(color)} />
  ))
}

export function MoreIcon({
  size = 22,
  color = 'currentColor',
  className,
}: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      <circle cx="5" cy="12" r="1.6" fill={color} />
      <circle cx="12" cy="12" r="1.6" fill={color} />
      <circle cx="19" cy="12" r="1.6" fill={color} />
    </svg>
  )
}

export function RefreshIcon(props: IconProps) {
  return renderIcon(props, (color) => (
    <>
      <path d="M20 6.5v5h-5" {...strokeProps(color)} />
      <path d="M4 17.5v-5h5" {...strokeProps(color)} />
      <path d="M18.2 10A6.2 6.2 0 0 0 7.4 6.8L4 10" {...strokeProps(color)} />
      <path d="M5.8 14A6.2 6.2 0 0 0 16.6 17.2L20 14" {...strokeProps(color)} />
    </>
  ))
}

export function SearchIcon(props: IconProps) {
  return renderIcon(props, (color) => (
    <>
      <circle cx="11" cy="11" r="6.5" {...strokeProps(color)} />
      <path d="M16 16l4 4" {...strokeProps(color)} />
    </>
  ))
}

export function FilterIcon(props: IconProps) {
  return renderIcon(props, (color) => <path d="M4 6h16M7 12h10M10 18h4" {...strokeProps(color)} />)
}

export function PinIcon(props: IconProps) {
  return renderIcon(props, (color) => (
    <>
      <path d="M12 2C7.6 2 4 5.6 4 10c0 5.4 8 12 8 12s8-6.6 8-12c0-4.4-3.6-8-8-8z" {...strokeProps(color)} />
      <circle cx="12" cy="10" r="3" {...strokeProps(color)} />
    </>
  ))
}

export function CheckIcon(props: IconProps) {
  return renderIcon(props, (color) => (
    <>
      <circle cx="12" cy="12" r="9" {...strokeProps(color)} />
      <path d="M8 12l3 3 5-6" {...strokeProps(color)} />
    </>
  ))
}

export function WarnIcon(props: IconProps) {
  return renderIcon(props, (color) => (
    <>
      <path d="M12 3l10 18H2z" {...strokeProps(color)} />
      <path d="M12 10v5M12 18v.5" {...strokeProps(color)} />
    </>
  ))
}

export function CameraIcon(props: IconProps) {
  return renderIcon(props, (color) => (
    <>
      <path d="M4 8h3l2-2h6l2 2h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z" {...strokeProps(color)} />
      <circle cx="12" cy="13" r="3.2" {...strokeProps(color)} />
    </>
  ))
}

export function GpsIcon(props: IconProps) {
  return renderIcon(props, (color) => (
    <>
      <circle cx="12" cy="12" r="3" {...strokeProps(color)} />
      <path d="M12 3v3M12 18v3M3 12h3M18 12h3" {...strokeProps(color)} />
    </>
  ))
}

export const Icons = {
  Mountain: MountainIcon,
  Archive: ArchiveIcon,
  Prep: PrepIcon,
  Record: RecordIcon,
  Community: CommunityIcon,
  Me: MeIcon,
  Back: BackIcon,
  Share: ShareIcon,
  More: MoreIcon,
  Refresh: RefreshIcon,
  Search: SearchIcon,
  Filter: FilterIcon,
  Pin: PinIcon,
  Check: CheckIcon,
  Warn: WarnIcon,
  Camera: CameraIcon,
  Gps: GpsIcon,
}
