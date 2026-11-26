import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Film,
  KeyRound,
  LogOut,
  RefreshCw,
  Search,
  Shield,
  ShieldAlert,
  Sliders,
  TrendingUp,
  UserCheck,
  UserX,
  Users,
} from 'lucide-react';
import { api, ApiError, setStoredToken } from '../api';
import { PosterImage } from './PosterImage';
import type {
  AccountStatus,
  ModeratorBootstrapStatus,
  ModeratorOverviewResponse,
  ModeratorUserOverview,
  OperationalState,
  SystemStatus,
  UserProfile,
} from '../types';

interface ModeratorPortalProps {
  user: UserProfile | null;
  onAuthSuccess: (user: UserProfile) => void;
  onLogout: () => void;
  onBackToApp: () => void;
  onSystemStatusUpdated: (status: SystemStatus) => void;
}

type ConsoleTab = 'trends' | 'users' | 'system';

const STATE_OPTIONS: {
  value: OperationalState;
  label: string;
  summary: string;
}[] = [
  {
    value: 'operational',
    label: 'Operational',
    summary: 'All discovery, recommendation, rating, and watchlist services run normally.',
  },
  {
    value: 'degraded',
    label: 'Degraded / Advisory',
    summary: 'Services remain online with a system notice banner displayed to all users.',
  },
  {
    value: 'maintenance',
    label: 'Maintenance Mode',
    summary: 'Pauses new registrations, ratings, and watchlist writes for standard users.',
  },
];

