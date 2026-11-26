import {
  Bookmark,
  Compass,
  Film,
  LayoutDashboard,
  LogIn,
  LogOut,
  Settings,
  Shield,
  SlidersHorizontal,
  Sparkles,
  User,
  X,
} from 'lucide-react';
import type { NavSection, UserProfile } from '../types';

interface SidebarProps {
  activeSection: NavSection;
  onNavigate: (section: NavSection) => void;
  user: UserProfile | null;
  onOpenAuth: () => void;
  onLogout: () => void;
  onOpenModerator: () => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}

const NAV_ITEMS: { id: NavSection; label: string; icon: typeof LayoutDashboard }[] = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'discover', label: 'Discover Movies', icon: Compass },
  { id: 'genres', label: 'Genres', icon: SlidersHorizontal },
  { id: 'recommended', label: 'Recommended Movies', icon: Sparkles },
  { id: 'watchlist', label: 'My Watchlist', icon: Bookmark },
  { id: 'profile', label: 'Profile', icon: User },
  { id: 'settings', label: 'Settings', icon: Settings },
];

export function Sidebar({
  activeSection,
  onNavigate,
  user,
  onOpenAuth,
  onLogout,
  onOpenModerator,
  mobileOpen,
  onCloseMobile,
}: SidebarProps) {
  const handleSelect = (id: NavSection) => {
    onNavigate(id);
    onCloseMobile();
  };

  const navContent = (
    <div className="flex flex-col h-full bg-[#141515] border-r border-white/[0.08] w-64 shrink-0">
      <div className="flex items-center justify-between px-5 py-5 border-b border-white/[0.08]">
        <button
          type="button"
          onClick={() => handleSelect('overview')}
          className="flex items-center gap-2.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#B7FF4C] rounded-lg"
        >
          <div className="w-8 h-8 rounded-lg bg-[#B7FF4C] flex items-center justify-center text-[#0F1010] shrink-0">
            <Film className="w-4 h-4 stroke-[2.5]" />
          </div>
          <span className="font-display text-lg font-bold tracking-tight text-white whitespace-nowrap">
            CineMatch
          </span>
        </button>
        <button
          type="button"
          onClick={onCloseMobile}
          aria-label="Close navigation menu"
          className="lg:hidden p-1.5 rounded-lg text-[#B4B8B8] hover:text-white hover:bg-[#272828]"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto" aria-label="Main navigation">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = activeSection === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => handleSelect(item.id)}
              className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-colors duration-150 whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#B7FF4C] ${
                isActive
                  ? 'bg-[#B7FF4C] text-[#0F1010] font-semibold'
                  : 'text-[#B4B8B8] hover:text-white hover:bg-[#272828]'
              }`}
            >
              <Icon className="w-4 h-4 shrink-0" />
              <span className="truncate">{item.label}</span>
              {item.id === 'watchlist' && user && user.watchlist.length > 0 && (
                <span
                  className={`ml-auto text-xs font-mono tabular-nums ${
                    isActive ? 'text-[#0F1010]/80' : 'text-[#808585]'
                  }`}
                >
                  {user.watchlist.length}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      <div className="p-4 border-t border-white/[0.08] space-y-3">
        {user ? (
          <div className="flex items-center justify-between gap-2 rounded-xl bg-[#272828] border border-white/[0.06] px-3 py-2.5">
            <button
              type="button"
              onClick={() => handleSelect('profile')}
              className="min-w-0 text-left focus-visible:outline-none"
            >
              <p className="text-sm font-medium text-white truncate">{user.username}</p>
              <p className="text-xs text-[#808585] truncate">{user.email}</p>
            </button>
            <button
              type="button"
              onClick={onLogout}
              title="Sign out"
              aria-label="Sign out"
              className="p-2 rounded-lg text-[#B4B8B8] hover:text-white hover:bg-[#0F1010] transition-colors shrink-0"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => {
              onCloseMobile();
              onOpenAuth();
            }}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-[#272828] hover:bg-[#323434] border border-white/10 text-sm font-medium text-white transition-colors whitespace-nowrap"
          >
            <LogIn className="w-4 h-4 text-[#B7FF4C]" />
            <span>Sign In / Register</span>
          </button>
        )}

        <button
          type="button"
          onClick={() => {
            onCloseMobile();
            onOpenModerator();
          }}
          className="w-full flex items-center justify-between gap-2 px-3.5 py-2 rounded-xl bg-[#1A1B1B] hover:bg-[#272828] border border-white/[0.06] text-xs font-medium text-[#B4B8B8] hover:text-white transition-colors whitespace-nowrap"
        >
          <span className="inline-flex items-center gap-2">
            <Shield className="w-3.5 h-3.5 text-[#B7FF4C]" />
            <span>Moderator Console</span>
          </span>
          {user?.role === 'moderator' && (
            <span className="text-[11px] font-mono text-[#B7FF4C]">Active</span>
          )}
        </button>

        <p className="text-[11px] leading-relaxed text-[#808585]">
          This product uses the TMDB API but is not endorsed or certified by TMDB.
        </p>
      </div>
    </div>
  );

  return (
    <>
      <aside className="hidden lg:block shrink-0">{navContent}</aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-black/70 backdrop-blur-xs"
            onClick={onCloseMobile}
            aria-hidden="true"
          />
          <div className="relative z-10 h-full">{navContent}</div>
        </div>
      )}
    </>
  );
}
