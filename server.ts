import 'dotenv/config';
import express, { type Request, type Response } from 'express';
import path from 'node:path';
import { createServer as createViteServer } from 'vite';
import {
  addModerationLog,
  addToWatchlist,
  db,
  deleteRating,
  getAllFavoriteGenreRows,
  getAllRatings,
  getAllWatchlistRows,
  getModerationLogs,
  getSystemStatus,
  getUserByEmailOrUsername,
  getUserById,
  getUserFavoriteGenres,
  getUserRatings,
  getUserWatchlist,
  hasAnyModerator,
  listAllUsersForModerator,
  removeFromWatchlistById,
  removeFromWatchlistByMovie,
  setUserAccountStatus,
  setUserFavoriteGenres,
  updateSystemStatus,
  upsertRating,
  type AccountStatus,
  type OperationalState,
} from './server/db.ts';
import {
  hashPassword,
  isModeratorPasscodeConfigured,
  optionalAuth,
  requireAuth,
  requireModerator,
  signToken,
  verifyModeratorPasscode,
  verifyPassword,
  type AuthenticatedRequest,
} from './server/auth.ts';
import {
  discoverMoviesUnified,
  getCatalogMode,
  getMovieDetailsUnified,
  getMovieGenresUnified,
  getPopularMoviesUnified,
  getPublicDomainMoviesUnified,
  getTrendingMoviesUnified,
  getWatchProvidersUnified,
  searchMoviesUnified,
} from './server/movieService.ts';
import { TmdbApiError, TmdbConfigError } from './server/tmdb.ts';
import { generateRecommendations } from './server/recommender.ts';

const PORT = 3000;

function handleError(res: Response, err: unknown): void {
  if (err instanceof TmdbConfigError) {
    res.status(503).json({ error: err.message, code: err.code });
    return;
  }
  if (err instanceof TmdbApiError) {
    res.status(err.status).json({ error: err.message, code: 'TMDB_API_ERROR' });
    return;
  }
  console.error('Server error:', err);
  res.status(500).json({ error: 'Internal server error.' });
}

function serializeSystemStatus() {
  const s = getSystemStatus();
  return {
    operational_state: s.operational_state,
    maintenance_banner: s.maintenance_banner,
    allow_registrations: s.allow_registrations === 1,
    allow_ratings: s.allow_ratings === 1,
    allow_watchlist: s.allow_watchlist === 1,
    updated_by: s.updated_by,
    updated_at: s.updated_at,
  };
}

function serializeUser(userId: number) {
  const user = getUserById(userId);
  if (!user) return null;
  const favoriteGenres = getUserFavoriteGenres(userId);
  const ratings = getUserRatings(userId);
  const watchlist = getUserWatchlist(userId);
  return {
    user_id: user.user_id,
    username: user.username,
    email: user.email,
    preferred_region: user.preferred_region,
    exclude_watched: user.exclude_watched === 1,
    role: user.role,
    account_status: user.account_status,
    created_at: user.created_at,
    favorite_genres: favoriteGenres,
    ratings,
    watchlist,
  };
}

