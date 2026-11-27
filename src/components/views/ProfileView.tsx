import { useEffect, useState, type FormEvent } from 'react';
import { Star, Trash2 } from 'lucide-react';
import { api, ApiError } from '../../api';
import type { Genre, RatingEntry, UserProfile } from '../../types';
import { AuthForm } from '../AuthModal';
import { PosterImage } from '../PosterImage';

interface ProfileViewProps {
  user: UserProfile | null;
  genres: Genre[];
  onAuthSuccess: (user: UserProfile) => void;
  onUserUpdated: (user: UserProfile) => void;
  onToggleFavoriteGenre: (genreId: number) => void;
  onSelectMovie: (movieId: number) => void;
  onDeleteRating: (movieId: number) => Promise<void>;
}

export function ProfileView({
  user,
  genres,
  onAuthSuccess,
  onUserUpdated,
  onToggleFavoriteGenre,
  onSelectMovie,
  onDeleteRating,
}: ProfileViewProps) {
  const [username, setUsername] = useState(user?.username || '');
  const [email, setEmail] = useState(user?.email || '');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hydratedRatings, setHydratedRatings] = useState<RatingEntry[]>([]);
  const [loadingRatings, setLoadingRatings] = useState(false);

  useEffect(() => {
    if (user) {
      setUsername(user.username);
      setEmail(user.email);
      setLoadingRatings(true);
      api
        .getUserRatings(user.user_id, true)
        .then((res) => setHydratedRatings(res.ratings || []))
        .catch(() => setHydratedRatings([]))
        .finally(() => setLoadingRatings(false));
    } else {
      setHydratedRatings([]);
    }
  }, [user, user?.ratings.length]);

  if (!user) {
    return (
      <div className="max-w-md mx-auto mt-6 rounded-2xl bg-[#272828] border border-white/10 p-6">
        <div className="mb-5">
          <h2 className="font-display text-xl font-bold text-white">Your Profile</h2>
          <p className="text-xs text-[#B4B8B8] mt-0.5">
            Sign in or create an account to save favorite genres and movie ratings.
          </p>
        </div>
        <AuthForm genres={genres} onSuccess={onAuthSuccess} />
      </div>
    );
  }

  const handleSaveProfile = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    setError(null);
    try {
      const res = await api.updateProfile({ username, email });
      onUserUpdated(res.user);
      setMessage('Profile details updated.');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to update profile.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Account Details */}
      <section className="rounded-2xl bg-[#272828] border border-white/[0.08] p-6 space-y-4">
        <div>
          <h2 className="font-display text-lg font-bold text-white">Account Information</h2>
          <p className="text-xs text-[#B4B8B8]">
            Manage your CineWatch display name and email address.
          </p>
        </div>

        {message && (
          <div className="rounded-xl bg-[#B7FF4C]/10 border border-[#B7FF4C]/35 px-4 py-2.5 text-xs text-[#B7FF4C]">
            {message}
          </div>
        )}
        {error && (
          <div className="rounded-xl bg-red-500/10 border border-red-500/35 px-4 py-2.5 text-xs text-red-200">
            {error}
          </div>
        )}

        <form onSubmit={handleSaveProfile} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="profile-username" className="block text-xs font-medium text-[#B4B8B8] mb-1.5">
              Username
            </label>
            <input
              id="profile-username"
              type="text"
              required
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full rounded-xl bg-[#141515] border border-white/10 px-4 py-2.5 text-sm text-white focus:outline-none focus:border-[#B7FF4C]"
            />
          </div>
          <div>
            <label htmlFor="profile-email" className="block text-xs font-medium text-[#B4B8B8] mb-1.5">
              Email
            </label>
            <input
              id="profile-email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-xl bg-[#141515] border border-white/10 px-4 py-2.5 text-sm text-white focus:outline-none focus:border-[#B7FF4C]"
            />
          </div>
          <div className="sm:col-span-2 flex justify-end">
            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2.5 rounded-xl bg-[#B7FF4C] text-[#0F1010] text-sm font-semibold hover:bg-[#c8ff75] disabled:opacity-50 transition-colors"
            >
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </section>

      {/* Favorite Genres */}
      <section className="rounded-2xl bg-[#272828] border border-white/[0.08] p-6 space-y-4">
        <div>
          <h3 className="font-display text-lg font-bold text-white">Favorite Genres</h3>
          <p className="text-xs text-[#B4B8B8]">
            Selected genres boost both popularity fallback and TF-IDF content profiles.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {genres.map((genre) => {
            const active = user.favorite_genres.includes(genre.id);
            return (
              <button
                key={genre.id}
                type="button"
                onClick={() => onToggleFavoriteGenre(genre.id)}
                className={`px-3.5 py-2 rounded-lg text-xs font-medium border transition-colors ${
                  active
                    ? 'bg-[#B7FF4C] text-[#0F1010] border-[#B7FF4C] font-semibold'
                    : 'bg-[#141515] text-[#B4B8B8] border-white/10 hover:text-white'
                }`}
              >
                {genre.name}
              </button>
            );
          })}
        </div>
      </section>

      {/* Ratings History */}
      <section className="rounded-2xl bg-[#272828] border border-white/[0.08] p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-display text-lg font-bold text-white">Rated Movies</h3>
            <p className="text-xs text-[#B4B8B8] tabular-nums">
              {hydratedRatings.length} movies rated
            </p>
          </div>
        </div>

        {loadingRatings ? (
          <div className="h-24 rounded-xl bg-[#141515] animate-pulse" />
        ) : hydratedRatings.length > 0 ? (
          <div className="divide-y divide-white/[0.06]">
            {hydratedRatings.map((entry) => {
              const title = entry.movie?.title || `TMDB Movie #${entry.tmdb_movie_id}`;
              const year = entry.movie?.release_date ? entry.movie.release_date.slice(0, 4) : '';
              return (
                <div
                  key={entry.rating_id}
                  className="py-3 flex items-center justify-between gap-4"
                >
                  <button
                    type="button"
                    onClick={() => onSelectMovie(entry.tmdb_movie_id)}
                    className="flex items-center gap-3.5 min-w-0 text-left group"
                  >
                    <div className="w-11 h-16 rounded-lg overflow-hidden shrink-0 bg-[#141515]">
                      <PosterImage
                        posterPath={entry.movie?.poster_path || null}
                        title={title}
                        releaseYear={year}
                        className="w-full h-full"
                      />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-white group-hover:text-[#B7FF4C] transition-colors truncate">
                        {title}
                      </p>
                      <p className="text-xs text-[#808585] tabular-nums">
                        {year || 'Movie'} · Rated {new Date(entry.updated_at).toLocaleDateString()}
                      </p>
                    </div>
                  </button>

                  <div className="flex items-center gap-3 shrink-0">
                    <span className="inline-flex items-center gap-1 text-sm font-mono font-semibold text-[#B7FF4C] tabular-nums">
                      <Star className="w-4 h-4 fill-[#B7FF4C]" />
                      {entry.rating_score}/5
                    </span>
                    <button
                      type="button"
                      onClick={() => onDeleteRating(entry.tmdb_movie_id)}
                      aria-label={`Remove rating for ${title}`}
                      className="p-2 rounded-lg text-[#808585] hover:text-red-300 hover:bg-[#141515] transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-[#B4B8B8]">
            You haven&apos;t rated any movies yet. Click any movie poster and select 1–5 stars to train your hybrid recommendations.
          </p>
        )}
      </section>
    </div>
  );
}
