import type { Metadata } from 'next'
import { IBM_Plex_Sans } from 'next/font/google'
import './globals.css'

const ibmPlexSans = IBM_Plex_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-ibm-plex-sans',
  display: 'swap',
})

const siteUrl = 'https://madhurdeepjain.github.io/opt-timeline'

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: 'OPT Timeline',
    template: '%s · OPT Timeline',
  },
  description:
    'Community-sourced OPT & STEM OPT EAD processing timelines aggregated from Reddit megathreads. Track approval times, biometrics, and card delivery.',
  openGraph: {
    type: 'website',
    url: siteUrl,
    siteName: 'OPT Timeline',
    title: 'OPT Timeline',
    description:
      'Community-sourced OPT & STEM OPT EAD processing timelines aggregated from Reddit megathreads.',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'OPT Timeline',
    description:
      'Community-sourced OPT & STEM OPT EAD processing timelines aggregated from Reddit megathreads.',
  },
  icons: {
    icon: '/opt-timeline/icon.svg',
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={ibmPlexSans.variable}>
      <body className="font-sans antialiased">{children}</body>
    </html>
  )
}