function formatDate(iso: string): string {
  if (!iso) return '—';
  const normalized = iso.includes('T') ? iso : iso.replace(' ', 'T') + 'Z';
  const d = new Date(normalized);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatDateTime(iso: string): string {
  if (!iso) return '—';
  const normalized = iso.includes('T') ? iso : iso.replace(' ', 'T') + 'Z';
  const d = new Date(normalized);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function stateLabel(state: OperationalState): string {
  if (state === 'maintenance') return 'Maintenance';
  if (state === 'degraded') return 'Advisory';
  return 'Operational';
}

export function ModeratorPortal({
  user,
  onAuthSuccess,
  onLogout,
  onBackToApp,
  onSystemStatusUpdated,
}: ModeratorPortalProps) {
  const isModerator = user?.role === 'moderator';

  // Auth / Claim state
  const [bootstrap, setBootstrap] = useState<ModeratorBootstrapStatus | null>(null);
  const [bootstrapLoading, setBootstrapLoading] = useState(false);
  const [authTab, setAuthTab] = useState<'passcode' | 'account'>('passcode');
  const [claimUsername, setClaimUsername] = useState('');
  const [claimEmail, setClaimEmail] = useState('');
  const [claimPassword, setClaimPassword] = useState('');
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [passcode, setPasscode] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);
  const [authSubmitting, setAuthSubmitting] = useState(false);

  // Console state
  const [activeTab, setActiveTab] = useState<ConsoleTab>('trends');
  const [overview, setOverview] = useState<ModeratorOverviewResponse | null>(null);
  const [usersList, setUsersList] = useState<ModeratorUserOverview[]>([]);
  const [consoleLoading, setConsoleLoading] = useState(false);
  const [consoleError, setConsoleError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // User oversight filters
  const [userSearch, setUserSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | AccountStatus>('all');
  const [pendingUserId, setPendingUserId] = useState<number | null>(null);

  // System status editor state
  const [draftState, setDraftState] = useState<OperationalState>('operational');
  const [draftBanner, setDraftBanner] = useState('');
  const [draftAllowReg, setDraftAllowReg] = useState(true);
  const [draftAllowRatings, setDraftAllowRatings] = useState(true);
  const [draftAllowWatchlist, setDraftAllowWatchlist] = useState(true);
  const [savingStatus, setSavingStatus] = useState(false);

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 3200);
    return () => clearTimeout(t);
  }, [notice]);

  useEffect(() => {
    if (isModerator) return;
    let cancelled = false;
    setBootstrapLoading(true);
    api
      .getModeratorBootstrapStatus()
      .then((res) => {
        if (cancelled) return;
        setBootstrap(res);
        setAuthTab(res.passcodeConfigured ? 'passcode' : 'account');
      })
      .catch((err) => {
        if (cancelled) return;
        setAuthError(err instanceof ApiError ? err.message : 'Unable to check moderator setup.');
      })
      .finally(() => {
        if (!cancelled) setBootstrapLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isModerator]);

  const syncSystemDraft = useCallback((status: SystemStatus) => {
    setDraftState(status.operational_state);
    setDraftBanner(status.maintenance_banner);
    setDraftAllowReg(status.allow_registrations);
    setDraftAllowRatings(status.allow_ratings);
    setDraftAllowWatchlist(status.allow_watchlist);
  }, []);

  const loadConsoleData = useCallback(async () => {
    if (!isModerator) return;
    setConsoleLoading(true);
    setConsoleError(null);
    try {
      const [ov, usr] = await Promise.all([api.getModeratorOverview(), api.getModeratorUsers()]);
      setOverview(ov);
      setUsersList(usr.users);
      syncSystemDraft(ov.systemStatus);
      onSystemStatusUpdated(ov.systemStatus);
    } catch (err) {
      setConsoleError(err instanceof ApiError ? err.message : 'Failed to load moderator telemetry.');
    } finally {
      setConsoleLoading(false);
    }
  }, [isModerator, onSystemStatusUpdated, syncSystemDraft]);

  useEffect(() => {
    if (isModerator) {
      loadConsoleData();
    }
  }, [isModerator, loadConsoleData]);

  const handleClaimSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setAuthSubmitting(true);
    try {
      const res = await api.claimModerator({
        username: claimUsername,
        email: claimEmail,
        password: claimPassword,
      });
      setStoredToken(res.token);
      onAuthSuccess(res.user);
    } catch (err) {
      setAuthError(err instanceof ApiError ? err.message : 'Could not create moderator account.');
    } finally {
      setAuthSubmitting(false);
    }
  };

  const handleLoginSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setAuthSubmitting(true);
    try {
      const payload =
        authTab === 'passcode' && bootstrap?.passcodeConfigured
          ? { passcode }
          : { identifier, password };
      const res = await api.loginModerator(payload);
      setStoredToken(res.token);
      onAuthSuccess(res.user);
    } catch (err) {
      setAuthError(err instanceof ApiError ? err.message : 'Moderator sign-in failed.');
    } finally {
      setAuthSubmitting(false);
    }
  };

  const handleToggleUserStatus = async (target: ModeratorUserOverview) => {
    const nextStatus: AccountStatus = target.account_status === 'active' ? 'suspended' : 'active';
    setPendingUserId(target.user_id);
    try {
      await api.updateUserStatus(target.user_id, nextStatus);
      setNotice(
        nextStatus === 'suspended'
          ? `Suspended account ${target.username}.`
          : `Reactivated account ${target.username}.`
      );
      await loadConsoleData();
    } catch (err) {
      setConsoleError(err instanceof ApiError ? err.message : 'Unable to update user status.');
    } finally {
      setPendingUserId(null);
    }
  };

  const handleSaveSystemStatus = async (e: FormEvent) => {
    e.preventDefault();
    setSavingStatus(true);
    setConsoleError(null);
    try {
      const res = await api.updateSystemStatus({
        operational_state: draftState,
        maintenance_banner: draftBanner,
        allow_registrations: draftAllowReg,
        allow_ratings: draftAllowRatings,
        allow_watchlist: draftAllowWatchlist,
      });
      onSystemStatusUpdated(res.systemStatus);
      setNotice('System status updated across CineMatch.');
      await loadConsoleData();
    } catch (err) {
      setConsoleError(err instanceof ApiError ? err.message : 'Failed to update system status.');
    } finally {
      setSavingStatus(false);
    }
  };

  const handleRestoreOperational = async () => {
    setSavingStatus(true);
    setConsoleError(null);
    try {
      const res = await api.updateSystemStatus({
        operational_state: 'operational',
        maintenance_banner: '',
        allow_registrations: true,
        allow_ratings: true,
        allow_watchlist: true,
      });
      onSystemStatusUpdated(res.systemStatus);
      setNotice('Restored full operational status.');
      await loadConsoleData();
    } catch (err) {
      setConsoleError(err instanceof ApiError ? err.message : 'Failed to restore operational status.');
    } finally {
      setSavingStatus(false);
    }
  };

  const filteredUsers = useMemo(() => {
    const q = userSearch.trim().toLowerCase();
    return usersList.filter((u) => {
      if (statusFilter !== 'all' && u.account_status !== statusFilter) return false;
      if (!q) return true;
      return (
        u.username.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        u.preferred_region.toLowerCase().includes(q)
      );
    });
  }, [usersList, userSearch, statusFilter]);

  // --- SEPARATE MODERATOR AUTH / BOOTSTRAP INTERFACE ---
  if (!isModerator) {
    const showClaimFlow =
      bootstrap && !bootstrap.passcodeConfigured && !bootstrap.hasModerator;

    return (
      <div className="min-h-screen bg-[#0F1010] text-white flex flex-col">
        <header className="h-16 px-4 sm:px-8 border-b border-white/[0.08] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-[#B7FF4C] flex items-center justify-center text-[#0F1010]">
              <Shield className="w-4 h-4 stroke-[2.5]" />
            </div>
            <div className="flex items-center gap-2 text-sm">
              <span className="font-display font-bold text-white">CineMatch</span>
              <span className="text-[#808585]" aria-hidden="true">·</span>
              <span className="text-[#B4B8B8]">Moderator Access</span>
            </div>
          </div>

          <button
            type="button"
            onClick={onBackToApp}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-[#272828] border border-white/10 text-xs font-medium text-[#B4B8B8] hover:text-white hover:border-white/25 transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back to CineMatch</span>
          </button>
        </header>

        <main className="flex-1 flex items-center justify-center p-4 sm:p-8">
          <div className="w-full max-w-md rounded-2xl bg-[#272828] border border-white/[0.08] p-6 sm:p-8">
            <div className="flex items-center gap-3 mb-5">
              <div className="w-10 h-10 rounded-xl bg-[#141515] border border-white/10 flex items-center justify-center text-[#B7FF4C]">
                <KeyRound className="w-5 h-5" />
              </div>
              <div>
                <h1 className="font-display text-xl font-bold text-white">
                  {showClaimFlow ? 'Claim Moderator Account' : 'Moderator Sign In'}
                </h1>
                <p className="text-xs text-[#B4B8B8] mt-0.5">
                  {showClaimFlow
                    ? 'Initialize the dedicated moderator account to oversee system trends and status.'
                    : 'Sign in with a separate moderator account to manage system health and users.'}
                </p>
              </div>
            </div>

            {user && (
              <div className="mb-5 rounded-xl bg-[#141515] border border-white/10 px-4 py-3 text-xs text-[#B4B8B8]">
                Currently signed in as standard user <strong className="text-white">{user.username}</strong>.
                Signing in here switches your session to the Moderator Console.
              </div>
            )}

            {authError && (
              <div
                role="alert"
                className="mb-5 rounded-xl bg-red-500/10 border border-red-500/30 px-4 py-3 text-sm text-red-200"
              >
                {authError}
              </div>
            )}

            {bootstrapLoading ? (
              <div className="py-10 text-center text-sm text-[#808585]">
                Checking moderator setup...
              </div>
            ) : showClaimFlow ? (
              <form onSubmit={handleClaimSubmit} className="space-y-4">
                <div>
                  <label htmlFor="mod-claim-username" className="block text-xs font-medium text-[#B4B8B8] mb-1.5">
                    Moderator Username
                  </label>
                  <input
                    id="mod-claim-username"
                    type="text"
                    required
                    minLength={2}
                    value={claimUsername}
                    onChange={(e) => setClaimUsername(e.target.value)}
                    placeholder="system-mod"
                    className="w-full rounded-xl bg-[#141515] border border-white/10 px-4 py-2.5 text-sm text-white placeholder-[#808585] focus:outline-none focus:border-[#B7FF4C]"
                  />
                </div>
                <div>
                  <label htmlFor="mod-claim-email" className="block text-xs font-medium text-[#B4B8B8] mb-1.5">
                    Moderator Email
                  </label>
                  <input
                    id="mod-claim-email"
                    type="email"
                    required
                    value={claimEmail}
                    onChange={(e) => setClaimEmail(e.target.value)}
                    placeholder="moderator@example.com"
                    className="w-full rounded-xl bg-[#141515] border border-white/10 px-4 py-2.5 text-sm text-white placeholder-[#808585] focus:outline-none focus:border-[#B7FF4C]"
                  />
                </div>
                <div>
                  <label htmlFor="mod-claim-password" className="block text-xs font-medium text-[#B4B8B8] mb-1.5">
                    Password (minimum 8 characters)
                  </label>
                  <input
                    id="mod-claim-password"
                    type="password"
                    required
                    minLength={8}
                    value={claimPassword}
                    onChange={(e) => setClaimPassword(e.target.value)}
                    placeholder="At least 8 characters"
                    className="w-full rounded-xl bg-[#141515] border border-white/10 px-4 py-2.5 text-sm text-white placeholder-[#808585] focus:outline-none focus:border-[#B7FF4C]"
                  />
                </div>

                <button
                  type="submit"
                  disabled={authSubmitting}
                  className="w-full px-5 py-2.5 rounded-xl bg-[#B7FF4C] text-[#0F1010] text-sm font-semibold hover:bg-[#c8ff75] disabled:opacity-60 transition-colors"
                >
                  {authSubmitting ? 'Creating Moderator Account...' : 'Claim Moderator Console'}
                </button>
              </form>
            ) : (
              <form onSubmit={handleLoginSubmit} className="space-y-4">
                {bootstrap?.passcodeConfigured && bootstrap?.hasModerator && (
                  <div className="flex items-center gap-1 p-1 rounded-xl bg-[#141515] border border-white/[0.08]">
                    <button
                      type="button"
                      onClick={() => {
                        setAuthTab('passcode');
                        setAuthError(null);
                      }}
                      className={`flex-1 py-2 px-3 rounded-lg text-xs font-medium transition-colors ${
                        authTab === 'passcode'
                          ? 'bg-[#B7FF4C] text-[#0F1010] font-semibold'
                          : 'text-[#B4B8B8] hover:text-white'
                      }`}
                    >
                      Passcode
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setAuthTab('account');
                        setAuthError(null);
                      }}
                      className={`flex-1 py-2 px-3 rounded-lg text-xs font-medium transition-colors ${
                        authTab === 'account'
                          ? 'bg-[#B7FF4C] text-[#0F1010] font-semibold'
                          : 'text-[#B4B8B8] hover:text-white'
                      }`}
                    >
                      Moderator Account
                    </button>
                  </div>
                )}

                {authTab === 'passcode' && bootstrap?.passcodeConfigured ? (
                  <div>
                    <label htmlFor="mod-passcode" className="block text-xs font-medium text-[#B4B8B8] mb-1.5">
                      Server Moderator Passcode
                    </label>
                    <input
                      id="mod-passcode"
                      type="password"
                      required
                      value={passcode}
                      onChange={(e) => setPasscode(e.target.value)}
                      placeholder="Enter MODERATOR_PASSCODE"
                      className="w-full rounded-xl bg-[#141515] border border-white/10 px-4 py-2.5 text-sm text-white placeholder-[#808585] focus:outline-none focus:border-[#B7FF4C]"
                    />
                  </div>
                ) : (
                  <>
                    <div>
                      <label htmlFor="mod-identifier" className="block text-xs font-medium text-[#B4B8B8] mb-1.5">
                        Moderator Email or Username
                      </label>
                      <input
                        id="mod-identifier"
                        type="text"
                        required
                        value={identifier}
                        onChange={(e) => setIdentifier(e.target.value)}
                        placeholder="system-mod"
                        className="w-full rounded-xl bg-[#141515] border border-white/10 px-4 py-2.5 text-sm text-white placeholder-[#808585] focus:outline-none focus:border-[#B7FF4C]"
                      />
                    </div>
                    <div>
                      <label htmlFor="mod-password" className="block text-xs font-medium text-[#B4B8B8] mb-1.5">
                        Password
                      </label>
                      <input
                        id="mod-password"
                        type="password"
                        required
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Moderator password"
                        className="w-full rounded-xl bg-[#141515] border border-white/10 px-4 py-2.5 text-sm text-white placeholder-[#808585] focus:outline-none focus:border-[#B7FF4C]"
                      />
                    </div>
                  </>
                )}

                <button
                  type="submit"
                  disabled={authSubmitting}
                  className="w-full px-5 py-2.5 rounded-xl bg-[#B7FF4C] text-[#0F1010] text-sm font-semibold hover:bg-[#c8ff75] disabled:opacity-60 transition-colors"
                >
                  {authSubmitting ? 'Signing In...' : 'Open Moderator Console'}
                </button>
              </form>
            )}
          </div>
        </main>
      </div>
    );
  }

  // --- AUTHENTICATED MODERATOR CONSOLE ---
  const sys = overview?.systemStatus;

  return (
    <div className="min-h-screen bg-[#0F1010] text-white flex flex-col">
      <header className="sticky top-0 z-30 h-16 px-4 sm:px-8 bg-[#0F1010]/95 backdrop-blur-md border-b border-white/[0.08] flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-[#B7FF4C] flex items-center justify-center text-[#0F1010] shrink-0">
            <Shield className="w-4 h-4 stroke-[2.5]" />
          </div>
          <div className="flex items-center gap-2 text-sm min-w-0">
            <span className="font-display font-bold text-white hidden sm:inline">CineMatch</span>
            <span className="text-[#808585] hidden sm:inline" aria-hidden="true">·</span>
            <h1 className="font-display text-base font-bold text-white truncate">
              Moderator Console
            </h1>
            {sys && (
              <>
                <span className="text-[#808585]" aria-hidden="true">·</span>
                <span
                  className={`inline-flex items-center gap-1.5 text-xs font-medium ${
                    sys.operational_state === 'operational'
                      ? 'text-[#B7FF4C]'
                      : sys.operational_state === 'degraded'
                        ? 'text-amber-300'
                        : 'text-red-300'
                  }`}
                >
                  <span
                    className={`w-2 h-2 rounded-full ${
                      sys.operational_state === 'operational'
                        ? 'bg-[#B7FF4C]'
                        : sys.operational_state === 'degraded'
                          ? 'bg-amber-400'
                          : 'bg-red-400'
                    }`}
                  />
                  {stateLabel(sys.operational_state)}
                </span>
              </>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          <span className="hidden md:inline text-xs text-[#808585]">
            Operator: <span className="text-white font-medium">{user?.username}</span>
          </span>
          <button
            type="button"
            onClick={loadConsoleData}
            disabled={consoleLoading}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#272828] border border-white/10 text-xs font-medium text-[#B4B8B8] hover:text-white hover:border-white/25 disabled:opacity-60 transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${consoleLoading ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Refresh</span>
          </button>
          <button
            type="button"
            onClick={onBackToApp}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#272828] border border-white/10 text-xs font-medium text-white hover:border-[#B7FF4C] transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5 text-[#B7FF4C]" />
            <span>User App</span>
          </button>
          <button
            type="button"
            onClick={onLogout}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#141515] border border-white/10 text-xs font-medium text-[#B4B8B8] hover:text-white hover:border-white/25 transition-colors"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Sign Out</span>
          </button>
        </div>
      </header>

      <div className="border-b border-white/[0.08] bg-[#141515] px-4 sm:px-8">
        <div className="max-w-[1440px] mx-auto flex items-center gap-2 overflow-x-auto py-3">
          <button
            type="button"
            onClick={() => setActiveTab('trends')}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-medium whitespace-nowrap transition-colors ${
              activeTab === 'trends'
                ? 'bg-[#B7FF4C] text-[#0F1010] font-semibold'
                : 'text-[#B4B8B8] hover:text-white hover:bg-[#272828]'
            }`}
          >
            <TrendingUp className="w-4 h-4" />
            <span>Trends & Overview</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('users')}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-medium whitespace-nowrap transition-colors ${
              activeTab === 'users'
                ? 'bg-[#B7FF4C] text-[#0F1010] font-semibold'
                : 'text-[#B4B8B8] hover:text-white hover:bg-[#272828]'
            }`}
          >
            <Users className="w-4 h-4" />
            <span>User Oversight</span>
            {overview && (
              <span
                className={`font-mono tabular-nums ${
                  activeTab === 'users' ? 'text-[#0F1010]/80' : 'text-[#808585]'
                }`}
              >
                {overview.summary.totalUsers}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('system')}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-medium whitespace-nowrap transition-colors ${
              activeTab === 'system'
                ? 'bg-[#B7FF4C] text-[#0F1010] font-semibold'
                : 'text-[#B4B8B8] hover:text-white hover:bg-[#272828]'
            }`}
          >
            <Sliders className="w-4 h-4" />
            <span>System Status Control</span>
          </button>
        </div>
      </div>

      <main className="flex-1 px-4 sm:px-8 py-6 sm:py-8 max-w-[1440px] w-full mx-auto space-y-6">
        {consoleError && (
          <div
            role="alert"
            className="rounded-xl bg-red-500/10 border border-red-500/30 px-4 py-3 text-sm text-red-200 flex items-center justify-between gap-4"
          >
            <span>{consoleError}</span>
            <button
              type="button"
              onClick={() => setConsoleError(null)}
              className="text-xs underline text-red-100 hover:text-white"
            >
              Dismiss
            </button>
          </div>
        )}

        {activeTab === 'trends' && (
          <>
            {/* KPI Summary Row */}
            <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
              <div className="rounded-2xl bg-[#272828] border border-white/[0.08] p-5">
                <div className="flex items-center justify-between text-xs text-[#B4B8B8]">
                  <span>Registered Accounts</span>
                  <Users className="w-4 h-4 text-[#B7FF4C]" />
                </div>
                <p className="mt-3 font-display text-3xl font-bold text-white tabular-nums">
                  {overview?.summary.totalUsers ?? '—'}
                </p>
                <p className="mt-2 text-xs text-[#808585] tabular-nums">
                  {overview
                    ? `${overview.summary.activeUsers} active · ${overview.summary.suspendedUsers} suspended`
                    : 'Loading accounts'}
                </p>
              </div>

              <div className="rounded-2xl bg-[#272828] border border-white/[0.08] p-5">
                <div className="flex items-center justify-between text-xs text-[#B4B8B8]">
                  <span>System Ratings</span>
                  <Activity className="w-4 h-4 text-[#B7FF4C]" />
                </div>
                <p className="mt-3 font-display text-3xl font-bold text-white tabular-nums">
                  {overview?.summary.totalRatings ?? '—'}
                </p>
                <p className="mt-2 text-xs text-[#808585] tabular-nums">
                  {overview
                    ? `Avg score ${overview.summary.averageSystemRating.toFixed(2)} / 5.0`
                    : 'Loading ratings'}
                </p>
              </div>

              <div className="rounded-2xl bg-[#272828] border border-white/[0.08] p-5">
                <div className="flex items-center justify-between text-xs text-[#B4B8B8]">
                  <span>Watchlist Saves</span>
                  <Film className="w-4 h-4 text-[#B7FF4C]" />
                </div>
                <p className="mt-3 font-display text-3xl font-bold text-white tabular-nums">
                  {overview?.summary.totalWatchlistSaves ?? '—'}
                </p>
                <p className="mt-2 text-xs text-[#808585] tabular-nums">
                  {overview
                    ? `${overview.summary.uniqueMoviesEngaged} unique titles tracked`
                    : 'Loading watchlist data'}
                </p>
              </div>

              <div className="rounded-2xl bg-[#272828] border border-white/[0.08] p-5">
                <div className="flex items-center justify-between text-xs text-[#B4B8B8]">
                  <span>System Status</span>
                  <Shield className="w-4 h-4 text-[#B7FF4C]" />
                </div>
                <p className="mt-3 font-display text-2xl font-bold text-white">
                  {sys ? stateLabel(sys.operational_state) : '—'}
                </p>
                <p className="mt-2 text-xs text-[#808585]">
                  {sys
                    ? [
                        sys.allow_registrations ? 'Signups on' : 'Signups paused',
                        sys.allow_ratings ? 'Ratings on' : 'Ratings paused',
                      ].join(' · ')
                    : 'Checking status'}
                </p>
              </div>
            </section>

            {/* Genre Preferences + Trending Movies */}
            <section className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              <div className="lg:col-span-5 rounded-2xl bg-[#272828] border border-white/[0.08] p-6">
                <div className="flex items-center justify-between mb-5">
                  <div>
                    <h2 className="font-display text-base font-bold text-white">
                      User Genre Trends
                    </h2>
                    <p className="text-xs text-[#808585] mt-0.5">
                      Most selected favorite genres across active profiles
                    </p>
                  </div>
                </div>

                {!overview || overview.genreTrends.length === 0 ? (
                  <p className="py-8 text-sm text-[#808585] text-center">
                    No genre preferences recorded by users yet.
                  </p>
                ) : (
                  <div className="space-y-4">
                    {overview.genreTrends.slice(0, 8).map((g) => (
                      <div key={g.genreId}>
                        <div className="flex items-center justify-between text-xs mb-1.5">
                          <span className="font-medium text-white">{g.genreName}</span>
                          <span className="text-[#B4B8B8] font-mono tabular-nums">
                            {g.userCount} {g.userCount === 1 ? 'user' : 'users'} · {g.sharePercent}%
                          </span>
                        </div>
                        <div className="h-2 rounded-full bg-[#141515] overflow-hidden">
                          <div
                            className="h-full rounded-full bg-[#B7FF4C]"
                            style={{ width: `${Math.max(4, g.sharePercent)}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="lg:col-span-7 rounded-2xl bg-[#272828] border border-white/[0.08] p-6">
                <div className="flex items-center justify-between mb-5">
                  <div>
                    <h2 className="font-display text-base font-bold text-white">
                      Top Trending Movies Among Users
                    </h2>
                    <p className="text-xs text-[#808585] mt-0.5">
                      Ranked by user ratings and watchlist saves across the platform
                    </p>
                  </div>
                </div>

                {!overview || overview.movieTrends.length === 0 ? (
                  <p className="py-8 text-sm text-[#808585] text-center">
                    No user ratings or watchlist saves have been logged yet.
                  </p>
                ) : (
                  <div className="divide-y divide-white/[0.06]">
                    {overview.movieTrends.map((m, idx) => (
                      <div key={m.movieId} className="py-3 first:pt-0 last:pb-0 flex items-center gap-3.5">
                        <span className="w-6 text-xs font-mono tabular-nums text-[#808585] shrink-0">
                          {String(idx + 1).padStart(2, '0')}
                        </span>
                        <PosterImage
                          posterPath={m.poster_path}
                          title={m.title}
                          releaseYear={m.release_date?.slice(0, 4)}
                          className="w-10 h-14 rounded-lg shrink-0"
                        />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-white truncate">{m.title}</p>
                          <p className="text-xs text-[#808585] mt-0.5 tabular-nums">
                            {m.release_date ? m.release_date.slice(0, 4) : 'Unknown year'} · ID {m.movieId}
                          </p>
                        </div>
                        <div className="text-right shrink-0 tabular-nums">
                          <p className="text-xs font-semibold text-white">
                            {m.ratingsCount} {m.ratingsCount === 1 ? 'rating' : 'ratings'}
                            {m.avgRating !== null ? ` · ${m.avgRating.toFixed(1)}/5` : ''}
                          </p>
                          <p className="text-xs text-[#B7FF4C] mt-0.5">
                            {m.watchlistCount} watchlist {m.watchlistCount === 1 ? 'save' : 'saves'}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </section>

            {/* Regions + Moderation Audit Log */}
            <section className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              <div className="lg:col-span-4 rounded-2xl bg-[#272828] border border-white/[0.08] p-6">
                <h2 className="font-display text-base font-bold text-white">
                  User Availability Regions
                </h2>
                <p className="text-xs text-[#808585] mt-0.5 mb-4">
                  Default watch-provider region distribution
                </p>
                {!overview || overview.regionDistribution.length === 0 ? (
                  <p className="py-6 text-sm text-[#808585] text-center">No user regions recorded.</p>
                ) : (
                  <div className="space-y-2.5">
                    {overview.regionDistribution.map((r) => (
                      <div
                        key={r.region}
                        className="flex items-center justify-between rounded-xl bg-[#141515] border border-white/[0.06] px-3.5 py-2.5 text-xs"
                      >
                        <span className="font-mono font-semibold text-white">{r.region}</span>
                        <span className="text-[#B4B8B8] tabular-nums">
                          {r.count} {r.count === 1 ? 'account' : 'accounts'}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                <div className="mt-5 pt-4 border-t border-white/[0.08] text-xs text-[#808585] space-y-1">
                  <p>
                    Catalog source:{' '}
                    <span className="text-white font-medium">
                      {overview?.catalogMode.tmdbActive ? 'TMDB Live API' : 'No-Key Fallback (iTunes + Archive)'}
                    </span>
                  </p>
                  {overview?.catalogMode.fallbackReason && (
                    <p className="text-[#B4B8B8]">{overview.catalogMode.fallbackReason}</p>
                  )}
                </div>
              </div>

              <div className="lg:col-span-8 rounded-2xl bg-[#272828] border border-white/[0.08] p-6">
                <h2 className="font-display text-base font-bold text-white">
                  Recent Moderation Activity
                </h2>
                <p className="text-xs text-[#808585] mt-0.5 mb-4">
                  Audit log of system status determinations and account actions
                </p>

                {!overview || overview.recentLogs.length === 0 ? (
                  <p className="py-8 text-sm text-[#808585] text-center">
                    No moderation actions have been recorded yet.
                  </p>
                ) : (
                  <div className="divide-y divide-white/[0.06] max-h-80 overflow-y-auto pr-1">
                    {overview.recentLogs.map((log) => (
                      <div key={log.log_id} className="py-3 first:pt-0 last:pb-0 flex items-start justify-between gap-4 text-xs">
                        <div className="min-w-0">
                          <p className="text-white font-medium">
                            <span className="text-[#B7FF4C] font-mono">{log.action}</span>
                            {' · '}
                            <span>{log.target}</span>
                          </p>
                          <p className="text-[#B4B8B8] mt-0.5">
                            By {log.moderator_username}
                            {log.details ? ` — ${log.details}` : ''}
                          </p>
                        </div>
                        <span className="text-[#808585] whitespace-nowrap tabular-nums shrink-0">
                          {formatDateTime(log.created_at)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </section>
          </>
        )}

        {activeTab === 'users' && (
          <section className="rounded-2xl bg-[#272828] border border-white/[0.08] p-6 space-y-5">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <h2 className="font-display text-lg font-bold text-white">
                  User Account Oversight
                </h2>
                <p className="text-xs text-[#808585] mt-0.5">
                  Monitor account statuses, engagement levels, and suspend or reactivate access.
                </p>
              </div>

              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                <div className="relative">
                  <Search className="w-4 h-4 text-[#808585] absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={userSearch}
                    onChange={(e) => setUserSearch(e.target.value)}
                    placeholder="Filter username, email, region..."
                    className="w-full sm:w-64 rounded-xl bg-[#141515] border border-white/10 pl-9 pr-3 py-2 text-xs text-white placeholder-[#808585] focus:outline-none focus:border-[#B7FF4C]"
                  />
                </div>

                <div className="flex items-center gap-1 p-1 rounded-xl bg-[#141515] border border-white/[0.08]">
                  {(['all', 'active', 'suspended'] as const).map((f) => (
                    <button
                      key={f}
                      type="button"
                      onClick={() => setStatusFilter(f)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-colors ${
                        statusFilter === f
                          ? 'bg-[#B7FF4C] text-[#0F1010] font-semibold'
                          : 'text-[#B4B8B8] hover:text-white'
                      }`}
                    >
                      {f}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {filteredUsers.length === 0 ? (
              <div className="py-12 text-center text-sm text-[#808585]">
                No user accounts match the current filter.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-white/[0.08] text-[11px] uppercase tracking-wider text-[#808585]">
                      <th className="py-3 pr-4 font-medium">Account</th>
                      <th className="py-3 px-4 font-medium">Role</th>
                      <th className="py-3 px-4 font-medium">Status</th>
                      <th className="py-3 px-4 font-medium">Region</th>
                      <th className="py-3 px-4 font-medium">Activity</th>
                      <th className="py-3 px-4 font-medium">Joined</th>
                      <th className="py-3 pl-4 font-medium text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.06] text-xs">
                    {filteredUsers.map((u) => {
                      const isSelf = user?.user_id === u.user_id;
                      const isSuspended = u.account_status === 'suspended';
                      return (
                        <tr key={u.user_id} className="hover:bg-white/[0.02]">
                          <td className="py-3.5 pr-4">
                            <p className="font-semibold text-white">{u.username}</p>
                            <p className="text-[#808585]">{u.email}</p>
                          </td>
                          <td className="py-3.5 px-4">
                            <span
                              className={`font-mono ${
                                u.role === 'moderator' ? 'text-[#B7FF4C]' : 'text-[#B4B8B8]'
                              }`}
                            >
                              {u.role}
                            </span>
                          </td>
                          <td className="py-3.5 px-4">
                            <span
                              className={`inline-flex items-center gap-1.5 font-medium ${
                                isSuspended ? 'text-red-300' : 'text-[#B7FF4C]'
                              }`}
                            >
                              <span
                                className={`w-1.5 h-1.5 rounded-full ${
                                  isSuspended ? 'bg-red-400' : 'bg-[#B7FF4C]'
                                }`}
                              />
                              {isSuspended ? 'Suspended' : 'Active'}
                            </span>
                          </td>
                          <td className="py-3.5 px-4 font-mono text-[#B4B8B8]">
                            {u.preferred_region}
                          </td>
                          <td className="py-3.5 px-4 text-[#B4B8B8] tabular-nums">
                            <span>{u.ratings_count} ratings</span>
                            {u.avg_rating !== null && <span> · {u.avg_rating.toFixed(1)} avg</span>}
                            <span> · {u.watchlist_count} saved</span>
                            <span> · {u.favorite_genres.length} genres</span>
                          </td>
                          <td className="py-3.5 px-4 text-[#808585] tabular-nums whitespace-nowrap">
                            {formatDate(u.created_at)}
                          </td>
                          <td className="py-3.5 pl-4 text-right">
                            {isSelf ? (
                              <span className="text-[#808585]">Current session</span>
                            ) : (
                              <button
                                type="button"
                                disabled={pendingUserId === u.user_id}
                                onClick={() => handleToggleUserStatus(u)}
                                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors disabled:opacity-50 ${
                                  isSuspended
                                    ? 'bg-[#B7FF4C]/10 border-[#B7FF4C]/40 text-[#B7FF4C] hover:bg-[#B7FF4C]/20'
                                    : 'bg-red-500/10 border-red-500/30 text-red-200 hover:bg-red-500/20'
                                }`}
                              >
                                {isSuspended ? (
                                  <>
                                    <UserCheck className="w-3.5 h-3.5" />
                                    <span>Reactivate</span>
                                  </>
                                ) : (
                                  <>
                                    <UserX className="w-3.5 h-3.5" />
                                    <span>Suspend</span>
                                  </>
                                )}
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}

        {activeTab === 'system' && (
          <section className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <form
              onSubmit={handleSaveSystemStatus}
              className="lg:col-span-8 rounded-2xl bg-[#272828] border border-white/[0.08] p-6 space-y-6"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="font-display text-lg font-bold text-white">
                    Determine System Status
                  </h2>
                  <p className="text-xs text-[#808585] mt-0.5">
                    Control overall platform availability, feature gates, and user-facing notices.
                  </p>
                </div>
                {sys && sys.operational_state !== 'operational' && (
                  <button
                    type="button"
                    disabled={savingStatus}
                    onClick={handleRestoreOperational}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#B7FF4C]/15 border border-[#B7FF4C]/40 text-xs font-semibold text-[#B7FF4C] hover:bg-[#B7FF4C]/25 transition-colors"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Restore Full Operational</span>
                  </button>
                )}
              </div>

              <div>
                <p className="text-xs font-medium text-[#B4B8B8] mb-2.5">Overall Platform State</p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {STATE_OPTIONS.map((opt) => {
                    const selected = draftState === opt.value;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setDraftState(opt.value)}
                        className={`text-left rounded-xl p-4 border transition-colors ${
                          selected
                            ? 'bg-[#141515] border-[#B7FF4C]'
                            : 'bg-[#141515] border-white/10 hover:border-white/25'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-semibold text-white">{opt.label}</span>
                          {opt.value === 'operational' ? (
                            <CheckCircle2 className={`w-4 h-4 ${selected ? 'text-[#B7FF4C]' : 'text-[#808585]'}`} />
                          ) : opt.value === 'degraded' ? (
                            <AlertTriangle className={`w-4 h-4 ${selected ? 'text-amber-300' : 'text-[#808585]'}`} />
                          ) : (
                            <ShieldAlert className={`w-4 h-4 ${selected ? 'text-red-300' : 'text-[#808585]'}`} />
                          )}
                        </div>
                        <p className="mt-2 text-xs text-[#808585] leading-relaxed">{opt.summary}</p>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-3">
                <p className="text-xs font-medium text-[#B4B8B8]">Feature Controls</p>

                <label className="flex items-center justify-between gap-4 rounded-xl bg-[#141515] border border-white/[0.08] px-4 py-3 cursor-pointer">
                  <div>
                    <p className="text-sm font-medium text-white">Allow New Registrations</p>
                    <p className="text-xs text-[#808585]">
                      When disabled, new users cannot register accounts.
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    checked={draftAllowReg}
                    onChange={(e) => setDraftAllowReg(e.target.checked)}
                    className="h-4 w-4 accent-[#B7FF4C]"
                  />
                </label>

                <label className="flex items-center justify-between gap-4 rounded-xl bg-[#141515] border border-white/[0.08] px-4 py-3 cursor-pointer">
                  <div>
                    <p className="text-sm font-medium text-white">Allow Movie Ratings</p>
                    <p className="text-xs text-[#808585]">
                      When disabled, standard users cannot submit new movie ratings.
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    checked={draftAllowRatings}
                    onChange={(e) => setDraftAllowRatings(e.target.checked)}
                    className="h-4 w-4 accent-[#B7FF4C]"
                  />
                </label>

                <label className="flex items-center justify-between gap-4 rounded-xl bg-[#141515] border border-white/[0.08] px-4 py-3 cursor-pointer">
                  <div>
                    <p className="text-sm font-medium text-white">Allow Watchlist Updates</p>
                    <p className="text-xs text-[#808585]">
                      When disabled, standard users cannot add new titles to their watchlist.
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    checked={draftAllowWatchlist}
                    onChange={(e) => setDraftAllowWatchlist(e.target.checked)}
                    className="h-4 w-4 accent-[#B7FF4C]"
                  />
                </label>
              </div>

              <div>
                <label htmlFor="sys-banner" className="block text-xs font-medium text-[#B4B8B8] mb-1.5">
                  System-Wide Notice Banner (optional, visible to all users)
                </label>
                <textarea
                  id="sys-banner"
                  rows={2}
                  maxLength={280}
                  value={draftBanner}
                  onChange={(e) => setDraftBanner(e.target.value)}
                  placeholder="e.g., Scheduled catalog maintenance tonight at 11:00 PM PHT."
                  className="w-full rounded-xl bg-[#141515] border border-white/10 px-4 py-2.5 text-sm text-white placeholder-[#808585] focus:outline-none focus:border-[#B7FF4C]"
                />
                <p className="mt-1 text-[11px] text-[#808585] tabular-nums">
                  {draftBanner.length}/280 characters
                </p>
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="submit"
                  disabled={savingStatus}
                  className="px-5 py-2.5 rounded-xl bg-[#B7FF4C] text-[#0F1010] text-sm font-semibold hover:bg-[#c8ff75] disabled:opacity-60 transition-colors"
                >
                  {savingStatus ? 'Applying Status...' : 'Apply System Status'}
                </button>
              </div>
            </form>

            <div className="lg:col-span-4 rounded-2xl bg-[#272828] border border-white/[0.08] p-6 space-y-4 h-fit">
              <h3 className="font-display text-base font-bold text-white">Active Configuration</h3>
              {sys ? (
                <div className="space-y-3 text-xs">
                  <div className="rounded-xl bg-[#141515] border border-white/[0.06] p-3.5 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[#808585]">Operational State</span>
                      <span className="font-semibold text-white">{stateLabel(sys.operational_state)}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-[#808585]">Registrations</span>
                      <span className={sys.allow_registrations ? 'text-[#B7FF4C]' : 'text-red-300'}>
                        {sys.allow_registrations ? 'Enabled' : 'Paused'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-[#808585]">Movie Ratings</span>
                      <span className={sys.allow_ratings ? 'text-[#B7FF4C]' : 'text-red-300'}>
                        {sys.allow_ratings ? 'Enabled' : 'Paused'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-[#808585]">Watchlist Writes</span>
                      <span className={sys.allow_watchlist ? 'text-[#B7FF4C]' : 'text-red-300'}>
                        {sys.allow_watchlist ? 'Enabled' : 'Paused'}
                      </span>
                    </div>
                  </div>
                  <p className="text-[#808585] tabular-nums">
                    Last updated by <span className="text-white">{sys.updated_by}</span> ·{' '}
                    {formatDateTime(sys.updated_at)}
                  </p>
                </div>
              ) : (
                <p className="text-xs text-[#808585]">Loading current configuration...</p>
              )}
            </div>
          </section>
        )}
      </main>

      {notice && (
        <div
          role="status"
          className="fixed bottom-5 right-5 z-50 rounded-xl bg-[#272828] border border-[#B7FF4C]/50 px-4 py-3 text-xs font-medium text-white shadow-xl"
        >
          {notice}
        </div>
      )}
    </div>
  );
}
