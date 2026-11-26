import {
  getAllRatings,
  getUserById,
  getUserFavoriteGenres,
  getUserRatings,
  getUserWatchlist,
  type RatingRow,
} from './db.ts';
import {
  discoverMoviesUnified,
  getMovieDetailsUnified,
  getMovieGenresUnified,
  getPopularMoviesUnified,
  getSimilarMoviesUnified,
  getTrendingMoviesUnified,
} from './movieService.ts';
import type { TmdbGenre, TmdbMovieDetail, TmdbMovieSummary } from './tmdb.ts';

export interface RecommendedMovieItem extends TmdbMovieSummary {
  genres: TmdbGenre[];
  finalScore: number;
  collaborativeScore: number;
  contentScore: number;
  popularityScore: number;
  recommendationMode: 'hybrid' | 'content-popularity' | 'popularity-fallback';
  reason: string;
}

export interface RecommendationResult {
  userId: number;
  mode: 'hybrid' | 'content-popularity' | 'popularity-fallback';
  formula: string;
  favoriteGenres: TmdbGenre[];
  recommendations: RecommendedMovieItem[];
}

const STOPWORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of',
  'with', 'by', 'from', 'as', 'is', 'was', 'are', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should',
  'this', 'that', 'these', 'those', 'it', 'its', 'his', 'her', 'their', 'they',
  'he', 'she', 'who', 'whom', 'which', 'what', 'when', 'where', 'why', 'how',
  'into', 'after', 'before', 'over', 'under', 'between', 'out', 'up', 'down',
  'one', 'two', 'new', 'life', 'world', 'story', 'man', 'woman', 'young',
]);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOPWORDS.has(w));
}

function addWeightedTokens(bag: Map<string, number>, tokens: string[], weight: number): void {
  for (const t of tokens) {
    bag.set(t, (bag.get(t) || 0) + weight);
  }
}

function buildMovieDocument(movie: TmdbMovieSummary | TmdbMovieDetail, genreMap: Map<number, string>): Map<string, number> {
  const bag = new Map<string, number>();

  const genreNames: string[] = [];
  if ('genres' in movie && Array.isArray(movie.genres)) {
    for (const g of movie.genres) genreNames.push(g.name);
  }
  if (Array.isArray(movie.genre_ids)) {
    for (const gid of movie.genre_ids) {
      const name = genreMap.get(gid);
      if (name) genreNames.push(name);
    }
  }
  for (const gName of genreNames) {
    addWeightedTokens(bag, [`genre_${gName.toLowerCase().replace(/\s+/g, '_')}`], 3.0);
  }

  if ('credits' in movie && movie.credits) {
    const directors = movie.credits.crew.filter((c) => c.job === 'Director').slice(0, 2);
    for (const d of directors) {
      addWeightedTokens(bag, [`director_${d.name.toLowerCase().replace(/\s+/g, '_')}`], 3.0);
    }
    const topCast = movie.credits.cast.slice(0, 6);
    for (const actor of topCast) {
      addWeightedTokens(bag, [`cast_${actor.name.toLowerCase().replace(/\s+/g, '_')}`], 2.0);
    }
  }

  if ('keywords' in movie && movie.keywords?.keywords) {
    for (const kw of movie.keywords.keywords.slice(0, 12)) {
      addWeightedTokens(bag, [`kw_${kw.name.toLowerCase().replace(/\s+/g, '_')}`], 2.0);
    }
  }

  if (movie.overview) {
    addWeightedTokens(bag, tokenize(movie.overview), 1.0);
  }
  if (movie.title) {
    addWeightedTokens(bag, tokenize(movie.title), 1.2);
  }

  return bag;
}

function computeTfIdfVectors(docs: Map<number, Map<string, number>>): Map<number, Map<string, number>> {
  const docCount = docs.size;
  const df = new Map<string, number>();

  for (const bag of docs.values()) {
    for (const term of bag.keys()) {
      df.set(term, (df.get(term) || 0) + 1);
    }
  }

  const vectors = new Map<number, Map<string, number>>();
  for (const [docId, bag] of docs.entries()) {
    const vec = new Map<string, number>();
    let totalWeight = 0;
    for (const w of bag.values()) totalWeight += w;
    if (totalWeight === 0) {
      vectors.set(docId, vec);
      continue;
    }

    for (const [term, count] of bag.entries()) {
      const tf = count / totalWeight;
      const idf = Math.log((docCount + 1) / ((df.get(term) || 0) + 1)) + 1;
      vec.set(term, tf * idf);
    }
    vectors.set(docId, vec);
  }

  return vectors;
}

