import React, { useState, useCallback } from 'react';
import {
  useGetVault,
  useGetVaultActivity,
  useUpdateVault,
  getGetVaultQueryKey,
  getGetVaultActivityQueryKey,
  getGetVaultStatsQueryKey,
} from '@workspace/api-client-react';
import type { ActivityEvent, VaultDetail } from '@workspace/api-client-react';
import { useWallet } from '@/context/WalletContext';
import { useRoute, Link } from 'wouter';
import { useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  Lock,
  Split,
  CheckCircle2,
  PauseCircle,
  XCircle,
  RefreshCw,
  Settings,
  ExternalLink,
  CalendarDays,
  Copy,
  Check,
  Clock,
  TrendingUp,
  Hash,
  Globe,
  FileDown,
  ArrowUpRight,
  FileClock,
  Coins,
  User,
  Wallet,
  BarChart3,
} from 'lucide-react';

// ── Utilities ─────────────────────────────────────────────────────────────────

function relativeTime(dateStr: string): string {
  const ms = Date.now() - new Date(dateStr).getTime();
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s} second${s !== 1 ? 's' : ''} ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} minute${m !== 1 ? 's' : ''} ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} hour${h !== 1 ? 's' : ''} ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d} day${d !== 1 ? 's' : ''} ago`;
  return new Date(dateStr).toLocaleDateString();
}

function formatAddr(addr: string, chars = 8): string {
  if (addr.length <= chars * 2 + 3) return addr;
  return `${addr.slice(0, chars)}…${addr.slice(-chars)}`;
}

function addMonths(date: Date, months: number): Date {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
}

function getScheduleIntervalMonths(schedule: string): number {
  switch (schedule) {
    case 'monthly': return 1;
    case 'quarterly': return 3;
    case 'annually': return 12;
    default: return 0; // one_time
  }
}

function getNextReleaseDate(createdAt: string, schedule: string, durationMonths: number): Date | null {
  if (schedule === 'one_time') return addMonths(new Date(createdAt), durationMonths);
  const interval = getScheduleIntervalMonths(schedule);
  const start = new Date(createdAt);
  const now = new Date();
  let next = addMonths(start, interval);
  const final = addMonths(start, durationMonths);
  while (next <= now && next < final) {
    next = addMonths(next, interval);
  }
  return next > final ? null : next;
}

function getFinalReleaseDate(createdAt: string, durationMonths: number): Date {
  return addMonths(new Date(createdAt), durationMonths);
}

function formatScheduleLabel(schedule: string): string {
  switch (schedule) {
    case 'one_time': return 'One-time';
    case 'monthly': return 'Monthly';
    case 'quarterly': return 'Quarterly';
    case 'annually': return 'Annually';
    default: return schedule;
  }
}

function scheduleFrequency(schedule: string): string {
  switch (schedule) {
    case 'one_time': return 'Single payment at end of duration';
    case 'monthly': return 'Every month';
    case 'quarterly': return 'Every 3 months';
    case 'annually': return 'Once per year';
    default: return schedule;
  }
}

// ── Copy hook ─────────────────────────────────────────────────────────────────

function useCopy(): [boolean, (text: string) => void] {
  const [copied, setCopied] = useState(false);
  const copy = useCallback((text: string) => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text).then(
        () => { setCopied(true); setTimeout(() => setCopied(false), 2000); },
        () => fallbackCopy(text, setCopied)
      );
    } else {
      fallbackCopy(text, setCopied);
    }
  }, []);
  return [copied, copy];
}

function fallbackCopy(text: string, setCopied: (v: boolean) => void) {
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;opacity:0';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  } catch {
    // silently ignore if copy is entirely unavailable
  }
}

// ── CopyButton ────────────────────────────────────────────────────────────────

function CopyButton({ text, className = '' }: { text: string; className?: string }) {
  const [copied, copy] = useCopy();
  return (
    <button
      onClick={() => copy(text)}
      title={copied ? 'Copied!' : 'Copy to clipboard'}
      className={`inline-flex items-center justify-center p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors ${className}`}
    >
      {copied ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
    </button>
  );
}

// ── CopyableAddress ───────────────────────────────────────────────────────────

function CopyableAddress({ address, chars = 10 }: { address: string; chars?: number }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="font-mono text-sm">{formatAddr(address, chars)}</span>
      <CopyButton text={address} />
    </span>
  );
}

// ── StatusBadge ───────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { icon: React.ReactNode; cls: string }> = {
    active: {
      icon: <CheckCircle2 className="w-3 h-3" />,
      cls: 'border-green-500/30 text-green-500 bg-green-500/10',
    },
    paused: {
      icon: <PauseCircle className="w-3 h-3" />,
      cls: 'border-yellow-500/30 text-yellow-500 bg-yellow-500/10',
    },
    completed: {
      icon: <CheckCircle2 className="w-3 h-3" />,
      cls: 'border-muted-foreground/30 text-muted-foreground bg-muted/50',
    },
    failed: {
      icon: <XCircle className="w-3 h-3" />,
      cls: 'border-destructive/30 text-destructive bg-destructive/10',
    },
    pending: {
      icon: <Clock className="w-3 h-3" />,
      cls: 'border-blue-400/30 text-blue-400 bg-blue-400/10',
    },
  };
  const style = map[status] ?? {
    icon: null,
    cls: 'border-muted-foreground/30 text-muted-foreground bg-muted/50',
  };
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded border ${style.cls}`}>
      {style.icon}
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}

