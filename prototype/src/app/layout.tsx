import type { Metadata, Viewport } from 'next'
import { MobileViewport } from '@/components/mobile-viewport'
import './globals.css'
import '@/components/mobile.css'

export const metadata: Metadata = {
  title: 'Lumio | Find your direction through real work',
  description: 'Explore careers, try simulated workplace tasks and build a private portfolio of your work.',
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  interactiveWidget: 'resizes-content',
  themeColor: '#111218',
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body><MobileViewport />{children}</body></html>
}
