import { getArchiveIdentifier, registerArchiveIdentifier } from './db.ts';
import type {
  TmdbGenre,
  TmdbMovieDetail,
  TmdbMovieSummary,
  TmdbPaginatedResponse,
  TmdbWatchProvidersResponse,
} from './tmdb.ts';

export const ITUNES_ID_OFFSET = 900_000_000_000;
export const ARCHIVE_ID_MIN = 800_000_000_000;
export const ARCHIVE_ID_MAX = 899_999_999_999;

export function isItunesMovieId(movieId: number): boolean {
  return movieId >= ITUNES_ID_OFFSET;
}

export function isArchiveMovieId(movieId: number): boolean {
  return movieId >= ARCHIVE_ID_MIN && movieId <= ARCHIVE_ID_MAX;
}

export const FALLBACK_GENRES: TmdbGenre[] = [
  { id: 28, name: 'Action' },
  { id: 12, name: 'Adventure' },
  { id: 16, name: 'Animation' },
  { id: 35, name: 'Comedy' },
  { id: 80, name: 'Crime' },
  { id: 99, name: 'Documentary' },
  { id: 18, name: 'Drama' },
  { id: 10751, name: 'Family' },
  { id: 14, name: 'Fantasy' },
  { id: 27, name: 'Horror' },
  { id: 9648, name: 'Mystery' },
  { id: 10749, name: 'Romance' },
  { id: 878, name: 'Science Fiction' },
  { id: 53, name: 'Thriller' },
];

const GENRE_BY_NAME = new Map<string, TmdbGenre>(
  FALLBACK_GENRES.map((g) => [g.name.toLowerCase(), g])
);

const ITUNES_GENRE_FEEDS: { tmdbGenreId: number; itunesGenreCode: number }[] = [
  { tmdbGenreId: 28, itunesGenreCode: 4401 }, // Action & Adventure
  { tmdbGenreId: 16, itunesGenreCode: 4402 }, // Animation
  { tmdbGenreId: 35, itunesGenreCode: 4404 }, // Comedy
  { tmdbGenreId: 99, itunesGenreCode: 4405 }, // Documentary
  { tmdbGenreId: 18, itunesGenreCode: 4406 }, // Drama
  { tmdbGenreId: 27, itunesGenreCode: 4408 }, // Horror
  { tmdbGenreId: 10751, itunesGenreCode: 4410 }, // Kids & Family
  { tmdbGenreId: 878, itunesGenreCode: 4413 }, // Sci-Fi & Fantasy
  { tmdbGenreId: 53, itunesGenreCode: 4416 }, // Thriller
];

function mapGenreStringToIds(genreStr: string): number[] {
  const lower = genreStr.toLowerCase();
  const ids = new Set<number>();

  if (lower.includes('action')) ids.add(28);
  if (lower.includes('adventure')) ids.add(12);
  if (lower.includes('animation') || lower.includes('anime')) ids.add(16);
  if (lower.includes('comedy')) ids.add(35);
  if (lower.includes('crime') || lower.includes('noir')) ids.add(80);
  if (lower.includes('documentary')) ids.add(99);
  if (lower.includes('drama')) ids.add(18);
  if (lower.includes('family') || lower.includes('kids')) ids.add(10751);
  if (lower.includes('fantasy')) ids.add(14);
  if (lower.includes('horror')) ids.add(27);
  if (lower.includes('mystery')) ids.add(9648);
  if (lower.includes('romance')) ids.add(10749);
  if (lower.includes('sci-fi') || lower.includes('science fiction')) ids.add(878);
  if (lower.includes('thriller') || lower.includes('suspense')) ids.add(53);

  const exact = GENRE_BY_NAME.get(lower);
  if (exact) ids.add(exact.id);

  if (ids.size === 0) ids.add(18);
  return Array.from(ids);
}

