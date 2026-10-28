import type { Company } from '@/lib/types'
import assets from '@/lib/company-logo-assets.json'

type LogoAsset = { src: string; tone?: 'light' | 'dark' }

export function CompanyLogo({ company, className = '' }: { company: Company; className?: string }) {
  const asset = (assets as Record<string, LogoAsset>)[company.id]
  if (!asset) return null
  return <span className={`company-logo ${asset.tone === 'dark' ? 'company-logo-dark' : ''} ${className}`}>
    {/* Official local brand artwork is separate from Lumio's role illustrations. */}
    {/* eslint-disable-next-line @next/next/no-img-element */}
    <img src={asset.src} alt={`${company.name.en} logo`} width={112} height={32} loading="lazy" decoding="async" />
  </span>
}
