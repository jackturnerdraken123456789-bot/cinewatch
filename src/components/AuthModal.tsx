import { useState, type FormEvent } from 'react';
import { X } from 'lucide-react';
import { api, ApiError, setStoredToken } from '../api';
import type { Genre, UserProfile } from '../types';

interface AuthFormProps {
  genres: Genre[];
  initialMode?: 'login' | 'register';
  onSuccess: (user: UserProfile) => void;
  onCancel?: () => void;
}

export function AuthForm({
  genres,
  initialMode = 'login',
  onSuccess,
  onCancel,
}: AuthFormProps) {
  const [mode, setMode] = useState<'login' | 'register'>(initialMode);
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [selectedGenres, setSelectedGenres] = useState<number[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const toggleGenre = (id: number) => {
    setSelectedGenres((prev) =>
      prev.includes(id) ? prev.filter((g) => g !== id) : [...prev, id]
    );
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      if (mode === 'login') {
        const res = await api.login({ identifier, password });
        setStoredToken(res.token);
        onSuccess(res.user);
      } else {
        const res = await api.register({
          username,
          email,
          password,
          favorite_genres: selectedGenres,
        });
        setStoredToken(res.token);
        onSuccess(res.user);
      }
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError('Unable to complete request. Please try again.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div>
      <div className="flex items-center gap-1 p-1 rounded-xl bg-[#141515] border border-white/[0.08] mb-6">
        <button
          type="button"
          onClick={() => {
            setMode('login');
            setError(null);
          }}
          className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-colors ${
            mode === 'login'
              ? 'bg-[#B7FF4C] text-[#0F1010] font-semibold'
              : 'text-[#B4B8B8] hover:text-white'
          }`}
        >
          Sign In
        </button>
        <button
          type="button"
          onClick={() => {
            setMode('register');
            setError(null);
          }}
          className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-colors ${
            mode === 'register'
              ? 'bg-[#B7FF4C] text-[#0F1010] font-semibold'
              : 'text-[#B4B8B8] hover:text-white'
          }`}
        >
          Create Account
        </button>
      </div>

      {error && (
        <div
          role="alert"
          className="mb-4 rounded-xl bg-red-500/10 border border-red-500/30 px-4 py-3 text-sm text-red-200"
        >
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        {mode === 'login' ? (
          <div>
            <label htmlFor="auth-identifier" className="block text-xs font-medium text-[#B4B8B8] mb-1.5">
              Email or Username
            </label>
            <input
              id="auth-identifier"
              type="text"
              required
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              placeholder="alex@example.com"
              className="w-full rounded-xl bg-[#141515] border border-white/10 px-4 py-2.5 text-sm text-white placeholder-[#808585] focus:outline-none focus:border-[#B7FF4C]"
            />
          </div>
        ) : (
          <>
            <div>
              <label htmlFor="auth-username" className="block text-xs font-medium text-[#B4B8B8] mb-1.5">
                Username
              </label>
              <input
                id="auth-username"
                type="text"
                required
                minLength={2}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="cinemaphile"
                className="w-full rounded-xl bg-[#141515] border border-white/10 px-4 py-2.5 text-sm text-white placeholder-[#808585] focus:outline-none focus:border-[#B7FF4C]"
              />
            </div>
            <div>
              <label htmlFor="auth-email" className="block text-xs font-medium text-[#B4B8B8] mb-1.5">
                Email Address
              </label>
              <input
                id="auth-email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full rounded-xl bg-[#141515] border border-white/10 px-4 py-2.5 text-sm text-white placeholder-[#808585] focus:outline-none focus:border-[#B7FF4C]"
              />
            </div>
          </>
        )}

        <div>
          <label htmlFor="auth-password" className="block text-xs font-medium text-[#B4B8B8] mb-1.5">
            Password
          </label>
          <input
            id="auth-password"
            type="password"
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Minimum 6 characters"
            className="w-full rounded-xl bg-[#141515] border border-white/10 px-4 py-2.5 text-sm text-white placeholder-[#808585] focus:outline-none focus:border-[#B7FF4C]"
          />
        </div>

        {mode === 'register' && genres.length > 0 && (
          <div>
            <p className="text-xs font-medium text-[#B4B8B8] mb-2">
              Select Favorite Genres (optional)
            </p>
            <div className="flex flex-wrap gap-2 max-h-36 overflow-y-auto pr-1">
              {genres.map((g) => {
                const active = selectedGenres.includes(g.id);
                return (
                  <button
                    key={g.id}
                    type="button"
                    onClick={() => toggleGenre(g.id)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                      active
                        ? 'bg-[#B7FF4C] text-[#0F1010] border-[#B7FF4C] font-semibold'
                        : 'bg-[#141515] text-[#B4B8B8] border-white/10 hover:border-white/25 hover:text-white'
                    }`}
                  >
                    {g.name}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div className="pt-2 flex items-center gap-3">
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2.5 rounded-xl bg-[#141515] border border-white/10 text-sm font-medium text-[#B4B8B8] hover:text-white transition-colors"
            >
              Cancel
            </button>
          )}
          <button
            type="submit"
            disabled={submitting}
            className="flex-1 px-5 py-2.5 rounded-xl bg-[#B7FF4C] text-[#0F1010] text-sm font-semibold hover:bg-[#c8ff75] disabled:opacity-60 transition-colors"
          >
            {submitting
              ? mode === 'login'
                ? 'Signing In...'
                : 'Creating Account...'
              : mode === 'login'
                ? 'Sign In'
                : 'Create Account'}
          </button>
        </div>
      </form>
    </div>
  );
}

interface AuthModalProps {
  open: boolean;
  genres: Genre[];
  initialMode?: 'login' | 'register';
  onClose: () => void;
  onSuccess: (user: UserProfile) => void;
}

export function AuthModal({ open, genres, initialMode = 'login', onClose, onSuccess }: AuthModalProps) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-label="Account authentication"
    >
      <div className="w-full max-w-md rounded-2xl bg-[#272828] border border-white/10 p-6 shadow-2xl">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="font-display text-xl font-bold text-white">CineMatch Account</h2>
            <p className="text-xs text-[#B4B8B8] mt-0.5">
              Save ratings, manage your watchlist, and unlock hybrid recommendations.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close authentication modal"
            className="p-2 rounded-lg text-[#B4B8B8] hover:text-white hover:bg-[#141515] transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <AuthForm
          genres={genres}
          initialMode={initialMode}
          onSuccess={(u) => {
            onSuccess(u);
            onClose();
          }}
          onCancel={onClose}
        />
      </div>
    </div>
  );
}