export interface ExtendedMovieDetail extends TmdbMovieDetail {
  source?: 'tmdb' | 'itunes' | 'archive';
  stream_url?: string | null;
  trailer_url?: string | null;
  external_watch_url?: string | null;
  is_full_movie_playable?: boolean;
}

export interface ExtendedMovieSummary extends TmdbMovieSummary {
  source?: 'tmdb' | 'itunes' | 'archive';
  is_full_movie_playable?: boolean;
}

interface CacheBucket<T> {
  expiresAt: number;
  data: T;
}

const rssCache = new Map<string, CacheBucket<ExtendedMovieSummary[]>>();
const detailCache = new Map<number, CacheBucket<ExtendedMovieDetail>>();
const archiveCache = new Map<string, CacheBucket<ExtendedMovieSummary[]>>();

function upscaleItunesPoster(url: string | undefined): string | null {
  if (!url) return null;
  return url.replace(/\/\d+x\d+bb\.(png|jpg)$/, '/600x900bb.jpg');
}

interface ItunesRssEntry {
  id?: { attributes?: { 'im:id'?: string } };
  'im:name'?: { label?: string };
  'im:image'?: { label?: string }[];
  category?: { attributes?: { label?: string } };
  'im:releaseDate'?: { label?: string };
  summary?: { label?: string };
  link?: { attributes?: { href?: string; type?: string } }[];
}

function parseItunesRssEntries(entries: ItunesRssEntry[], extraGenreId?: number): ExtendedMovieSummary[] {
  const results: ExtendedMovieSummary[] = [];
  entries.forEach((entry, idx) => {
    const rawId = entry.id?.attributes?.['im:id'];
    const numId = rawId ? Number(rawId) : NaN;
    if (!Number.isFinite(numId)) return;

    const title = (entry['im:name']?.label || '').trim();
    if (!title) return;

    const images = entry['im:image'] || [];
    const lastImg = images[images.length - 1]?.label;
    const posterUrl = upscaleItunesPoster(lastImg);
    const genreLabel = entry.category?.attributes?.label || 'Drama';
    const genreIds = mapGenreStringToIds(genreLabel);
    if (extraGenreId && !genreIds.includes(extraGenreId)) {
      genreIds.unshift(extraGenreId);
    }

    const releaseRaw = entry['im:releaseDate']?.label || '';
    const releaseDate = releaseRaw ? releaseRaw.slice(0, 10) : '';

    results.push({
      id: ITUNES_ID_OFFSET + numId,
      title,
      overview: (entry.summary?.label || '').trim(),
      poster_path: posterUrl,
      backdrop_path: posterUrl,
      release_date: releaseDate,
      vote_average: Number((7.8 - (idx % 14) * 0.1).toFixed(1)),
      vote_count: Math.max(120, 1800 - idx * 32),
      popularity: Math.max(25, 320 - idx * 5),
      genre_ids: genreIds,
      source: 'itunes',
      is_full_movie_playable: false,
    });
  });
  return results;
}

export async function getItunesMoviesFeed(genreCode?: number, extraGenreId?: number): Promise<ExtendedMovieSummary[]> {
  const cacheKey = genreCode ? `genre_${genreCode}` : 'top_100';
  const cached = rssCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }

  const url = genreCode
    ? `https://itunes.apple.com/us/rss/topmovies/limit=40/genre=${genreCode}/json`
    : `https://itunes.apple.com/us/rss/topmovies/limit=60/json`;

  const response = await fetch(url);
  if (!response.ok) return [];
  const json = (await response.json()) as { feed?: { entry?: ItunesRssEntry[] } };
  const parsed = parseItunesRssEntries(json.feed?.entry || [], extraGenreId);

  rssCache.set(cacheKey, {
    expiresAt: Date.now() + 10 * 60 * 1000,
    data: parsed,
  });
  return parsed;
}

