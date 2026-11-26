import { RefreshCw, Sparkles } from 'lucide-react';
import type { RecommendationsResponse, UserProfile } from '../../types';
import { MovieCard } from '../MovieCard';
import { TmdbNotice } from '../TmdbNotice';

interface RecommendedViewProps {
  user: UserProfile | null;
  genresMap: Map<number, string>;
  data: RecommendationsResponse | null;
  loading: boolean;
  tmdbMissing: boolean;
  error: string | null;
  watchlistIds: Set<number>;
  ratingsMap: Map<number, number>;
  onRefresh: () => void;
  onSelectMovie: (movieId: number) => void;
  onToggleWatchlist: (movieId: number) => void;
  onOpenAuth: () => void;
}

export function RecommendedView({
  user,
  genresMap,
  data,
  loading,
  tmdbMissing,
  error,
  watchlistIds,
  ratingsMap,
  onRefresh,
  onSelectMovie,
  onToggleWatchlist,
  onOpenAuth,
}: RecommendedViewProps) {
  const list = data?.recommendations || [];

  return (
    <div className="space-y-6">
      {/* Hybrid Engine Summary */}
      <section className="rounded-2xl bg-[#272828] border border-white/[0.08] p-5 sm:p-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-[#B7FF4C]" />
            <h2 className="font-display text-xl font-bold text-white">
              Top 10 Recommended Movies
            </h2>
          </div>
          <p className="text-sm text-[#B4B8B8]">
            {data?.mode === 'hybrid'
              ? 'Active Formula: 0.50 × Collaborative Filtering + 0.30 × TF-IDF Content Similarity + 0.20 × Popularity'
              : data?.mode === 'content-popularity'
                ? 'Active Formula: 0.50 × Collaborative (awaiting peer overlap) + 0.30 × TF-IDF Content + 0.20 × Popularity'
                : 'Popularity-based recommendations filtered by your selected favorite genres.'}
          </p>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          {!user && (
            <button
              type="button"
              onClick={onOpenAuth}
              className="px-4 py-2.5 rounded-xl bg-[#B7FF4C] text-[#0F1010] text-xs font-semibold hover:bg-[#c8ff75] transition-colors whitespace-nowrap"
            >
              Sign In for Personalization
            </button>
          )}
          <button
            type="button"
            disabled={loading}
            onClick={onRefresh}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#141515] border border-white/15 text-xs font-medium text-white hover:border-[#B7FF4C] disabled:opacity-50 transition-colors whitespace-nowrap"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Recalculate</span>
          </button>
        </div>
      </section>

      {tmdbMissing && <TmdbNotice message={error} />}

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {Array.from({ length: 6 }).map((_, idx) => (
            <div key={idx} className="h-44 rounded-xl bg-[#272828] animate-pulse" />
          ))}
        </div>
      ) : list.length > 0 ? (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-4">
            {list.map((movie) => (
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

          {/* Score Breakdown Table */}
          <section className="rounded-2xl bg-[#272828] border border-white/[0.08] overflow-hidden">
            <div className="px-5 py-4 border-b border-white/[0.08]">
              <h3 className="font-display text-base font-semibold text-white">
                Hybrid Scoring Breakdown
              </h3>
              <p className="text-xs text-[#B4B8B8] mt-0.5">
                Normalized component weights per recommended title
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-white/[0.08] text-xs text-[#808585]">
                    <th className="py-3 px-4 font-medium">Rank & Title</th>
                    <th className="py-3 px-4 font-medium text-right">Collaborative (50%)</th>
                    <th className="py-3 px-4 font-medium text-right">Content TF-IDF (30%)</th>
                    <th className="py-3 px-4 font-medium text-right">Popularity (20%)</th>
                    <th className="py-3 px-4 font-medium text-right">Final Score</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.06] text-sm">
                  {list.map((movie, idx) => (
                    <tr
                      key={movie.id}
                      onClick={() => onSelectMovie(movie.id)}
                      className="hover:bg-[#1E1F1F] cursor-pointer transition-colors"
                    >
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-3">
                          <span className="font-mono text-xs text-[#808585] tabular-nums w-5">
                            {String(idx + 1).padStart(2, '0')}
                          </span>
                          <span className="font-medium text-white truncate max-w-xs">
                            {movie.title}
                          </span>
                        </div>
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-xs text-[#B4B8B8] tabular-nums">
                        {movie.collaborativeScore.toFixed(3)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-xs text-[#B4B8B8] tabular-nums">
                        {movie.contentScore.toFixed(3)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-xs text-[#B4B8B8] tabular-nums">
                        {movie.popularityScore.toFixed(3)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-xs font-semibold text-[#B7FF4C] tabular-nums">
                        {(movie.finalScore * 100).toFixed(1)}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      ) : !tmdbMissing ? (
        <div className="rounded-2xl bg-[#272828] border border-white/[0.08] p-12 text-center space-y-2">
          <p className="font-display text-lg font-semibold text-white">No recommendations generated yet</p>
          <p className="text-sm text-[#B4B8B8]">
            Rate movies or pick favorite genres to receive personalized recommendations.
          </p>
        </div>
      ) : null}
    </div>
  );
}
