import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';

const dbPath = path.resolve(process.cwd(), 'cinematch.db');
export const db = new DatabaseSync(dbPath);

db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS users (
    user_id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    preferred_region TEXT NOT NULL DEFAULT 'PH',
    exclude_watched INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS user_preferences (
    preference_id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL UNIQUE,
    favorite_genres TEXT NOT NULL DEFAULT '[]',
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS ratings (
    rating_id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    tmdb_movie_id INTEGER NOT NULL,
    rating_score REAL NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(user_id, tmdb_movie_id),
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS watchlist (
    watchlist_id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    tmdb_movie_id INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(user_id, tmdb_movie_id),
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS external_sources (
    movie_id INTEGER PRIMARY KEY,
    external_key TEXT NOT NULL UNIQUE
  );

  CREATE TABLE IF NOT EXISTS system_status (
    status_id INTEGER PRIMARY KEY CHECK (status_id = 1),
    operational_state TEXT NOT NULL DEFAULT 'operational',
    maintenance_banner TEXT NOT NULL DEFAULT '',
    allow_registrations INTEGER NOT NULL DEFAULT 1,
    allow_ratings INTEGER NOT NULL DEFAULT 1,
    allow_watchlist INTEGER NOT NULL DEFAULT 1,
    updated_by TEXT NOT NULL DEFAULT 'system',
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  INSERT OR IGNORE INTO system_status (
    status_id, operational_state, maintenance_banner, allow_registrations, allow_ratings, allow_watchlist, updated_by
  ) VALUES (1, 'operational', '', 1, 1, 1, 'system');

  CREATE TABLE IF NOT EXISTS moderation_logs (
    log_id INTEGER PRIMARY KEY AUTOINCREMENT,
    moderator_username TEXT NOT NULL,
    action TEXT NOT NULL,
    target TEXT NOT NULL,
    details TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

// Safe migrations for existing databases
const userColumns = db.prepare('PRAGMA table_info(users)').all() as Array<{ name: string }>;
const colNames = new Set(userColumns.map((c) => c.name));
if (!colNames.has('role')) {
  db.exec("ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'user'");
}
if (!colNames.has('account_status')) {
  db.exec("ALTER TABLE users ADD COLUMN account_status TEXT NOT NULL DEFAULT 'active'");
}

export type UserRole = 'user' | 'moderator';
export type AccountStatus = 'active' | 'suspended';
export type OperationalState = 'operational' | 'degraded' | 'maintenance';

export interface UserRow {
  user_id: number;
  username: string;
  email: string;
  password_hash: string;
  preferred_region: string;
  exclude_watched: number;
  role: UserRole;
  account_status: AccountStatus;
  created_at: string;
}

export interface SystemStatusRow {
  status_id: number;
  operational_state: OperationalState;
  maintenance_banner: string;
  allow_registrations: number;
  allow_ratings: number;
  allow_watchlist: number;
  updated_by: string;
  updated_at: string;
}

export interface ModerationLogRow {
  log_id: number;
  moderator_username: string;
  action: string;
  target: string;
  details: string;
  created_at: string;
}

export interface PreferenceRow {
  preference_id: number;
  user_id: number;
  favorite_genres: string;
}

export interface RatingRow {
  rating_id: number;
  user_id: number;
  tmdb_movie_id: number;
  rating_score: number;
  updated_at: string;
}

export interface WatchlistRow {
  watchlist_id: number;
  user_id: number;
  tmdb_movie_id: number;
  created_at: string;
}

export function getUserById(userId: number): UserRow | undefined {
  return db
    .prepare('SELECT user_id, username, email, password_hash, preferred_region, exclude_watched, role, account_status, created_at FROM users WHERE user_id = ?')
    .get(userId) as UserRow | undefined;
}

export function getUserByEmailOrUsername(identifier: string): UserRow | undefined {
  return db
    .prepare('SELECT user_id, username, email, password_hash, preferred_region, exclude_watched, role, account_status, created_at FROM users WHERE lower(email) = lower(?) OR lower(username) = lower(?)')
    .get(identifier, identifier) as UserRow | undefined;
}

export function getUserFavoriteGenres(userId: number): number[] {
  const row = db
    .prepare('SELECT favorite_genres FROM user_preferences WHERE user_id = ?')
    .get(userId) as { favorite_genres: string } | undefined;
  if (!row) return [];
  try {
    const parsed = JSON.parse(row.favorite_genres);
    return Array.isArray(parsed) ? parsed.filter((id) => typeof id === 'number') : [];
  } catch {
    return [];
  }
}

export function setUserFavoriteGenres(userId: number, genreIds: number[]): void {
  const clean = Array.from(new Set(genreIds.filter((g) => Number.isInteger(g) && g > 0)));
  const existing = db
    .prepare('SELECT preference_id FROM user_preferences WHERE user_id = ?')
    .get(userId);
  if (existing) {
    db.prepare('UPDATE user_preferences SET favorite_genres = ? WHERE user_id = ?').run(
      JSON.stringify(clean),
      userId
    );
  } else {
    db.prepare('INSERT INTO user_preferences (user_id, favorite_genres) VALUES (?, ?)').run(
      userId,
      JSON.stringify(clean)
    );
  }
}

export function getUserRatings(userId: number): RatingRow[] {
  return db
    .prepare('SELECT rating_id, user_id, tmdb_movie_id, rating_score, updated_at FROM ratings WHERE user_id = ? ORDER BY updated_at DESC')
    .all(userId) as unknown as RatingRow[];
}

export function getAllRatings(): RatingRow[] {
  return db
    .prepare('SELECT rating_id, user_id, tmdb_movie_id, rating_score, updated_at FROM ratings')
    .all() as unknown as RatingRow[];
}

export function upsertRating(userId: number, tmdbMovieId: number, ratingScore: number): RatingRow {
  db.prepare(
    `INSERT INTO ratings (user_id, tmdb_movie_id, rating_score, updated_at)
     VALUES (?, ?, ?, datetime('now'))
     ON CONFLICT(user_id, tmdb_movie_id)
     DO UPDATE SET rating_score = excluded.rating_score, updated_at = datetime('now')`
  ).run(userId, tmdbMovieId, ratingScore);

  return db
    .prepare('SELECT rating_id, user_id, tmdb_movie_id, rating_score, updated_at FROM ratings WHERE user_id = ? AND tmdb_movie_id = ?')
    .get(userId, tmdbMovieId) as unknown as RatingRow;
}

export function deleteRating(userId: number, tmdbMovieId: number): boolean {
  const res = db
    .prepare('DELETE FROM ratings WHERE user_id = ? AND tmdb_movie_id = ?')
    .run(userId, tmdbMovieId);
  return Number(res.changes) > 0;
}

export function getUserWatchlist(userId: number): WatchlistRow[] {
  return db
    .prepare('SELECT watchlist_id, user_id, tmdb_movie_id, created_at FROM watchlist WHERE user_id = ? ORDER BY created_at DESC')
    .all(userId) as unknown as WatchlistRow[];
}

export function addToWatchlist(userId: number, tmdbMovieId: number): WatchlistRow {
  db.prepare(
    `INSERT OR IGNORE INTO watchlist (user_id, tmdb_movie_id) VALUES (?, ?)`
  ).run(userId, tmdbMovieId);

  return db
    .prepare('SELECT watchlist_id, user_id, tmdb_movie_id, created_at FROM watchlist WHERE user_id = ? AND tmdb_movie_id = ?')
    .get(userId, tmdbMovieId) as unknown as WatchlistRow;
}

export function removeFromWatchlistById(watchlistId: number, userId: number): boolean {
  const res = db
    .prepare('DELETE FROM watchlist WHERE watchlist_id = ? AND user_id = ?')
    .run(watchlistId, userId);
  return Number(res.changes) > 0;
}

export function removeFromWatchlistByMovie(userId: number, tmdbMovieId: number): boolean {
  const res = db
    .prepare('DELETE FROM watchlist WHERE user_id = ? AND tmdb_movie_id = ?')
    .run(userId, tmdbMovieId);
  return Number(res.changes) > 0;
}

const ARCHIVE_ID_OFFSET = 800_000_000_000;

function hashIdentifier32(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) % 90_000_000_000 + 1;
}

export function registerArchiveIdentifier(identifier: string): number {
  const existing = db
    .prepare('SELECT movie_id FROM external_sources WHERE external_key = ?')
    .get(identifier) as { movie_id: number } | undefined;
  if (existing) return existing.movie_id;

  let candidate = ARCHIVE_ID_OFFSET + hashIdentifier32(identifier);
  while (
    db.prepare('SELECT movie_id FROM external_sources WHERE movie_id = ?').get(candidate)
  ) {
    candidate += 1;
  }

  db.prepare('INSERT OR IGNORE INTO external_sources (movie_id, external_key) VALUES (?, ?)').run(
    candidate,
    identifier
  );
  return candidate;
}

export function getArchiveIdentifier(movieId: number): string | null {
  const row = db
    .prepare('SELECT external_key FROM external_sources WHERE movie_id = ?')
    .get(movieId) as { external_key: string } | undefined;
  return row ? row.external_key : null;
}

export function hasAnyModerator(): boolean {
  const row = db
    .prepare("SELECT user_id FROM users WHERE role = 'moderator' LIMIT 1")
    .get() as { user_id: number } | undefined;
  return Boolean(row);
}

export function getSystemStatus(): SystemStatusRow {
  return db
    .prepare(
      'SELECT status_id, operational_state, maintenance_banner, allow_registrations, allow_ratings, allow_watchlist, updated_by, updated_at FROM system_status WHERE status_id = 1'
    )
    .get() as unknown as SystemStatusRow;
}

export function updateSystemStatus(opts: {
  operational_state?: OperationalState;
  maintenance_banner?: string;
  allow_registrations?: boolean;
  allow_ratings?: boolean;
  allow_watchlist?: boolean;
  updated_by: string;
}): SystemStatusRow {
  const current = getSystemStatus();
  const nextState = opts.operational_state ?? current.operational_state;
  const nextBanner = opts.maintenance_banner !== undefined ? opts.maintenance_banner : current.maintenance_banner;
  const nextRegs = opts.allow_registrations !== undefined ? (opts.allow_registrations ? 1 : 0) : current.allow_registrations;
  const nextRatings = opts.allow_ratings !== undefined ? (opts.allow_ratings ? 1 : 0) : current.allow_ratings;
  const nextWatchlist = opts.allow_watchlist !== undefined ? (opts.allow_watchlist ? 1 : 0) : current.allow_watchlist;

  db.prepare(
    `UPDATE system_status
     SET operational_state = ?, maintenance_banner = ?, allow_registrations = ?, allow_ratings = ?, allow_watchlist = ?, updated_by = ?, updated_at = datetime('now')
     WHERE status_id = 1`
  ).run(nextState, nextBanner, nextRegs, nextRatings, nextWatchlist, opts.updated_by);

  return getSystemStatus();
}

export function addModerationLog(
  moderatorUsername: string,
  action: string,
  target: string,
  details = ''
): void {
  db.prepare(
    'INSERT INTO moderation_logs (moderator_username, action, target, details) VALUES (?, ?, ?, ?)'
  ).run(moderatorUsername, action, target, details);
}

export function getModerationLogs(limit = 30): ModerationLogRow[] {
  return db
    .prepare(
      'SELECT log_id, moderator_username, action, target, details, created_at FROM moderation_logs ORDER BY log_id DESC LIMIT ?'
    )
    .all(limit) as unknown as ModerationLogRow[];
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

export function listAllUsersForModerator(): ModeratorUserOverview[] {
  const users = db
    .prepare(
      'SELECT user_id, username, email, role, account_status, preferred_region, created_at FROM users ORDER BY created_at DESC'
    )
    .all() as Array<{
    user_id: number;
    username: string;
    email: string;
    role: UserRole;
    account_status: AccountStatus;
    preferred_region: string;
    created_at: string;
  }>;

  const ratingStats = new Map<number, { count: number; avg: number | null }>();
  const rRows = db
    .prepare('SELECT user_id, COUNT(*) as cnt, AVG(rating_score) as avg_score FROM ratings GROUP BY user_id')
    .all() as Array<{ user_id: number; cnt: number; avg_score: number }>;
  for (const r of rRows) {
    ratingStats.set(r.user_id, {
      count: Number(r.cnt),
      avg: r.avg_score !== null ? Number(r.avg_score.toFixed(2)) : null,
    });
  }

  const watchlistCounts = new Map<number, number>();
  const wRows = db
    .prepare('SELECT user_id, COUNT(*) as cnt FROM watchlist GROUP BY user_id')
    .all() as Array<{ user_id: number; cnt: number }>;
  for (const w of wRows) {
    watchlistCounts.set(w.user_id, Number(w.cnt));
  }

  const prefMap = new Map<number, number[]>();
  const pRows = db
    .prepare('SELECT user_id, favorite_genres FROM user_preferences')
    .all() as Array<{ user_id: number; favorite_genres: string }>;
  for (const p of pRows) {
    try {
      const parsed = JSON.parse(p.favorite_genres);
      if (Array.isArray(parsed)) {
        prefMap.set(p.user_id, parsed.filter((x) => typeof x === 'number'));
      }
    } catch {
      prefMap.set(p.user_id, []);
    }
  }

  return users.map((u) => {
    const rs = ratingStats.get(u.user_id);
    return {
      ...u,
      favorite_genres: prefMap.get(u.user_id) || [],
      ratings_count: rs?.count || 0,
      avg_rating: rs?.avg ?? null,
      watchlist_count: watchlistCounts.get(u.user_id) || 0,
    };
  });
}

export function setUserAccountStatus(userId: number, status: AccountStatus): boolean {
  const res = db
    .prepare('UPDATE users SET account_status = ? WHERE user_id = ?')
    .run(status, userId);
  return Number(res.changes) > 0;
}

export function getAllWatchlistRows(): WatchlistRow[] {
  return db
    .prepare('SELECT watchlist_id, user_id, tmdb_movie_id, created_at FROM watchlist')
    .all() as unknown as WatchlistRow[];
}

export function getAllFavoriteGenreRows(): Array<{ user_id: number; favorite_genres: string }> {
  return db
    .prepare('SELECT user_id, favorite_genres FROM user_preferences')
    .all() as unknown as Array<{ user_id: number; favorite_genres: string }>;
}


