const TMDB_BASE_URL = 'https://api.themoviedb.org/3';

export class TmdbConfigError extends Error {
  code = 'TMDB_KEY_MISSING';
  constructor(message = 'TMDB_API_KEY is not configured on the server.') {
    super(message);
    this.name = 'TmdbConfigError';
  }
}

export class TmdbApiError extends Error {
  status: number;
  constructor(message: string, status = 502) {
    super(message);
    this.name = 'TmdbApiError';
    this.status = status;
  }
}

interface CacheEntry {
  expiresAt: number;
  data: unknown;
}

const memoryCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 5 * 60 * 1000;

function normalizeTmdbKey(raw: string | undefined): string {
  let key = (raw || '').trim();
  if ((key.startsWith('"') && key.endsWith('"')) || (key.startsWith("'") && key.endsWith("'"))) {
    key = key.slice(1, -1).trim();
  }
  if (key.toLowerCase().startsWith('bearer ')) {
    key = key.slice(7).trim();
  }
  return key;
}

export function isTmdbConfigured(): boolean {
  const key = normalizeTmdbKey(process.env.TMDB_API_KEY);
  return Boolean(key && key !== 'MY_TMDB_API_KEY');
}

export async function tmdbFetch<T>(
  endpoint: string,
  params: Record<string, string | number | undefined> = {},
  ttlMs = CACHE_TTL_MS
): Promise<T> {
  const apiKey = normalizeTmdbKey(process.env.TMDB_API_KEY);
  if (!apiKey || apiKey === 'MY_TMDB_API_KEY') {
    throw new TmdbConfigError();
  }

  const url = new URL(`${TMDB_BASE_URL}${endpoint}`);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== '') {
      url.searchParams.set(k, String(v));
    }
  }

  const isBearerToken = apiKey.includes('.');
  if (!isBearerToken) {
    url.searchParams.set('api_key', apiKey);
  }

  const cacheKey = url.toString();
  const cached = memoryCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data as T;
  }

  const headers: Record<string, string> = {
    Accept: 'application/json',
  };
  if (isBearerToken) {
    headers.Authorization = `Bearer ${apiKey}`;
  }

  const response = await fetch(url.toString(), { headers });
  if (!response.ok) {
    let errMessage = `TMDB API responded with status ${response.status}`;
    try {
      const errBody = (await response.json()) as { status_message?: string };
      if (errBody?.status_message) {
        errMessage = errBody.status_message;
      }
    } catch {
      // ignore parse failure
    }
    throw new TmdbApiError(errMessage, response.status === 401 ? 401 : 502);
  }

  const data = (await response.json()) as T;
  memoryCache.set(cacheKey, {
    expiresAt: Date.now() + ttlMs,
    data,
  });

  // Prevent unbounded cache growth
  if (memoryCache.size > 600) {
    const firstKey = memoryCache.keys().next().value;
    if (firstKey) memoryCache.delete(firstKey);
  }

  return data;
}

export interface TmdbGenre {
  id: number;
  name: string;
}

export interface TmdbMovieSummary {
  id: number;
  title: string;
  overview: string;
  poster_path: string | null;
  backdrop_path: string | null;
  release_date: string;
  vote_average: number;
  vote_count: number;
  popularity: number;
  genre_ids?: number[];
  genres?: TmdbGenre[];
}

export interface TmdbPaginatedResponse<T> {
  page: number;
  results: T[];
  total_pages: number;
  total_results: number;
}

export interface TmdbCastMember {
  id: number;
  name: string;
  character: string;
  profile_path: string | null;
  order: number;
}

export interface TmdbCrewMember {
  id: number;
  name: string;
  job: string;
  department: string;
  profile_path: string | null;
}

export interface TmdbCreditsResponse {
  id: number;
  cast: TmdbCastMember[];
  crew: TmdbCrewMember[];
}

export interface TmdbKeywordsResponse {
  id: number;
  keywords: { id: number; name: string }[];
}

