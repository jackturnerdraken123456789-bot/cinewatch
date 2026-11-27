import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Menu, Search, ShieldAlert } from 'lucide-react';
import { api, ApiError, getStoredToken, setStoredToken } from './api';
import type {
  Genre,
  MovieSummary,
  NavSection,
  RecommendationsResponse,
  SystemStatus,
  UserProfile,
} from './types';
import { Sidebar } from './components/Sidebar';
import { AuthModal } from './components/AuthModal';
import { ModeratorPortal } from './components/ModeratorPortal';
import { MovieDetailModal } from './components/MovieDetailModal';
import { OverviewView } from './components/views/OverviewView';
import { DiscoverView } from './components/views/DiscoverView';
import { GenresView } from './components/views/GenresView';
import { RecommendedView } from './components/views/RecommendedView';
import { WatchlistView } from './components/views/WatchlistView';
import { ProfileView } from './components/views/ProfileView';
import { SettingsView } from './components/views/SettingsView';

const SECTION_TITLES: Record<NavSection, string> = {
  overview: 'Overview',
  discover: 'Discover Movies',
  genres: 'Genres',
  recommended: 'Recommended Movies',
  watchlist: 'My Watchlist',
  profile: 'Profile',
  settings: 'Settings',
};

export default function App() {
  const [viewMode, setViewMode] = useState<'user' | 'moderator'>('user');
  const [activeSection, setActiveSection] = useState<NavSection>('overview');
  const [discoverInitialMode, setDiscoverInitialMode] = useState<'all' | 'public-domain'>('all');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const [user, setUser] = useState<UserProfile | null>(null);
  const [authModalOpen, setAuthModalOpen] = useState(false);

  const [tmdbConfigured, setTmdbConfigured] = useState(true);
  const [usingFallback, setUsingFallback] = useState(false);
  const [fallbackReason, setFallbackReason] = useState<string | null>(null);
  const [systemStatus, setSystemStatus] = useState<SystemStatus | null>(null);

  const [genres, setGenres] = useState<Genre[]>([]);
  const [popularMovies, setPopularMovies] = useState<MovieSummary[]>([]);
  const [publicDomainMovies, setPublicDomainMovies] = useState<MovieSummary[]>([]);
  const [recommendations, setRecommendations] = useState<RecommendationsResponse | null>(null);
  const [overviewLoading, setOverviewLoading] = useState(true);
  const [recsLoading, setRecsLoading] = useState(false);

  const [selectedMovieId, setSelectedMovieId] = useState<number | null>(null);
  const [focusProviders, setFocusProviders] = useState(false);

  const [guestRegion, setGuestRegion] = useState<string>(() => {
    try {
      return localStorage.getItem('cinewatch_region') || 'PH';
    } catch {
      return 'PH';
    }
  });

  const [toast, setToast] = useState<string | null>(null);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3200);
    return () => clearTimeout(t);
  }, [toast]);

  const genresMap = useMemo(
    () => new Map<number, string>(genres.map((g) => [g.id, g.name])),
    [genres]
  );

  const watchlistIds = useMemo(
    () => new Set<number>((user?.watchlist || []).map((w) => w.tmdb_movie_id)),
    [user]
  );

  const ratingsMap = useMemo(() => {
    const map = new Map<number, number>();
    for (const r of user?.ratings || []) {
      map.set(r.tmdb_movie_id, r.rating_score);
    }
    return map;
  }, [user]);

  const activeRegion = user?.preferred_region || guestRegion || 'PH';

  // Restore session on mount
  useEffect(() => {
    const token = getStoredToken();
    if (token) {
      api
        .me()
        .then((res) => setUser(res.user))
        .catch(() => {
          setStoredToken(null);
        });
    }
  }, []);

  // Load genres, popular movies, and free public domain movies
  useEffect(() => {
    let cancelled = false;
    setOverviewLoading(true);

    Promise.all([
      api.getGenres(),
      api.getPopular(1),
      api.getPublicDomainMovies({ page: 1 }).catch(() => ({ results: [] as MovieSummary[] })),
    ])
      .then(([genreRes, popRes, pdRes]) => {
        if (cancelled) return;
        setGenres(genreRes.genres || []);
        setPopularMovies(popRes.results || []);
        setPublicDomainMovies(pdRes.results || []);
        setUsingFallback(popRes.catalogSource === 'fallback');

        api
          .health()
          .then((h) => {
            if (cancelled) return;
            setTmdbConfigured(Boolean(h.tmdbActive));
            setFallbackReason(h.fallbackReason || null);
            if (h.systemStatus) {
              setSystemStatus(h.systemStatus);
            }
          })
          .catch(() => {});
      })
      .catch((err) => {
        if (cancelled) return;
        setFallbackReason(err instanceof ApiError ? err.message : 'Unable to reach movie service.');
      })
      .finally(() => {
        if (!cancelled) setOverviewLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const refreshRecommendations = useCallback(
    async (targetUser: UserProfile | null) => {
      setRecsLoading(true);
      try {
        const res = targetUser
          ? await api.getRecommendations(targetUser.user_id)
          : await api.getGuestRecommendations([]);
        setRecommendations(res);
      } catch {
        // handled cleanly by empty state
      } finally {
        setRecsLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    refreshRecommendations(user);
  }, [
    user?.user_id,
    user?.favorite_genres.join(','),
    user?.ratings.length,
    user?.exclude_watched,
    refreshRecommendations,
  ]);

  const handleNavigate = (section: NavSection, discoverMode?: 'all' | 'public-domain') => {
    if (section === 'discover') {
      setDiscoverInitialMode(discoverMode || 'all');
    }
    setActiveSection(section);
  };

  const handleOpenMovie = (movieId: number, openProviders = false) => {
    setFocusProviders(openProviders);
    setSelectedMovieId(movieId);
  };

  const handleToggleWatchlist = async (movieId: number) => {
    if (!user) {
      setAuthModalOpen(true);
      return;
    }

    try {
      const exists = watchlistIds.has(movieId);
      if (exists) {
        await api.removeFromWatchlistByMovie(movieId);
        setUser((prev) =>
          prev
            ? {
                ...prev,
                watchlist: prev.watchlist.filter((w) => w.tmdb_movie_id !== movieId),
              }
            : prev
        );
        showToast('Removed from your watchlist.');
      } else {
        const res = await api.addToWatchlist(movieId);
        setUser((prev) =>
          prev
            ? {
                ...prev,
                watchlist: [res.item, ...prev.watchlist],
              }
            : prev
        );
        showToast('Saved to your watchlist.');
      }
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Unable to update watchlist.');
    }
  };

  const handleRemoveWatchlistById = async (watchlistId: number) => {
    try {
      await api.removeFromWatchlistById(watchlistId);
      setUser((prev) =>
        prev
          ? {
              ...prev,
              watchlist: prev.watchlist.filter((w) => w.watchlist_id !== watchlistId),
            }
          : prev
      );
      showToast('Removed from your watchlist.');
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Unable to remove item.');
    }
  };

  const handleRateMovie = async (movieId: number, score: number) => {
    if (!user) {
      setAuthModalOpen(true);
      return;
    }
    try {
      const res = await api.rateMovie(movieId, score);
      setUser((prev) => {
        if (!prev) return prev;
        const filtered = prev.ratings.filter((r) => r.tmdb_movie_id !== movieId);
        return {
          ...prev,
          ratings: [res.rating, ...filtered],
        };
      });
      showToast(`Saved ${score}/5 rating. Recommendations updated.`);
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Unable to save rating.');
    }
  };

  const handleDeleteRating = async (movieId: number) => {
    try {
      await api.deleteRating(movieId);
      setUser((prev) =>
        prev
          ? {
              ...prev,
              ratings: prev.ratings.filter((r) => r.tmdb_movie_id !== movieId),
            }
          : prev
      );
      showToast('Rating removed.');
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Unable to remove rating.');
    }
  };

  const handleToggleFavoriteGenre = async (genreId: number) => {
    if (!user) {
      setAuthModalOpen(true);
      return;
    }
    const current = user.favorite_genres || [];
    const next = current.includes(genreId)
      ? current.filter((g) => g !== genreId)
      : [...current, genreId];

    const res = await api.updatePreferences({ favorite_genres: next });
    setUser(res.user);
    showToast('Favorite genres updated.');
  };

  const handleChangeRegion = async (newRegion: string) => {
    setGuestRegion(newRegion);
    try {
      localStorage.setItem('cinewatch_region', newRegion);
    } catch {
      // ignore storage errors
    }
    if (user) {
      const res = await api.updatePreferences({ preferred_region: newRegion });
      setUser(res.user);
    }
  };

  const handleLogout = () => {
    setStoredToken(null);
    setUser(null);
    showToast('Signed out.');
  };

  const handleReturnFromModerator = () => {
    setViewMode('user');
    api
      .health()
      .then((h) => {
        if (h.systemStatus) {
          setSystemStatus(h.systemStatus);
        }
      })
      .catch(() => {});
  };

  if (viewMode === 'moderator') {
    return (
      <ModeratorPortal
        user={user}
        onAuthSuccess={(modUser) => {
          setUser(modUser);
        }}
        onLogout={() => {
          setStoredToken(null);
          setUser(null);
        }}
        onBackToApp={handleReturnFromModerator}
        onSystemStatusUpdated={(status) => setSystemStatus(status)}
      />
    );
  }

  return (
    <div className="min-h-screen bg-[#0F1010] text-white flex">
      <Sidebar
        activeSection={activeSection}
        onNavigate={(s) => handleNavigate(s)}
        user={user}
        onOpenAuth={() => setAuthModalOpen(true)}
        onLogout={handleLogout}
        onOpenModerator={() => setViewMode('moderator')}
        mobileOpen={mobileMenuOpen}
        onCloseMobile={() => setMobileMenuOpen(false)}
      />

      <div className="flex-1 min-w-0 flex flex-col min-h-screen">
        {/* Top Bar Contract: Single row, contextual title on left, single primary action on right */}
        <header className="sticky top-0 z-30 h-16 px-4 sm:px-8 bg-[#0F1010]/90 backdrop-blur-md border-b border-white/[0.08] flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              aria-label="Open navigation menu"
              className="lg:hidden p-2 rounded-xl bg-[#272828] border border-white/10 text-white hover:border-[#B7FF4C] transition-colors"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2 text-sm min-w-0">
              <span className="text-[#808585] hidden sm:inline">CineWatch</span>
              <span className="text-[#808585] hidden sm:inline" aria-hidden="true">/</span>
              <h1 className="font-display text-base sm:text-lg font-bold text-white truncate">
                {SECTION_TITLES[activeSection]}
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            {activeSection !== 'discover' && (
              <button
                type="button"
                onClick={() => handleNavigate('discover', 'all')}
                className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-[#272828] border border-white/10 text-xs font-medium text-[#B4B8B8] hover:text-white hover:border-white/25 transition-colors whitespace-nowrap"
              >
                <Search className="w-3.5 h-3.5 text-[#B7FF4C]" />
                <span className="hidden sm:inline">Search Movies</span>
              </button>
            )}
            {!user && (
              <button
                type="button"
                onClick={() => setAuthModalOpen(true)}
                className="px-4 py-2 rounded-xl bg-[#B7FF4C] text-[#0F1010] text-xs font-semibold hover:bg-[#c8ff75] transition-colors whitespace-nowrap"
              >
                Sign In
              </button>
            )}
          </div>
        </header>

        <main className="flex-1 px-4 sm:px-8 py-6 sm:py-8 max-w-[1440px] w-full mx-auto">
          {systemStatus &&
            (systemStatus.operational_state !== 'operational' ||
              systemStatus.maintenance_banner.trim() !== '') && (
              <div
                role="status"
                className={`mb-6 rounded-2xl border px-4 py-3.5 flex items-start gap-3 text-sm ${
                  systemStatus.operational_state === 'maintenance'
                    ? 'bg-red-500/10 border-red-500/30 text-red-100'
                    : 'bg-amber-500/10 border-amber-400/30 text-amber-100'
                }`}
              >
                {systemStatus.operational_state === 'maintenance' ? (
                  <ShieldAlert className="w-4 h-4 text-red-300 shrink-0 mt-0.5" />
                ) : (
                  <AlertTriangle className="w-4 h-4 text-amber-300 shrink-0 mt-0.5" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">
                    {systemStatus.operational_state === 'maintenance'
                      ? 'System Maintenance Mode'
                      : systemStatus.operational_state === 'degraded'
                        ? 'System Status Advisory'
                        : 'System Notice'}
                  </p>
                  <p className="text-xs opacity-90 mt-0.5">
                    {systemStatus.maintenance_banner ||
                      'Some account actions are temporarily paused by a system moderator.'}
                  </p>
                </div>
              </div>
            )}

          {activeSection === 'overview' && (
            <OverviewView
              user={user}
              genres={genres}
              genresMap={genresMap}
              popularMovies={popularMovies}
              publicDomainMovies={publicDomainMovies}
              recommendations={recommendations}
              loading={overviewLoading}
              usingFallback={usingFallback}
              fallbackReason={fallbackReason}
              watchlistIds={watchlistIds}
              ratingsMap={ratingsMap}
              onSelectMovie={(id) => handleOpenMovie(id)}
              onToggleWatchlist={handleToggleWatchlist}
              onNavigate={handleNavigate}
              onToggleFavoriteGenre={handleToggleFavoriteGenre}
              onOpenAuth={() => setAuthModalOpen(true)}
            />
          )}

          {activeSection === 'discover' && (
            <DiscoverView
              genres={genres}
              genresMap={genresMap}
              watchlistIds={watchlistIds}
              ratingsMap={ratingsMap}
              initialMode={discoverInitialMode}
              onSelectMovie={(id) => handleOpenMovie(id)}
              onToggleWatchlist={handleToggleWatchlist}
            />
          )}

          {activeSection === 'genres' && (
            <GenresView
              user={user}
              genres={genres}
              genresMap={genresMap}
              watchlistIds={watchlistIds}
              ratingsMap={ratingsMap}
              onSelectMovie={(id) => handleOpenMovie(id)}
              onToggleWatchlist={handleToggleWatchlist}
              onToggleFavoriteGenre={handleToggleFavoriteGenre}
              onOpenAuth={() => setAuthModalOpen(true)}
            />
          )}

          {activeSection === 'recommended' && (
            <RecommendedView
              user={user}
              genresMap={genresMap}
              data={recommendations}
              loading={recsLoading}
              tmdbMissing={usingFallback}
              error={fallbackReason}
              watchlistIds={watchlistIds}
              ratingsMap={ratingsMap}
              onRefresh={() => refreshRecommendations(user)}
              onSelectMovie={(id) => handleOpenMovie(id)}
              onToggleWatchlist={handleToggleWatchlist}
              onOpenAuth={() => setAuthModalOpen(true)}
            />
          )}

          {activeSection === 'watchlist' && (
            <WatchlistView
              user={user}
              onSelectMovie={(id, providers) => handleOpenMovie(id, providers)}
              onRemoveWatchlistItem={handleRemoveWatchlistById}
              onNavigate={(s) => handleNavigate(s)}
              onOpenAuth={() => setAuthModalOpen(true)}
            />
          )}

          {activeSection === 'profile' && (
            <ProfileView
              user={user}
              genres={genres}
              onAuthSuccess={(loggedInUser) => {
                setUser(loggedInUser);
                showToast(`Welcome, ${loggedInUser.username}!`);
              }}
              onUserUpdated={setUser}
              onToggleFavoriteGenre={handleToggleFavoriteGenre}
              onSelectMovie={(id) => handleOpenMovie(id)}
              onDeleteRating={handleDeleteRating}
            />
          )}

          {activeSection === 'settings' && (
            <SettingsView
              user={user}
              region={activeRegion}
              tmdbConfigured={tmdbConfigured}
              onChangeRegion={handleChangeRegion}
              onUserUpdated={setUser}
            />
          )}
        </main>
      </div>

      {/* Movie Details Modal */}
      <MovieDetailModal
        movieId={selectedMovieId}
        defaultRegion={activeRegion}
        initialFocusProviders={focusProviders}
        isSignedIn={Boolean(user)}
        inWatchlist={selectedMovieId ? watchlistIds.has(selectedMovieId) : false}
        userRating={selectedMovieId ? ratingsMap.get(selectedMovieId) : undefined}
        onClose={() => setSelectedMovieId(null)}
        onSelectMovie={(id) => handleOpenMovie(id, false)}
        onToggleWatchlist={handleToggleWatchlist}
        onRateMovie={handleRateMovie}
        onRequireAuth={() => setAuthModalOpen(true)}
      />

      {/* Authentication Modal */}
      <AuthModal
        open={authModalOpen}
        genres={genres}
        onClose={() => setAuthModalOpen(false)}
        onSuccess={(loggedInUser) => {
          setUser(loggedInUser);
          showToast(`Signed in as ${loggedInUser.username}`);
        }}
      />

      {/* Action Confirmation Toast */}
      {toast && (
        <div
          role="status"
          className="fixed bottom-5 right-5 z-50 rounded-xl bg-[#272828] border border-[#B7FF4C]/50 px-4 py-3 text-xs font-medium text-white shadow-xl"
        >
          {toast}
        </div>
      )}
    </div>
  );
}
