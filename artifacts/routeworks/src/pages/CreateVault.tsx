import { useWallet } from '@/context/WalletContext';
import { useFlowVault } from '@/hooks/useFlowVault';
import {
  useCreateVault,
  getListVaultsQueryKey,
  getGetVaultStatsQueryKey,
} from '@workspace/api-client-react';
import { useState } from 'react';
import { useLocation, Link } from 'wouter';
import { useQueryClient } from '@tanstack/react-query';
import { useForm, useFieldArray, UseFormReturn } from 'react-hook-form';
import {
  Lock,
  Split,
  ArrowLeft,
  Plus,
  Trash2,
  ArrowRight,
  CheckCircle2,
  AlertCircle,
  Zap,
  Globe,
  Wallet,
  ChevronRight,
  Edit3,
  WifiOff,
  ExternalLink,
  Copy,
  Check,
  Loader2,
} from 'lucide-react';
import { executeFlowVaultTransaction, type TxPhase, type FlowVaultTxResult, TX_PHASE_MESSAGES } from '@/lib/flowvault/transaction';
import { isUserRejection, getFlowVaultErrorMessage } from '@/lib/flowvault/errors';
import type { VaultState } from 'flowvault-sdk';

// ── Types ────────────────────────────────────────────────────────────────────

interface LockFormValues {
  name: string;
  description: string;
  recipientAddress: string;
  amountStx: string;
  releaseSchedule: 'one_time' | 'monthly' | 'quarterly' | 'annually';
  durationMonths: string;
}

interface SplitRecipient {
  recipientName: string;
  address: string;
  percentage: string;
}

interface SplitFormValues {
  name: string;
  description: string;
  recipients: SplitRecipient[];
}

type VaultType = 'lock' | 'split';
type WizardStep = 1 | 2 | 3 | 4;

// ── Constants ─────────────────────────────────────────────────────────────────

const STACKS_ADDR = /^(SP|ST)[A-Z0-9]+$/;

const SCHEDULE_LABELS: Record<string, string> = {
  one_time: 'One-time at end of duration',
  monthly: 'Monthly linear release',
  quarterly: 'Quarterly release',
  annually: 'Annually',
};

const RECIPIENT_COLORS = [
  '#FC6432',
  '#3B82F6',
  '#8B5CF6',
  '#10B981',
  '#F59E0B',
  '#EF4444',
  '#6366F1',
  '#EC4899',
];

const STEP_LABELS: Record<WizardStep, string> = {
  1: 'Primitive',
  2: 'Configure',
  3: 'Review',
  4: 'Execute',
};

// ── Copy helper ───────────────────────────────────────────────────────────────

