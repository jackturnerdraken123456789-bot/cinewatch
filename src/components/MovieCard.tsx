import { Bookmark, Check, Star } from 'lucide-react';
import type { Genre, MovieSummary } from '../types';
import { PosterImage } from './PosterImage';

interface MovieCardProps {
  movie: MovieSummary;
  genresMap?: Map<number, string>;
  inWatchlist?: boolean;
  userRating?: number;
  matchScore?: number;
  reason?: string;
  onSelect: (movieId: number) => void;
  onToggleWatchlist?: (movieId: number) => void;
}

export function MovieCard({
  movie,
  genresMap,
  inWatchlist = false,
  userRating,
  matchScore,
  reason,
  onSelect,
  onToggleWatchlist,
}: MovieCardProps) {
  const year = movie.release_date ? movie.release_date.slice(0, 4) : 'TBA';
  const ratingText = movie.vote_average ? movie.vote_average.toFixed(1) : 'NR';

  const resolvedGenres: string[] = [];
  if (movie.genres && movie.genres.length > 0) {
    movie.genres.slice(0, 2).forEach((g: Genre) => resolvedGenres.push(g.name));
  } else if (movie.genre_ids && genresMap) {
    movie.genre_ids.slice(0, 2).forEach((gid) => {
      const name = genresMap.get(gid);
      if (name) resolvedGenres.push(name);
    });
  }

  return (
    <article className="group relative flex flex-col rounded-xl bg-[#272828] border border-white/[0.07] hover:border-[#B7FF4C]/45 transition-colors duration-200 overflow-hidden">
      <div className="relative aspect-[2/3] w-full overflow-hidden bg-[#181919]">
        <button
          type="button"
          onClick={() => onSelect(movie.id)}
          className="block w-full h-full text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#B7FF4C]"
          aria-label={`View details for ${movie.title}`}
        >
          <PosterImage
            posterPath={movie.poster_path}
            title={movie.title}
            releaseYear={year}
            className="w-full h-full transition-transform duration-300 group-hover:scale-[1.03]"
          />
        </button>

        {onToggleWatchlist && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggleWatchlist(movie.id);
            }}
            aria-label={inWatchlist ? `Remove ${movie.title} from watchlist` : `Add ${movie.title} to watchlist`}
            title={inWatchlist ? 'In Watchlist' : 'Add to Watchlist'}
            className={`absolute top-2.5 right-2.5 w-9 h-9 rounded-lg flex items-center justify-center transition-colors duration-150 border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#B7FF4C] ${
              inWatchlist
                ? 'bg-[#B7FF4C] text-[#0F1010] border-[#B7FF4C]'
                : 'bg-[#0F1010]/80 text-white border-white/15 hover:bg-[#0F1010] hover:border-[#B7FF4C]/60'
            }`}
          >
            {inWatchlist ? <Check className="w-4 h-4 stroke-[2.5]" /> : <Bookmark className="w-4 h-4" />}
          </button>
        )}

        {typeof matchScore === 'number' && (
          <div className="pointer-events-none absolute bottom-0 inset-x-0 bg-gradient-to-t from-[#0F1010]/95 via-[#0F1010]/70 to-transparent px-3 pt-6 pb-2 flex items-center justify-between">
            <span className="text-xs font-mono font-semibold text-[#B7FF4C] tabular-nums">
              {Math.round(matchScore * 100)}% match
            </span>
          </div>
        )}
      </div>

      <button
        type="button"
        onClick={() => onSelect(movie.id)}
        className="flex-1 flex flex-col justify-between p-3.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#B7FF4C]"
      >
        <div>
          <h3 className="font-display text-sm font-semibold text-white leading-snug line-clamp-1 group-hover:text-[#B7FF4C] transition-colors">
            {movie.title}
          </h3>
          <div className="mt-1.5 flex items-center gap-1.5 text-xs text-[#B4B8B8] tabular-nums flex-wrap">
            <span>{year}</span>
            <span aria-hidden="true">·</span>
            <span className="inline-flex items-center gap-1 text-white font-medium">
              <Star className="w-3.5 h-3.5 text-[#B7FF4C] fill-[#B7FF4C]" />
              {ratingText}
            </span>
            {typeof userRating === 'number' && (
              <>
                <span aria-hidden="true">·</span>
                <span className="text-[#B7FF4C]">You: {userRating}/5</span>
              </>
            )}
            {movie.is_full_movie_playable && (
              <>
                <span aria-hidden="true">·</span>
                <span className="text-[#B7FF4C] font-medium">Watch Full</span>
              </>
            )}
          </div>
          {resolvedGenres.length > 0 && (
            <p className="mt-1 text-xs text-[#808585] line-clamp-1">
              {resolvedGenres.join(' / ')}
            </p>
          )}
        </div>

        {reason && (
          <p className="mt-2 pt-2 border-t border-white/[0.06] text-xs text-[#B4B8B8] line-clamp-2">
            {reason}
          </p>
        )}
      </button>
    </article>
  );
}
