import type { Metadata, Viewport } from 'next';
import { readFile } from 'fs/promises';
import { join } from 'path';
import ExplorerShell from '@/components/explorer/ExplorerShell';
import PwaRegistrar from '@/components/PwaRegistrar';
import { transformAlbums } from '@/components/explorer/showcase-data';

export const metadata: Metadata = {
  title: 'Roam Productions · rdelune',
  description: 'Music by Roam Studio. Listen to albums, demos, and works in progress.',
  alternates: {
    canonical: 'https://productions.rdelune.dev/',
  },
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    title: 'Roam Productions',
    statusBarStyle: 'black-translucent',
  },
  other: {
    'mobile-web-app-capable': 'yes',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#050810',
  colorScheme: 'dark',
};

async function getInitialAlbums() {
  try {
    const filePath = join(process.cwd(), 'public', 'data', 'showcase.json');
    const raw = await readFile(filePath, 'utf8');
    const data = JSON.parse(raw) as { albums?: readonly unknown[] };
    const albums = transformAlbums(Array.isArray(data.albums) ? data.albums : []);

    if (process.env.NODE_ENV !== 'production' && albums.length === 0) {
      console.warn('[productions] Local showcase seed contained no albums.');
    }

    return albums;
  } catch (error) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn(
        '[productions] Failed to read local showcase seed:',
        error instanceof Error ? error.message : String(error),
      );
    }

    return [];
  }
}

export default async function ProductionsPage() {
  const initialAlbums = await getInitialAlbums();

  return (
    <>
      <PwaRegistrar />
      <ExplorerShell initialAlbums={initialAlbums} />
    </>
  );
}
