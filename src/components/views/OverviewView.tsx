import { ArrowRight, Bookmark, Film, SlidersHorizontal, Sparkles, Star } from 'lucide-react';
import type {
  Genre,
  MovieSummary,
  NavSection,
  RecommendationsResponse,
  UserProfile,
} from '../../types';
import { MovieCard } from '../MovieCard';
import { TmdbNotice } from '../TmdbNotice';

interface OverviewViewProps {
  user: UserProfile | null;
  genres: Genre[];
  genresMap: Map<number, string>;
  popularMovies: MovieSummary[];
  publicDomainMovies: MovieSummary[];
  recommendations: RecommendationsResponse | null;
  loading: boolean;
  usingFallback: boolean;
  fallbackReason: string | null;
  watchlistIds: Set<number>;
  ratingsMap: Map<number, number>;
  onSelectMovie: (movieId: number) => void;
  onToggleWatchlist: (movieId: number) => void;
  onNavigate: (section: NavSection, discoverMode?: 'all' | 'public-domain') => void;
  onToggleFavoriteGenre: (genreId: number) => void;
  onOpenAuth: () => void;
}

export function OverviewView({
  user,
  genres,
  genresMap,
  popularMovies,
  publicDomainMovies,
  recommendations,
  loading,
  usingFallback,
  fallbackReason,
  watchlistIds,
  ratingsMap,
  onSelectMovie,
  onToggleWatchlist,
  onNavigate,
  onToggleFavoriteGenre,
  onOpenAuth,
}: OverviewViewProps) {
  const recList = recommendations?.recommendations || [];
  const favoriteGenreIds = user?.favorite_genres || [];
  const favoriteGenreNames = favoriteGenreIds
    .map((id) => genresMap.get(id))
    .filter((name): name is string => Boolean(name));

  return (
    <div className="space-y-8">
      {/* Welcome Banner */}
      <section className="rounded-2xl bg-[#272828] border border-white/[0.08] p-6 sm:p-7 flex flex-col md:flex-row md:items-center md:justify-between gap-6">
        <div className="space-y-2 max-w-2xl">
          <h2 className="font-display text-2xl sm:text-3xl font-bold text-white tracking-tight text-balance">
            {user ? `Welcome back, ${user.username}` : 'Welcome to CineMatch'}
          </h2>
          <p className="text-sm sm:text-base text-[#B4B8B8] leading-relaxed">
            {user
              ? 'Your personalized recommendations combine collaborative rating overlap, TF-IDF content similarity, and live popularity signals.'
              : 'Browse movies, watch official trailers and free full-length public domain classics right in your browser, and unlock personalized recommendations.'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 shrink-0">
          {!user ? (
            <button
              type="button"
              onClick={onOpenAuth}
              className="px-5 py-2.5 rounded-xl bg-[#B7FF4C] text-[#0F1010] text-sm font-semibold hover:bg-[#c8ff75] transition-colors whitespace-nowrap"
            >
              Sign In to Personalize
            </button>
          ) : (
            <button
              type="button"
              onClick={() => onNavigate('recommended')}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#B7FF4C] text-[#0F1010] text-sm font-semibold hover:bg-[#c8ff75] transition-colors whitespace-nowrap"
            >
              <span>View Top 10 Matches</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          )}
          <button
            type="button"
            onClick={() => onNavigate('discover', 'public-domain')}
            className="px-4 py-2.5 rounded-xl bg-[#161717] border border-white/10 text-sm font-medium text-white hover:border-[#B7FF4C] transition-colors whitespace-nowrap"
          >
            Watch Free Full Movies
          </button>
        </div>
      </section>

      {usingFallback && <TmdbNotice message={fallbackReason} />}

      {/* 4-Column KPI Strip */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-xl bg-[#272828] border border-white/[0.08] p-4 sm:p-5">
          <div className="flex items-center justify-between text-xs text-[#B4B8B8]">
            <span>Recommended Movies</span>
            <Sparkles className="w-4 h-4 text-[#B7FF4C]" />
          </div>
          <p className="mt-2 font-display text-2xl font-bold text-white tabular-nums">
            {recList.length}
          </p>
          <p className="mt-1 text-xs text-[#808585]">
            {recommendations?.mode === 'hybrid'
              ? 'Hybrid engine active'
              : recommendations?.mode === 'content-popularity'
                ? 'Content + Popularity'
                : 'Popularity fallback'}
          </p>
        </div>

        <div className="rounded-xl bg-[#272828] border border-white/[0.08] p-4 sm:p-5">
          <div className="flex items-center justify-between text-xs text-[#B4B8B8]">
            <span>Favorite Genres</span>
            <SlidersHorizontal className="w-4 h-4 text-[#B7FF4C]" />
          </div>
          <p className="mt-2 font-display text-2xl font-bold text-white tabular-nums">
            {favoriteGenreIds.length}
          </p>
          <p className="mt-1 text-xs text-[#808585] truncate">
            {favoriteGenreNames.length > 0 ? favoriteGenreNames.join(', ') : 'None selected yet'}
          </p>
        </div>

        <div className="rounded-xl bg-[#272828] border border-white/[0.08] p-4 sm:p-5">
          <div className="flex items-center justify-between text-xs text-[#B4B8B8]">
            <span>Movies Rated</span>
            <Star className="w-4 h-4 text-[#B7FF4C]" />
          </div>
          <p className="mt-2 font-display text-2xl font-bold text-white tabular-nums">
            {user?.ratings.length ?? 0}
          </p>
          <p className="mt-1 text-xs text-[#808585]">
            Used for taste vectors
          </p>
        </div>

        <div className="rounded-xl bg-[#272828] border border-white/[0.08] p-4 sm:p-5">
          <div className="flex items-center justify-between text-xs text-[#B4B8B8]">
            <span>My Watchlist</span>
            <Bookmark className="w-4 h-4 text-[#B7FF4C]" />
          </div>
          <p className="mt-2 font-display text-2xl font-bold text-white tabular-nums">
            {user?.watchlist.length ?? 0}
          </p>
          <p className="mt-1 text-xs text-[#808585]">
            Saved titles
          </p>
        </div>
      </section>

      {/* Favorite Genres Quick Selector */}
      {genres.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h3 className="font-display text-lg font-semibold text-white">Favorite Genres</h3>
              <p className="text-xs text-[#B4B8B8]">
                Select genres to shape your personalized recommendations.
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('genres')}
              className="text-xs font-medium text-[#B7FF4C] hover:underline whitespace-nowrap shrink-0"
            >
              Browse All Genres
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {genres.slice(0, 12).map((genre) => {
              const selected = favoriteGenreIds.includes(genre.id);
              return (
                <button
                  key={genre.id}
                  type="button"
                  onClick={() => {
                    if (!user) {
                      onOpenAuth();
                      return;
                    }
                    onToggleFavoriteGenre(genre.id);
                  }}
                  className={`px-3.5 py-2 rounded-lg text-xs font-medium border transition-colors whitespace-nowrap ${
                    selected
                      ? 'bg-[#B7FF4C] text-[#0F1010] border-[#B7FF4C] font-semibold'
                      : 'bg-[#272828] text-[#B4B8B8] border-white/10 hover:text-white hover:border-white/25'
                  }`}
                >
                  {genre.name}
                </button>
              );
            })}
          </div>
        </section>
      )}

      {/* Free Full-Length Movies (Watch Inside CineMatch) */}
      {(loading || publicDomainMovies.length > 0) && (
        <section className="space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h3 className="font-display text-xl font-bold text-white">
                Free Full Movies — Watch Now
              </h3>
              <p className="text-xs text-[#B4B8B8] mt-0.5">
                Public domain feature films playable in full directly inside CineMatch
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('discover', 'public-domain')}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#B7FF4C] hover:underline whitespace-nowrap shrink-0"
            >
              <span>See all free films</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {loading ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="aspect-[2/3] rounded-xl bg-[#272828] animate-pulse" />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-4">
              {publicDomainMovies.slice(0, 5).map((movie) => (
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
        </section>
      )}

      {/* Personalized / Recently Recommended Movies */}
      <section className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h3 className="font-display text-xl font-bold text-white">
              {user ? 'Personalized Recommendations' : 'Recommended For You'}
            </h3>
            <p className="text-xs text-[#B4B8B8] mt-0.5">
              {recommendations?.formula || 'Top picks based on popularity and genre alignment'}
            </p>
          </div>
          <button
            type="button"
            onClick={() => onNavigate('recommended')}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#B7FF4C] hover:underline whitespace-nowrap shrink-0"
          >
            <span>See all 10</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {loading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="aspect-[2/3] rounded-xl bg-[#272828] animate-pulse" />
            ))}
          </div>
        ) : recList.length > 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-4">
            {recList.slice(0, 5).map((movie) => (
              <MovieCard
                key={movie.id}
                movie={movie}
                genresMap={genresMap}
                inWatchlist={watchlistIds.has(movie.id)}
                userRating={ratingsMap.get(movie.id)}
                matchScore={movie.finalScore}
                reason={movie.reason}
                onSelect={onSelectMovie}
                onToggleWatchlist={onToggleWatchlist}
              />
            ))}
          </div>
        ) : (
          <div className="rounded-xl bg-[#272828] border border-white/[0.08] p-8 text-center">
            <Film className="w-8 h-8 text-[#808585] mx-auto mb-2" />
            <p className="text-sm text-[#B4B8B8]">
              Rate a few movies or pick favorite genres to generate personalized matches.
            </p>
          </div>
        )}
      </section>

      {/* Most Popular Movies */}
      <section className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h3 className="font-display text-xl font-bold text-white">Most Popular Movies</h3>
            <p className="text-xs text-[#B4B8B8] mt-0.5">
              {usingFallback
                ? 'Live top movies chart via Apple iTunes & Internet Archive'
                : 'Live global popularity chart from The Movie Database'}
            </p>
          </div>
          <button
            type="button"
            onClick={() => onNavigate('discover', 'all')}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#B7FF4C] hover:underline whitespace-nowrap shrink-0"
          >
            <span>Explore catalog</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {loading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-4">
            {Array.from({ length: 10 }).map((_, i) => (
              <div key={i} className="aspect-[2/3] rounded-xl bg-[#272828] animate-pulse" />
            ))}
          </div>
        ) : popularMovies.length > 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-4">
            {popularMovies.slice(0, 10).map((movie) => (
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
        ) : null}
      </section>
    </div>
  );
}