async function startServer() {
  const app = express();
  app.use(express.json());
  app.use(optionalAuth);

  // Health & config status
  app.get('/api/health', (_req: Request, res: Response) => {
    const mode = getCatalogMode();
    res.json({
      status: 'ok',
      ...mode,
      systemStatus: serializeSystemStatus(),
    });
  });

  // --- AUTH ROUTES ---
  const handleRegister = (req: Request, res: Response) => {
    try {
      const sysStatus = getSystemStatus();
      if (sysStatus.operational_state === 'maintenance' || sysStatus.allow_registrations === 0) {
        res.status(503).json({
          error:
            sysStatus.maintenance_banner ||
            'New account registrations are currently paused by a system moderator.',
        });
        return;
      }

      const { username, email, password, favorite_genres } = req.body as {
        username?: string;
        email?: string;
        password?: string;
        favorite_genres?: number[];
      };

      const cleanUsername = (username || '').trim();
      const cleanEmail = (email || '').trim().toLowerCase();

      if (!cleanUsername || cleanUsername.length < 2) {
        res.status(400).json({ error: 'Username must be at least 2 characters.' });
        return;
      }
      if (!cleanEmail || !cleanEmail.includes('@')) {
        res.status(400).json({ error: 'Please enter a valid email address.' });
        return;
      }
      if (!password || password.length < 6) {
        res.status(400).json({ error: 'Password must be at least 6 characters.' });
        return;
      }

      const existing = db
        .prepare('SELECT user_id FROM users WHERE lower(email) = lower(?) OR lower(username) = lower(?)')
        .get(cleanEmail, cleanUsername);
      if (existing) {
        res.status(409).json({ error: 'An account with that email or username already exists.' });
        return;
      }

      const passwordHash = hashPassword(password);
      const insert = db
        .prepare(
          "INSERT INTO users (username, email, password_hash, preferred_region, role, account_status) VALUES (?, ?, ?, ?, 'user', 'active')"
        )
        .run(cleanUsername, cleanEmail, passwordHash, 'PH');

      const userId = Number(insert.lastInsertRowid);
      if (Array.isArray(favorite_genres) && favorite_genres.length > 0) {
        setUserFavoriteGenres(userId, favorite_genres);
      } else {
        setUserFavoriteGenres(userId, []);
      }

      const token = signToken(userId, cleanUsername, 'user');
      res.status(201).json({
        token,
        user: serializeUser(userId),
      });
    } catch (err) {
      handleError(res, err);
    }
  };

  const handleLogin = (req: Request, res: Response) => {
    try {
      const { identifier, email, username, password } = req.body as {
        identifier?: string;
        email?: string;
        username?: string;
        password?: string;
      };

      const lookup = (identifier || email || username || '').trim();
      if (!lookup || !password) {
        res.status(400).json({ error: 'Email/username and password are required.' });
        return;
      }

      const user = getUserByEmailOrUsername(lookup);
      if (!user || !verifyPassword(password, user.password_hash)) {
        res.status(401).json({ error: 'Invalid email/username or password.' });
        return;
      }
      if (user.account_status === 'suspended') {
        res.status(403).json({
          error: 'This account has been suspended by a system moderator.',
        });
        return;
      }

      const token = signToken(user.user_id, user.username, user.role);
      res.json({
        token,
        user: serializeUser(user.user_id),
      });
    } catch (err) {
      handleError(res, err);
    }
  };

  app.post('/api/register', handleRegister);
  app.post('/register', handleRegister);
  app.post('/api/login', handleLogin);
  app.post('/login', handleLogin);

  app.get('/api/me', requireAuth, (req: AuthenticatedRequest, res: Response) => {
    if (req.authUser!.userId === 0 && req.authUser!.role === 'moderator') {
      res.json({
        user: {
          user_id: 0,
          username: req.authUser!.username,
          email: 'moderator@cinematch.local',
          preferred_region: 'PH',
          exclude_watched: true,
          role: 'moderator',
          account_status: 'active',
          created_at: new Date().toISOString(),
          favorite_genres: [],
          ratings: [],
          watchlist: [],
        },
      });
      return;
    }

    const user = serializeUser(req.authUser!.userId);
    if (!user) {
      res.status(404).json({ error: 'User not found.' });
      return;
    }
    res.json({ user });
  });

  app.put('/api/profile', requireAuth, (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.authUser!.userId;
      const { username, email } = req.body as { username?: string; email?: string };
      const cleanUsername = (username || '').trim();
      const cleanEmail = (email || '').trim().toLowerCase();

      if (!cleanUsername || cleanUsername.length < 2) {
        res.status(400).json({ error: 'Username must be at least 2 characters.' });
        return;
      }
      if (!cleanEmail || !cleanEmail.includes('@')) {
        res.status(400).json({ error: 'Please enter a valid email address.' });
        return;
      }

      const conflict = db
        .prepare('SELECT user_id FROM users WHERE (lower(email) = lower(?) OR lower(username) = lower(?)) AND user_id != ?')
        .get(cleanEmail, cleanUsername, userId);
      if (conflict) {
        res.status(409).json({ error: 'Username or email is already in use.' });
        return;
      }

      db.prepare('UPDATE users SET username = ?, email = ? WHERE user_id = ?').run(
        cleanUsername,
        cleanEmail,
        userId
      );

      res.json({ user: serializeUser(userId) });
    } catch (err) {
      handleError(res, err);
    }
  });

  app.put('/api/preferences', requireAuth, (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.authUser!.userId;
      const { favorite_genres, preferred_region, exclude_watched } = req.body as {
        favorite_genres?: number[];
        preferred_region?: string;
        exclude_watched?: boolean;
      };

      if (Array.isArray(favorite_genres)) {
        setUserFavoriteGenres(userId, favorite_genres);
      }
      if (typeof preferred_region === 'string' && /^[A-Z]{2}$/.test(preferred_region)) {
        db.prepare('UPDATE users SET preferred_region = ? WHERE user_id = ?').run(
          preferred_region,
          userId
        );
      }
      if (typeof exclude_watched === 'boolean') {
        db.prepare('UPDATE users SET exclude_watched = ? WHERE user_id = ?').run(
          exclude_watched ? 1 : 0,
          userId
        );
      }

      res.json({ user: serializeUser(userId) });
    } catch (err) {
      handleError(res, err);
    }
  });

  // --- MOVIE CATALOG & PROXY ROUTES ---
  const handleGenres = async (_req: Request, res: Response) => {
    try {
      const genres = await getMovieGenresUnified();
      res.json({ genres });
    } catch (err) {
      handleError(res, err);
    }
  };
  app.get('/api/genres', handleGenres);

  const handlePopular = async (req: Request, res: Response) => {
    try {
      const page = Math.max(1, Number(req.query.page) || 1);
      const data = await getPopularMoviesUnified(page);
      res.json(data);
    } catch (err) {
      handleError(res, err);
    }
  };
  app.get('/api/movies/popular', handlePopular);
  app.get('/movies/popular', handlePopular);

  const handleTrending = async (req: Request, res: Response) => {
    try {
      const page = Math.max(1, Number(req.query.page) || 1);
      const data = await getTrendingMoviesUnified(page);
      res.json(data);
    } catch (err) {
      handleError(res, err);
    }
  };
  app.get('/api/movies/trending', handleTrending);
  app.get('/movies/trending', handleTrending);

  const handleSearch = async (req: Request, res: Response) => {
    try {
      const q = String(req.query.q || req.query.query || '').trim();
      const page = Math.max(1, Number(req.query.page) || 1);
      const year = req.query.year ? Number(req.query.year) : undefined;
      if (!q) {
        res.status(400).json({ error: 'Search query parameter q is required.' });
        return;
      }
      const data = await searchMoviesUnified(q, page, year);
      res.json(data);
    } catch (err) {
      handleError(res, err);
    }
  };
  app.get('/api/movies/search', handleSearch);
  app.get('/movies/search', handleSearch);

  app.get('/api/movies/discover', async (req: Request, res: Response) => {
    try {
      const page = Math.max(1, Number(req.query.page) || 1);
      const genre = req.query.genre ? String(req.query.genre) : undefined;
      const year = req.query.year ? Number(req.query.year) : undefined;
      const minRating = req.query.minRating ? Number(req.query.minRating) : undefined;
      const sortBy = req.query.sortBy ? String(req.query.sortBy) : 'popularity.desc';
      const data = await discoverMoviesUnified({ page, genre, year, minRating, sortBy });
      res.json(data);
    } catch (err) {
      handleError(res, err);
    }
  });

  app.get('/api/movies/public-domain', async (req: Request, res: Response) => {
    try {
      const page = Math.max(1, Number(req.query.page) || 1);
      const q = req.query.q ? String(req.query.q).trim() : undefined;
      const genreId = req.query.genre ? Number(req.query.genre) : undefined;
      const year = req.query.year ? Number(req.query.year) : undefined;
      const data = await getPublicDomainMoviesUnified({
        query: q,
        genreId: genreId && Number.isInteger(genreId) ? genreId : undefined,
        year: year && Number.isInteger(year) ? year : undefined,
        page,
      });
      res.json(data);
    } catch (err) {
      handleError(res, err);
    }
  });

  const handleMovieDetail = async (req: Request, res: Response) => {
    try {
      const movieId = Number(req.params.movie_id);
      if (!Number.isInteger(movieId) || movieId <= 0) {
        res.status(400).json({ error: 'Invalid movie ID.' });
        return;
      }
      const data = await getMovieDetailsUnified(movieId);
      res.json(data);
    } catch (err) {
      handleError(res, err);
    }
  };
  app.get('/api/movies/:movie_id', handleMovieDetail);
  app.get('/movies/:movie_id', handleMovieDetail);

  const handleWatchProviders = async (req: Request, res: Response) => {
    try {
      const movieId = Number(req.params.movie_id);
      const region = String(req.query.region || 'PH').toUpperCase();
      if (!Number.isInteger(movieId) || movieId <= 0) {
        res.status(400).json({ error: 'Invalid movie ID.' });
        return;
      }
      const data = await getWatchProvidersUnified(movieId);
      const regional = data.results?.[region] || null;
      const availableRegions = Object.keys(data.results || {});
      res.json({
        movie_id: movieId,
        region,
        providers: regional,
        availableRegions,
      });
    } catch (err) {
      handleError(res, err);
    }
  };
  app.get('/api/movies/:movie_id/watch-providers', handleWatchProviders);
  app.get('/movies/:movie_id/watch-providers', handleWatchProviders);

  // --- RECOMMENDATIONS ROUTE ---
  const handleRecommendations = async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = Number(req.params.user_id);
      if (!Number.isInteger(userId) || userId <= 0) {
        res.status(400).json({ error: 'Invalid user ID.' });
        return;
      }
      const result = await generateRecommendations(userId);
      res.json(result);
    } catch (err) {
      handleError(res, err);
    }
  };
  app.get('/api/recommendations/:user_id', handleRecommendations);
  app.get('/recommendations/:user_id', handleRecommendations);

  // Guest/Public recommendations fallback using query genres (popularity-based)
  app.get('/api/recommendations', async (req: Request, res: Response) => {
    try {
      const genreQuery = String(req.query.genres || '');
      const genreIds = genreQuery
        .split(',')
        .map((s) => Number(s.trim()))
        .filter((n) => Number.isInteger(n) && n > 0);
      const genres = await getMovieGenresUnified();
      const genreMap = new Map(genres.map((g) => [g.id, g.name]));
      const data = genreIds.length > 0
        ? await discoverMoviesUnified({ genre: genreIds.join('|'), sortBy: 'popularity.desc', page: 1 })
        : await getPopularMoviesUnified(1);

      const recommendations = (data.results || []).slice(0, 10).map((m, idx) => ({
        ...m,
        genres: (m.genre_ids || [])
          .map((gid) => ({ id: gid, name: genreMap.get(gid) || '' }))
          .filter((g) => g.name !== ''),
        finalScore: Number((1 - idx * 0.05).toFixed(4)),
        collaborativeScore: 0,
        contentScore: 0,
        popularityScore: Number((1 - idx * 0.05).toFixed(4)),
        recommendationMode: 'popularity-fallback' as const,
        reason: genreIds.length > 0 ? 'Popular in your selected genres' : 'Most popular movies right now',
      }));

      res.json({
        userId: null,
        mode: 'popularity-fallback',
        formula: 'Popularity-Based Fallback',
        favoriteGenres: genreIds.map((id) => ({ id, name: genreMap.get(id) || '' })).filter((g) => g.name),
        recommendations,
      });
    } catch (err) {
      handleError(res, err);
    }
  });

  // --- RATINGS ROUTES ---
  const handlePostRating = (req: AuthenticatedRequest, res: Response) => {
    try {
      const sysStatus = getSystemStatus();
      if (
        req.authUser!.role !== 'moderator' &&
        (sysStatus.operational_state === 'maintenance' || sysStatus.allow_ratings === 0)
      ) {
        res.status(503).json({
          error: 'Movie ratings are currently paused by a system moderator.',
        });
        return;
      }

      const userId = req.authUser!.userId;
      if (userId <= 0) {
        res.status(400).json({ error: 'Sign in with a standard or claimed moderator account to rate movies.' });
        return;
      }
      const { tmdb_movie_id, rating_score } = req.body as {
        tmdb_movie_id?: number;
        rating_score?: number;
      };
      const movieId = Number(tmdb_movie_id);
      const score = Number(rating_score);
      if (!Number.isInteger(movieId) || movieId <= 0) {
        res.status(400).json({ error: 'Valid tmdb_movie_id is required.' });
        return;
      }
      if (Number.isNaN(score) || score < 0.5 || score > 5) {
        res.status(400).json({ error: 'rating_score must be between 0.5 and 5.' });
        return;
      }
      const saved = upsertRating(userId, movieId, score);
      res.status(201).json({ rating: saved });
    } catch (err) {
      handleError(res, err);
    }
  };
  app.post('/api/ratings', requireAuth, handlePostRating);
  app.post('/ratings', requireAuth, handlePostRating);

  app.get('/api/ratings/:user_id', async (req: Request, res: Response) => {
    try {
      const userId = Number(req.params.user_id);
      if (!Number.isInteger(userId) || userId <= 0) {
        res.status(400).json({ error: 'Invalid user ID.' });
        return;
      }
      const rows = getUserRatings(userId);
      const hydrate = req.query.hydrate === '1';
      if (!hydrate) {
        res.json({ ratings: rows });
        return;
      }
      const hydrated = await Promise.all(
        rows.map(async (row) => {
          try {
            const movie = await getMovieDetailsUnified(row.tmdb_movie_id);
            return { ...row, movie };
          } catch {
            return { ...row, movie: null };
          }
        })
      );
      res.json({ ratings: hydrated });
    } catch (err) {
      handleError(res, err);
    }
  });

  app.delete('/api/ratings/:tmdb_movie_id', requireAuth, (req: AuthenticatedRequest, res: Response) => {
    const userId = req.authUser!.userId;
    const movieId = Number(req.params.tmdb_movie_id);
    const removed = deleteRating(userId, movieId);
    res.json({ removed });
  });

  // --- WATCHLIST ROUTES ---
  const handleGetWatchlist = async (req: Request, res: Response) => {
    try {
      const userId = Number(req.params.user_id);
      if (!Number.isInteger(userId) || userId <= 0) {
        res.status(400).json({ error: 'Invalid user ID.' });
        return;
      }
      const rows = getUserWatchlist(userId);
      const hydrate = req.query.hydrate !== '0';
      if (!hydrate) {
        res.json({ watchlist: rows });
        return;
      }
      const hydrated = await Promise.all(
        rows.map(async (row) => {
          try {
            const movie = await getMovieDetailsUnified(row.tmdb_movie_id);
            return { ...row, movie };
          } catch {
            return { ...row, movie: null };
          }
        })
      );
      res.json({ watchlist: hydrated });
    } catch (err) {
      handleError(res, err);
    }
  };
  app.get('/api/watchlist/:user_id', handleGetWatchlist);
  app.get('/watchlist/:user_id', handleGetWatchlist);

  const handleAddWatchlist = (req: AuthenticatedRequest, res: Response) => {
    try {
      const sysStatus = getSystemStatus();
      if (
        req.authUser!.role !== 'moderator' &&
        (sysStatus.operational_state === 'maintenance' || sysStatus.allow_watchlist === 0)
      ) {
        res.status(503).json({
          error: 'Watchlist updates are currently paused by a system moderator.',
        });
        return;
      }

      const userId = req.authUser!.userId;
      if (userId <= 0) {
        res.status(400).json({ error: 'Sign in with a user or claimed moderator account to manage a watchlist.' });
        return;
      }
      const { tmdb_movie_id } = req.body as { tmdb_movie_id?: number };
      const movieId = Number(tmdb_movie_id);
      if (!Number.isInteger(movieId) || movieId <= 0) {
        res.status(400).json({ error: 'Valid tmdb_movie_id is required.' });
        return;
      }
      const item = addToWatchlist(userId, movieId);
      res.status(201).json({ item });
    } catch (err) {
      handleError(res, err);
    }
  };
  app.post('/api/watchlist', requireAuth, handleAddWatchlist);
  app.post('/watchlist', requireAuth, handleAddWatchlist);

  const handleDeleteWatchlist = (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.authUser!.userId;
      const watchlistId = Number(req.params.watchlist_id);
      if (!Number.isInteger(watchlistId) || watchlistId <= 0) {
        res.status(400).json({ error: 'Invalid watchlist ID.' });
        return;
      }
      const removed = removeFromWatchlistById(watchlistId, userId);
      if (!removed) {
        res.status(404).json({ error: 'Watchlist entry not found.' });
        return;
      }
      res.json({ removed: true, watchlist_id: watchlistId });
    } catch (err) {
      handleError(res, err);
    }
  };
  app.delete('/api/watchlist/:watchlist_id', requireAuth, handleDeleteWatchlist);
  app.delete('/watchlist/:watchlist_id', requireAuth, handleDeleteWatchlist);

  app.delete('/api/watchlist/movie/:tmdb_movie_id', requireAuth, (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.authUser!.userId;
      const movieId = Number(req.params.tmdb_movie_id);
      const removed = removeFromWatchlistByMovie(userId, movieId);
      res.json({ removed });
    } catch (err) {
      handleError(res, err);
    }
  });

  // --- MODERATOR ACCOUNT & OVERSIGHT ROUTES ---
  app.get('/api/moderator/bootstrap-status', (_req: Request, res: Response) => {
    res.json({
      hasModerator: hasAnyModerator(),
      passcodeConfigured: isModeratorPasscodeConfigured(),
    });
  });

  app.post('/api/moderator/claim', (req: Request, res: Response) => {
    try {
      if (isModeratorPasscodeConfigured()) {
        res.status(403).json({
          error: 'MODERATOR_PASSCODE is configured on the server. Sign in using the moderator passcode.',
        });
        return;
      }
      if (hasAnyModerator()) {
        res.status(409).json({
          error: 'A moderator account has already been claimed. Sign in with your moderator credentials.',
        });
        return;
      }

      const { username, email, password } = req.body as {
        username?: string;
        email?: string;
        password?: string;
      };
      const cleanUsername = (username || '').trim();
      const cleanEmail = (email || '').trim().toLowerCase();

      if (!cleanUsername || cleanUsername.length < 2) {
        res.status(400).json({ error: 'Moderator username must be at least 2 characters.' });
        return;
      }
      if (!cleanEmail || !cleanEmail.includes('@')) {
        res.status(400).json({ error: 'Please enter a valid moderator email address.' });
        return;
      }
      if (!password || password.length < 8) {
        res.status(400).json({ error: 'Moderator password must be at least 8 characters.' });
        return;
      }

      const conflict = db
        .prepare('SELECT user_id FROM users WHERE lower(email) = lower(?) OR lower(username) = lower(?)')
        .get(cleanEmail, cleanUsername);
      if (conflict) {
        res.status(409).json({ error: 'That username or email is already taken by an existing user.' });
        return;
      }

      const passwordHash = hashPassword(password);
      const insert = db
        .prepare(
          "INSERT INTO users (username, email, password_hash, preferred_region, role, account_status) VALUES (?, ?, ?, 'PH', 'moderator', 'active')"
        )
        .run(cleanUsername, cleanEmail, passwordHash);

      const userId = Number(insert.lastInsertRowid);
      setUserFavoriteGenres(userId, []);
      addModerationLog(cleanUsername, 'CLAIM_MODERATOR', cleanUsername, 'Initial moderator account claimed');

      const token = signToken(userId, cleanUsername, 'moderator');
      res.status(201).json({
        token,
        user: serializeUser(userId),
      });
    } catch (err) {
      handleError(res, err);
    }
  });

  app.post('/api/moderator/login', (req: Request, res: Response) => {
    try {
      const { identifier, password, passcode } = req.body as {
        identifier?: string;
        password?: string;
        passcode?: string;
      };

      if (passcode && passcode.trim()) {
        if (!isModeratorPasscodeConfigured()) {
          res.status(400).json({ error: 'Server moderator passcode is not configured.' });
          return;
        }
        if (!verifyModeratorPasscode(passcode.trim())) {
          res.status(401).json({ error: 'Invalid moderator passcode.' });
          return;
        }
        const token = signToken(0, 'Moderator', 'moderator');
        res.json({
          token,
          user: {
            user_id: 0,
            username: 'Moderator',
            email: 'moderator@cinematch.local',
            preferred_region: 'PH',
            exclude_watched: true,
            role: 'moderator',
            account_status: 'active',
            created_at: new Date().toISOString(),
            favorite_genres: [],
            ratings: [],
            watchlist: [],
          },
        });
        return;
      }

      const lookup = (identifier || '').trim();
      if (!lookup || !password) {
        res.status(400).json({ error: 'Moderator credentials are required.' });
        return;
      }

      const user = getUserByEmailOrUsername(lookup);
      if (!user || !verifyPassword(password, user.password_hash)) {
        res.status(401).json({ error: 'Invalid moderator credentials.' });
        return;
      }
      if (user.role !== 'moderator') {
        res.status(403).json({ error: 'This account does not have moderator privileges.' });
        return;
      }
      if (user.account_status === 'suspended') {
        res.status(403).json({ error: 'This moderator account is suspended.' });
        return;
      }

      const token = signToken(user.user_id, user.username, 'moderator');
      res.json({
        token,
        user: serializeUser(user.user_id),
      });
    } catch (err) {
      handleError(res, err);
    }
  });

  app.get('/api/moderator/overview', requireModerator, async (_req: AuthenticatedRequest, res: Response) => {
    try {
      const users = listAllUsersForModerator();
      const allRatings = getAllRatings();
      const allWatchlist = getAllWatchlistRows();
      const prefRows = getAllFavoriteGenreRows();
      const genres = await getMovieGenresUnified();
      const genreNameMap = new Map<number, string>(genres.map((g) => [g.id, g.name]));

      const totalUsers = users.length;
      const activeUsers = users.filter((u) => u.account_status === 'active').length;
      const suspendedUsers = users.filter((u) => u.account_status === 'suspended').length;
      const moderatorCount = users.filter((u) => u.role === 'moderator').length;

      const totalRatings = allRatings.length;
      const averageSystemRating =
        totalRatings > 0
          ? Number(
              (allRatings.reduce((acc, r) => acc + r.rating_score, 0) / totalRatings).toFixed(2)
            )
          : 0;

      // Aggregate Genre Trends
      const genreCounts = new Map<number, number>();
      let usersWithGenres = 0;
      for (const row of prefRows) {
        try {
          const parsed = JSON.parse(row.favorite_genres);
          if (Array.isArray(parsed) && parsed.length > 0) {
            usersWithGenres++;
            for (const gid of parsed) {
              if (typeof gid === 'number') {
                genreCounts.set(gid, (genreCounts.get(gid) || 0) + 1);
              }
            }
          }
        } catch {
          // ignore malformed row
        }
      }

      const genreTrends = Array.from(genreCounts.entries())
        .map(([genreId, userCount]) => ({
          genreId,
          genreName: genreNameMap.get(genreId) || `Genre #${genreId}`,
          userCount,
          sharePercent: usersWithGenres > 0 ? Math.round((userCount / usersWithGenres) * 100) : 0,
        }))
        .sort((a, b) => b.userCount - a.userCount);

      // Aggregate Movie Trends across ratings & watchlists
      const movieAgg = new Map<
        number,
        { ratingsCount: number; ratingSum: number; watchlistCount: number }
      >();
      for (const r of allRatings) {
        const cur = movieAgg.get(r.tmdb_movie_id) || {
          ratingsCount: 0,
          ratingSum: 0,
          watchlistCount: 0,
        };
        cur.ratingsCount += 1;
        cur.ratingSum += r.rating_score;
        movieAgg.set(r.tmdb_movie_id, cur);
      }
      for (const w of allWatchlist) {
        const cur = movieAgg.get(w.tmdb_movie_id) || {
          ratingsCount: 0,
          ratingSum: 0,
          watchlistCount: 0,
        };
        cur.watchlistCount += 1;
        movieAgg.set(w.tmdb_movie_id, cur);
      }

      const topMovieStats = Array.from(movieAgg.entries())
        .map(([movieId, stats]) => ({
          movieId,
          ratingsCount: stats.ratingsCount,
          avgRating:
            stats.ratingsCount > 0
              ? Number((stats.ratingSum / stats.ratingsCount).toFixed(2))
              : null,
          watchlistCount: stats.watchlistCount,
          trendScore: stats.ratingsCount * 2 + stats.watchlistCount,
        }))
        .sort((a, b) => b.trendScore - a.trendScore)
        .slice(0, 10);

      const movieTrends = await Promise.all(
        topMovieStats.map(async (item) => {
          try {
            const detail = await getMovieDetailsUnified(item.movieId);
            return {
              ...item,
              title: detail.title,
              poster_path: detail.poster_path,
              release_date: detail.release_date,
            };
          } catch {
            return {
              ...item,
              title: `Movie #${item.movieId}`,
              poster_path: null,
              release_date: '',
            };
          }
        })
      );

      // Region breakdown
      const regionCounts = new Map<string, number>();
      for (const u of users) {
        const reg = u.preferred_region || 'PH';
        regionCounts.set(reg, (regionCounts.get(reg) || 0) + 1);
      }
      const regionDistribution = Array.from(regionCounts.entries())
        .map(([region, count]) => ({ region, count }))
        .sort((a, b) => b.count - a.count);

      res.json({
        summary: {
          totalUsers,
          activeUsers,
          suspendedUsers,
          moderatorCount,
          totalRatings,
          averageSystemRating,
          totalWatchlistSaves: allWatchlist.length,
          uniqueMoviesEngaged: movieAgg.size,
        },
        genreTrends,
        movieTrends,
        regionDistribution,
        systemStatus: serializeSystemStatus(),
        catalogMode: getCatalogMode(),
        recentLogs: getModerationLogs(25),
      });
    } catch (err) {
      handleError(res, err);
    }
  });

  app.get('/api/moderator/users', requireModerator, (_req: AuthenticatedRequest, res: Response) => {
    try {
      const users = listAllUsersForModerator();
      res.json({ users });
    } catch (err) {
      handleError(res, err);
    }
  });

  app.patch('/api/moderator/users/:user_id/status', requireModerator, (req: AuthenticatedRequest, res: Response) => {
    try {
      const targetUserId = Number(req.params.user_id);
      const { account_status } = req.body as { account_status?: AccountStatus };

      if (!Number.isInteger(targetUserId) || targetUserId <= 0) {
        res.status(400).json({ error: 'Invalid user ID.' });
        return;
      }
      if (account_status !== 'active' && account_status !== 'suspended') {
        res.status(400).json({ error: "account_status must be 'active' or 'suspended'." });
        return;
      }
      if (targetUserId === req.authUser!.userId && account_status === 'suspended') {
        res.status(400).json({ error: 'You cannot suspend your own active moderator account.' });
        return;
      }

      const target = getUserById(targetUserId);
      if (!target) {
        res.status(404).json({ error: 'User not found.' });
        return;
      }

      setUserAccountStatus(targetUserId, account_status);
      addModerationLog(
        req.authUser!.username,
        account_status === 'suspended' ? 'SUSPEND_USER' : 'ACTIVATE_USER',
        target.username,
        `Updated status to ${account_status}`
      );

      res.json({
        updated: true,
        user_id: targetUserId,
        account_status,
      });
    } catch (err) {
      handleError(res, err);
    }
  });

  app.put('/api/moderator/system-status', requireModerator, (req: AuthenticatedRequest, res: Response) => {
    try {
      const {
        operational_state,
        maintenance_banner,
        allow_registrations,
        allow_ratings,
        allow_watchlist,
      } = req.body as {
        operational_state?: OperationalState;
        maintenance_banner?: string;
        allow_registrations?: boolean;
        allow_ratings?: boolean;
        allow_watchlist?: boolean;
      };

      if (
        operational_state !== undefined &&
        operational_state !== 'operational' &&
        operational_state !== 'degraded' &&
        operational_state !== 'maintenance'
      ) {
        res.status(400).json({ error: 'Invalid operational_state.' });
        return;
      }

      const cleanBanner =
        typeof maintenance_banner === 'string'
          ? maintenance_banner.trim().slice(0, 280)
          : undefined;

      const updated = updateSystemStatus({
        operational_state,
        maintenance_banner: cleanBanner,
        allow_registrations: typeof allow_registrations === 'boolean' ? allow_registrations : undefined,
        allow_ratings: typeof allow_ratings === 'boolean' ? allow_ratings : undefined,
        allow_watchlist: typeof allow_watchlist === 'boolean' ? allow_watchlist : undefined,
        updated_by: req.authUser!.username,
      });

      addModerationLog(
        req.authUser!.username,
        'UPDATE_SYSTEM_STATUS',
        updated.operational_state.toUpperCase(),
        `Registrations=${updated.allow_registrations}, Ratings=${updated.allow_ratings}, Watchlist=${updated.allow_watchlist}`
      );

      res.json({ systemStatus: serializeSystemStatus() });
    } catch (err) {
      handleError(res, err);
    }
  });

  // Vite middleware in development, static dist in production
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('/{*splat}', (_req: Request, res: Response) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`CineMatch server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start CineMatch server:', err);
  process.exit(1);
});