export interface TmdbVideoItem {
  id: string;
  key: string;
  name: string;
  site: string;
  type: string;
  official: boolean;
}

export interface TmdbMovieDetail extends TmdbMovieSummary {
  runtime: number | null;
  tagline: string;
  genres: TmdbGenre[];
  status: string;
  original_language: string;
  credits?: TmdbCreditsResponse;
  keywords?: TmdbKeywordsResponse;
  similar?: TmdbPaginatedResponse<TmdbMovieSummary>;
  videos?: {
    results: TmdbVideoItem[];
  };
}

export interface TmdbWatchProvider {
  logo_path: string;
  provider_id: number;
  provider_name: string;
  display_priority: number;
}

export interface TmdbCountryProviders {
  link?: string;
  flatrate?: TmdbWatchProvider[];
  rent?: TmdbWatchProvider[];
  buy?: TmdbWatchProvider[];
  free?: TmdbWatchProvider[];
  ads?: TmdbWatchProvider[];
}

export interface TmdbWatchProvidersResponse {
  id: number;
  results: Record<string, TmdbCountryProviders>;
}

export async function getMovieGenres(): Promise<TmdbGenre[]> {
  const data = await tmdbFetch<{ genres: TmdbGenre[] }>('/genre/movie/list', {
    language: 'en-US',
  }, 60 * 60 * 1000);
  return data.genres || [];
}

export async function getPopularMovies(page = 1): Promise<TmdbPaginatedResponse<TmdbMovieSummary>> {
  return tmdbFetch<TmdbPaginatedResponse<TmdbMovieSummary>>('/movie/popular', {
    language: 'en-US',
    page,
  });
}

export async function getTrendingMovies(page = 1): Promise<TmdbPaginatedResponse<TmdbMovieSummary>> {
  return tmdbFetch<TmdbPaginatedResponse<TmdbMovieSummary>>('/trending/movie/week', {
    language: 'en-US',
    page,
  });
}

export async function searchMovies(query: string, page = 1, year?: number): Promise<TmdbPaginatedResponse<TmdbMovieSummary>> {
  return tmdbFetch<TmdbPaginatedResponse<TmdbMovieSummary>>('/search/movie', {
    language: 'en-US',
    query,
    page,
    include_adult: 'false',
    primary_release_year: year,
  });
}

export async function discoverMovies(opts: {
  page?: number;
  genre?: string;
  year?: number;
  minRating?: number;
  sortBy?: string;
}): Promise<TmdbPaginatedResponse<TmdbMovieSummary>> {
  return tmdbFetch<TmdbPaginatedResponse<TmdbMovieSummary>>('/discover/movie', {
    language: 'en-US',
    include_adult: 'false',
    page: opts.page || 1,
    with_genres: opts.genre,
    primary_release_year: opts.year,
    'vote_average.gte': opts.minRating,
    'vote_count.gte': opts.minRating ? 50 : 20,
    sort_by: opts.sortBy || 'popularity.desc',
  });
}

export async function getMovieDetails(movieId: number): Promise<TmdbMovieDetail> {
  return tmdbFetch<TmdbMovieDetail>(`/movie/${movieId}`, {
    language: 'en-US',
    append_to_response: 'credits,keywords,similar,videos',
  });
}

export async function getMovieCredits(movieId: number): Promise<TmdbCreditsResponse> {
  return tmdbFetch<TmdbCreditsResponse>(`/movie/${movieId}/credits`, {
    language: 'en-US',
  });
}

export async function getSimilarMovies(movieId: number): Promise<TmdbPaginatedResponse<TmdbMovieSummary>> {
  return tmdbFetch<TmdbPaginatedResponse<TmdbMovieSummary>>(`/movie/${movieId}/similar`, {
    language: 'en-US',
    page: 1,
  });
}

export async function getWatchProviders(movieId: number): Promise<TmdbWatchProvidersResponse> {
  return tmdbFetch<TmdbWatchProvidersResponse>(`/movie/${movieId}/watch/providers`);
}
