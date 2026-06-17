import type { Metadata } from 'next';
import './globals.css';
import PageTracker from '@/components/PageTracker';

const title = 'Roam Productions · rdelune';
const description = 'Music by Roam Studio. Listen to albums, demos, and works in progress.';
const siteUrl = 'https://productions.rdelune.dev';

export const metadata: Metadata = {
  title,
  description,
  metadataBase: new URL(siteUrl),
  icons: {
    icon: [
      { url: '/favicon.png', type: 'image/png', sizes: '32x32' },
      { url: '/favicon.svg', type: 'image/svg+xml' },
      { url: '/icon-192.png', type: 'image/png', sizes: '192x192' },
      { url: '/icon-512.png', type: 'image/png', sizes: '512x512' },
    ],
    apple: '/apple-touch-icon.png',
  },
  alternates: {
    canonical: siteUrl,
  },
  openGraph: {
    title,
    description,
    type: 'website',
    url: siteUrl,
    siteName: 'Roam Productions',
  },
  twitter: {
    card: 'summary',
    title,
    description,
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="dark" data-productions-route="true" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{document.documentElement.dataset.theme='dark';document.documentElement.dataset.productionsRoute='true';document.documentElement.style.backgroundColor='#050810'}catch(e){}})()`,
          }}
        />
        <link rel="preload" href="/fonts/space-grotesk.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
        <link rel="preload" href="/fonts/outfit.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
      </head>
      <body>
        <main className="relative w-screen h-[100dvh] min-h-[100dvh] overflow-hidden bg-black">
          <PageTracker />
          {children}
        </main>
      </body>
    </html>
  );
}
