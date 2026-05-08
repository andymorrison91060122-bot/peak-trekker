import Link from 'next/link'
import { MountainIcon } from '@/components/ui/Icons'

export default function MountainBindRow({
  mountain,
  mountainHref,
}: {
  mountain: {
    name: string
    location: string
  }
  mountainHref: string
}) {
  return (
    <Link href={mountainHref} className="community-v2-mountain-bind" data-testid="community-mountain-bind-row">
      <MountainIcon size={14} />
      <span className="community-v2-mountain-bind__name">{mountain.name}</span>
      {mountain.location ? <span className="community-v2-mountain-bind__location">· {mountain.location}</span> : null}
    </Link>
  )
}