// ── InfoRow ───────────────────────────────────────────────────────────────────

function InfoRow({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3 py-3 border-b border-card-border last:border-0">
      <div className="mt-0.5 text-muted-foreground shrink-0">{icon}</div>
      <div className="flex-1 min-w-0">
        <p className="text-xs text-muted-foreground mb-0.5">{label}</p>
        <div className="text-sm font-medium break-all">{children}</div>
      </div>
    </div>
  );
}

// ── OverviewCard ──────────────────────────────────────────────────────────────

function OverviewCard({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: React.ReactNode;
  sub?: string;
  accent?: boolean;
}) {
  return (
    <div className="bg-card border border-card-border rounded-xl p-5">
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">{label}</p>
      <p className={`text-2xl font-semibold tracking-tight ${accent ? 'text-primary' : ''}`}>{value}</p>
      {sub && <p className="text-xs text-muted-foreground mt-1.5">{sub}</p>}
    </div>
  );
}

// ── SectionHeader ─────────────────────────────────────────────────────────────

function SectionHeader({ title, sub }: { title: string; sub?: string }) {
  return (
    <div className="mb-4">
      <h2 className="text-lg font-medium tracking-tight">{title}</h2>
      {sub && <p className="text-sm text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  );
}

// ── Activity event config ─────────────────────────────────────────────────────

const EVENT_CONFIG: Record<string, { icon: React.ReactNode; dot: string; label: string }> = {
  vault_created: {
    icon: <FileClock className="w-4 h-4 text-primary" />,
    dot: 'bg-primary',
    label: 'Vault Created',
  },
  funds_locked: {
    icon: <Lock className="w-4 h-4 text-blue-400" />,
    dot: 'bg-blue-400',
    label: 'Funds Locked',
  },
  payment_released: {
    icon: <ArrowUpRight className="w-4 h-4 text-green-400" />,
    dot: 'bg-green-400',
    label: 'Payment Released',
  },
  split_executed: {
    icon: <Split className="w-4 h-4 text-purple-400" />,
    dot: 'bg-purple-400',
    label: 'Split Executed',
  },
  recipient_added: {
    icon: <User className="w-4 h-4 text-muted-foreground" />,
    dot: 'bg-muted-foreground',
    label: 'Recipient Added',
  },
  vault_paused: {
    icon: <PauseCircle className="w-4 h-4 text-yellow-500" />,
    dot: 'bg-yellow-500',
    label: 'Vault Paused',
  },
  vault_completed: {
    icon: <CheckCircle2 className="w-4 h-4 text-muted-foreground" />,
    dot: 'bg-muted-foreground',
    label: 'Vault Completed',
  },
};

// ── Skeleton ──────────────────────────────────────────────────────────────────

function PageSkeleton() {
  return (
    <div className="max-w-6xl mx-auto px-4 py-8 animate-pulse space-y-6">
      <div className="h-5 w-40 bg-card rounded-md" />
      <div className="h-10 w-72 bg-card rounded-lg" />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => <div key={i} className="h-24 bg-card rounded-xl" />)}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="h-64 bg-card rounded-xl" />
        <div className="h-64 bg-card rounded-xl" />
      </div>
      <div className="h-48 bg-card rounded-xl" />
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function VaultDetails() {
  const [, params] = useRoute('/vaults/:id');
  const id = Number(params?.id);
  const { address, network } = useWallet();
  const queryClient = useQueryClient();

  const { data: vault, isLoading } = useGetVault(id, {
    query: { enabled: !!id && !!address, queryKey: getGetVaultQueryKey(id) },
  });
  const { data: activity } = useGetVaultActivity(id, {
    query: { enabled: !!id && !!address, queryKey: getGetVaultActivityQueryKey(id) },
  });
  const updateVault = useUpdateVault();
  const [vaultIdCopied, copyVaultId] = useCopy();

  if (isLoading) return <PageSkeleton />;
  if (!vault) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-16 text-center">
        <div className="w-16 h-16 bg-card border border-card-border rounded-full flex items-center justify-center mx-auto mb-4">
          <Lock className="w-7 h-7 text-muted-foreground" />
        </div>
        <h2 className="text-lg font-medium mb-2">Vault Not Found</h2>
        <p className="text-sm text-muted-foreground mb-6">
          This vault doesn't exist or you don't have access to it.
        </p>
        <Link href="/" className="inline-flex items-center gap-2 text-sm text-primary hover:underline font-medium">
          <ArrowLeft className="w-4 h-4" /> Back to Dashboard
        </Link>
      </div>
    );
  }

  const handleToggleStatus = () => {
    const newStatus = vault.status === 'active' ? 'paused' : 'active';
    updateVault.mutate(
      { id, data: { status: newStatus } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetVaultQueryKey(id) });
          queryClient.invalidateQueries({ queryKey: getGetVaultActivityQueryKey(id) });
          queryClient.invalidateQueries({ queryKey: getGetVaultStatsQueryKey() });
        },
      }
    );
  };

  // ── Derived values ──────────────────────────────────────────────────────────
  const isLock = vault.type === 'lock';
  const lock = vault.lockDetails;

  // Total released: for lock vaults derive from locked - balance;
  // for split vaults (and as fallback) sum positive amounts from payout events.
  const activityReleased = (activity ?? [])
    .filter((e) => e.eventType === 'payment_released' || e.eventType === 'split_executed')
    .reduce((sum, e) => sum + (e.amount ?? 0), 0);

  const totalReleased = isLock && lock
    ? Math.max(0, lock.amountStx - vault.balance)
    : activityReleased;

  const progressPct = isLock && lock && lock.amountStx > 0
    ? Math.min(100, (totalReleased / lock.amountStx) * 100)
    : 0;

  const startDate = new Date(vault.createdAt);
  const finalDate = isLock && lock ? getFinalReleaseDate(vault.createdAt, lock.durationMonths) : null;
  const nextDate = isLock && lock && lock.releaseSchedule !== 'one_time'
    ? getNextReleaseDate(vault.createdAt, lock.releaseSchedule, lock.durationMonths)
    : finalDate;

  // Transactions: activity events with amounts
  const transactions = (activity ?? [])
    .filter((e) => e.amount != null)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  // Activity: newest first
  const timeline = [...(activity ?? [])].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 space-y-8">

      {/* ── Back + last updated ── */}
      <div className="flex items-center justify-between">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="w-4 h-4" /> Back to Dashboard
        </Link>
        <span className="text-xs text-muted-foreground flex items-center gap-1.5">
          <Clock className="w-3.5 h-3.5" />
          Updated {relativeTime(vault.updatedAt)}
        </span>
      </div>

      {/* ── Header ── */}
      <div className="flex flex-col md:flex-row md:items-start justify-between gap-6">
        <div>
          <div className="flex flex-wrap items-center gap-3 mb-2">
            <h1 className="text-3xl font-semibold tracking-tight">{vault.name}</h1>
            {isLock ? (
              <span className="inline-flex items-center gap-1.5 text-xs uppercase tracking-wider font-semibold bg-blue-500/10 text-blue-400 px-2.5 py-1 rounded border border-blue-500/20">
                <Lock className="w-3.5 h-3.5" /> Lock Vault
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 text-xs uppercase tracking-wider font-semibold bg-purple-500/10 text-purple-400 px-2.5 py-1 rounded border border-purple-500/20">
                <Split className="w-3.5 h-3.5" /> Split Vault
              </span>
            )}
            <StatusBadge status={vault.status} />
          </div>
          {vault.description && (
            <p className="text-muted-foreground text-sm mt-1 max-w-2xl">{vault.description}</p>
          )}
        </div>

        <div className="flex items-center gap-3 shrink-0">
          {vault.status !== 'completed' && (
            <button
              onClick={handleToggleStatus}
              disabled={updateVault.isPending}
              className={`px-4 py-2 rounded-md font-medium text-sm flex items-center gap-2 border transition-colors disabled:opacity-50 ${
                vault.status === 'active'
                  ? 'border-yellow-500/30 text-yellow-500 hover:bg-yellow-500/10'
                  : 'border-green-500/30 text-green-500 hover:bg-green-500/10'
              }`}
            >
              <RefreshCw className={`w-4 h-4 ${updateVault.isPending ? 'animate-spin' : ''}`} />
              {vault.status === 'active' ? 'Pause Vault' : 'Resume Vault'}
            </button>
          )}
          <button
            title="Settings"
            className="p-2 border border-card-border rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
          >
            <Settings className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* ── Overview Cards ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <OverviewCard
          label="Current Balance"
          value={`${vault.balance.toLocaleString()} USDCx`}
          sub="Available in vault"
          accent
        />
        {isLock && lock ? (
          <>
            <OverviewCard
              label="Locked Amount"
              value={`${lock.amountStx.toLocaleString()} USDCx`}
              sub="Total committed"
            />
            <OverviewCard
              label="Total Released"
              value={`${totalReleased.toLocaleString()} USDCx`}
              sub={`${progressPct.toFixed(1)}% of locked`}
            />
            <OverviewCard
              label="Remaining Locked"
              value={`${vault.balance.toLocaleString()} USDCx`}
              sub={finalDate ? `Until ${finalDate.toLocaleDateString()}` : undefined}
            />
          </>
        ) : (
          <>
            <OverviewCard
              label="Recipients"
              value={(vault.splitRecipients ?? []).length}
              sub="Active splits"
            />
            <OverviewCard
              label="Total Distributed"
              value={`${totalReleased.toLocaleString()} USDCx`}
              sub="Lifetime payouts"
            />
            <OverviewCard
              label="Vault ID"
              value={`#${vault.id}`}
              sub={`${vault.type.charAt(0).toUpperCase() + vault.type.slice(1)} vault`}
            />
          </>
        )}
      </div>

      {/* ── Vault Information + Release Rules ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Vault Information */}
        <div>
          <SectionHeader title="Vault Information" />
          <div className="bg-card border border-card-border rounded-xl px-5 py-2">
            <InfoRow icon={<Hash className="w-4 h-4" />} label="Vault ID">
              <span className="flex items-center gap-2">
                <span className="font-mono">#{vault.id}</span>
                <CopyButton text={String(vault.id)} />
              </span>
            </InfoRow>
            <InfoRow icon={<Wallet className="w-4 h-4" />} label="Creator Address">
              <CopyableAddress address={vault.ownerAddress} />
            </InfoRow>
            {isLock && lock && (
              <InfoRow icon={<User className="w-4 h-4" />} label="Recipient Address">
                <CopyableAddress address={lock.recipientAddress} />
              </InfoRow>
            )}
            <InfoRow icon={isLock ? <Lock className="w-4 h-4" /> : <Split className="w-4 h-4" />} label="Vault Type">
              {isLock ? 'Lock Vault' : 'Split Vault'}
            </InfoRow>
            <InfoRow icon={<Globe className="w-4 h-4" />} label="Network">
              <span className="flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${network === 'mainnet' ? 'bg-green-500' : 'bg-yellow-500'}`} />
                {network === 'mainnet' ? 'Mainnet' : 'Testnet'}
              </span>
            </InfoRow>
            <InfoRow icon={<CalendarDays className="w-4 h-4" />} label="Created">
              {new Date(vault.createdAt).toLocaleString(undefined, {
                dateStyle: 'medium',
                timeStyle: 'short',
              })}
            </InfoRow>
          </div>
        </div>

        {/* Release Rules (Lock) or Split Breakdown */}
        {isLock && lock ? (
          <div>
            <SectionHeader title="Release Rules" sub="Automated schedule for fund distribution" />
            <div className="bg-card border border-card-border rounded-xl px-5 py-2">
              <InfoRow icon={<Coins className="w-4 h-4" />} label="Locked Amount">
                <span className="text-primary font-semibold">{lock.amountStx.toLocaleString()} USDCx</span>
              </InfoRow>
              <InfoRow icon={<RefreshCw className="w-4 h-4" />} label="Release Schedule">
                {formatScheduleLabel(lock.releaseSchedule)}
              </InfoRow>
              <InfoRow icon={<Clock className="w-4 h-4" />} label="Frequency">
                {scheduleFrequency(lock.releaseSchedule)}
              </InfoRow>
              <InfoRow icon={<BarChart3 className="w-4 h-4" />} label="Duration">
                {lock.durationMonths} month{lock.durationMonths !== 1 ? 's' : ''}
              </InfoRow>
              <InfoRow icon={<CalendarDays className="w-4 h-4" />} label="Start Date">
                {startDate.toLocaleDateString(undefined, { dateStyle: 'medium' })}
              </InfoRow>
              {lock.releaseSchedule !== 'one_time' && nextDate && (
                <InfoRow icon={<ArrowUpRight className="w-4 h-4" />} label="Next Release">
                  <span className="text-green-400">{nextDate.toLocaleDateString(undefined, { dateStyle: 'medium' })}</span>
                </InfoRow>
              )}
              {finalDate && (
                <InfoRow icon={<CheckCircle2 className="w-4 h-4" />} label="Final Release">
                  {finalDate.toLocaleDateString(undefined, { dateStyle: 'medium' })}
                </InfoRow>
              )}
            </div>
          </div>
        ) : (
          <div>
            <SectionHeader title="Split Configuration" sub="Percentage distribution to recipients" />
            <div className="bg-card border border-card-border rounded-xl overflow-hidden">
              <div className="px-5 py-3 border-b border-card-border bg-muted/30 flex justify-between text-xs font-medium text-muted-foreground uppercase tracking-wider">
                <span>Recipient Address</span>
                <span>Allocation</span>
              </div>
              {(vault.splitRecipients ?? []).length > 0 ? (
                <div className="divide-y divide-card-border">
                  {(vault.splitRecipients ?? []).map((r, i) => (
                    <div key={i} className="px-5 py-4 flex items-center justify-between gap-4">
                      <CopyableAddress address={r.address} chars={10} />
                      <div className="flex items-center gap-3 shrink-0">
                        <div className="w-20 h-1.5 bg-input rounded-full overflow-hidden">
                          <div className="h-full bg-primary rounded-full" style={{ width: `${r.percentage}%` }} />
                        </div>
                        <span className="text-sm font-semibold w-12 text-right">{r.percentage}%</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-8 text-center text-sm text-muted-foreground">No recipients configured.</div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── Vault Progress (Lock Vault only) ── */}
      {isLock && lock && (
        <div>
          <SectionHeader title="Vault Progress" />
          <div className="bg-card border border-card-border rounded-xl p-6">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-primary" />
                <span className="text-sm font-medium">Release Progress</span>
              </div>
              <span className="text-sm font-semibold text-primary">{progressPct.toFixed(1)}% Released</span>
            </div>

            {/* Progress bar */}
            <div className="w-full h-3 bg-input rounded-full overflow-hidden mb-4">
              <div
                className="h-full bg-primary rounded-full transition-all duration-700"
                style={{ width: `${progressPct}%` }}
              />
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mt-2">
              <div className="text-center p-3 bg-muted/30 rounded-lg border border-card-border">
                <p className="text-xs text-muted-foreground mb-1">Released</p>
                <p className="text-base font-semibold text-green-400">{totalReleased.toLocaleString()} USDCx</p>
              </div>
              <div className="text-center p-3 bg-muted/30 rounded-lg border border-card-border">
                <p className="text-xs text-muted-foreground mb-1">Remaining</p>
                <p className="text-base font-semibold text-primary">{vault.balance.toLocaleString()} USDCx</p>
              </div>
              {nextDate && (
                <div className="text-center p-3 bg-muted/30 rounded-lg border border-card-border col-span-2 sm:col-span-1">
                  <p className="text-xs text-muted-foreground mb-1">Next Release In</p>
                  <p className="text-base font-semibold">
                    {Math.max(0, Math.ceil((nextDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)))} days
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Recipient Section (Lock Vault) ── */}
      {isLock && lock && (
        <div>
          <SectionHeader title="Recipient" sub="Designated wallet for released funds" />
          <div className="bg-card border border-card-border rounded-xl p-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                  <User className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Wallet Address</p>
                  <CopyableAddress address={lock.recipientAddress} chars={14} />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-6 sm:text-right">
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Total Amount</p>
                  <p className="text-sm font-semibold">{lock.amountStx.toLocaleString()} USDCx</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Schedule</p>
                  <p className="text-sm font-medium">{formatScheduleLabel(lock.releaseSchedule)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Status</p>
                  <StatusBadge status={vault.status} />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Activity Timeline + Transaction History ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Activity Timeline */}
        <div>
          <SectionHeader title="Activity Timeline" sub="All vault events, newest first" />
          <div className="bg-card border border-card-border rounded-xl overflow-hidden">
            {timeline.length > 0 ? (
              <div className="relative px-5 py-5">
                <div className="absolute left-[33px] top-5 bottom-5 w-px bg-card-border" />
                <div className="space-y-5 relative">
                  {timeline.map((event) => {
                    const cfg = EVENT_CONFIG[event.eventType] ?? {
                      icon: <FileClock className="w-4 h-4 text-muted-foreground" />,
                      dot: 'bg-muted-foreground',
                      label: event.eventType,
                    };
                    return (
                      <div key={event.id} className="flex gap-4">
                        <div className="shrink-0 relative z-10">
                          <div
                            className={`w-3 h-3 rounded-full mt-1.5 ring-4 ring-card ${cfg.dot}`}
                          />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2">
                            <p className="text-sm font-medium leading-snug">{event.description}</p>
                            {event.amount != null && (
                              <span className="text-xs font-semibold text-primary shrink-0">
                                {event.amount > 0 ? '+' : ''}{event.amount.toLocaleString()} USDCx
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-xs text-muted-foreground">
                              {new Date(event.createdAt).toLocaleString(undefined, {
                                dateStyle: 'medium',
                                timeStyle: 'short',
                              })}
                            </span>
                            <span className="text-muted-foreground/40">·</span>
                            <span className="text-xs text-muted-foreground">{cfg.label}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <EmptyState
                icon={<FileClock className="w-6 h-6" />}
                title="No activity yet"
                body="Events will appear here once the vault starts processing."
              />
            )}
          </div>
        </div>

        {/* Transaction History */}
        <div>
          <SectionHeader title="Transaction History" sub="On-chain transactions for this vault" />
          <div className="bg-card border border-card-border rounded-xl overflow-hidden">
            {transactions.length > 0 ? (
              <>
                <div className="grid grid-cols-4 px-4 py-2.5 border-b border-card-border text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  <span>Date</span>
                  <span>Type</span>
                  <span className="text-right">Amount</span>
                  <span className="text-right">Status</span>
                </div>
                <div className="divide-y divide-card-border">
                  {transactions.map((tx) => {
                    const txCfg = EVENT_CONFIG[tx.eventType];
                    return (
                      <div key={tx.id} className="grid grid-cols-4 items-center px-4 py-3 gap-2">
                        <span className="text-xs text-muted-foreground">
                          {new Date(tx.createdAt).toLocaleDateString()}
                        </span>
                        <span className="text-xs font-medium truncate">
                          {txCfg?.label ?? tx.eventType}
                        </span>
                        <span className="text-xs font-semibold text-right text-primary">
                          {tx.amount != null ? `${tx.amount > 0 ? '+' : ''}${tx.amount.toLocaleString()} USDCx` : '—'}
                        </span>
                        <div className="flex justify-end">
                          <span className="inline-flex items-center gap-1 text-xs bg-green-500/10 text-green-400 border border-green-500/20 px-2 py-0.5 rounded">
                            <CheckCircle2 className="w-2.5 h-2.5" /> Confirmed
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="px-4 py-2.5 border-t border-card-border bg-muted/20">
                  <p className="text-xs text-muted-foreground">
                    Transaction hashes will appear once blockchain integration is active.
                  </p>
                </div>
              </>
            ) : (
              <EmptyState
                icon={<ArrowUpRight className="w-6 h-6" />}
                title="No transactions yet"
                body="On-chain transactions will appear here once funds are deposited and released."
              />
            )}
          </div>
        </div>
      </div>

      {/* ── Vault Actions ── */}
      <div>
        <SectionHeader title="Vault Actions" />
        <div className="bg-card border border-card-border rounded-xl p-5">
          <div className="flex flex-wrap gap-3">
            <ActionButton
              icon={<ExternalLink className="w-4 h-4" />}
              label="View on Explorer"
              onClick={() =>
                window.open(
                  `https://explorer.hiro.so/address/${vault.ownerAddress}?chain=${network}`,
                  '_blank'
                )
              }
            />
            <ActionButton
              icon={vaultIdCopied ? <Check className="w-4 h-4 text-green-500" /> : <Hash className="w-4 h-4" />}
              label={vaultIdCopied ? 'Vault ID Copied!' : 'Copy Vault ID'}
              onClick={() => copyVaultId(String(vault.id))}
            />
            <ActionButton
              icon={<FileDown className="w-4 h-4" />}
              label="Export Vault Details"
              onClick={() => exportVaultDetails(vault, activity ?? [])}
            />
          </div>
          <p className="text-xs text-muted-foreground mt-4 border-t border-card-border pt-4">
            Explorer links resolve on-chain once the vault is deployed to the Stacks network.
            Export creates a JSON snapshot of current vault state.
          </p>
        </div>
      </div>
    </div>
  );
}

// ── ActionButton ──────────────────────────────────────────────────────────────

function ActionButton({
  icon,
  label,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center gap-2 px-4 py-2 rounded-md border border-card-border bg-card hover:border-primary/50 hover:bg-primary/5 text-sm font-medium text-foreground transition-colors"
    >
      {icon}
      {label}
    </button>
  );
}

// ── EmptyState ────────────────────────────────────────────────────────────────

function EmptyState({
  icon,
  title,
  body,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center p-10 text-center">
      <div className="w-12 h-12 rounded-full bg-muted/50 flex items-center justify-center mb-3 text-muted-foreground">
        {icon}
      </div>
      <p className="text-sm font-medium mb-1">{title}</p>
      <p className="text-xs text-muted-foreground max-w-xs">{body}</p>
    </div>
  );
}

// ── Export helper ─────────────────────────────────────────────────────────────

function exportVaultDetails(vault: VaultDetail, events: ActivityEvent[]) {
  const data = {
    vault: {
      id: vault.id,
      name: vault.name,
      type: vault.type,
      status: vault.status,
      ownerAddress: vault.ownerAddress,
      balance: vault.balance,
      description: vault.description,
      createdAt: vault.createdAt,
      updatedAt: vault.updatedAt,
      lockDetails: vault.lockDetails,
      splitRecipients: vault.splitRecipients,
    },
    activity: events,
    exportedAt: new Date().toISOString(),
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `vault-${vault.id}-${vault.name.toLowerCase().replace(/\s+/g, '-')}.json`;
  a.click();
  URL.revokeObjectURL(url);
}
