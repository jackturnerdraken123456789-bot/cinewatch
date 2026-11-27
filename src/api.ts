import type {
  AccountStatus,
  Genre,
  ModeratorBootstrapStatus,
  ModeratorOverviewResponse,
  ModeratorUserOverview,
  MovieDetail,
  OperationalState,
  PaginatedMovies,
  RatingEntry,
  RecommendationsResponse,
  SystemStatus,
  UserProfile,
  WatchlistEntry,
  WatchProvidersResponse,
} from './types';

let memoryToken: string | null = null;

// Clear any legacy persistent token on startup
try {
  localStorage.removeItem('cinewatch_token');
} catch {
  // ignore storage errors
}

export function getStoredToken(): string | null {
  return memoryToken;
}

export function setStoredToken(token: string | null): void {
  memoryToken = token;
  try {
    localStorage.removeItem('cinewatch_token');
  } catch {
    // ignore storage errors
  }
}

export class ApiError extends Error {
  status: number;
  code?: string;
  constructor(message: string, status: number, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getStoredToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(init.headers as Record<string, string> | undefined),
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const res = await fetch(path, {
    ...init,
    headers,
  });

  const body = (await res.json().catch(() => ({}))) as { error?: string; code?: string } & T;
  if (!res.ok) {
    throw new ApiError(body.error || `Request failed (${res.status})`, res.status, body.code);
  }
  return body;
}

export const api = {
  health: () =>
    request<{
      status: string;
      tmdbConfigured: boolean;
      tmdbActive?: boolean;
      fallbackReason?: string | null;
      systemStatus?: SystemStatus;
    }>('/api/health'),

  register: (payload: {
    username: string;
    email: string;
    password: string;
    favorite_genres?: number[];
  }) =>
    request<{ token: string; user: UserProfile }>('/api/register', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  login: (payload: { identifier: string; password: string }) =>
    request<{ token: string; user: UserProfile }>('/api/login', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  me: () => request<{ user: UserProfile }>('/api/me'),

  updateProfile: (payload: { username: string; email: string }) =>
    request<{ user: UserProfile }>('/api/profile', {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),

  updatePreferences: (payload: {
    favorite_genres?: number[];
    preferred_region?: string;
    exclude_watched?: boolean;
  }) =>
    request<{ user: UserProfile }>('/api/preferences', {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),

  getGenres: () => request<{ genres: Genre[] }>('/api/genres'),

  getPopular: (page = 1) => request<PaginatedMovies>(`/api/movies/popular?page=${page}`),

  getTrending: (page = 1) => request<PaginatedMovies>(`/api/movies/trending?page=${page}`),

  searchMovies: (q: string, page = 1, year?: number) => {
    const params = new URLSearchParams({ q, page: String(page) });
    if (year) params.set('year', String(year));
    return request<PaginatedMovies>(`/api/movies/search?${params.toString()}`);
  },

  discoverMovies: (opts: {
    page?: number;
    genre?: string;
    year?: number;
    minRating?: number;
    sortBy?: string;
  }) => {
    const params = new URLSearchParams();
    if (opts.page) params.set('page', String(opts.page));
    if (opts.genre) params.set('genre', opts.genre);
    if (opts.year) params.set('year', String(opts.year));
    if (opts.minRating) params.set('minRating', String(opts.minRating));
    if (opts.sortBy) params.set('sortBy', opts.sortBy);
    return request<PaginatedMovies>(`/api/movies/discover?${params.toString()}`);
  },

  getPublicDomainMovies: (opts: {
    page?: number;
    q?: string;
    genre?: string;
    year?: number;
  }) => {
    const params = new URLSearchParams();
    if (opts.page) params.set('page', String(opts.page));
    if (opts.q) params.set('q', opts.q);
    if (opts.genre) params.set('genre', opts.genre);
    if (opts.year) params.set('year', String(opts.year));
    return request<PaginatedMovies>(`/api/movies/public-domain?${params.toString()}`);
  },

  getMovieDetail: (movieId: number) => request<MovieDetail>(`/api/movies/${movieId}`),

  getWatchProviders: (movieId: number, region = 'PH') =>
    request<WatchProvidersResponse>(`/api/movies/${movieId}/watch-providers?region=${region}`),

  getRecommendations: (userId: number) =>
    request<RecommendationsResponse>(`/api/recommendations/${userId}`),

  getGuestRecommendations: (genreIds: number[]) =>
    request<RecommendationsResponse>(
      `/api/recommendations${genreIds.length > 0 ? `?genres=${genreIds.join(',')}` : ''}`
    ),

  rateMovie: (tmdbMovieId: number, ratingScore: number) =>
    request<{ rating: RatingEntry }>('/api/ratings', {
      method: 'POST',
      body: JSON.stringify({ tmdb_movie_id: tmdbMovieId, rating_score: ratingScore }),
    }),

  getUserRatings: (userId: number, hydrate = true) =>
    request<{ ratings: RatingEntry[] }>(`/api/ratings/${userId}?hydrate=${hydrate ? '1' : '0'}`),

  deleteRating: (tmdbMovieId: number) =>
    request<{ removed: boolean }>(`/api/ratings/${tmdbMovieId}`, {
      method: 'DELETE',
    }),

  getWatchlist: (userId: number, hydrate = true) =>
    request<{ watchlist: WatchlistEntry[] }>(
      `/api/watchlist/${userId}?hydrate=${hydrate ? '1' : '0'}`
    ),

  addToWatchlist: (tmdbMovieId: number) =>
    request<{ item: WatchlistEntry }>('/api/watchlist', {
      method: 'POST',
      body: JSON.stringify({ tmdb_movie_id: tmdbMovieId }),
    }),

  removeFromWatchlistById: (watchlistId: number) =>
    request<{ removed: boolean; watchlist_id: number }>(`/api/watchlist/${watchlistId}`, {
      method: 'DELETE',
    }),

  removeFromWatchlistByMovie: (tmdbMovieId: number) =>
    request<{ removed: boolean }>(`/api/watchlist/movie/${tmdbMovieId}`, {
      method: 'DELETE',
    }),

  getModeratorBootstrapStatus: () =>
    request<ModeratorBootstrapStatus>('/api/moderator/bootstrap-status'),

  claimModerator: (payload: { username: string; email: string; password: string }) =>
    request<{ token: string; user: UserProfile }>('/api/moderator/claim', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  loginModerator: (payload: { identifier?: string; password?: string; passcode?: string }) =>
    request<{ token: string; user: UserProfile }>('/api/moderator/login', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  getModeratorOverview: () => request<ModeratorOverviewResponse>('/api/moderator/overview'),

  getModeratorUsers: () =>
    request<{ users: ModeratorUserOverview[] }>('/api/moderator/users'),

  updateUserStatus: (userId: number, accountStatus: AccountStatus) =>
    request<{ updated: boolean; user_id: number; account_status: AccountStatus }>(
      `/api/moderator/users/${userId}/status`,
      {
        method: 'PATCH',
        body: JSON.stringify({ account_status: accountStatus }),
      }
    ),

  updateSystemStatus: (payload: {
    operational_state?: OperationalState;
    maintenance_banner?: string;
    allow_registrations?: boolean;
    allow_ratings?: boolean;
    allow_watchlist?: boolean;
  }) =>
    request<{ systemStatus: SystemStatus }>('/api/moderator/system-status', {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),
};
