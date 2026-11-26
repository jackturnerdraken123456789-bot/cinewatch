export type NavSection =
  | 'overview'
  | 'discover'
  | 'genres'
  | 'recommended'
  | 'watchlist'
  | 'profile'
  | 'settings';

export interface Genre {
  id: number;
  name: string;
}

export interface RatingEntry {
  rating_id: number;
  user_id: number;
  tmdb_movie_id: number;
  rating_score: number;
  updated_at: string;
  movie?: MovieDetail | null;
}

export interface WatchlistEntry {
  watchlist_id: number;
  user_id: number;
  tmdb_movie_id: number;
  created_at: string;
  movie?: MovieDetail | null;
}

export type UserRole = 'user' | 'moderator';
export type AccountStatus = 'active' | 'suspended';
export type OperationalState = 'operational' | 'degraded' | 'maintenance';

export interface SystemStatus {
  operational_state: OperationalState;
  maintenance_banner: string;
  allow_registrations: boolean;
  allow_ratings: boolean;
  allow_watchlist: boolean;
  updated_by: string;
  updated_at: string;
}

export interface ModeratorBootstrapStatus {
  hasModerator: boolean;
  passcodeConfigured: boolean;
}

export interface ModeratorSummary {
  totalUsers: number;
  activeUsers: number;
  suspendedUsers: number;
  moderatorCount: number;
  totalRatings: number;
  averageSystemRating: number;
  totalWatchlistSaves: number;
  uniqueMoviesEngaged: number;
}

export interface GenreTrendItem {
  genreId: number;
  genreName: string;
  userCount: number;
  sharePercent: number;
}

export interface MovieTrendItem {
  movieId: number;
  title: string;
  poster_path: string | null;
  release_date: string;
  ratingsCount: number;
  avgRating: number | null;
  watchlistCount: number;
  trendScore: number;
}

export interface RegionDistributionItem {
  region: string;
  count: number;
}

export interface ModerationLogEntry {
  log_id: number;
  moderator_username: string;
  action: string;
  target: string;
  details: string;
  created_at: string;
}

export interface ModeratorUserOverview {
  user_id: number;
  username: string;
  email: string;
  role: UserRole;
  account_status: AccountStatus;
  preferred_region: string;
  favorite_genres: number[];
  ratings_count: number;
  avg_rating: number | null;
  watchlist_count: number;
  created_at: string;
}

export interface ModeratorOverviewResponse {
  summary: ModeratorSummary;
  genreTrends: GenreTrendItem[];
  movieTrends: MovieTrendItem[];
  regionDistribution: RegionDistributionItem[];
  systemStatus: SystemStatus;
  catalogMode: {
    tmdbConfigured: boolean;
    tmdbActive: boolean;
    fallbackReason: string | null;
  };
  recentLogs: ModerationLogEntry[];
}

export interface UserProfile {
  user_id: number;
  username: string;
  email: string;
  preferred_region: string;
  exclude_watched: boolean;
  role: UserRole;
  account_status: AccountStatus;
  created_at: string;
  favorite_genres: number[];
  ratings: RatingEntry[];
  watchlist: WatchlistEntry[];
}

export interface MovieSummary {
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
  genres?: Genre[];
  source?: 'tmdb' | 'itunes' | 'archive';
  is_full_movie_playable?: boolean;
}

export interface PaginatedMovies {
  page: number;
  results: MovieSummary[];
  total_pages: number;
  total_results: number;
  catalogSource?: 'tmdb' | 'fallback';
}

export interface CastMember {
  id: number;
  name: string;
  character: string;
  profile_path: string | null;
  order: number;
}

export interface CrewMember {
  id: number;
  name: string;
  job: string;
  department: string;
  profile_path: string | null;
}

export interface VideoItem {
  id: string;
  key: string;
  name: string;
  site: string;
  type: string;
  official: boolean;
}

export interface MovieDetail extends MovieSummary {
  runtime: number | null;
  tagline: string;
  genres: Genre[];
  status: string;
  original_language: string;
  credits?: {
    cast: CastMember[];
    crew: CrewMember[];
  };
  similar?: PaginatedMovies;
  videos?: {
    results: VideoItem[];
  };
  stream_url?: string | null;
  trailer_url?: string | null;
  external_watch_url?: string | null;
}

export interface WatchProviderItem {
  logo_path: string;
  provider_id: number;
  provider_name: string;
  display_priority: number;
}

export interface RegionalWatchProviders {
  link?: string;
  flatrate?: WatchProviderItem[];
  rent?: WatchProviderItem[];
  buy?: WatchProviderItem[];
  free?: WatchProviderItem[];
  ads?: WatchProviderItem[];
}

export interface WatchProvidersResponse {
  movie_id: number;
  region: string;
  providers: RegionalWatchProviders | null;
  availableRegions: string[];
}

export interface RecommendedMovie extends MovieSummary {
  genres: Genre[];
  finalScore: number;
  collaborativeScore: number;
  contentScore: number;
  popularityScore: number;
  recommendationMode: 'hybrid' | 'content-popularity' | 'popularity-fallback';
  reason: string;
}

export interface RecommendationsResponse {
  userId: number | null;
  mode: 'hybrid' | 'content-popularity' | 'popularity-fallback';
  formula: string;
  favoriteGenres: Genre[];
  recommendations: RecommendedMovie[];
}

export const WATCH_REGIONS: { code: string; name: string }[] = [
  { code: 'PH', name: 'Philippines' },
  { code: 'US', name: 'United States' },
  { code: 'GB', name: 'United Kingdom' },
  { code: 'CA', name: 'Canada' },
  { code: 'AU', name: 'Australia' },
  { code: 'SG', name: 'Singapore' },
  { code: 'JP', name: 'Japan' },
  { code: 'KR', name: 'South Korea' },
  { code: 'IN', name: 'India' },
  { code: 'DE', name: 'Germany' },
  { code: 'FR', name: 'France' },
  { code: 'ES', name: 'Spain' },
  { code: 'BR', name: 'Brazil' },
  { code: 'MX', name: 'Mexico' },
];
