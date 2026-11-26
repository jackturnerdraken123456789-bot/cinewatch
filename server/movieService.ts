import {
  FALLBACK_GENRES,
  getFallbackDiscover,
  getFallbackMovieDetail,
  getFallbackPopular,
  getFallbackSearch,
  getFallbackWatchProviders,
  isArchiveMovieId,
  isItunesMovieId,
  searchArchivePublicDomainMovies,
  type ExtendedMovieDetail,
  type ExtendedMovieSummary,
} from './fallbackCatalog.ts';
import {
  discoverMovies as tmdbDiscover,
  getMovieDetails as tmdbGetMovieDetails,
  getMovieGenres as tmdbGetMovieGenres,
  getPopularMovies as tmdbGetPopular,
  getSimilarMovies as tmdbGetSimilar,
  getTrendingMovies as tmdbGetTrending,
  getWatchProviders as tmdbGetWatchProviders,
  isTmdbConfigured,
  searchMovies as tmdbSearch,
  TmdbApiError,
  TmdbConfigError,
  type TmdbGenre,
  type TmdbPaginatedResponse,
  type TmdbWatchProvidersResponse,
} from './tmdb.ts';

let tmdbStatusCache: { checkedAt: number; active: boolean; reason: string | null } = {
  checkedAt: 0,
  active: isTmdbConfigured(),
  reason: null,
};

function isTmdbUnavailableError(err: unknown): boolean {
  if (err instanceof TmdbConfigError) return true;
  if (err instanceof TmdbApiError && (err.status === 401 || err.status === 403)) return true;
  return false;
}

function markTmdbDown(err: unknown) {
  tmdbStatusCache = {
    checkedAt: Date.now(),
    active: false,
    reason: err instanceof Error ? err.message : 'TMDB unavailable',
  };
}

function markTmdbUp() {
  tmdbStatusCache = {
    checkedAt: Date.now(),
    active: true,
    reason: null,
  };
}

export function getCatalogMode(): {
  tmdbConfigured: boolean;
  tmdbActive: boolean;
  fallbackReason: string | null;
} {
  return {
    tmdbConfigured: isTmdbConfigured(),
    tmdbActive: tmdbStatusCache.active,
    fallbackReason: tmdbStatusCache.reason,
  };
}

export async function getMovieGenresUnified(): Promise<TmdbGenre[]> {
  try {
    const genres = await tmdbGetMovieGenres();
    markTmdbUp();
    return genres;
  } catch (err) {
    if (isTmdbUnavailableError(err)) {
      markTmdbDown(err);
      return FALLBACK_GENRES;
    }
    throw err;
  }
}

export async function getPopularMoviesUnified(
  page = 1
): Promise<TmdbPaginatedResponse<ExtendedMovieSummary> & { catalogSource: 'tmdb' | 'fallback' }> {
  try {
    const res = await tmdbGetPopular(page);
    markTmdbUp();
    return { ...res, catalogSource: 'tmdb' };
  } catch (err) {
    if (isTmdbUnavailableError(err)) {
      markTmdbDown(err);
      const fb = await getFallbackPopular(page);
      return { ...fb, catalogSource: 'fallback' };
    }
    throw err;
  }
}

export async function getTrendingMoviesUnified(
  page = 1
): Promise<TmdbPaginatedResponse<ExtendedMovieSummary> & { catalogSource: 'tmdb' | 'fallback' }> {
  try {
    const res = await tmdbGetTrending(page);
    markTmdbUp();
    return { ...res, catalogSource: 'tmdb' };
  } catch (err) {
    if (isTmdbUnavailableError(err)) {
      markTmdbDown(err);
      const fb = await getFallbackPopular(page);
      return { ...fb, catalogSource: 'fallback' };
    }
    throw err;
  }
}

export async function searchMoviesUnified(
  query: string,
  page = 1,
  year?: number
): Promise<TmdbPaginatedResponse<ExtendedMovieSummary> & { catalogSource: 'tmdb' | 'fallback' }> {
  try {
    const res = await tmdbSearch(query, page, year);
    markTmdbUp();
    return { ...res, catalogSource: 'tmdb' };
  } catch (err) {
    if (isTmdbUnavailableError(err)) {
      markTmdbDown(err);
      const fb = await getFallbackSearch(query, page, year);
      return { ...fb, catalogSource: 'fallback' };
    }
    throw err;
  }
}

export async function discoverMoviesUnified(opts: {
  page?: number;
  genre?: string;
  year?: number;
  minRating?: number;
  sortBy?: string;
}): Promise<TmdbPaginatedResponse<ExtendedMovieSummary> & { catalogSource: 'tmdb' | 'fallback' }> {
  try {
    const res = await tmdbDiscover(opts);
    markTmdbUp();
    return { ...res, catalogSource: 'tmdb' };
  } catch (err) {
    if (isTmdbUnavailableError(err)) {
      markTmdbDown(err);
      const fb = await getFallbackDiscover(opts);
      return { ...fb, catalogSource: 'fallback' };
    }
    throw err;
  }
}

export async function getPublicDomainMoviesUnified(opts: {
  query?: string;
  genreId?: number;
  year?: number;
  page?: number;
}): Promise<TmdbPaginatedResponse<ExtendedMovieSummary>> {
  return searchArchivePublicDomainMovies({
    query: opts.query,
    genreId: opts.genreId,
    year: opts.year,
    page: opts.page || 1,
    rows: 20,
  });
}

export async function getMovieDetailsUnified(movieId: number): Promise<ExtendedMovieDetail> {
  if (isItunesMovieId(movieId) || isArchiveMovieId(movieId)) {
    const fb = await getFallbackMovieDetail(movieId);
    if (!fb) {
      throw new TmdbApiError('Movie details could not be found.', 404);
    }
    return fb;
  }

  try {
    const detail = await tmdbGetMovieDetails(movieId);
    markTmdbUp();
    return { ...detail, source: 'tmdb', is_full_movie_playable: false };
  } catch (err) {
    if (isTmdbUnavailableError(err)) {
      markTmdbDown(err);
      const fb = await getFallbackMovieDetail(movieId);
      if (fb) return fb;
    }
    throw err;
  }
}

export async function getSimilarMoviesUnified(
  movieId: number
): Promise<TmdbPaginatedResponse<ExtendedMovieSummary>> {
  if (isItunesMovieId(movieId) || isArchiveMovieId(movieId)) {
    const detail = await getFallbackMovieDetail(movieId);
    const primaryGenre = detail?.genres?.[0]?.id;
    return getFallbackDiscover({
      genre: primaryGenre ? String(primaryGenre) : undefined,
      page: 1,
    });
  }

  try {
    return await tmdbGetSimilar(movieId);
  } catch (err) {
    if (isTmdbUnavailableError(err)) {
      markTmdbDown(err);
      return getFallbackPopular(1);
    }
    throw err;
  }
}

export async function getWatchProvidersUnified(
  movieId: number
): Promise<TmdbWatchProvidersResponse> {
  if (isItunesMovieId(movieId) || isArchiveMovieId(movieId)) {
    return getFallbackWatchProviders(movieId, 'PH');
  }

  try {
    return await tmdbGetWatchProviders(movieId);
  } catch (err) {
    if (isTmdbUnavailableError(err)) {
      markTmdbDown(err);
      return getFallbackWatchProviders(movieId, 'PH');
    }
    throw err;
  }
}
