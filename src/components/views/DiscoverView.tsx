import { useEffect, useState } from 'react';
import { Film, RotateCcw, Search } from 'lucide-react';
import { api, ApiError } from '../../api';
import type { Genre, MovieSummary } from '../../types';
import { MovieCard } from '../MovieCard';
import { TmdbNotice } from '../TmdbNotice';

interface DiscoverViewProps {
  genres: Genre[];
  genresMap: Map<number, string>;
  watchlistIds: Set<number>;
  ratingsMap: Map<number, number>;
  initialMode?: 'all' | 'public-domain';
  onSelectMovie: (movieId: number) => void;
  onToggleWatchlist: (movieId: number) => void;
}

const YEARS = Array.from({ length: 45 }, (_, idx) => 2026 - idx);

export function DiscoverView({
  genres,
  genresMap,
  watchlistIds,
  ratingsMap,
  initialMode = 'all',
  onSelectMovie,
  onToggleWatchlist,
}: DiscoverViewProps) {
  const [catalogMode, setCatalogMode] = useState<'all' | 'public-domain'>(initialMode);
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [selectedGenre, setSelectedGenre] = useState('');
  const [selectedYear, setSelectedYear] = useState('');
  const [minRating, setMinRating] = useState('');
  const [sortBy, setSortBy] = useState('popularity.desc');

  const [movies, setMovies] = useState<MovieSummary[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalResults, setTotalResults] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [usingFallback, setUsingFallback] = useState(false);

  useEffect(() => {
    setCatalogMode(initialMode);
  }, [initialMode]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(query.trim());
    }, 320);
    return () => clearTimeout(timer);
  }, [query]);

  const fetchMovies = async (targetPage: number, append: boolean) => {
    if (append) {
      setLoadingMore(true);
    } else {
      setLoading(true);
    }
    setError(null);

    try {
      const res =
        catalogMode === 'public-domain'
          ? await api.getPublicDomainMovies({
              page: targetPage,
              q: debouncedQuery || undefined,
              genre: selectedGenre || undefined,
              year: selectedYear ? Number(selectedYear) : undefined,
            })
          : debouncedQuery
            ? await api.searchMovies(
                debouncedQuery,
                targetPage,
                selectedYear ? Number(selectedYear) : undefined
              )
            : await api.discoverMovies({
                page: targetPage,
                genre: selectedGenre || undefined,
                year: selectedYear ? Number(selectedYear) : undefined,
                minRating: minRating ? Number(minRating) : undefined,
                sortBy,
              });

      setUsingFallback(res.catalogSource === 'fallback');
      setTotalPages(res.total_pages || 1);
      setTotalResults(res.total_results || 0);
      setPage(targetPage);
      setMovies((prev) => {
        if (!append) return res.results || [];
        const existing = new Set(prev.map((m) => m.id));
        const next = (res.results || []).filter((m) => !existing.has(m.id));
        return [...prev, ...next];
      });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to fetch movies.');
      if (!append) setMovies([]);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  useEffect(() => {
    fetchMovies(1, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [catalogMode, debouncedQuery, selectedGenre, selectedYear, minRating, sortBy]);

  const hasFilters = Boolean(query || selectedGenre || selectedYear || minRating || sortBy !== 'popularity.desc');

  const resetFilters = () => {
    setQuery('');
    setDebouncedQuery('');
    setSelectedGenre('');
    setSelectedYear('');
    setMinRating('');
    setSortBy('popularity.desc');
  };

  return (
    <div className="space-y-6">
      {/* Catalog Mode Switch + Search & Filter Toolbar */}
      <section className="rounded-2xl bg-[#272828] border border-white/[0.08] p-4 sm:p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="inline-flex items-center gap-1 p-1 rounded-xl bg-[#141515] border border-white/[0.08]">
            <button
              type="button"
              onClick={() => setCatalogMode('all')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
                catalogMode === 'all'
                  ? 'bg-[#B7FF4C] text-[#0F1010] font-semibold'
                  : 'text-[#B4B8B8] hover:text-white'
              }`}
            >
              All Movies
            </button>
            <button
              type="button"
              onClick={() => setCatalogMode('public-domain')}
              className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
                catalogMode === 'public-domain'
                  ? 'bg-[#B7FF4C] text-[#0F1010] font-semibold'
                  : 'text-[#B4B8B8] hover:text-white'
              }`}
            >
              <Film className="w-3.5 h-3.5" />
              <span>Free Full Movies (Watch Now)</span>
            </button>
          </div>

          {hasFilters && (
            <button
              type="button"
              onClick={resetFilters}
              className="inline-flex items-center justify-center gap-2 px-3.5 py-2 rounded-xl bg-[#141515] border border-white/10 text-xs font-medium text-[#B4B8B8] hover:text-white transition-colors whitespace-nowrap"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset Filters</span>
            </button>
          )}
        </div>

        <div className="relative">
          <Search className="w-4 h-4 text-[#808585] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={
              catalogMode === 'public-domain'
                ? 'Search free full-length public domain movies...'
                : 'Search movie titles...'
            }
            aria-label="Search movies"
            className="w-full rounded-xl bg-[#141515] border border-white/10 pl-10 pr-4 py-2.5 text-sm text-white placeholder-[#808585] focus:outline-none focus:border-[#B7FF4C]"
          />
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div>
            <label htmlFor="filter-genre" className="block text-[11px] font-medium text-[#808585] mb-1">
              Genre
            </label>
            <select
              id="filter-genre"
              value={selectedGenre}
              disabled={Boolean(debouncedQuery) && catalogMode === 'all'}
              onChange={(e) => setSelectedGenre(e.target.value)}
              className="w-full rounded-xl bg-[#141515] border border-white/10 px-3 py-2 text-xs text-white focus:outline-none focus:border-[#B7FF4C] disabled:opacity-50"
            >
              <option value="">All Genres</option>
              {genres.map((g) => (
                <option key={g.id} value={String(g.id)}>
                  {g.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="filter-year" className="block text-[11px] font-medium text-[#808585] mb-1">
              Release Year
            </label>
            <select
              id="filter-year"
              value={selectedYear}
              onChange={(e) => setSelectedYear(e.target.value)}
              className="w-full rounded-xl bg-[#141515] border border-white/10 px-3 py-2 text-xs text-white focus:outline-none focus:border-[#B7FF4C]"
            >
              <option value="">Any Year</option>
              {YEARS.map((y) => (
                <option key={y} value={String(y)}>
                  {y}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="filter-rating" className="block text-[11px] font-medium text-[#808585] mb-1">
              Minimum Rating
            </label>
            <select
              id="filter-rating"
              value={minRating}
              disabled={Boolean(debouncedQuery) || catalogMode === 'public-domain'}
              onChange={(e) => setMinRating(e.target.value)}
              className="w-full rounded-xl bg-[#141515] border border-white/10 px-3 py-2 text-xs text-white focus:outline-none focus:border-[#B7FF4C] disabled:opacity-50"
            >
              <option value="">Any Rating</option>
              <option value="8">8.0+ / 10</option>
              <option value="7">7.0+ / 10</option>
              <option value="6">6.0+ / 10</option>
              <option value="5">5.0+ / 10</option>
            </select>
          </div>

          <div>
            <label htmlFor="filter-sort" className="block text-[11px] font-medium text-[#808585] mb-1">
              Sort By
            </label>
            <select
              id="filter-sort"
              value={sortBy}
              disabled={Boolean(debouncedQuery) || catalogMode === 'public-domain'}
              onChange={(e) => setSortBy(e.target.value)}
              className="w-full rounded-xl bg-[#141515] border border-white/10 px-3 py-2 text-xs text-white focus:outline-none focus:border-[#B7FF4C] disabled:opacity-50"
            >
              <option value="popularity.desc">Most Popular</option>
              <option value="vote_average.desc">Highest Rated</option>
              <option value="primary_release_date.desc">Newest Releases</option>
            </select>
          </div>
        </div>
      </section>

      {usingFallback && catalogMode === 'all' && <TmdbNotice />}

      {error && (
        <div className="rounded-xl bg-red-500/10 border border-red-500/30 p-4 text-sm text-red-200">
          {error}
        </div>
      )}

      {!loading && !error && (
        <div className="flex items-center justify-between text-xs text-[#B4B8B8] tabular-nums">
          <span>
            {catalogMode === 'public-domain'
              ? 'Free Public Domain Full Movies (Internet Archive)'
              : debouncedQuery
                ? `Search results for "${debouncedQuery}"`
                : 'Discovering live movie catalog'}
          </span>
          <span>{totalResults.toLocaleString()} titles found</span>
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-4">
          {Array.from({ length: 15 }).map((_, idx) => (
            <div key={idx} className="aspect-[2/3] rounded-xl bg-[#272828] animate-pulse" />
          ))}
        </div>
      ) : movies.length > 0 ? (
        <>
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

          {page < totalPages && (
            <div className="flex justify-center pt-4">
              <button
                type="button"
                disabled={loadingMore}
                onClick={() => fetchMovies(page + 1, true)}
                className="px-6 py-2.5 rounded-xl bg-[#272828] border border-white/15 text-sm font-semibold text-white hover:border-[#B7FF4C] hover:text-[#B7FF4C] disabled:opacity-50 transition-colors"
              >
                {loadingMore ? 'Loading more movies...' : 'Load More Movies'}
              </button>
            </div>
          )}
        </>
      ) : !error ? (
        <div className="rounded-2xl bg-[#272828] border border-white/[0.08] p-12 text-center space-y-3">
          <p className="font-display text-lg font-semibold text-white">No movies matched your filters</p>
          <p className="text-sm text-[#B4B8B8]">
            Try broadening your search terms, release year, or minimum rating.
          </p>
          {hasFilters && (
            <button
              type="button"
              onClick={resetFilters}
              className="mt-2 px-4 py-2 rounded-xl bg-[#B7FF4C] text-[#0F1010] text-sm font-semibold"
            >
              Clear All Filters
            </button>
          )}
        </div>
      ) : null}
    </div>
  );
}