export async function getItunesMovieDetail(movieId: number): Promise<ExtendedMovieDetail | null> {
  const cached = detailCache.get(movieId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }

  const itunesId = movieId - ITUNES_ID_OFFSET;
  const response = await fetch(`https://itunes.apple.com/lookup?id=${itunesId}&country=US`);
  if (!response.ok) return null;

  const json = (await response.json()) as {
    results?: Array<{
      trackId: number;
      trackName: string;
      longDescription?: string;
      shortDescription?: string;
      artworkUrl100?: string;
      releaseDate?: string;
      trackTimeMillis?: number;
      primaryGenreName?: string;
      previewUrl?: string;
      trackViewUrl?: string;
      artistName?: string;
    }>;
  };

  const item = json.results?.[0];
  if (!item) return null;

  const poster = upscaleItunesPoster(item.artworkUrl100);
  const genreIds = mapGenreStringToIds(item.primaryGenreName || 'Drama');
  const genres = genreIds
    .map((id) => FALLBACK_GENRES.find((g) => g.id === id))
    .filter((g): g is TmdbGenre => Boolean(g));

  const detail: ExtendedMovieDetail = {
    id: movieId,
    title: item.trackName,
    overview: item.longDescription || item.shortDescription || '',
    poster_path: poster,
    backdrop_path: poster,
    release_date: item.releaseDate ? item.releaseDate.slice(0, 10) : '',
    vote_average: 7.4,
    vote_count: 450,
    popularity: 180,
    runtime: item.trackTimeMillis ? Math.round(item.trackTimeMillis / 60000) : null,
    tagline: item.artistName ? `Directed by ${item.artistName}` : '',
    genres,
    genre_ids: genreIds,
    status: 'Released',
    original_language: 'en',
    source: 'itunes',
    trailer_url: item.previewUrl || null,
    external_watch_url: item.trackViewUrl || null,
    is_full_movie_playable: false,
    credits: item.artistName
      ? {
          id: movieId,
          cast: [],
          crew: [
            {
              id: 1,
              name: item.artistName,
              job: 'Director',
              department: 'Directing',
              profile_path: null,
            },
          ],
        }
      : undefined,
  };

  detailCache.set(movieId, {
    expiresAt: Date.now() + 15 * 60 * 1000,
    data: detail,
  });

  return detail;
}

interface ArchiveDoc {
  identifier: string;
  title?: string;
  year?: number | string;
  description?: string | string[];
  downloads?: number;
  subject?: string | string[];
}

function normalizeTextField(val: string | string[] | undefined): string {
  if (!val) return '';
  if (Array.isArray(val)) return val.join(', ');
  return String(val);
}

