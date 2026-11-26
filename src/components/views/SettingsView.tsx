import { useState } from 'react';
import { Globe, ShieldCheck, SlidersHorizontal } from 'lucide-react';
import { api } from '../../api';
import { WATCH_REGIONS, type UserProfile } from '../../types';

interface SettingsViewProps {
  user: UserProfile | null;
  region: string;
  tmdbConfigured: boolean;
  onChangeRegion: (region: string) => void;
  onUserUpdated: (user: UserProfile) => void;
}

export function SettingsView({
  user,
  region,
  tmdbConfigured,
  onChangeRegion,
  onUserUpdated,
}: SettingsViewProps) {
  const [saving, setSaving] = useState(false);
  const [savedNotice, setSavedNotice] = useState<string | null>(null);

  const handleToggleExcludeWatched = async () => {
    if (!user) return;
    setSaving(true);
    setSavedNotice(null);
    try {
      const res = await api.updatePreferences({
        exclude_watched: !user.exclude_watched,
      });
      onUserUpdated(res.user);
      setSavedNotice('Recommendation filtering preference saved.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 max-w-3xl">
      {savedNotice && (
        <div className="rounded-xl bg-[#B7FF4C]/10 border border-[#B7FF4C]/35 px-4 py-3 text-xs text-[#B7FF4C]">
          {savedNotice}
        </div>
      )}

      {/* Region Preference */}
      <section className="rounded-2xl bg-[#272828] border border-white/[0.08] p-6 space-y-4">
        <div className="flex items-start gap-3">
          <Globe className="w-5 h-5 text-[#B7FF4C] shrink-0 mt-0.5" />
          <div className="space-y-1">
            <h2 className="font-display text-lg font-bold text-white">
              Default Where to Watch Region
            </h2>
            <p className="text-sm text-[#B4B8B8]">
              Choose the default country used when checking streaming, rental, and purchase providers. Defaults to Philippines (PH).
            </p>
          </div>
        </div>

        <div className="max-w-xs">
          <label htmlFor="settings-region" className="block text-xs font-medium text-[#B4B8B8] mb-1.5">
            Viewing Country / Region
          </label>
          <select
            id="settings-region"
            value={region}
            onChange={(e) => {
              onChangeRegion(e.target.value);
              setSavedNotice(`Default viewing region set to ${e.target.value}.`);
            }}
            className="w-full rounded-xl bg-[#141515] border border-white/10 px-4 py-2.5 text-sm text-white focus:outline-none focus:border-[#B7FF4C]"
          >
            {WATCH_REGIONS.map((r) => (
              <option key={r.code} value={r.code}>
                {r.name} ({r.code})
              </option>
            ))}
          </select>
        </div>
      </section>

      {/* Recommendation Preferences */}
      <section className="rounded-2xl bg-[#272828] border border-white/[0.08] p-6 space-y-4">
        <div className="flex items-start gap-3">
          <SlidersHorizontal className="w-5 h-5 text-[#B7FF4C] shrink-0 mt-0.5" />
          <div className="space-y-1">
            <h3 className="font-display text-lg font-bold text-white">
              Recommendation Filtering
            </h3>
            <p className="text-sm text-[#B4B8B8]">
              Control how CineMatch filters candidate titles in your Top 10 recommendations.
            </p>
          </div>
        </div>

        <div className="flex items-center justify-between gap-4 rounded-xl bg-[#141515] border border-white/[0.06] p-4">
          <div>
            <p className="text-sm font-medium text-white">
              Exclude Watchlist & Rated Movies
            </p>
            <p className="text-xs text-[#808585] mt-0.5">
              Prevent movies you have already rated or saved from appearing in recommendations.
            </p>
          </div>
          <button
            type="button"
            disabled={!user || saving}
            onClick={handleToggleExcludeWatched}
            role="switch"
            aria-checked={user ? user.exclude_watched : true}
            className={`px-4 py-2 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap disabled:opacity-50 ${
              (user ? user.exclude_watched : true)
                ? 'bg-[#B7FF4C] text-[#0F1010]'
                : 'bg-[#272828] text-[#B4B8B8] border border-white/10'
            }`}
          >
            {(user ? user.exclude_watched : true) ? 'Enabled' : 'Disabled'}
          </button>
        </div>
      </section>

      {/* External API & Attribution */}
      <section className="rounded-2xl bg-[#272828] border border-white/[0.08] p-6 space-y-3">
        <div className="flex items-start gap-3">
          <ShieldCheck className="w-5 h-5 text-[#B7FF4C] shrink-0 mt-0.5" />
          <div className="space-y-1">
            <h3 className="font-display text-lg font-bold text-white">
              TMDB Data Source & Attribution
            </h3>
            <p className="text-sm text-[#B4B8B8]">
              Server TMDB Connection: {tmdbConfigured ? 'Connected' : 'Pending TMDB_API_KEY configuration'}
            </p>
            <p className="text-xs text-[#808585] leading-relaxed pt-1">
              This product uses the TMDB API but is not endorsed or certified by TMDB. Regional streaming, rental, and purchase availability links are sourced via JustWatch through TMDB. CineMatch does not host, upload, or distribute movie files.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
