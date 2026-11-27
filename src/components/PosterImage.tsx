import { useState } from 'react';
import { Film } from 'lucide-react';

interface PosterImageProps {
  posterPath: string | null;
  title: string;
  releaseYear?: string;
  className?: string;
}

export function resolvePosterUrl(path: string | null): string | null {
  if (!path) return null;
  if (path.startsWith('http://') || path.startsWith('https://')) {
    return path;
  }
  return `https://image.tmdb.org/t/p/w500${path}`;
}

export function PosterImage({ posterPath, title, releaseYear, className = '' }: PosterImageProps) {
  const [failed, setFailed] = useState(false);
  const src = resolvePosterUrl(posterPath);

  if (!src || failed) {
    return (
      <div
        className={`flex flex-col items-center justify-between bg-gradient-to-br from-[#272828] via-[#1B1C1C] to-[#121313] p-4 text-center border border-white/10 ${className}`}
        aria-label={`${title} poster unavailable`}
      >
        <div className="w-full flex items-center justify-between text-[11px] text-[#808585] font-mono tabular-nums">
          <span>CINEWATCH</span>
          {releaseYear ? <span>{releaseYear}</span> : null}
        </div>
        <div className="flex flex-col items-center gap-3 my-auto px-2">
          <div className="w-11 h-11 rounded-xl bg-[#0F1010]/70 border border-white/10 flex items-center justify-center text-[#B7FF4C]">
            <Film className="w-5 h-5" />
          </div>
          <p className="font-display text-sm font-semibold text-white leading-snug line-clamp-3">
            {title}
          </p>
        </div>
        <span className="text-[11px] text-[#808585]">Poster unavailable</span>
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={`${title} movie poster`}
      referrerPolicy="no-referrer"
      loading="lazy"
      onError={() => setFailed(true)}
      className={`object-cover bg-[#181919] ${className}`}
    />
  );
}