function useCopy(): [boolean, (text: string) => void] {
  const [copied, setCopied] = useState(false);
  const copy = (text: string) => {
    navigator.clipboard?.writeText(text).then(
      () => { setCopied(true); setTimeout(() => setCopied(false), 2000); },
      () => {}
    );
  };
  return [copied, copy];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function truncateAddr(addr: string | null, pre = 6, post = 4): string {
  if (!addr) return '—';
  if (addr.length <= pre + post + 3) return addr;
  return `${addr.slice(0, pre)}…${addr.slice(-post)}`;
}

// ── Shared UI ─────────────────────────────────────────────────────────────────

function inputCls(hasError: boolean) {
  return `w-full bg-input border ${
    hasError ? 'border-destructive' : 'border-border'
  } rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary transition-colors`;
}

function Field({
  label,
  error,
  hint,
  children,
}: {
  label: string;
  error?: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium">{label}</label>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      {children}
      {error && <p className="text-xs text-destructive mt-1">{error}</p>}
    </div>
  );
}

function SectionCard({
  title,
  right,
  children,
}: {
  title: string;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-card border border-card-border p-6 rounded-xl space-y-5">
      <div className="flex items-center justify-between border-b border-card-border pb-3">
        <h2 className="text-base font-semibold">{title}</h2>
        {right}
      </div>
      {children}
    </div>
  );
}

function ReviewRow({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2 border-b border-card-border/50 last:border-0">
      <span className="text-sm text-muted-foreground shrink-0">{label}</span>
      <span className={`text-sm font-medium text-right ${mono ? 'font-mono text-xs' : ''}`}>{value}</span>
    </div>
  );
}

// ── Stepper ───────────────────────────────────────────────────────────────────

function Stepper({ step }: { step: WizardStep }) {
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {([1, 2, 3, 4] as WizardStep[]).map((s, i) => (
        <span key={s} className="flex items-center gap-1.5">
          {i > 0 && (
            <ChevronRight className={`w-3.5 h-3.5 ${step > s - 1 ? 'text-primary' : 'text-muted-foreground/30'}`} />
          )}
          <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium shrink-0 transition-colors ${
            step > s
              ? 'bg-primary/20 text-primary'
              : step === s
              ? 'bg-primary text-primary-foreground'
              : 'bg-muted text-muted-foreground'
          }`}>
            {step > s ? <CheckCircle2 className="w-3.5 h-3.5" /> : s}
          </span>
          <span className={`text-sm font-medium transition-colors ${
            step >= s ? 'text-foreground' : 'text-muted-foreground/50'
          }`}>
            {STEP_LABELS[s]}
          </span>
        </span>
      ))}
    </div>
  );
}

// ── Distribution Bar (Split Preview) ─────────────────────────────────────────

function DistributionBar({ recipients }: { recipients: SplitRecipient[] }) {
  const total = recipients.reduce((s, r) => s + (Number(r.percentage) || 0), 0);

  return (
    <div className="space-y-3">
      {/* Bar */}
      <div className="h-2.5 rounded-full overflow-hidden flex bg-muted/60 gap-px">
        {recipients.map((r, i) => {
          const pct = Number(r.percentage) || 0;
          if (pct <= 0 || total <= 0) return null;
          return (
            <div
              key={i}
              style={{ width: `${(pct / Math.max(total, 100)) * 100}%`, backgroundColor: RECIPIENT_COLORS[i % RECIPIENT_COLORS.length] }}
              className="transition-all duration-300 first:rounded-l-full last:rounded-r-full"
            />
          );
        })}
      </div>
      {/* Legend */}
      <div className="space-y-2">
        {recipients.map((r, i) => (
          <div key={i} className="flex items-center gap-2">
            <div
              className="w-2 h-2 rounded-sm shrink-0"
              style={{ backgroundColor: RECIPIENT_COLORS[i % RECIPIENT_COLORS.length] }}
            />
            <span className="text-xs text-muted-foreground font-mono truncate flex-1 min-w-0">
              {r.recipientName ? (
                <span className="not-mono text-foreground font-medium">{r.recipientName} </span>
              ) : null}
              {r.address ? truncateAddr(r.address) : <span className="italic opacity-40">No address</span>}
            </span>
            <span className="text-xs font-semibold tabular-nums shrink-0">
              {r.percentage || '0'}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Summary Panel ─────────────────────────────────────────────────────────────

function SummaryPanel({
  vaultType,
  lockValues,
  splitValues,
  address,
  network,
}: {
  vaultType: VaultType | null;
  lockValues: LockFormValues;
  splitValues: SplitFormValues;
  address: string | null;
  network: string;
}) {
  const isLock = vaultType === 'lock';
  const name = isLock ? lockValues.name : splitValues.name;
  const recipientCount = isLock ? 1 : splitValues.recipients.length;
  const splitTotal = splitValues.recipients.reduce((s, r) => s + (Number(r.percentage) || 0), 0);
  const splitOk = Math.abs(splitTotal - 100) < 0.01;

  return (
    <div className="bg-card border border-card-border rounded-xl overflow-hidden">
      {/* Header */}
      <div className="bg-primary/5 border-b border-card-border px-5 py-3.5">
        <p className="text-xs font-semibold text-primary uppercase tracking-wider">Configuration Summary</p>
      </div>

      <div className="px-5 py-4 space-y-4">
        {/* Primitive */}
        <div className="flex items-center gap-3">
          <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
            isLock ? 'bg-blue-500/10 text-blue-400' : 'bg-purple-500/10 text-purple-400'
          }`}>
            {isLock ? <Lock className="w-4 h-4" /> : <Split className="w-4 h-4" />}
          </div>
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">Primitive</p>
            <p className="text-sm font-semibold">{isLock ? 'Lock Vault' : 'Split Vault'}</p>
          </div>
        </div>

        <div className="border-t border-card-border/50" />

        {/* Routing Name */}
        <div>
          <p className="text-xs text-muted-foreground mb-0.5">Routing Name</p>
          <p className="text-sm font-medium truncate">
            {name || <span className="text-muted-foreground/40 italic">Untitled</span>}
          </p>
        </div>

        {/* Lock-specific */}
        {isLock && (
          <>
            <div>
              <p className="text-xs text-muted-foreground mb-0.5">Amount</p>
              <p className="text-sm font-semibold">
                {lockValues.amountStx ? (
                  <><span className="text-foreground">{lockValues.amountStx}</span> <span className="text-muted-foreground text-xs">STX</span></>
                ) : (
                  <span className="text-muted-foreground/40 italic">Not set</span>
                )}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-0.5">Recipient</p>
              <p className="text-xs font-mono truncate">
                {lockValues.recipientAddress || <span className="text-muted-foreground/40 italic not-mono">Not set</span>}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-0.5">Schedule</p>
              <p className="text-sm">{SCHEDULE_LABELS[lockValues.releaseSchedule] ?? '—'}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-0.5">Duration</p>
              <p className="text-sm">
                {lockValues.durationMonths ? `${lockValues.durationMonths} months` : '—'}
              </p>
            </div>
          </>
        )}

        {/* Split-specific */}
        {!isLock && (
          <>
            <div>
              <p className="text-xs text-muted-foreground mb-1.5">Recipients ({recipientCount})</p>
              <DistributionBar recipients={splitValues.recipients} />
            </div>
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">Total Allocation</p>
              <span className={`text-sm font-semibold tabular-nums ${splitOk ? 'text-green-500' : 'text-destructive'}`}>
                {splitTotal.toFixed(splitTotal % 1 === 0 ? 0 : 2)}%
                {!splitOk && <span className="text-xs ml-1">(needs 100%)</span>}
              </span>
            </div>
          </>
        )}

        <div className="border-t border-card-border/50" />

        {/* Network & Wallet */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Globe className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
            <p className="text-xs text-muted-foreground">Network</p>
            <p className="text-xs font-medium ml-auto capitalize">{network}</p>
          </div>
          <div className="flex items-center gap-2">
            <Wallet className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
            <p className="text-xs text-muted-foreground">Creator</p>
            <p className="text-xs font-mono ml-auto">{truncateAddr(address)}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Lock Vault Form ───────────────────────────────────────────────────────────

function LockVaultForm({
  form,
  onNext,
  onBack,
  apiError,
}: {
  form: UseFormReturn<LockFormValues>;
  onNext: () => void;
  onBack: () => void;
  apiError?: string;
}) {
  const { register, handleSubmit, formState: { errors } } = form;

  return (
    <form onSubmit={handleSubmit(onNext)} className="space-y-5">
      {apiError && (
        <div className="flex items-start gap-3 p-3 bg-destructive/10 text-destructive text-sm rounded-lg border border-destructive/20">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          {apiError}
        </div>
      )}

      <SectionCard title="General Details">
        <div className="space-y-5">
          <Field label="Routing Name" error={errors.name?.message}>
            <input
              {...register('name', { required: 'Routing name is required' })}
              className={inputCls(!!errors.name)}
              placeholder="e.g. Founder Vesting"
              autoFocus
            />
          </Field>
          <Field label="Description" hint="Optional — describe what this routing configuration does">
            <textarea
              {...register('description')}
              className={`${inputCls(false)} min-h-[80px] resize-none`}
              placeholder="Details about this vault…"
            />
          </Field>
        </div>
      </SectionCard>

      <SectionCard title="Lock Configuration">
        <div className="space-y-5">
          <Field
            label="Recipient Stacks Address"
            error={errors.recipientAddress?.message}
            hint="Funds will be released to this address on the configured schedule"
          >
            <input
              {...register('recipientAddress', {
                required: 'Recipient address is required',
                pattern: { value: STACKS_ADDR, message: 'Must be a valid Stacks address (SP… or ST…)' },
              })}
              className={inputCls(!!errors.recipientAddress)}
              placeholder="SP…"
              spellCheck={false}
            />
          </Field>

          <div className="grid sm:grid-cols-2 gap-5">
            <Field label="Amount to Lock (STX)" error={errors.amountStx?.message}>
              <div className="relative">
                <input
                  type="number"
                  step="0.000001"
                  min="0"
                  {...register('amountStx', {
                    required: 'Amount is required',
                    validate: (v) => Number(v) > 0 || 'Amount must be greater than 0',
                  })}
                  className={`${inputCls(!!errors.amountStx)} pr-12`}
                  placeholder="0.000000"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground font-medium">STX</span>
              </div>
            </Field>
            <Field label="Duration" error={errors.durationMonths?.message}>
              <div className="relative">
                <input
                  type="number"
                  min="1"
                  {...register('durationMonths', {
                    required: 'Duration is required',
                    validate: (v) => Number(v) >= 1 || 'Must be at least 1 month',
                  })}
                  className={`${inputCls(!!errors.durationMonths)} pr-16`}
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground font-medium">months</span>
              </div>
            </Field>
          </div>

          <Field label="Release Schedule" error={errors.releaseSchedule?.message}>
            <select
              {...register('releaseSchedule', { required: true })}
              className={inputCls(!!errors.releaseSchedule)}
            >
              <option value="one_time">One-time at end of duration</option>
              <option value="monthly">Monthly linear release</option>
              <option value="quarterly">Quarterly release</option>
              <option value="annually">Annually</option>
            </select>
          </Field>
        </div>
      </SectionCard>

      <div className="flex items-center justify-between pt-1">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-md border border-border hover:bg-muted text-sm font-medium transition-colors"
        >
          <ArrowLeft className="w-4 h-4" /> Back
        </button>
        <button
          type="submit"
          className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-6 py-2.5 rounded-md text-sm font-medium hover:bg-primary/90 transition-colors"
        >
          Review Configuration <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </form>
  );
}

// ── Split Vault Form ──────────────────────────────────────────────────────────

function SplitVaultForm({
  form,
  onNext,
  onBack,
  apiError,
}: {
  form: UseFormReturn<SplitFormValues>;
  onNext: () => void;
  onBack: () => void;
  apiError?: string;
}) {
  const {
    register,
    handleSubmit,
    control,
    watch,
    setError,
    formState: { errors },
  } = form;

  const { fields, append, remove } = useFieldArray({ control, name: 'recipients' });
  const watchedRecipients = watch('recipients');
  const total = watchedRecipients.reduce((sum, r) => sum + (Number(r.percentage) || 0), 0);
  const totalOk = Math.abs(total - 100) < 0.01;

  const handleFormSubmit = (data: SplitFormValues) => {
    const pct = data.recipients.reduce((s, r) => s + Number(r.percentage), 0);
    if (Math.abs(pct - 100) >= 0.01) {
      setError('recipients', {
        message: `Allocations must total 100% — currently ${pct.toFixed(2)}%`,
      });
      return;
    }
    onNext();
  };

  return (
    <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-5">
      {apiError && (
        <div className="flex items-start gap-3 p-3 bg-destructive/10 text-destructive text-sm rounded-lg border border-destructive/20">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          {apiError}
        </div>
      )}

      <SectionCard title="General Details">
        <div className="space-y-5">
          <Field label="Routing Name" error={errors.name?.message}>
            <input
              {...register('name', { required: 'Routing name is required' })}
              className={inputCls(!!errors.name)}
              placeholder="e.g. Revenue Share"
              autoFocus
            />
          </Field>
          <Field label="Description" hint="Optional — describe what this routing configuration does">
            <textarea
              {...register('description')}
              className={`${inputCls(false)} min-h-[80px] resize-none`}
              placeholder="Details about this vault…"
            />
          </Field>
        </div>
      </SectionCard>

      <SectionCard
        title="Recipients & Allocation"
        right={
          <div className={`text-sm font-semibold tabular-nums px-2.5 py-1 rounded-md ${
            totalOk
              ? 'bg-green-500/10 text-green-500'
              : 'bg-destructive/10 text-destructive'
          }`}>
            {total.toFixed(total % 1 === 0 ? 0 : 2)}% / 100%
          </div>
        }
      >
        <div className="space-y-4">
          {errors.recipients?.message && (
            <div className="flex items-start gap-2 p-3 bg-destructive/10 text-destructive text-sm rounded-lg border border-destructive/20">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              {errors.recipients.message}
            </div>
          )}

          <div className="space-y-3">
            {fields.map((field, index) => {
              const color = RECIPIENT_COLORS[index % RECIPIENT_COLORS.length];
              return (
                <div key={field.id} className="bg-background/40 border border-border/50 rounded-lg p-3.5 space-y-3">
                  {/* Recipient header */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: color }} />
                      <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                        Recipient {index + 1}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => remove(index)}
                      disabled={fields.length === 1}
                      className="p-1 text-muted-foreground hover:text-destructive transition-colors disabled:opacity-25 rounded"
                      title="Remove recipient"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {/* Name (optional) */}
                  <div>
                    <input
                      {...register(`recipients.${index}.recipientName`)}
                      className={inputCls(false)}
                      placeholder="Recipient name (optional)"
                    />
                  </div>

                  {/* Address + Percentage */}
                  <div className="flex items-start gap-2">
                    <div className="flex-1 min-w-0">
                      <input
                        {...register(`recipients.${index}.address`, {
                          required: 'Address required',
                          pattern: {
                            value: STACKS_ADDR,
                            message: 'Must be a valid Stacks address (SP… or ST…)',
                          },
                        })}
                        className={inputCls(!!(errors.recipients?.[index]?.address))}
                        placeholder="SP… or ST… address"
                        spellCheck={false}
                      />
                      {errors.recipients?.[index]?.address && (
                        <p className="text-xs text-destructive mt-1">
                          {errors.recipients[index]?.address?.message}
                        </p>
                      )}
                    </div>
                    <div className="w-24 shrink-0">
                      <div className="relative">
                        <input
                          type="number"
                          step="0.01"
                          min="0.01"
                          max="100"
                          {...register(`recipients.${index}.percentage`, {
                            required: 'Required',
                            validate: (v) => Number(v) > 0 || 'Must be > 0',
                          })}
                          className={`${inputCls(!!(errors.recipients?.[index]?.percentage))} pr-6 text-right`}
                          placeholder="0"
                        />
                        <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">%</span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <button
            type="button"
            onClick={() => append({ recipientName: '', address: '', percentage: '' })}
            className="flex items-center gap-2 text-sm text-primary hover:text-primary/80 font-medium transition-colors"
          >
            <Plus className="w-4 h-4" /> Add Recipient
          </button>

          {/* Live distribution preview */}
          {watchedRecipients.some((r) => r.address || r.percentage) && (
            <div className="bg-background/30 border border-border/40 rounded-lg p-4 space-y-2.5">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Live Distribution</p>
              <DistributionBar recipients={watchedRecipients} />
            </div>
          )}
        </div>
      </SectionCard>

      <div className="flex items-center justify-between pt-1">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-md border border-border hover:bg-muted text-sm font-medium transition-colors"
        >
          <ArrowLeft className="w-4 h-4" /> Back
        </button>
        <button
          type="submit"
          className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-6 py-2.5 rounded-md text-sm font-medium hover:bg-primary/90 transition-colors"
        >
          Review Configuration <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </form>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function CreateVault() {
  const { address, network } = useWallet();
  // Phase 3 — wallet guard: verified before any FlowVault transaction
  const { guard, getClient, connect, isConnecting } = useFlowVault();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();

  const [step, setStep] = useState<WizardStep>(1);
  const [vaultType, setVaultType] = useState<VaultType | null>(null);
  const [createdVaultId, setCreatedVaultId] = useState<number | null>(null);
  const [executeError, setExecuteError] = useState<string | null>(null);

  // Phase 4–8 — FlowVault transaction state
  const [txPhase, setTxPhase] = useState<TxPhase>('idle');
  const [txResult, setTxResult] = useState<FlowVaultTxResult | null>(null);
  const [txError, setTxError] = useState<string | null>(null);
  const [chainVaultState, setChainVaultState] = useState<VaultState | null>(null);

  // Lift both forms to parent so state survives step navigation
  const lockForm = useForm<LockFormValues>({
    defaultValues: {
      name: '',
      description: '',
      recipientAddress: '',
      amountStx: '',
      releaseSchedule: 'monthly',
      durationMonths: '12',
    },
  });
  const splitForm = useForm<SplitFormValues>({
    defaultValues: {
      name: '',
      description: '',
      recipients: [{ recipientName: '', address: '', percentage: '100' }],
    },
  });

  // Live-watch for the summary panel
  const lockValues = lockForm.watch();
  const splitValues = splitForm.watch();

  const createVault = useCreateVault();

  if (!address) {
    setLocation('/');
    return null;
  }

  // ── Handlers ────────────────────────────────────────────────────────────────

  const handleSelectPrimitive = (type: VaultType) => {
    setVaultType(type);
    setStep(2);
  };

  const handleConfigureNext = () => setStep(3);

  const handleBackToConfig = () => setStep(2);

  const handleConfirmExecute = async () => {
    if (!guard.isReady) return;
    setExecuteError(null);
    setTxError(null);
    setTxPhase('idle');
    setTxResult(null);
    setChainVaultState(null);

    const isLock = vaultType === 'lock';

    const payload = isLock
      ? {
          name: lockValues.name,
          description: lockValues.description || undefined,
          type: 'lock' as const,
          ownerAddress: address,
          lockDetails: {
            recipientAddress: lockValues.recipientAddress,
            amountStx: Number(lockValues.amountStx),
            releaseSchedule: lockValues.releaseSchedule,
            durationMonths: Number(lockValues.durationMonths),
          },
        }
      : {
          name: splitValues.name,
          description: splitValues.description || undefined,
          type: 'split' as const,
          ownerAddress: address,
          splitRecipients: splitValues.recipients.map((r) => ({
            address: r.address,
            percentage: Number(r.percentage),
          })),
        };

    // ── Step 1: Persist routing config to RouteWorks API ──────────────────────
    let vaultId: number;
    try {
      const data = await createVault.mutateAsync({ data: payload });
      queryClient.invalidateQueries({ queryKey: getListVaultsQueryKey() });
      queryClient.invalidateQueries({ queryKey: getGetVaultStatsQueryKey() });
      vaultId = (data as { id?: number }).id!;
      setCreatedVaultId(vaultId);
    } catch (err: unknown) {
      setExecuteError((err as Error)?.message ?? 'Failed to save routing configuration. Please try again.');
      return;
    }

    // ── Step 2: Execute FlowVault on-chain transaction ────────────────────────
    try {
      const client = getClient();

      const fvParams = isLock
        ? {
            type: 'lock' as const,
            amountStx: Number(lockValues.amountStx),
            durationMonths: Number(lockValues.durationMonths),
            walletAddress: address!,
          }
        : {
            type: 'split' as const,
            recipients: splitValues.recipients.map((r) => ({
              address: r.address,
              percentage: Number(r.percentage),
            })),
            walletAddress: address!,
          };

      const result = await executeFlowVaultTransaction(
        client,
        fvParams,
        network,
        (phase) => setTxPhase(phase)
      );

      setTxResult(result);
      setChainVaultState(result.vaultState);

      // Refresh dashboard + vault list with live blockchain data
      queryClient.invalidateQueries({ queryKey: getListVaultsQueryKey() });
      queryClient.invalidateQueries({ queryKey: getGetVaultStatsQueryKey() });

      setStep(4);
    } catch (err: unknown) {
      if (isUserRejection(err)) {
        setTxPhase('rejected');
        setTxError('Transaction cancelled — you rejected the wallet signature request. You can retry below.');
      } else {
        setTxPhase('error');
        setTxError(getFlowVaultErrorMessage(err));
      }
    }
  };

  /** Retry only the FlowVault transaction — vault record already exists in the API. */
  const handleRetryTx = async () => {
    if (!guard.isReady || !createdVaultId) return;
    setTxError(null);
    setTxPhase('idle');
    setTxResult(null);
    setChainVaultState(null);

    const isLock = vaultType === 'lock';

    try {
      const client = getClient();

      const fvParams = isLock
        ? {
            type: 'lock' as const,
            amountStx: Number(lockValues.amountStx),
            durationMonths: Number(lockValues.durationMonths),
            walletAddress: address!,
          }
        : {
            type: 'split' as const,
            recipients: splitValues.recipients.map((r) => ({
              address: r.address,
              percentage: Number(r.percentage),
            })),
            walletAddress: address!,
          };

      const result = await executeFlowVaultTransaction(
        client,
        fvParams,
        network,
        (phase) => setTxPhase(phase)
      );

      setTxResult(result);
      setChainVaultState(result.vaultState);

      queryClient.invalidateQueries({ queryKey: getListVaultsQueryKey() });
      queryClient.invalidateQueries({ queryKey: getGetVaultStatsQueryKey() });

      setStep(4);
    } catch (err: unknown) {
      if (isUserRejection(err)) {
        setTxPhase('rejected');
        setTxError('Transaction cancelled — you rejected the wallet signature request. You can retry below.');
      } else {
        setTxPhase('error');
        setTxError(getFlowVaultErrorMessage(err));
      }
    }
  };

  // ── Step 1: Select Primitive ─────────────────────────────────────────────────

  if (step === 1) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-8">
        <PageHeader step={step} />
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Select Routing Primitive</h1>
            <p className="text-muted-foreground mt-1.5">
              Choose the FlowVault mechanism that fits your programmable payment needs.
            </p>
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            {/* Lock Vault */}
            <button
              onClick={() => handleSelectPrimitive('lock')}
              className="group text-left bg-card border border-card-border p-6 rounded-xl hover:border-primary/60 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-background transition-all"
            >
              <div className="w-12 h-12 bg-blue-500/10 text-blue-400 rounded-xl flex items-center justify-center mb-5 group-hover:scale-105 transition-transform">
                <Lock className="w-6 h-6" />
              </div>
              <h3 className="font-semibold text-lg mb-2">🔒 Lock Vault</h3>
              <p className="text-sm text-muted-foreground leading-relaxed mb-4">
                Lock funds and release them according to predefined conditions — schedules, milestones,
                or time-based triggers.
              </p>
              <div className="flex flex-wrap gap-1.5">
                {['Token vesting', 'Escrow', 'Delayed payment'].map((tag) => (
                  <span key={tag} className="text-xs bg-blue-500/8 text-blue-400 border border-blue-500/15 px-2 py-0.5 rounded-full">
                    {tag}
                  </span>
                ))}
              </div>
              <div className="mt-5 flex items-center gap-1.5 text-sm font-medium text-primary opacity-0 group-hover:opacity-100 transition-opacity">
                Select <ArrowRight className="w-4 h-4" />
              </div>
            </button>

            {/* Split Vault */}
            <button
              onClick={() => handleSelectPrimitive('split')}
              className="group text-left bg-card border border-card-border p-6 rounded-xl hover:border-primary/60 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-background transition-all"
            >
              <div className="w-12 h-12 bg-purple-500/10 text-purple-400 rounded-xl flex items-center justify-center mb-5 group-hover:scale-105 transition-transform">
                <Split className="w-6 h-6" />
              </div>
              <h3 className="font-semibold text-lg mb-2">🔀 Split Vault</h3>
              <p className="text-sm text-muted-foreground leading-relaxed mb-4">
                Automatically distribute funds among multiple recipient wallet addresses using
                programmable percentage allocations.
              </p>
              <div className="flex flex-wrap gap-1.5">
                {['Revenue sharing', 'Team treasury', 'Royalties'].map((tag) => (
                  <span key={tag} className="text-xs bg-purple-500/8 text-purple-400 border border-purple-500/15 px-2 py-0.5 rounded-full">
                    {tag}
                  </span>
                ))}
              </div>
              <div className="mt-5 flex items-center gap-1.5 text-sm font-medium text-primary opacity-0 group-hover:opacity-100 transition-opacity">
                Select <ArrowRight className="w-4 h-4" />
              </div>
            </button>
          </div>

          {/* Info strip */}
          <div className="flex items-start gap-3 p-4 bg-primary/5 border border-primary/15 rounded-xl">
            <Zap className="w-4 h-4 text-primary shrink-0 mt-0.5" />
            <p className="text-sm text-muted-foreground">
              Routing configurations are powered by{' '}
              <span className="text-foreground font-medium">FlowVault primitives</span>{' '}
              — programmable, on-chain payment rules built on the Stacks blockchain.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ── Step 2: Configure ────────────────────────────────────────────────────────

  if (step === 2) {
    const isLock = vaultType === 'lock';
    return (
      <div className="max-w-6xl mx-auto px-4 py-8">
        <PageHeader step={step} />
        <div className="mb-6">
          <h1 className="text-2xl font-semibold tracking-tight">
            Configure {isLock ? 'Lock' : 'Split'} Vault
          </h1>
          <p className="text-muted-foreground mt-1.5">
            {isLock
              ? 'Set the locking conditions and release schedule for this routing flow.'
              : 'Define recipients and their allocation percentages for this routing flow.'}
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_304px] gap-6 items-start animate-in fade-in slide-in-from-bottom-4">
          {/* Form */}
          <div>
            {isLock ? (
              <LockVaultForm
                form={lockForm}
                onNext={handleConfigureNext}
                onBack={() => setStep(1)}
              />
            ) : (
              <SplitVaultForm
                form={splitForm}
                onNext={handleConfigureNext}
                onBack={() => setStep(1)}
              />
            )}
          </div>

          {/* Sticky summary */}
          <div className="lg:sticky lg:top-24">
            <SummaryPanel
              vaultType={vaultType}
              lockValues={lockValues}
              splitValues={splitValues}
              address={address}
              network={network}
            />
          </div>
        </div>
      </div>
    );
  }

  // ── Step 3: Review ───────────────────────────────────────────────────────────

  if (step === 3) {
    const isLock = vaultType === 'lock';
    const splitTotal = splitValues.recipients.reduce((s, r) => s + (Number(r.percentage) || 0), 0);

    return (
      <div className="max-w-3xl mx-auto px-4 py-8 animate-in fade-in slide-in-from-bottom-4">
        <PageHeader step={step} />
        <div className="mb-6">
          <h1 className="text-2xl font-semibold tracking-tight">Review Configuration</h1>
          <p className="text-muted-foreground mt-1.5">
            Confirm all routing rules before proceeding to execution.
          </p>
        </div>

        <div className="space-y-5">
          {/* Primitive badge */}
          <div className="flex items-center gap-4 bg-card border border-card-border rounded-xl p-5">
            <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${
              isLock ? 'bg-blue-500/10 text-blue-400' : 'bg-purple-500/10 text-purple-400'
            }`}>
              {isLock ? <Lock className="w-5 h-5" /> : <Split className="w-5 h-5" />}
            </div>
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Routing Primitive</p>
              <p className="text-lg font-semibold">{isLock ? 'Lock Vault' : 'Split Vault'}</p>
            </div>
            <button
              onClick={handleBackToConfig}
              className="ml-auto flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary transition-colors"
            >
              <Edit3 className="w-3.5 h-3.5" /> Edit
            </button>
          </div>

          {/* General details */}
          <SectionCard title="Routing Details">
            <div className="space-y-0">
              <ReviewRow label="Routing Name" value={isLock ? lockValues.name : splitValues.name} />
              {(isLock ? lockValues.description : splitValues.description) && (
                <ReviewRow
                  label="Description"
                  value={isLock ? lockValues.description : splitValues.description}
                />
              )}
              <ReviewRow label="Vault Type" value={isLock ? 'Lock Vault' : 'Split Vault'} />
              <ReviewRow label="Network" value={<span className="capitalize">{network}</span>} />
              <ReviewRow
                label="Creator Wallet"
                value={<span className="font-mono text-xs">{address}</span>}
              />
            </div>
          </SectionCard>

          {/* Lock-specific */}
          {isLock && (
            <SectionCard title="Lock Configuration">
              <div className="space-y-0">
                <ReviewRow label="Amount" value={`${lockValues.amountStx} STX`} />
                <ReviewRow
                  label="Recipient Address"
                  value={<span className="font-mono text-xs break-all">{lockValues.recipientAddress}</span>}
                />
                <ReviewRow
                  label="Release Schedule"
                  value={SCHEDULE_LABELS[lockValues.releaseSchedule]}
                />
                <ReviewRow label="Duration" value={`${lockValues.durationMonths} months`} />
              </div>
            </SectionCard>
          )}

          {/* Split-specific */}
          {!isLock && (
            <SectionCard
              title="Split Configuration"
              right={
                <span className={`text-sm font-semibold tabular-nums ${
                  Math.abs(splitTotal - 100) < 0.01 ? 'text-green-500' : 'text-destructive'
                }`}>
                  {splitTotal.toFixed(splitTotal % 1 === 0 ? 0 : 2)}% total
                </span>
              }
            >
              <div className="space-y-3">
                {splitValues.recipients.map((r, i) => (
                  <div key={i} className="flex items-start gap-3 py-2.5 border-b border-card-border/50 last:border-0">
                    <div
                      className="w-2.5 h-2.5 rounded-full shrink-0 mt-1"
                      style={{ backgroundColor: RECIPIENT_COLORS[i % RECIPIENT_COLORS.length] }}
                    />
                    <div className="flex-1 min-w-0 space-y-0.5">
                      {r.recipientName && (
                        <p className="text-sm font-medium">{r.recipientName}</p>
                      )}
                      <p className="text-xs font-mono text-muted-foreground break-all">{r.address}</p>
                    </div>
                    <span className="text-sm font-semibold tabular-nums shrink-0">{r.percentage}%</span>
                  </div>
                ))}

                {/* Distribution bar in review */}
                <div className="pt-1">
                  <DistributionBar recipients={splitValues.recipients} />
                </div>
              </div>
            </SectionCard>
          )}

          {/* Actions */}
          <div className="flex items-center justify-between pt-1">
            <button
              onClick={handleBackToConfig}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-md border border-border hover:bg-muted text-sm font-medium transition-colors"
            >
              <ArrowLeft className="w-4 h-4" /> Edit Configuration
            </button>
            <button
              onClick={() => setStep(4)}
              className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-6 py-2.5 rounded-md text-sm font-medium hover:bg-primary/90 transition-colors"
            >
              Confirm & Execute <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Step 4: Confirm & Execute ─────────────────────────────────────────────────

  // ── Post-execution success state (Phase 4–8) ─────────────────────────────────
  // Require txResult (not just createdVaultId) so the success screen only renders
  // after the FlowVault transaction is confirmed — not the moment the API call returns.
  if (step === 4 && createdVaultId !== null && txResult !== null) {
    const isLock = vaultType === 'lock';
    return <SuccessScreen
      isLock={isLock}
      createdVaultId={createdVaultId}
      lockValues={lockValues}
      splitValues={splitValues}
      network={network}
      address={address}
      txResult={txResult}
      chainVaultState={chainVaultState}
    />;
  }

  // ── Step 4 (pre-execution) ────────────────────────────────────────────────────

  const isLock = vaultType === 'lock';
  const splitTotal = splitValues.recipients.reduce((s, r) => s + (Number(r.percentage) || 0), 0);

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 animate-in fade-in slide-in-from-bottom-4">
      <PageHeader step={step} />
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Confirm & Execute</h1>
        <p className="text-muted-foreground mt-1.5">
          Ready to create your routing configuration. Review the final summary below.
        </p>
      </div>

      <div className="space-y-5">
        {/* Phase 3 — Wallet guard status banner */}
        {guard.isReady ? (
          <div className="flex items-center gap-3 p-4 bg-primary/5 border border-primary/20 rounded-xl">
            <div className="w-8 h-8 bg-primary/10 rounded-lg flex items-center justify-center shrink-0">
              <Zap className="w-4 h-4 text-primary" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold">Ready to create routing configuration</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Wallet connected · {isLock ? 'Lock Vault' : 'Split Vault'} · {network}
              </p>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-green-500 font-medium shrink-0">
              <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
              Verified
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-3 p-4 bg-destructive/5 border border-destructive/20 rounded-xl">
            <div className="w-8 h-8 bg-destructive/10 rounded-lg flex items-center justify-center shrink-0">
              <WifiOff className="w-4 h-4 text-destructive" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-destructive">Wallet verification failed</p>
              <p className="text-xs text-muted-foreground mt-0.5">{guard.message}</p>
            </div>
            {guard.status === 'not_connected' && (
              <button
                type="button"
                onClick={connect}
                disabled={isConnecting}
                className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors disabled:opacity-60"
              >
                <Wallet className="w-3 h-3" />
                {isConnecting ? 'Connecting…' : 'Connect'}
              </button>
            )}
          </div>
        )}

        {/* Final summary */}
        <SectionCard title="Routing Summary">
          <div className="space-y-0">
            <ReviewRow label="Routing Name" value={isLock ? lockValues.name : splitValues.name} />
            <ReviewRow label="Primitive" value={isLock ? 'Lock Vault' : 'Split Vault'} />
            {isLock && (
              <>
                <ReviewRow label="Amount" value={`${lockValues.amountStx} STX`} />
                <ReviewRow
                  label="Recipient"
                  value={<span className="font-mono text-xs">{truncateAddr(lockValues.recipientAddress)}</span>}
                  mono
                />
                <ReviewRow label="Schedule" value={SCHEDULE_LABELS[lockValues.releaseSchedule]} />
                <ReviewRow label="Duration" value={`${lockValues.durationMonths} months`} />
              </>
            )}
            {!isLock && (
              <>
                <ReviewRow label="Recipients" value={`${splitValues.recipients.length} addresses`} />
                <ReviewRow
                  label="Total Allocation"
                  value={
                    <span className={Math.abs(splitTotal - 100) < 0.01 ? 'text-green-500' : 'text-destructive'}>
                      {splitTotal.toFixed(splitTotal % 1 === 0 ? 0 : 2)}%
                    </span>
                  }
                />
              </>
            )}
            <ReviewRow label="Network" value={<span className="capitalize">{network}</span>} />
            <ReviewRow
              label="Creator Wallet"
              value={<span className="font-mono text-xs">{truncateAddr(address)}</span>}
            />
          </div>
        </SectionCard>

        {/* Error */}
        {executeError && (
          <div className="flex items-start gap-3 p-3 bg-destructive/10 text-destructive text-sm rounded-lg border border-destructive/20">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            {executeError}
          </div>
        )}

        {/* ── Transaction progress (Phase 7) ── */}
        {txPhase !== 'idle' && txPhase !== 'rejected' && txPhase !== 'error' && (
          <div className="flex items-center gap-4 p-4 bg-primary/5 border border-primary/20 rounded-xl">
            <Loader2 className="w-5 h-5 text-primary animate-spin shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold">{TX_PHASE_MESSAGES[txPhase]}</p>
              <div className="flex items-center gap-1.5 mt-2">
                {(['preparing', 'signing', 'submitted', 'confirmed'] as TxPhase[]).map((ph, i) => {
                  const phaseOrder = { preparing: 0, signing: 1, submitted: 2, confirmed: 3 };
                  const currentOrder = phaseOrder[txPhase as keyof typeof phaseOrder] ?? -1;
                  const phOrder = phaseOrder[ph as keyof typeof phaseOrder] ?? 0;
                  return (
                    <span key={ph} className="flex items-center gap-1">
                      {i > 0 && <span className="w-4 h-px bg-border" />}
                      <span className={`w-2 h-2 rounded-full transition-colors ${phOrder < currentOrder ? 'bg-primary' : phOrder === currentOrder ? 'bg-primary animate-pulse' : 'bg-muted-foreground/30'}`} />
                    </span>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* ── Wallet rejection / error with retry (Phase 7) ── */}
        {(txPhase === 'rejected' || txPhase === 'error') && txError && (
          <div className="p-4 bg-destructive/8 border border-destructive/20 rounded-xl space-y-3">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
              <p className="text-sm text-destructive leading-relaxed">{txError}</p>
            </div>
            <button
              onClick={handleRetryTx}
              disabled={!guard.isReady}
              className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:text-primary/80 transition-colors disabled:opacity-50"
            >
              <Zap className="w-3.5 h-3.5" /> Retry transaction
            </button>
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center justify-between pt-1">
          <button
            onClick={() => setStep(3)}
            disabled={createVault.isPending || ['preparing', 'signing', 'submitted'].includes(txPhase)}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-md border border-border hover:bg-muted text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <ArrowLeft className="w-4 h-4" /> Back
          </button>
          <button
            onClick={handleConfirmExecute}
            disabled={createVault.isPending || !guard.isReady || ['preparing', 'signing', 'submitted'].includes(txPhase)}
            title={!guard.isReady ? (guard.message ?? 'Wallet not ready') : undefined}
            className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-8 py-2.5 rounded-md text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-60 disabled:cursor-not-allowed min-w-[200px] justify-center"
          >
            {createVault.isPending ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Saving configuration…</>
            ) : txPhase === 'preparing' ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Preparing…</>
            ) : txPhase === 'signing' ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Awaiting signature…</>
            ) : txPhase === 'submitted' ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Submitting…</>
            ) : (
              <><Zap className="w-4 h-4" /> Execute FlowVault Routing</>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Success Screen (Phases 5, 8) ─────────────────────────────────────────────

function SuccessScreen({
  isLock,
  createdVaultId,
  lockValues,
  splitValues,
  network,
  address,
  txResult,
  chainVaultState,
}: {
  isLock: boolean;
  createdVaultId: number;
  lockValues: LockFormValues;
  splitValues: SplitFormValues;
  network: string;
  address: string | null;
  txResult: FlowVaultTxResult | null;
  chainVaultState: VaultState | null;
}) {
  const [txCopied, copyTxId] = useCopy();

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 animate-in fade-in zoom-in-95">
      {/* ── Header ── */}
      <div className="text-center space-y-4 py-8">
        <div className="w-20 h-20 bg-primary/10 text-primary rounded-full flex items-center justify-center mx-auto">
          <CheckCircle2 className="w-10 h-10" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Routing Configured On-Chain</h1>
          <p className="text-muted-foreground mt-2 max-w-md mx-auto">
            Your {isLock ? 'Lock' : 'Split'} Vault routing rule is live on Stacks Testnet via the FlowVault SDK.
          </p>
        </div>
      </div>

      {/* ── Transaction data — Phase 8 (Explorer Integration) ── */}
      {txResult && (
        <div className="bg-card border border-card-border rounded-xl p-5 mb-4">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-8 h-8 bg-green-500/10 text-green-500 rounded-lg flex items-center justify-center shrink-0">
              <CheckCircle2 className="w-4 h-4" />
            </div>
            <div>
              <p className="text-sm font-semibold">FlowVault Transaction Confirmed</p>
              <p className="text-xs text-muted-foreground">Stacks Testnet · flowvault-sdk · set-routing-rules</p>
            </div>
          </div>

          {/* Transaction hash */}
          <div className="space-y-0">
            <div className="flex items-start justify-between gap-4 py-2.5 border-b border-card-border/50">
              <span className="text-sm text-muted-foreground shrink-0">Transaction Hash</span>
              <span className="flex items-center gap-1.5 min-w-0">
                <span className="text-xs font-mono break-all">{txResult.txId}</span>
                <button
                  onClick={() => copyTxId(txResult.txId)}
                  title={txCopied ? 'Copied!' : 'Copy transaction hash'}
                  className="shrink-0 p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
                >
                  {txCopied ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              </span>
            </div>

            {/* Explorer link */}
            <div className="flex items-center justify-between gap-4 py-2.5">
              <span className="text-sm text-muted-foreground shrink-0">Explorer</span>
              <a
                href={txResult.explorerUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:text-primary/80 transition-colors"
              >
                View on Hiro Testnet Explorer <ExternalLink className="w-3.5 h-3.5 shrink-0" />
              </a>
            </div>
          </div>
        </div>
      )}

      {/* ── Live blockchain state — Phase 5 ── */}
      {chainVaultState && (
        <div className="bg-card border border-card-border rounded-xl p-5 mb-4">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-4">
            Live Blockchain State
          </p>
          <div className="grid grid-cols-3 gap-3">
            <div className="text-center p-3 bg-muted/30 rounded-lg">
              <p className="text-xs text-muted-foreground mb-1">Total Balance</p>
              <p className="text-sm font-semibold tabular-nums">
                {(chainVaultState.totalBalance / 1_000_000).toFixed(2)}
                <span className="text-muted-foreground text-xs ml-1">USDCx</span>
              </p>
            </div>
            <div className="text-center p-3 bg-muted/30 rounded-lg">
              <p className="text-xs text-muted-foreground mb-1">Locked</p>
              <p className="text-sm font-semibold tabular-nums text-blue-400">
                {(chainVaultState.lockedBalance / 1_000_000).toFixed(2)}
                <span className="text-xs ml-1">USDCx</span>
              </p>
            </div>
            <div className="text-center p-3 bg-muted/30 rounded-lg">
              <p className="text-xs text-muted-foreground mb-1">Unlocked</p>
              <p className="text-sm font-semibold tabular-nums text-green-400">
                {(chainVaultState.unlockedBalance / 1_000_000).toFixed(2)}
                <span className="text-xs ml-1">USDCx</span>
              </p>
            </div>
          </div>
          {chainVaultState.lockUntilBlock > 0 && (
            <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground border-t border-card-border/50 pt-3">
              <span>Lock expires at block</span>
              <span className="font-mono font-medium">{chainVaultState.lockUntilBlock.toLocaleString()}</span>
            </div>
          )}
          <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
            <span>Current chain block</span>
            <span className="font-mono">{chainVaultState.currentBlock.toLocaleString()}</span>
          </div>
        </div>
      )}

      {/* ── Split SDK note ── */}
      {txResult?.splitNote && (
        <div className="flex items-start gap-3 p-4 bg-blue-500/5 border border-blue-500/20 rounded-xl mb-4">
          <AlertCircle className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
          <p className="text-xs text-muted-foreground leading-relaxed">{txResult.splitNote}</p>
        </div>
      )}

      {/* ── Routing configuration summary ── */}
      <div className="bg-card border border-card-border rounded-xl p-5 mb-6">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Routing Configuration</p>
        <div className="space-y-0">
          <ReviewRow label="Routing Name" value={isLock ? lockValues.name : splitValues.name} />
          <ReviewRow label="Routing ID" value={`#${createdVaultId}`} />
          <ReviewRow label="Primitive" value={isLock ? 'Lock Vault' : 'Split Vault'} />
          <ReviewRow label="Network" value={<span className="capitalize">{network}</span>} />
          <ReviewRow label="Creator" value={<span className="font-mono text-xs">{truncateAddr(address)}</span>} />
          {isLock && (
            <>
              <ReviewRow label="Amount" value={`${lockValues.amountStx} STX`} />
              <ReviewRow label="Duration" value={`${lockValues.durationMonths} months`} />
            </>
          )}
        </div>
      </div>

      {/* ── Actions ── */}
      <div className="flex items-center justify-center gap-3">
        <Link
          href={`/vaults/${createdVaultId}`}
          className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-6 py-2.5 rounded-md text-sm font-medium hover:bg-primary/90 transition-colors"
        >
          View Routing Details <ArrowRight className="w-4 h-4" />
        </Link>
        <Link
          href="/"
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-md border border-border hover:bg-muted text-sm font-medium transition-colors"
        >
          Dashboard
        </Link>
      </div>
    </div>
  );
}

// ── Page Header ───────────────────────────────────────────────────────────────

function PageHeader({ step }: { step: WizardStep }) {
  return (
    <div className="mb-8 space-y-4">
      <Link
        href="/"
        className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="w-4 h-4" /> Back to Dashboard
      </Link>
      <Stepper step={step} />
    </div>
  );
}