function cosineSimilarity(a: Map<string, number>, b: Map<string, number>): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (const val of a.values()) normA += val * val;
  for (const val of b.values()) normB += val * val;

  if (normA === 0 || normB === 0) return 0;

  const [smaller, larger] = a.size < b.size ? [a, b] : [b, a];
  for (const [term, val] of smaller.entries()) {
    const other = larger.get(term);
    if (other !== undefined) {
      dot += val * other;
    }
  }

  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

function normalizeMap(rawScores: Map<number, number>): Map<number, number> {
  const result = new Map<number, number>();
  if (rawScores.size === 0) return result;

  let min = Infinity;
  let max = -Infinity;
  for (const val of rawScores.values()) {
    if (val < min) min = val;
    if (val > max) max = val;
  }

  const range = max - min;
  for (const [id, val] of rawScores.entries()) {
    if (range <= 1e-9) {
      result.set(id, val > 0 ? 0.5 : 0);
    } else {
      result.set(id, (val - min) / range);
    }
  }
  return result;
}

function computeCollaborativeScores(
  targetUserId: number,
  candidateIds: number[],
  allRatings: RatingRow[]
): { scores: Map<number, number>; hasCollaborativeSignal: boolean } {
  const scores = new Map<number, number>();
  const byUser = new Map<number, Map<number, number>>();

  for (const r of allRatings) {
    let map = byUser.get(r.user_id);
    if (!map) {
      map = new Map<number, number>();
      byUser.set(r.user_id, map);
    }
    map.set(r.tmdb_movie_id, r.rating_score);
  }

  const targetRatings = byUser.get(targetUserId);
  if (!targetRatings || targetRatings.size === 0 || byUser.size < 2) {
    for (const cid of candidateIds) scores.set(cid, 0);
    return { scores, hasCollaborativeSignal: false };
  }

  let targetSum = 0;
  for (const v of targetRatings.values()) targetSum += v;
  const targetMean = targetSum / targetRatings.size;

  // Compute user-based centered cosine similarity with neighbors
  const similarities: Array<{ userId: number; sim: number; mean: number; ratings: Map<number, number> }> = [];

  for (const [otherId, otherRatings] of byUser.entries()) {
    if (otherId === targetUserId || otherRatings.size === 0) continue;

    let otherSum = 0;
    for (const v of otherRatings.values()) otherSum += v;
    const otherMean = otherSum / otherRatings.size;

    let dot = 0;
    let normTarget = 0;
    let normOther = 0;
    let overlapCount = 0;

    for (const [movieId, tScore] of targetRatings.entries()) {
      const oScore = otherRatings.get(movieId);
      if (oScore !== undefined) {
        overlapCount++;
        const dt = tScore - targetMean;
        const do_ = oScore - otherMean;
        // If users have uniform ratings (e.g. both gave 5), fallback to raw affinity
        if (dt === 0 && do_ === 0) {
          dot += tScore * oScore;
          normTarget += tScore * tScore;
          normOther += oScore * oScore;
        } else {
          dot += dt * do_;
          normTarget += dt * dt;
          normOther += do_ * do_;
        }
      }
    }

    if (overlapCount > 0 && normTarget > 0 && normOther > 0) {
      const sim = dot / (Math.sqrt(normTarget) * Math.sqrt(normOther));
      if (sim > 0) {
        similarities.push({ userId: otherId, sim, mean: otherMean, ratings: otherRatings });
      }
    }
  }

  if (similarities.length === 0) {
    for (const cid of candidateIds) scores.set(cid, 0);
    return { scores, hasCollaborativeSignal: false };
  }

  let anyPrediction = false;
  for (const cid of candidateIds) {
    let weightedSum = 0;
    let simSum = 0;
    for (const neighbor of similarities) {
      const nRating = neighbor.ratings.get(cid);
      if (nRating !== undefined) {
        weightedSum += neighbor.sim * (nRating - neighbor.mean);
        simSum += Math.abs(neighbor.sim);
      }
    }
    if (simSum > 0) {
      anyPrediction = true;
      scores.set(cid, targetMean + weightedSum / simSum);
    } else {
      scores.set(cid, 0);
    }
  }

  return { scores, hasCollaborativeSignal: anyPrediction };
}