export async function searchArchivePublicDomainMovies(opts: {
  query?: string;
  genreId?: number;
  year?: number;
  page?: number;
  rows?: number;
}): Promise<TmdbPaginatedResponse<ExtendedMovieSummary>> {
  const page = Math.max(1, opts.page || 1);
  const rows = opts.rows || 20;

  const baseClauses = [
    'collection:(feature_films OR classic_tv OR sci_fi_horror)',
    'mediatype:(movies)',
    'format:(MPEG4)',
    'NOT subject:(exploitation OR erotic OR adult OR sex OR pornography)',
  ];

  if (opts.query && opts.query.trim()) {
    const cleanQ = opts.query.trim().replace(/[^\w\s-]/g, ' ');
    baseClauses.push(`(title:(${cleanQ}) OR description:(${cleanQ}))`);
  }

  if (opts.year) {
    baseClauses.push(`year:${opts.year}`);
  } else {
    baseClauses.push('year:[1920 TO 2024]');
  }

  if (opts.genreId) {
    const genreObj = FALLBACK_GENRES.find((g) => g.id === opts.genreId);
    if (genreObj) {
      const term = genreObj.name === 'Science Fiction' ? 'sci-fi' : genreObj.name.toLowerCase();
      baseClauses.push(`subject:(${term})`);
    }
  }

  const qStr = baseClauses.join(' AND ');
  const cacheKey = `${qStr}|${page}|${rows}`;
  const cached = archiveCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return {
      page,
      results: cached.data,
      total_pages: 10,
      total_results: cached.data.length * 10,
    };
  }

  const url = new URL('https://archive.org/advancedsearch.php');
  url.searchParams.set('q', qStr);
  url.searchParams.append('fl[]', 'identifier');
  url.searchParams.append('fl[]', 'title');
  url.searchParams.append('fl[]', 'year');
  url.searchParams.append('fl[]', 'description');
  url.searchParams.append('fl[]', 'downloads');
  url.searchParams.append('fl[]', 'subject');
  url.searchParams.set('sort[]', 'downloads desc');
  url.searchParams.set('rows', String(rows));
  url.searchParams.set('page', String(page));
  url.searchParams.set('output', 'json');

  const response = await fetch(url.toString());
  if (!response.ok) {
    return { page, results: [], total_pages: 1, total_results: 0 };
  }

  const json = (await response.json()) as {
    response?: { numFound?: number; docs?: ArchiveDoc[] };
  };

  const docs = json.response?.docs || [];
  const totalResults = json.response?.numFound || docs.length;

  const results: ExtendedMovieSummary[] = docs.map((doc) => {
    const movieId = registerArchiveIdentifier(doc.identifier);
    const subjectStr = normalizeTextField(doc.subject);
    const descStr = normalizeTextField(doc.description).replace(/<[^>]+>/g, ' ').trim();
    const genreIds = mapGenreStringToIds(subjectStr || descStr);
    const yearStr = doc.year ? String(doc.year).slice(0, 4) : '';
    const downloads = Number(doc.downloads || 1000);
    const popularity = Math.min(300, Math.round(Math.log10(Math.max(10, downloads)) * 45));

    return {
      id: movieId,
      title: (doc.title || doc.identifier).trim(),
      overview: descStr || 'Public domain classic feature film available for free streaming via Internet Archive.',
      poster_path: `https://archive.org/services/img/${doc.identifier}`,
      backdrop_path: `https://archive.org/services/img/${doc.identifier}`,
      release_date: yearStr ? `${yearStr}-01-01` : '',
      vote_average: Number((6.6 + (Math.min(downloads, 500000) / 500000) * 1.8).toFixed(1)),
      vote_count: Math.max(50, Math.round(downloads / 100)),
      popularity,
      genre_ids: genreIds,
      source: 'archive',
      is_full_movie_playable: true,
    };
  });

  archiveCache.set(cacheKey, {
    expiresAt: Date.now() + 10 * 60 * 1000,
    data: results,
  });

  return {
    page,
    results,
    total_pages: Math.max(1, Math.min(25, Math.ceil(totalResults / rows))),
    total_results: totalResults,
  };
}

