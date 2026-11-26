import { useEffect, useState } from 'react';
import {
  Bookmark,
  Check,
  ExternalLink,
  Film,
  Globe,
  Play,
  Star,
  Tv,
  X,
} from 'lucide-react';
import { api, ApiError } from '../api';
import {
  WATCH_REGIONS,
  type MovieDetail,
  type WatchProviderItem,
  type WatchProvidersResponse,
} from '../types';
import { PosterImage } from './PosterImage';

interface MovieDetailModalProps {
  movieId: number | null;
  defaultRegion: string;
  initialFocusProviders?: boolean;
  isSignedIn: boolean;
  inWatchlist: boolean;
  userRating?: number;
  onClose: () => void;
  onSelectMovie: (movieId: number) => void;
  onToggleWatchlist: (movieId: number) => Promise<void>;
  onRateMovie: (movieId: number, score: number) => Promise<void>;
  onRequireAuth: () => void;
}

function ProviderGroup({
  title,
  items,
}: {
  title: string;
  items?: WatchProviderItem[];
}) {
  if (!items || items.length === 0) return null;
  return (
    <div>
      <p className="text-xs font-medium text-[#B4B8B8] mb-2">{title}</p>
      <div className="flex flex-wrap gap-2.5">
        {items.map((p) => (
          <div
            key={p.provider_id}
            className="flex items-center gap-2 rounded-xl bg-[#181919] border border-white/10 px-3 py-2"
          >
            {p.logo_path && (
              <img
                src={`https://image.tmdb.org/t/p/original${p.logo_path}`}
                alt={p.provider_name}
                referrerPolicy="no-referrer"
                className="w-6 h-6 rounded-md object-cover shrink-0"
              />
            )}
            <span className="text-xs font-medium text-white whitespace-nowrap">
              {p.provider_name}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function MovieDetailModal({
  movieId,
  defaultRegion,
  initialFocusProviders = false,
  isSignedIn,
  inWatchlist,
  userRating,
  onClose,
  onSelectMovie,
  onToggleWatchlist,
  onRateMovie,
  onRequireAuth,
}: MovieDetailModalProps) {
  const [movie, setMovie] = useState<MovieDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [showProviders, setShowProviders] = useState(initialFocusProviders);
  const [showTrailer, setShowTrailer] = useState(false);
  const [showFullMovie, setShowFullMovie] = useState(false);
  const [region, setRegion] = useState(defaultRegion || 'PH');
  const [providersData, setProvidersData] = useState<WatchProvidersResponse | null>(null);
  const [providersLoading, setProvidersLoading] = useState(false);

  const [hoverRating, setHoverRating] = useState<number | null>(null);
  const [ratingBusy, setRatingBusy] = useState(false);
  const [watchlistBusy, setWatchlistBusy] = useState(false);

  useEffect(() => {
    setRegion(defaultRegion || 'PH');
  }, [defaultRegion]);

  useEffect(() => {
    setShowProviders(initialFocusProviders);
    setShowTrailer(false);
    setShowFullMovie(false);
  }, [initialFocusProviders, movieId]);

  useEffect(() => {
    if (!movieId) {
      setMovie(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    setProvidersData(null);

    api
      .getMovieDetail(movieId)
      .then((detail) => {
        if (!cancelled) setMovie(detail);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof ApiError ? err.message : 'Unable to load movie details.');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [movieId]);

  useEffect(() => {
    if (!movieId || !showProviders) return;
    let cancelled = false;
    setProvidersLoading(true);

    api
      .getWatchProviders(movieId, region)
      .then((res) => {
        if (!cancelled) setProvidersData(res);
      })
      .catch(() => {
        if (!cancelled) setProvidersData(null);
      })
      .finally(() => {
        if (!cancelled) setProvidersLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [movieId, region, showProviders]);

  if (!movieId) return null;

  const directors = movie?.credits?.crew.filter((c) => c.job === 'Director') || [];
  const topCast = movie?.credits?.cast.slice(0, 8) || [];
  const similarMovies = movie?.similar?.results.slice(0, 6) || [];
  const year = movie?.release_date ? movie.release_date.slice(0, 4) : 'TBA';
  const officialTrailer =
    movie?.videos?.results?.find(
      (v) => v.site === 'YouTube' && v.type === 'Trailer' && v.official
    ) ||
    movie?.videos?.results?.find((v) => v.site === 'YouTube' && v.type === 'Trailer') ||
    movie?.videos?.results?.find((v) => v.site === 'YouTube');

  const regionName =
    WATCH_REGIONS.find((r) => r.code === region)?.name || region;

  const providers = providersData?.providers;
  const subscriptionItems = [
    ...(providers?.flatrate || []),
    ...(providers?.free || []),
    ...(providers?.ads || []),
  ];
  const hasAnyProvider =
    subscriptionItems.length > 0 ||
    (providers?.rent && providers.rent.length > 0) ||
    (providers?.buy && providers.buy.length > 0);

  const handleStarClick = async (score: number) => {
    if (!isSignedIn) {
      onRequireAuth();
      return;
    }
    setRatingBusy(true);
    try {
      await onRateMovie(movieId, score);
    } finally {
      setRatingBusy(false);
    }
  };

  const handleWatchlistClick = async () => {
    if (!isSignedIn) {
      onRequireAuth();
      return;
    }
    setWatchlistBusy(true);
    try {
      await onToggleWatchlist(movieId);
    } finally {
      setWatchlistBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/85 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-label={movie ? `${movie.title} details` : 'Movie details'}
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-4xl max-h-[92vh] overflow-y-auto rounded-2xl bg-[#161717] border border-white/10 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close movie details"
          className="sticky top-4 float-right mr-4 mt-4 z-20 p-2 rounded-xl bg-[#0F1010]/85 border border-white/15 text-white hover:border-[#B7FF4C] transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        {loading && (
          <div className="p-8 space-y-6">
            <div className="h-56 rounded-xl bg-[#272828] animate-pulse" />
            <div className="h-8 w-2/3 rounded-lg bg-[#272828] animate-pulse" />
            <div className="h-24 rounded-lg bg-[#272828] animate-pulse" />
          </div>
        )}

        {error && !loading && (
          <div className="p-10 text-center space-y-4">
            <p className="text-red-300 text-sm">{error}</p>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-[#272828] text-white text-sm font-medium"
            >
              Close
            </button>
          </div>
        )}

        {movie && !loading && (
          <div>
            {/* Backdrop Banner */}
            <div className="relative h-56 sm:h-72 w-full overflow-hidden bg-[#0F1010]">
              {movie.backdrop_path ? (
                <img
                  src={
                    movie.backdrop_path.startsWith('http://') ||
                    movie.backdrop_path.startsWith('https://')
                      ? movie.backdrop_path
                      : `https://image.tmdb.org/t/p/w1280${movie.backdrop_path}`
                  }
                  alt={`${movie.title} backdrop`}
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover opacity-75"
                />
              ) : (
                <div className="w-full h-full bg-gradient-to-br from-[#272828] to-[#0F1010]" />
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-[#161717] via-[#161717]/60 to-transparent" />
            </div>

            <div className="px-5 sm:px-8 pb-8 -mt-24 relative z-10 space-y-8">
              {/* Primary Split Info */}
              <div className="flex flex-col sm:flex-row gap-6 items-start">
                <div className="w-36 sm:w-44 shrink-0 rounded-xl overflow-hidden border border-white/15 shadow-xl aspect-[2/3] bg-[#272828]">
                  <PosterImage
                    posterPath={movie.poster_path}
                    title={movie.title}
                    releaseYear={year}
                    className="w-full h-full"
                  />
                </div>

                <div className="flex-1 min-w-0 pt-2 sm:pt-10 space-y-4">
                  <div>
                    <h2 className="font-display text-2xl sm:text-3xl font-bold text-white leading-tight">
                      {movie.title}
                    </h2>
                    {movie.tagline && (
                      <p className="mt-1 text-sm italic text-[#B4B8B8]">{movie.tagline}</p>
                    )}

                    <div className="mt-3 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-sm text-[#B4B8B8] tabular-nums">
                      <span>{movie.release_date || 'Release TBA'}</span>
                      {movie.runtime ? (
                        <>
                          <span aria-hidden="true">·</span>
                          <span>{movie.runtime} min</span>
                        </>
                      ) : null}
                      <span aria-hidden="true">·</span>
                      <span className="inline-flex items-center gap-1 text-white font-semibold">
                        <Star className="w-4 h-4 text-[#B7FF4C] fill-[#B7FF4C]" />
                        {movie.vote_average ? movie.vote_average.toFixed(1) : 'NR'} / 10
                      </span>
                      {movie.genres && movie.genres.length > 0 && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="text-[#B4B8B8]">
                            {movie.genres.map((g) => g.name).join(', ')}
                          </span>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Primary Action Row */}
                  <div className="flex flex-wrap items-center gap-3">
                    {movie.stream_url ? (
                      <button
                        type="button"
                        onClick={() => {
                          setShowFullMovie((prev) => !prev);
                          setShowTrailer(false);
                        }}
                        className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#B7FF4C] text-[#0F1010] text-sm font-semibold hover:bg-[#c8ff75] transition-colors whitespace-nowrap"
                      >
                        <Play className="w-4 h-4 fill-current" />
                        <span>{showFullMovie ? 'Hide Movie Player' : 'Watch Full Movie'}</span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setShowProviders((prev) => !prev)}
                        className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#B7FF4C] text-[#0F1010] text-sm font-semibold hover:bg-[#c8ff75] transition-colors whitespace-nowrap"
                      >
                        <Play className="w-4 h-4 fill-current" />
                        <span>Where to Watch</span>
                      </button>
                    )}

                    {movie.stream_url && (
                      <button
                        type="button"
                        onClick={() => setShowProviders((prev) => !prev)}
                        className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#272828] border border-white/15 text-sm font-medium text-white hover:border-white/35 transition-colors whitespace-nowrap"
                      >
                        <Tv className="w-4 h-4" />
                        <span>Where to Watch</span>
                      </button>
                    )}

                    {(officialTrailer || movie.trailer_url) && (
                      <button
                        type="button"
                        onClick={() => {
                          setShowTrailer((prev) => !prev);
                          setShowFullMovie(false);
                        }}
                        className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium border transition-colors whitespace-nowrap ${
                          showTrailer
                            ? 'bg-[#272828] border-[#B7FF4C] text-[#B7FF4C]'
                            : 'bg-[#272828] border-white/15 text-white hover:border-white/35'
                        }`}
                      >
                        <Film className="w-4 h-4" />
                        <span>{showTrailer ? 'Hide Trailer' : 'Watch Trailer'}</span>
                      </button>
                    )}

                    <button
                      type="button"
                      disabled={watchlistBusy}
                      onClick={handleWatchlistClick}
                      className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium border transition-colors whitespace-nowrap ${
                        inWatchlist
                          ? 'bg-[#272828] border-[#B7FF4C] text-[#B7FF4C]'
                          : 'bg-[#272828] border-white/15 text-white hover:border-white/35'
                      }`}
                    >
                      {inWatchlist ? (
                        <>
                          <Check className="w-4 h-4" />
                          <span>In Watchlist</span>
                        </>
                      ) : (
                        <>
                          <Bookmark className="w-4 h-4" />
                          <span>Add to Watchlist</span>
                        </>
                      )}
                    </button>
                  </div>

                  {/* Interactive Rating Control */}
                  <div className="flex flex-wrap items-center gap-3 pt-1">
                    <span className="text-xs font-medium text-[#B4B8B8]">Rate this movie:</span>
                    <div className="flex items-center gap-1" role="group" aria-label="Rate movie from 1 to 5 stars">
                      {[1, 2, 3, 4, 5].map((star) => {
                        const active = (hoverRating ?? userRating ?? 0) >= star;
                        return (
                          <button
                            key={star}
                            type="button"
                            disabled={ratingBusy}
                            onMouseEnter={() => setHoverRating(star)}
                            onMouseLeave={() => setHoverRating(null)}
                            onClick={() => handleStarClick(star)}
                            aria-label={`Rate ${star} out of 5 stars`}
                            className="p-1 rounded-md hover:bg-[#272828] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#B7FF4C]"
                          >
                            <Star
                              className={`w-5 h-5 transition-colors ${
                                active
                                  ? 'text-[#B7FF4C] fill-[#B7FF4C]'
                                  : 'text-[#808585]'
                              }`}
                            />
                          </button>
                        );
                      })}
                    </div>
                    {typeof userRating === 'number' && (
                      <span className="text-xs font-mono text-[#B7FF4C] tabular-nums">
                        Your rating: {userRating}/5
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Full Public Domain Movie Player */}
              {showFullMovie && movie.stream_url && (
                <section className="rounded-xl bg-[#272828] border border-white/10 p-5 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h3 className="font-display text-base font-semibold text-white">
                        {movie.title} — Free Public Domain Stream
                      </h3>
                      <p className="text-xs text-[#B4B8B8]">
                        Streamed directly from Internet Archive public domain collection
                      </p>
                    </div>
                    {movie.external_watch_url && (
                      <a
                        href={movie.external_watch_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 text-xs font-medium text-[#B7FF4C] hover:underline whitespace-nowrap"
                      >
                        <span>Open on Internet Archive</span>
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    )}
                  </div>
                  <div className="aspect-video w-full overflow-hidden rounded-xl bg-black border border-white/10">
                    <video
                      key={movie.stream_url}
                      src={movie.stream_url}
                      controls
                      autoPlay
                      playsInline
                      className="w-full h-full"
                    >
                      Your browser does not support embedded video playback.
                    </video>
                  </div>
                </section>
              )}

              {/* Official Trailer Drawer */}
              {showTrailer && (officialTrailer || movie.trailer_url) && (
                <section className="rounded-xl bg-[#272828] border border-white/10 p-5 space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="font-display text-base font-semibold text-white">
                      {officialTrailer?.name || `${movie.title} — Trailer Preview`}
                    </h3>
                    {officialTrailer ? (
                      <a
                        href={`https://www.youtube.com/watch?v=${officialTrailer.key}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 text-xs font-medium text-[#B7FF4C] hover:underline whitespace-nowrap"
                      >
                        <span>Open on YouTube</span>
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    ) : movie.external_watch_url ? (
                      <a
                        href={movie.external_watch_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 text-xs font-medium text-[#B7FF4C] hover:underline whitespace-nowrap"
                      >
                        <span>Open on Apple TV</span>
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    ) : null}
                  </div>
                  <div className="aspect-video w-full overflow-hidden rounded-xl bg-[#0F1010] border border-white/10">
                    {officialTrailer ? (
                      <iframe
                        title={officialTrailer.name || `${movie.title} Trailer`}
                        src={`https://www.youtube-nocookie.com/embed/${officialTrailer.key}`}
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                        allowFullScreen
                        className="w-full h-full border-0"
                      />
                    ) : movie.trailer_url ? (
                      <video
                        key={movie.trailer_url}
                        src={movie.trailer_url}
                        controls
                        autoPlay
                        playsInline
                        className="w-full h-full"
                      />
                    ) : null}
                  </div>
                </section>
              )}

              {/* Where to Watch Drawer */}
              {showProviders && (
                <section className="rounded-xl bg-[#272828] border border-white/10 p-5 space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <Tv className="w-4 h-4 text-[#B7FF4C]" />
                      <h3 className="font-display text-base font-semibold text-white">
                        Where to Watch
                      </h3>
                    </div>

                    <div className="flex items-center gap-2">
                      <Globe className="w-4 h-4 text-[#B4B8B8]" />
                      <label htmlFor="watch-region-select" className="sr-only">
                        Select country
                      </label>
                      <select
                        id="watch-region-select"
                        value={region}
                        onChange={(e) => setRegion(e.target.value)}
                        className="rounded-lg bg-[#141515] border border-white/15 px-3 py-1.5 text-xs text-white focus:outline-none focus:border-[#B7FF4C]"
                      >
                        {WATCH_REGIONS.map((r) => (
                          <option key={r.code} value={r.code}>
                            {r.name} ({r.code})
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {providersLoading ? (
                    <div className="h-16 rounded-lg bg-[#181919] animate-pulse" />
                  ) : hasAnyProvider ? (
                    <div className="space-y-4">
                      <ProviderGroup title="Stream (Subscription / Free)" items={subscriptionItems} />
                      <ProviderGroup title="Rent" items={providers?.rent} />
                      <ProviderGroup title="Buy" items={providers?.buy} />

                      {providers?.link && (
                        <div className="pt-2 border-t border-white/[0.08] flex flex-wrap items-center justify-between gap-3">
                          <span className="text-xs text-[#808585]">
                            Streaming availability data powered by JustWatch via TMDB.
                          </span>
                          <a
                            href={providers.link}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#B7FF4C] text-[#0F1010] text-xs font-semibold hover:bg-[#c8ff75] transition-colors whitespace-nowrap"
                          >
                            <span>Open Official Viewing Links</span>
                            <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="rounded-lg bg-[#181919] border border-white/[0.06] p-4 flex flex-wrap items-center justify-between gap-3">
                      <p className="text-sm text-[#B4B8B8]">
                        Streaming, rental, or purchase availability could not be found for {regionName}. Try changing the region above.
                      </p>
                      <a
                        href={`https://www.themoviedb.org/movie/${movie.id}/watch?locale=${region}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 text-xs font-medium text-[#B7FF4C] hover:underline whitespace-nowrap"
                      >
                        <span>Check TMDB Watch Page</span>
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    </div>
                  )}
                </section>
              )}

              {/* Synopsis & Director */}
              <section className="space-y-3">
                <h3 className="font-display text-base font-semibold text-white">Synopsis</h3>
                <p className="text-sm leading-relaxed text-[#C4C8C8]">
                  {movie.overview || 'No synopsis is available for this title.'}
                </p>
                {directors.length > 0 && (
                  <p className="text-xs text-[#B4B8B8]">
                    Directed by{' '}
                    <span className="text-white font-medium">
                      {directors.map((d) => d.name).join(', ')}
                    </span>
                  </p>
                )}
              </section>

              {/* Cast */}
              {topCast.length > 0 && (
                <section className="space-y-3">
                  <h3 className="font-display text-base font-semibold text-white">Top Cast</h3>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {topCast.map((member) => (
                      <div
                        key={member.id}
                        className="flex items-center gap-3 rounded-xl bg-[#272828] border border-white/[0.06] p-2.5"
                      >
                        {member.profile_path ? (
                          <img
                            src={`https://image.tmdb.org/t/p/w185${member.profile_path}`}
                            alt={member.name}
                            referrerPolicy="no-referrer"
                            className="w-10 h-10 rounded-lg object-cover shrink-0 bg-[#141515]"
                          />
                        ) : (
                          <div className="w-10 h-10 rounded-lg bg-[#141515] border border-white/10 flex items-center justify-center text-xs font-semibold text-[#B4B8B8] shrink-0">
                            {member.name
                              .split(' ')
                              .map((p) => p[0])
                              .slice(0, 2)
                              .join('')}
                          </div>
                        )}
                        <div className="min-w-0">
                          <p className="text-xs font-medium text-white truncate">{member.name}</p>
                          <p className="text-[11px] text-[#808585] truncate">{member.character}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* Similar Movies */}
              {similarMovies.length > 0 && (
                <section className="space-y-3">
                  <h3 className="font-display text-base font-semibold text-white">
                    Similar Movies
                  </h3>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
                    {similarMovies.map((sim) => (
                      <button
                        key={sim.id}
                        type="button"
                        onClick={() => onSelectMovie(sim.id)}
                        className="group text-left rounded-xl bg-[#272828] border border-white/[0.07] hover:border-[#B7FF4C]/50 overflow-hidden transition-colors"
                      >
                        <div className="aspect-[2/3] w-full overflow-hidden">
                          <PosterImage
                            posterPath={sim.poster_path}
                            title={sim.title}
                            releaseYear={sim.release_date?.slice(0, 4)}
                            className="w-full h-full group-hover:scale-[1.03] transition-transform"
                          />
                        </div>
                        <p className="p-2 text-xs font-medium text-white line-clamp-1">
                          {sim.title}
                        </p>
                      </button>
                    ))}
                  </div>
                </section>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
