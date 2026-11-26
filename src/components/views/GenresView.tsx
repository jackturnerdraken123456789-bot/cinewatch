import { useEffect, useState } from 'react';
import { Check, Heart } from 'lucide-react';
import { api, ApiError } from '../../api';
import type { Genre, MovieSummary, UserProfile } from '../../types';
import { MovieCard } from '../MovieCard';
import { TmdbNotice } from '../TmdbNotice';

interface GenresViewProps {
  user: UserProfile | null;
  genres: Genre[];
  genresMap: Map<number, string>;
  watchlistIds: Set<number>;
  ratingsMap: Map<number, number>;
  onSelectMovie: (movieId: number) => void;
  onToggleWatchlist: (movieId: number) => void;
  onToggleFavoriteGenre: (genreId: number) => void;
  onOpenAuth: () => void;
}

export function GenresView({
  user,
  genres,
  genresMap,
  watchlistIds,
  ratingsMap,
  onSelectMovie,
  onToggleWatchlist,
  onToggleFavoriteGenre,
  onOpenAuth,
}: GenresViewProps) {
  const [activeGenreId, setActiveGenreId] = useState<number | null>(null);
  const [movies, setMovies] = useState<MovieSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [tmdbMissing, setTmdbMissing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (genres.length > 0 && activeGenreId === null) {
      const preferred = user?.favorite_genres?.[0];
      setActiveGenreId(preferred || genres[0].id);
    }
  }, [genres, activeGenreId, user]);

  useEffect(() => {
    if (!activeGenreId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setTmdbMissing(false);

    api
      .discoverMovies({ genre: String(activeGenreId), sortBy: 'popularity.desc', page: 1 })
      .then((res) => {
        if (!cancelled) setMovies(res.results || []);
      })
      .catch((err) => {
        if (!cancelled) {
          if (err instanceof ApiError && err.code === 'TMDB_KEY_MISSING') {
            setTmdbMissing(true);
          }
          setError(err instanceof ApiError ? err.message : 'Failed to load genre catalog.');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [activeGenreId]);

  const activeGenre = genres.find((g) => g.id === activeGenreId);
  const isFavorite = activeGenreId ? Boolean(user?.favorite_genres.includes(activeGenreId)) : false;

  return (
    <div className="space-y-6">
      <section className="rounded-2xl bg-[#272828] border border-white/[0.08] p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-lg font-bold text-white">Browse by Genre</h2>
            <p className="text-xs text-[#B4B8B8]">
              Pick a genre to explore movies or star it as one of your favorites.
            </p>
          </div>
          {activeGenre && (
            <button
              type="button"
              onClick={() => {
                if (!user) {
                  onOpenAuth();
                  return;
                }
                onToggleFavoriteGenre(activeGenre.id);
              }}
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold border transition-colors whitespace-nowrap ${
                isFavorite
                  ? 'bg-[#B7FF4C] text-[#0F1010] border-[#B7FF4C]'
                  : 'bg-[#141515] text-white border-white/15 hover:border-[#B7FF4C]'
              }`}
            >
              {isFavorite ? <Check className="w-3.5 h-3.5" /> : <Heart className="w-3.5 h-3.5" />}
              <span>{isFavorite ? `${activeGenre.name} Favorited` : `Add ${activeGenre.name} to Favorites`}</span>
            </button>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          {genres.map((genre) => {
            const active = genre.id === activeGenreId;
            const fav = user?.favorite_genres.includes(genre.id);
            return (
              <button
                key={genre.id}
                type="button"
                onClick={() => setActiveGenreId(genre.id)}
                className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-medium border transition-colors whitespace-nowrap ${
                  active
                    ? 'bg-[#B7FF4C] text-[#0F1010] border-[#B7FF4C] font-semibold'
                    : 'bg-[#141515] text-[#B4B8B8] border-white/10 hover:text-white hover:border-white/25'
                }`}
              >
                <span>{genre.name}</span>
                {fav && (
                  <Heart
                    className={`w-3 h-3 ${
                      active ? 'fill-[#0F1010] text-[#0F1010]' : 'fill-[#B7FF4C] text-[#B7FF4C]'
                    }`}
                  />
                )}
              </button>
            );
          })}
        </div>
      </section>

      {tmdbMissing && <TmdbNotice message={error} />}

      {activeGenre && !tmdbMissing && (
        <div className="space-y-4">
          <h3 className="font-display text-xl font-bold text-white">
            Popular in {activeGenre.name}
          </h3>

          {loading ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-4">
              {Array.from({ length: 10 }).map((_, idx) => (
                <div key={idx} className="aspect-[2/3] rounded-xl bg-[#272828] animate-pulse" />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-4">
              {movies.map((movie) => (
                <MovieCard
                  key={movie.id}
                  movie={movie}
                  genresMap={genresMap}
                  inWatchlist={watchlistIds.has(movie.id)}
                  userRating={ratingsMap.get(movie.id)}
                  onSelect={onSelectMovie}
                  onToggleWatchlist={onToggleWatchlist}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