export async function getArchiveMovieDetail(movieId: number): Promise<ExtendedMovieDetail | null> {
  const cached = detailCache.get(movieId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }

  const identifier = getArchiveIdentifier(movieId);
  if (!identifier) return null;

  const response = await fetch(`https://archive.org/metadata/${identifier}`);
  if (!response.ok) return null;

  const json = (await response.json()) as {
    metadata?: {
      title?: string;
      description?: string | string[];
      year?: string | number;
      date?: string;
      runtime?: string;
      subject?: string | string[];
      director?: string | string[];
      creator?: string | string[];
    };
    files?: Array<{
      name?: string;
      format?: string;
      size?: string;
      length?: string;
    }>;
  };

  const meta = json.metadata || {};
  const files = json.files || [];

  // Prefer standard h.264 / MPEG4 file (skip tiny _512kb if full MP4 exists)
  const mp4Candidates = files.filter(
    (f) => f.name && f.name.toLowerCase().endsWith('.mp4')
  );
  const chosenFile =
    mp4Candidates.find((f) => f.name && !f.name.includes('_512kb')) ||
    mp4Candidates[0];

  const streamUrl = chosenFile?.name
    ? `https://archive.org/download/${identifier}/${encodeURIComponent(chosenFile.name)}`
    : null;

  const subjectStr = normalizeTextField(meta.subject);
  const genreIds = mapGenreStringToIds(subjectStr);
  const genres = genreIds
    .map((id) => FALLBACK_GENRES.find((g) => g.id === id))
    .filter((g): g is TmdbGenre => Boolean(g));

  let runtimeMin: number | null = null;
  if (meta.runtime) {
    const parts = String(meta.runtime).split(':').map(Number);
    if (parts.length === 3 && parts.every((n) => !Number.isNaN(n))) {
      runtimeMin = parts[0] * 60 + parts[1];
    } else if (parts.length === 2 && parts.every((n) => !Number.isNaN(n))) {
      runtimeMin = parts[0];
    } else if (!Number.isNaN(Number(meta.runtime))) {
      runtimeMin = Math.round(Number(meta.runtime));
    }
  }

  const directorName = normalizeTextField(meta.director || meta.creator).trim();
  const rawDesc = normalizeTextField(meta.description).replace(/<[^>]+>/g, ' ').trim();
  const yearStr = meta.year ? String(meta.year).slice(0, 4) : meta.date ? String(meta.date).slice(0, 4) : '';

  const detail: ExtendedMovieDetail = {
    id: movieId,
    title: meta.title || identifier,
    overview: rawDesc || 'Public domain full-length feature film hosted by the Internet Archive.',
    poster_path: `https://archive.org/services/img/${identifier}`,
    backdrop_path: `https://archive.org/services/img/${identifier}`,
    release_date: yearStr ? `${yearStr}-01-01` : '',
    vote_average: 7.3,
    vote_count: 320,
    popularity: 150,
    runtime: runtimeMin,
    tagline: 'Public Domain Feature Film · Free Full Stream',
    genres,
    genre_ids: genreIds,
    status: 'Released',
    original_language: 'en',
    source: 'archive',
    stream_url: streamUrl,
    external_watch_url: `https://archive.org/details/${identifier}`,
    is_full_movie_playable: Boolean(streamUrl),
    credits: directorName
      ? {
          id: movieId,
          cast: [],
          crew: [
            {
              id: 1,
              name: directorName,
              job: 'Director',
              department: 'Directing',
              profile_path: null,
            },
          ],
        }
      : undefined,
  };

  detailCache.set(movieId, {
    expiresAt: Date.now() + 15 * 60 * 1000,
    data: detail,
  });

  return detail;
}

export async function getFallbackPopular(page = 1): Promise<TmdbPaginatedResponse<ExtendedMovieSummary>> {
  const [itunes, archive] = await Promise.all([
    getItunesMoviesFeed(),
    searchArchivePublicDomainMovies({ page, rows: 10 }),
  ]);

  const pageSize = 20;
  const start = (page - 1) * pageSize;
  const combined =
    page === 1
      ? [...itunes.slice(0, 14), ...archive.results.slice(0, 6)]
      : [...itunes.slice(start, start + 14), ...archive.results.slice(0, 6)];

  return {
    page,
    results: combined,
    total_pages: 4,
    total_results: itunes.length + archive.results.length,
  };
}

