'use client';

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { generatePalette } from './palette';
import type { Album } from './showcase-data';
import { C3 } from './theme';

interface Props {
  album: Album;
  alt?: string;
  className?: string;
  style?: CSSProperties;
  fallbackClassName?: string;
  fallbackStyle?: CSSProperties;
  fallbackLabel?: string;
  priority?: boolean;
  deferMs?: number;
}

export default function AlbumArtwork({
  album,
  alt = '',
  className,
  style,
  fallbackClassName = 'flex h-full w-full items-center justify-center text-sm font-semibold',
  fallbackStyle,
  fallbackLabel,
  priority = false,
  deferMs = 0,
}: Props) {
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [shouldLoad, setShouldLoad] = useState(priority || deferMs <= 0);
  const { opacity, ...imageStyle } = style ?? {};
  const placeholderPalette = generatePalette(album.base_color ?? null);
  const [br, bg, bb] = placeholderPalette.bgDark;
  const [mr, mg, mb] = placeholderPalette.bgMid;
  const [ar, ag, ab] = placeholderPalette.accentGlow;
  const placeholderStyle: CSSProperties = {
    color: C3,
    background: `radial-gradient(circle at 24% 20%, rgba(${ar},${ag},${ab},0.32), transparent 56%), linear-gradient(145deg, rgb(${mr},${mg},${mb}), rgb(${br},${bg},${bb}))`,
    opacity: 0.82,
    ...fallbackStyle,
  };
  const placeholderLabel = fallbackLabel ?? album.name.charAt(0).toUpperCase();

  useEffect(() => {
    setFailed(false);
    setLoaded(false);
    setShouldLoad(priority || deferMs <= 0);

    if (priority || deferMs <= 0) return;
    const timeout = setTimeout(() => setShouldLoad(true), deferMs);
    return () => clearTimeout(timeout);
  }, [album.artworkUrl, deferMs, priority]);

  useEffect(() => {
    const image = imgRef.current;
    if (!image || !image.complete || image.naturalWidth === 0) return;
    setLoaded(true);
  }, [album.artworkUrl]);

  if (album.artworkUrl && shouldLoad && !failed) {
    return (
      <span className="relative block h-full w-full overflow-hidden">
        <span className={`absolute inset-0 ${fallbackClassName}`} style={placeholderStyle} aria-hidden="true">
          {placeholderLabel}
        </span>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          ref={imgRef}
          src={album.artworkUrl}
          alt={alt}
          loading={priority ? 'eager' : 'lazy'}
          decoding="async"
          className={`${className ?? ''} relative explorer-fade-image ${loaded ? 'is-loaded' : ''}`}
          style={{
            ...imageStyle,
            ['--explorer-image-loaded-opacity' as string]: opacity ?? 1,
          }}
          onLoad={() => setLoaded(true)}
          onError={() => setFailed(true)}
        />
      </span>
    );
  }

  return (
    <span
      className={fallbackClassName}
      style={placeholderStyle}
      aria-hidden={alt ? undefined : 'true'}
    >
      {placeholderLabel}
    </span>
  );
}
