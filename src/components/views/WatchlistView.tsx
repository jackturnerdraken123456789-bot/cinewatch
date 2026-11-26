import { useEffect, useState } from 'react';
import { Bookmark, Play, Star, Trash2 } from 'lucide-react';
import { api } from '../../api';
import type { NavSection, UserProfile, WatchlistEntry } from '../../types';
import { PosterImage } from '../PosterImage';

interface WatchlistViewProps {
  user: UserProfile | null;
  onSelectMovie: (movieId: number, focusProviders?: boolean) => void;
  onRemoveWatchlistItem: (watchlistId: number) => Promise<void>;
  onNavigate: (section: NavSection) => void;
  onOpenAuth: () => void;
}

export function WatchlistView({
  user,
  onSelectMovie,
  onRemoveWatchlistItem,
  onNavigate,
  onOpenAuth,
}: WatchlistViewProps) {
  const [items, setItems] = useState<WatchlistEntry[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!user) {
      setItems([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    api
      .getWatchlist(user.user_id, true)
      .then((res) => {
        if (!cancelled) setItems(res.watchlist || []);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [user, user?.watchlist.length]);

  if (!user) {
    return (
      <div className="rounded-2xl bg-[#272828] border border-white/[0.08] p-12 text-center space-y-4 max-w-xl mx-auto mt-8">
        <div className="w-12 h-12 rounded-2xl bg-[#141515] border border-white/10 flex items-center justify-center mx-auto text-[#B7FF4C]">
          <Bookmark className="w-6 h-6" />
        </div>
        <h2 className="font-display text-xl font-bold text-white">Sign in to manage your Watchlist</h2>
        <p className="text-sm text-[#B4B8B8]">
          Save movies by TMDB ID to keep track of titles you want to watch later and check where they stream.
        </p>
        <button
          type="button"
          onClick={onOpenAuth}
          className="px-5 py-2.5 rounded-xl bg-[#B7FF4C] text-[#0F1010] text-sm font-semibold hover:bg-[#c8ff75] transition-colors"
        >
          Sign In or Create Account
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-xl font-bold text-white">My Watchlist</h2>
          <p className="text-xs text-[#B4B8B8] mt-0.5 tabular-nums">
            {items.length} saved {items.length === 1 ? 'title' : 'titles'}
          </p>
        </div>
        <button
          type="button"
          onClick={() => onNavigate('discover')}
          className="px-4 py-2 rounded-xl bg-[#272828] border border-white/10 text-xs font-medium text-white hover:border-[#B7FF4C] transition-colors whitespace-nowrap"
        >
          Add More Movies
        </button>
      </div>

      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-4">
          {Array.from({ length: 5 }).map((_, idx) => (
            <div key={idx} className="aspect-[2/3] rounded-xl bg-[#272828] animate-pulse" />
          ))}
        </div>
      ) : items.length > 0 ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-4">
          {items.map((entry) => {
            const movie = entry.movie;
            const title = movie?.title || `Movie #${entry.tmdb_movie_id}`;
            const year = movie?.release_date ? movie.release_date.slice(0, 4) : 'TBA';
            const rating = movie?.vote_average ? movie.vote_average.toFixed(1) : 'NR';

            return (
              <article
                key={entry.watchlist_id}
                className="flex flex-col rounded-xl bg-[#272828] border border-white/[0.08] overflow-hidden"
              >
                <button
                  type="button"
                  onClick={() => onSelectMovie(entry.tmdb_movie_id)}
                  className="aspect-[2/3] w-full overflow-hidden bg-[#181919] text-left"
                >
                  <PosterImage
                    posterPath={movie?.poster_path || null}
                    title={title}
                    releaseYear={year}
                    className="w-full h-full hover:scale-[1.03] transition-transform"
                  />
                </button>

                <div className="p-3.5 flex-1 flex flex-col justify-between gap-3">
                  <div>
                    <h3 className="font-display text-sm font-semibold text-white line-clamp-1">
                      {title}
                    </h3>
                    <div className="mt-1 flex items-center gap-1.5 text-xs text-[#B4B8B8] tabular-nums">
                      <span>{year}</span>
                      <span aria-hidden="true">·</span>
                      <span className="inline-flex items-center gap-1 text-white">
                        <Star className="w-3.5 h-3.5 text-[#B7FF4C] fill-[#B7FF4C]" />
                        {rating}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => onSelectMovie(entry.tmdb_movie_id, true)}
                      className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-[#B7FF4C] text-[#0F1010] text-xs font-semibold hover:bg-[#c8ff75] transition-colors whitespace-nowrap"
                    >
                      <Play className="w-3.5 h-3.5 fill-current" />
                      <span>Watch</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => onRemoveWatchlistItem(entry.watchlist_id)}
                      aria-label={`Remove ${title} from watchlist`}
                      title="Remove from Watchlist"
                      className="p-2 rounded-lg bg-[#141515] border border-white/10 text-[#B4B8B8] hover:text-red-300 hover:border-red-400/40 transition-colors shrink-0"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="rounded-2xl bg-[#272828] border border-white/[0.08] p-12 text-center space-y-3">
          <p className="font-display text-lg font-semibold text-white">Your watchlist is empty</p>
          <p className="text-sm text-[#B4B8B8]">
            Bookmark movies from Overview or Discover Movies to build your personal queue.
          </p>
          <button
            type="button"
            onClick={() => onNavigate('discover')}
            className="mt-2 px-5 py-2.5 rounded-xl bg-[#B7FF4C] text-[#0F1010] text-sm font-semibold"
          >
            Discover Movies
          </button>
        </div>
      )}
    </div>
  );
}
