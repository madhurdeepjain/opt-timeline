import type { Metadata } from 'next'
import { IBM_Plex_Sans } from 'next/font/google'
import { Analytics } from '@vercel/analytics/next'
import './globals.css'

const ibmPlexSans = IBM_Plex_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-ibm-plex-sans',
  display: 'swap',
})

const siteUrl = 'https://www.mdjain.com/opt-timeline'
const ogImage = { url: `${siteUrl}/opengraph-image`, width: 1200, height: 630, type: 'image/png' }

export const metadata: Metadata = {
  // metadataBase must be the domain root — absolute paths like /opengraph-image
  // replace the path segment of the base URL, so /opt-timeline in the base would be dropped.
  metadataBase: new URL('https://www.mdjain.com'),
  title: {
    default: 'OPT Timeline',
    template: '%s · OPT Timeline',
  },
  description: 'Real OPT & STEM OPT approval timelines crowdsourced from Reddit — 2000+ records from r/f1visa and r/USCIS megathreads.',
  openGraph: {
    type: 'website',
    url: siteUrl,
    siteName: 'OPT Timeline',
    title: 'OPT Timeline',
    description: 'Real OPT & STEM OPT approval timelines crowdsourced from Reddit — 2000+ records from r/f1visa and r/USCIS.',
    images: [ogImage],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'OPT Timeline',
    description: 'Real OPT & STEM OPT approval timelines crowdsourced from Reddit — 2000+ records from r/f1visa and r/USCIS.',
    images: [ogImage],
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={ibmPlexSans.variable}>
      <body className="font-sans antialiased">
        {children}
        <Analytics />
      </body>
    </html>
  )
}