export async function generateRecommendations(userId: number): Promise<RecommendationResult> {
  const user = getUserById(userId);
  const favoriteGenreIds = getUserFavoriteGenres(userId);
  const userRatings = getUserRatings(userId);
  const userWatchlist = getUserWatchlist(userId);
  const allRatings = getAllRatings();
  const excludeWatched = user ? user.exclude_watched === 1 : true;

  const allGenres = await getMovieGenresUnified();
  const genreMap = new Map<number, string>(allGenres.map((g) => [g.id, g.name]));
  const favoriteGenres = favoriteGenreIds
    .map((id) => ({ id, name: genreMap.get(id) || '' }))
    .filter((g) => g.name !== '');

  const excludedIds = new Set<number>(userRatings.map((r) => r.tmdb_movie_id));
  if (excludeWatched) {
    for (const w of userWatchlist) {
      excludedIds.add(w.tmdb_movie_id);
    }
  }

  // Gather candidate pool from Popular, Trending, Genre Discover, and Similar to top-rated movies
  const candidateMap = new Map<number, TmdbMovieSummary>();
  const addCandidates = (list: TmdbMovieSummary[]) => {
    for (const m of list) {
      if (m && m.id && !excludedIds.has(m.id) && !candidateMap.has(m.id)) {
        candidateMap.set(m.id, m);
      }
    }
  };

  const [popular1, popular2, trending1] = await Promise.all([
    getPopularMoviesUnified(1),
    getPopularMoviesUnified(2),
    getTrendingMoviesUnified(1),
  ]);
  addCandidates(popular1.results);
  addCandidates(popular2.results);
  addCandidates(trending1.results);

  if (favoriteGenreIds.length > 0) {
    const genreDisc = await discoverMoviesUnified({
      genre: favoriteGenreIds.slice(0, 3).join('|'),
      sortBy: 'popularity.desc',
      page: 1,
    });
    addCandidates(genreDisc.results);
  }

  // Add similar movies for user's top 3 rated movies (>= 3.5)
  const likedRatings = userRatings
    .filter((r) => r.rating_score >= 3.5)
    .sort((a, b) => b.rating_score - a.rating_score)
    .slice(0, 3);

  if (likedRatings.length > 0) {
    const similarResults = await Promise.allSettled(
      likedRatings.map((r) => getSimilarMoviesUnified(r.tmdb_movie_id))
    );
    for (const res of similarResults) {
      if (res.status === 'fulfilled') {
        addCandidates(res.value.results);
      }
    }
  }

  const candidates = Array.from(candidateMap.values()).slice(0, 60);

  // Popularity-based fallback when user has no rating history
  if (userRatings.length === 0) {
    const rawPopularity = new Map<number, number>();
    for (const m of candidates) {
      const mGenres = m.genre_ids || [];
      const genreMatches = favoriteGenreIds.filter((gid) => mGenres.includes(gid)).length;
      const genreBoost = favoriteGenreIds.length > 0 ? (genreMatches > 0 ? 1.5 + genreMatches * 0.35 : 0.4) : 1.0;
      const bayesQuality = (m.vote_average / 10) * Math.min(1, Math.log10((m.vote_count || 1) + 1) / 3.5);
      const popLog = Math.log10((m.popularity || 1) + 1);
      rawPopularity.set(m.id, (popLog * 0.45 + bayesQuality * 4.0) * genreBoost);
    }
    const normPop = normalizeMap(rawPopularity);

    const ranked = candidates
      .map((m) => {
        const pScore = normPop.get(m.id) || 0;
        const mGenres = (m.genre_ids || [])
          .map((gid) => ({ id: gid, name: genreMap.get(gid) || '' }))
          .filter((g) => g.name !== '');
        const matchingNames = mGenres
          .filter((g) => favoriteGenreIds.includes(g.id))
          .map((g) => g.name);

        const reason =
          matchingNames.length > 0
            ? `Popular in ${matchingNames.slice(0, 2).join(' & ')}`
            : 'Trending & highly rated globally';

        return {
          ...m,
          genres: mGenres,
          finalScore: Number(pScore.toFixed(4)),
          collaborativeScore: 0,
          contentScore: 0,
          popularityScore: Number(pScore.toFixed(4)),
          recommendationMode: 'popularity-fallback' as const,
          reason,
        };
      })
      .sort((a, b) => b.finalScore - a.finalScore)
      .slice(0, 10);

    return {
      userId,
      mode: 'popularity-fallback',
      formula: 'Popularity-Based Fallback (filtered by favorite genres)',
      favoriteGenres,
      recommendations: ranked,
    };
  }

  // Enrich top 28 candidates + user's liked movies (up to 6) with full details/credits/keywords for TF-IDF
  const topCandidatesForDetail = candidates.slice(0, 28);
  const ratedMovieIds = userRatings.slice(0, 6).map((r) => r.tmdb_movie_id);

  const detailFetches = await Promise.allSettled([
    ...topCandidatesForDetail.map((m) => getMovieDetailsUnified(m.id)),
    ...ratedMovieIds.map((id) => getMovieDetailsUnified(id)),
  ]);

  const detailMap = new Map<number, TmdbMovieDetail>();
  for (const res of detailFetches) {
    if (res.status === 'fulfilled' && res.value?.id) {
      detailMap.set(res.value.id, res.value);
    }
  }

  // Build TF-IDF documents across candidates + rated movies
  const docBags = new Map<number, Map<string, number>>();
  for (const m of candidates) {
    const detailed = detailMap.get(m.id) || m;
    docBags.set(m.id, buildMovieDocument(detailed, genreMap));
  }
  for (const rId of ratedMovieIds) {
    const detailed = detailMap.get(rId);
    if (detailed) {
      docBags.set(rId, buildMovieDocument(detailed, genreMap));
    }
  }

  const tfidfVectors = computeTfIdfVectors(docBags);

  // Build User Content Profile Vector weighted by user's ratings & favorite genres
  const userProfileVec = new Map<string, number>();
  for (const r of userRatings.slice(0, 6)) {
    const mVec = tfidfVectors.get(r.tmdb_movie_id);
    if (!mVec) continue;
    const ratingWeight = Math.max(-1.0, (r.rating_score - 2.5) / 2.5);
    if (ratingWeight <= 0) continue;
    for (const [term, val] of mVec.entries()) {
      userProfileVec.set(term, (userProfileVec.get(term) || 0) + val * ratingWeight);
    }
  }
  // Incorporate explicit favorite genres into user profile vector
  for (const gid of favoriteGenreIds) {
    const gName = genreMap.get(gid);
    if (gName) {
      const token = `genre_${gName.toLowerCase().replace(/\s+/g, '_')}`;
      userProfileVec.set(token, (userProfileVec.get(token) || 0) + 0.35);
    }
  }

  // 1. Content-Based Score (TF-IDF Cosine Similarity)
  const rawContent = new Map<number, number>();
  for (const m of candidates) {
    const mVec = tfidfVectors.get(m.id);
    const sim = mVec ? cosineSimilarity(userProfileVec, mVec) : 0;
    rawContent.set(m.id, Math.max(0, sim));
  }
  const normContent = normalizeMap(rawContent);

  // 2. Collaborative Filtering Score (User-Based Cosine Similarity)
  const candidateIds = candidates.map((m) => m.id);
  const { scores: rawCollab, hasCollaborativeSignal } = computeCollaborativeScores(
    userId,
    candidateIds,
    allRatings
  );
  const normCollab = hasCollaborativeSignal ? normalizeMap(rawCollab) : rawCollab;

  // 3. Popularity Score
  const rawPopularity = new Map<number, number>();
  for (const m of candidates) {
    const mGenres = m.genre_ids || [];
    const genreMatches = favoriteGenreIds.filter((gid) => mGenres.includes(gid)).length;
    const genreBoost = favoriteGenreIds.length > 0 && genreMatches > 0 ? 1.25 : 1.0;
    const bayesQuality = (m.vote_average / 10) * Math.min(1, Math.log10((m.vote_count || 1) + 1) / 3.5);
    const popLog = Math.log10((m.popularity || 1) + 1);
    rawPopularity.set(m.id, (popLog * 0.4 + bayesQuality * 4.0) * genreBoost);
  }
  const normPop = normalizeMap(rawPopularity);

  // 4. Hybrid Formula: Final Score = (0.50 × Collaborative) + (0.30 × Content) + (0.20 × Popularity)
  const mode = hasCollaborativeSignal ? 'hybrid' : 'content-popularity';
  const formula = '0.50 × Collaborative + 0.30 × Content + 0.20 × Popularity';

  const scored: RecommendedMovieItem[] = candidates.map((m) => {
    const collab = normCollab.get(m.id) || 0;
    const content = normContent.get(m.id) || 0;
    const pop = normPop.get(m.id) || 0;

    // Exact requested hybrid formula
    const finalScore = 0.50 * collab + 0.30 * content + 0.20 * pop;

    const detailed = detailMap.get(m.id);
    const mGenres = detailed?.genres
      ? detailed.genres
      : (m.genre_ids || [])
          .map((gid) => ({ id: gid, name: genreMap.get(gid) || '' }))
          .filter((g) => g.name !== '');

    let reason = 'Matches your viewing profile';
    if (collab > 0.5 && content > 0.5) {
      reason = 'Strong taste match & peer rating overlap';
    } else if (collab > 0.55) {
      reason = 'Highly rated by users with similar taste';
    } else if (content > 0.55) {
      reason = 'Similar cast, themes & genres to your favorites';
    } else if (mGenres.some((g) => favoriteGenreIds.includes(g.id))) {
      const matched = mGenres.filter((g) => favoriteGenreIds.includes(g.id)).map((g) => g.name);
      reason = `Matches favorite genre: ${matched.slice(0, 2).join(', ')}`;
    }

    return {
      ...m,
      genres: mGenres,
      finalScore: Number(finalScore.toFixed(4)),
      collaborativeScore: Number(collab.toFixed(4)),
      contentScore: Number(content.toFixed(4)),
      popularityScore: Number(pop.toFixed(4)),
      recommendationMode: mode,
      reason,
    };
  });

  scored.sort((a, b) => b.finalScore - a.finalScore);

  return {
    userId,
    mode,
    formula,
    favoriteGenres,
    recommendations: scored.slice(0, 10),
  };
}