export async function getFallbackDiscover(opts: {
  page?: number;
  genre?: string;
  year?: number;
  minRating?: number;
  sortBy?: string;
}): Promise<TmdbPaginatedResponse<ExtendedMovieSummary>> {
  const page = Math.max(1, opts.page || 1);
  const genreIds = (opts.genre || '')
    .split(/[,|]/)
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isInteger(n) && n > 0);

  const primaryGenreId = genreIds[0];
  const feedMatch = primaryGenreId
    ? ITUNES_GENRE_FEEDS.find((f) => f.tmdbGenreId === primaryGenreId)
    : undefined;

  const [itunes, archive] = await Promise.all([
    feedMatch ? getItunesMoviesFeed(feedMatch.itunesGenreCode, feedMatch.tmdbGenreId) : getItunesMoviesFeed(),
    searchArchivePublicDomainMovies({
      genreId: primaryGenreId,
      year: opts.year,
      page,
      rows: 12,
    }),
  ]);

  let pool = [...itunes, ...archive.results];
  // Deduplicate by id
  const seen = new Set<number>();
  pool = pool.filter((m) => {
    if (seen.has(m.id)) return false;
    seen.add(m.id);
    return true;
  });

  if (genreIds.length > 0) {
    pool = pool.filter((m) => (m.genre_ids || []).some((g) => genreIds.includes(g)));
  }
  if (opts.year) {
    pool = pool.filter((m) => m.release_date.startsWith(String(opts.year)));
  }
  if (opts.minRating) {
    pool = pool.filter((m) => m.vote_average >= opts.minRating!);
  }

  if (opts.sortBy === 'vote_average.desc') {
    pool.sort((a, b) => b.vote_average - a.vote_average);
  } else if (opts.sortBy === 'primary_release_date.desc') {
    pool.sort((a, b) => (b.release_date || '').localeCompare(a.release_date || ''));
  } else {
    pool.sort((a, b) => b.popularity - a.popularity);
  }

  const pageSize = 20;
  const start = (page - 1) * pageSize;
  const slice = pool.slice(start, start + pageSize);

  return {
    page,
    results: slice,
    total_pages: Math.max(1, Math.ceil(pool.length / pageSize)),
    total_results: pool.length,
  };
}

export async function getFallbackSearch(
  query: string,
  page = 1,
  year?: number
): Promise<TmdbPaginatedResponse<ExtendedMovieSummary>> {
  const lower = query.toLowerCase();
  const [itunes, archive] = await Promise.all([
    getItunesMoviesFeed(),
    searchArchivePublicDomainMovies({ query, year, page, rows: 16 }),
  ]);

  const itunesMatches = itunes.filter((m) => {
    const matchesText =
      m.title.toLowerCase().includes(lower) || m.overview.toLowerCase().includes(lower);
    const matchesYear = year ? m.release_date.startsWith(String(year)) : true;
    return matchesText && matchesYear;
  });

  const combined = page === 1 ? [...itunesMatches, ...archive.results] : archive.results;
  return {
    page,
    results: combined,
    total_pages: Math.max(1, archive.total_pages),
    total_results: itunesMatches.length + archive.total_results,
  };
}

export async function getFallbackMovieDetail(movieId: number): Promise<ExtendedMovieDetail | null> {
  if (isItunesMovieId(movieId)) {
    return getItunesMovieDetail(movieId);
  }
  if (isArchiveMovieId(movieId)) {
    return getArchiveMovieDetail(movieId);
  }
  return null;
}

export async function getFallbackWatchProviders(movieId: number, region = 'PH'): Promise<TmdbWatchProvidersResponse> {
  const detail = await getFallbackMovieDetail(movieId);
  const externalLink = detail?.external_watch_url || undefined;

  if (detail?.source === 'archive') {
    return {
      id: movieId,
      results: {
        [region]: {
          link: externalLink,
          free: [
            {
              logo_path: '',
              provider_id: 99001,
              provider_name: 'Internet Archive (Free Public Domain Stream)',
              display_priority: 1,
            },
          ],
        },
      },
    };
  }

  if (detail?.source === 'itunes') {
    return {
      id: movieId,
      results: {
        [region]: {
          link: externalLink,
          rent: [
            {
              logo_path: '',
              provider_id: 2,
              provider_name: 'Apple TV / iTunes Store',
              display_priority: 1,
            },
          ],
          buy: [
            {
              logo_path: '',
              provider_id: 2,
              provider_name: 'Apple TV / iTunes Store',
              display_priority: 1,
            },
          ],
        },
      },
    };
  }

  return { id: movieId, results: {} };
}
