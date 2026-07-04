import { useWallet } from '@/context/WalletContext';
import { useCreateVault, getListVaultsQueryKey, getGetVaultStatsQueryKey } from '@workspace/api-client-react';
import { useState } from 'react';
import { useLocation, Link } from 'wouter';
import { useQueryClient } from '@tanstack/react-query';
import { useForm, useFieldArray } from 'react-hook-form';
import { Lock, Split, ArrowLeft, Plus, Trash2, CheckCircle2 } from 'lucide-react';

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
  address: string;
  percentage: string;
}

interface SplitFormValues {
  name: string;
  description: string;
  recipients: SplitRecipient[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const STACKS_ADDR = /^(SP|ST)[A-Z0-9]+$/;

// ── Main page ────────────────────────────────────────────────────────────────

export default function CreateVault() {
  const { address } = useWallet();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [vaultType, setVaultType] = useState<'lock' | 'split' | null>(null);
  const createVault = useCreateVault();

  if (!address) {
    setLocation('/');
    return null;
  }

  const Stepper = () => (
    <div className="flex items-center gap-3">
      {([1, 2, 3] as const).map((s, i) => (
        <span key={s} className="flex items-center gap-1.5">
          {i > 0 && <span className={`h-px w-8 ${step >= s ? 'bg-primary' : 'bg-border'}`} />}
          <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium ${step >= s ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>{s}</span>
          <span className={`text-sm font-medium ${step >= s ? 'text-foreground' : 'text-muted-foreground'}`}>{['Type', 'Configure', 'Complete'][i]}</span>
        </span>
      ))}
    </div>
  );

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <div className="mb-8">
        <Link href="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6">
          <ArrowLeft className="w-4 h-4" /> Back to Dashboard
        </Link>
        <Stepper />
      </div>

      {/* ── Step 1: choose type ── */}
      {step === 1 && (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Choose Vault Type</h1>
            <p className="text-muted-foreground mt-1">Select the vault mechanism that fits your needs.</p>
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            <button
              onClick={() => { setVaultType('lock'); setStep(2); }}
              className="text-left bg-card border border-card-border p-6 rounded-xl hover:border-primary transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-background group"
            >
              <div className="w-12 h-12 bg-blue-500/10 text-blue-400 rounded-lg flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                <Lock className="w-6 h-6" />
              </div>
              <h3 className="font-semibold text-lg mb-2">Lock Vault</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">Lock funds and release them on a predefined schedule to a single recipient. Perfect for token vesting and delayed payments.</p>
            </button>

            <button
              onClick={() => { setVaultType('split'); setStep(2); }}
              className="text-left bg-card border border-card-border p-6 rounded-xl hover:border-primary transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-background group"
            >
              <div className="w-12 h-12 bg-purple-500/10 text-purple-400 rounded-lg flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                <Split className="w-6 h-6" />
              </div>
              <h3 className="font-semibold text-lg mb-2">Split Vault</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">Automatically distribute incoming funds to multiple recipients by percentage. Ideal for revenue sharing and team treasuries.</p>
            </button>
          </div>
        </div>
      )}

      {/* ── Step 2a: Lock Vault form ── */}
      {step === 2 && vaultType === 'lock' && (
        <div className="animate-in fade-in slide-in-from-bottom-4">
          <div className="mb-6 flex items-center gap-3">
            <button onClick={() => setStep(1)} className="p-2 hover:bg-muted rounded-md transition-colors">
              <ArrowLeft className="w-5 h-5" />
            </button>
            <h1 className="text-2xl font-semibold tracking-tight">Configure Lock Vault</h1>
          </div>
          <LockVaultForm
            onSubmit={(data) => {
              createVault.mutate({
                data: {
                  name: data.name,
                  description: data.description || undefined,
                  type: 'lock',
                  ownerAddress: address,
                  lockDetails: {
                    recipientAddress: data.recipientAddress,
                    amountStx: Number(data.amountStx),
                    releaseSchedule: data.releaseSchedule,
                    durationMonths: Number(data.durationMonths),
                  },
                },
              }, {
                onSuccess: () => {
                  queryClient.invalidateQueries({ queryKey: getListVaultsQueryKey() });
                  queryClient.invalidateQueries({ queryKey: getGetVaultStatsQueryKey() });
                  setStep(3);
                },
              });
            }}
            isPending={createVault.isPending}
            error={createVault.error?.message}
          />
        </div>
      )}

      {/* ── Step 2b: Split Vault form ── */}
      {step === 2 && vaultType === 'split' && (
        <div className="animate-in fade-in slide-in-from-bottom-4">
          <div className="mb-6 flex items-center gap-3">
            <button onClick={() => setStep(1)} className="p-2 hover:bg-muted rounded-md transition-colors">
              <ArrowLeft className="w-5 h-5" />
            </button>
            <h1 className="text-2xl font-semibold tracking-tight">Configure Split Vault</h1>
          </div>
          <SplitVaultForm
            onSubmit={(data) => {
              createVault.mutate({
                data: {
                  name: data.name,
                  description: data.description || undefined,
                  type: 'split',
                  ownerAddress: address,
                  splitRecipients: data.recipients.map((r) => ({
                    address: r.address,
                    percentage: Number(r.percentage),
                  })),
                },
              }, {
                onSuccess: () => {
                  queryClient.invalidateQueries({ queryKey: getListVaultsQueryKey() });
                  queryClient.invalidateQueries({ queryKey: getGetVaultStatsQueryKey() });
                  setStep(3);
                },
              });
            }}
            isPending={createVault.isPending}
            error={createVault.error?.message}
          />
        </div>
      )}

      {/* ── Step 3: Success ── */}
      {step === 3 && (
        <div className="text-center py-12 animate-in fade-in zoom-in-95">
          <div className="w-20 h-20 bg-green-500/10 text-green-500 rounded-full flex items-center justify-center mx-auto mb-6">
            <CheckCircle2 className="w-10 h-10" />
          </div>
          <h1 className="text-3xl font-semibold mb-2">Vault Created</h1>
          <p className="text-muted-foreground mb-8">
            Your {vaultType === 'lock' ? 'Lock' : 'Split'} Vault is successfully configured and active.
          </p>
          <div className="flex items-center justify-center gap-4">
            <Link href="/" className="px-6 py-2.5 rounded-md border border-input hover:bg-muted font-medium transition-colors">
              Go to Dashboard
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Lock Vault Form ───────────────────────────────────────────────────────────

function LockVaultForm({
  onSubmit,
  isPending,
  error,
}: {
  onSubmit: (data: LockFormValues) => void;
  isPending: boolean;
  error?: string;
}) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LockFormValues>({
    defaultValues: {
      name: '',
      description: '',
      recipientAddress: '',
      amountStx: '',
      releaseSchedule: 'monthly',
      durationMonths: '12',
    },
  });

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-8">
      {error && (
        <div className="p-3 bg-destructive/10 text-destructive text-sm rounded-md border border-destructive/20">
          {error}
        </div>
      )}

      <div className="bg-card border border-card-border p-6 rounded-xl space-y-6">
        <h2 className="text-lg font-medium border-b border-card-border pb-2">General Details</h2>
        <div className="grid gap-6">
          <Field label="Vault Name" error={errors.name?.message}>
            <input
              {...register('name', { required: 'Vault name is required' })}
              className={inputCls(!!errors.name)}
              placeholder="e.g. Founder Vesting"
            />
          </Field>
          <Field label="Description (Optional)">
            <textarea
              {...register('description')}
              className={`${inputCls(false)} min-h-[80px]`}
              placeholder="Details about this vault..."
            />
          </Field>
        </div>
      </div>

      <div className="bg-card border border-card-border p-6 rounded-xl space-y-6">
        <h2 className="text-lg font-medium border-b border-card-border pb-2">Lock Configuration</h2>
        <div className="grid gap-6">
          <Field label="Recipient Stacks Address" error={errors.recipientAddress?.message}>
            <input
              {...register('recipientAddress', {
                required: 'Recipient address is required',
                pattern: { value: STACKS_ADDR, message: 'Must be a valid Stacks address (SP… or ST…)' },
              })}
              className={inputCls(!!errors.recipientAddress)}
              placeholder="SP…"
            />
          </Field>
          <div className="grid sm:grid-cols-2 gap-6">
            <Field label="Amount to Lock (STX)" error={errors.amountStx?.message}>
              <input
                type="number"
                step="0.000001"
                {...register('amountStx', {
                  required: 'Amount is required',
                  validate: (v) => Number(v) > 0 || 'Amount must be greater than 0',
                })}
                className={inputCls(!!errors.amountStx)}
                placeholder="0.000000"
              />
            </Field>
            <Field label="Duration (Months)" error={errors.durationMonths?.message}>
              <input
                type="number"
                {...register('durationMonths', {
                  required: 'Duration is required',
                  validate: (v) => Number(v) >= 1 || 'Must be at least 1 month',
                })}
                className={inputCls(!!errors.durationMonths)}
              />
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
      </div>

      <div className="flex justify-end">
        <SubmitButton isPending={isPending} label="Create Lock Vault" />
      </div>
    </form>
  );
}

// ── Split Vault Form ──────────────────────────────────────────────────────────

function SplitVaultForm({
  onSubmit,
  isPending,
  error,
}: {
  onSubmit: (data: SplitFormValues) => void;
  isPending: boolean;
  error?: string;
}) {
  const {
    register,
    handleSubmit,
    control,
    watch,
    setError,
    formState: { errors },
  } = useForm<SplitFormValues>({
    defaultValues: {
      name: '',
      description: '',
      recipients: [{ address: '', percentage: '100' }],
    },
  });

  const { fields, append, remove } = useFieldArray({ control, name: 'recipients' });
  const watchedRecipients = watch('recipients');
  const total = watchedRecipients.reduce((sum, r) => sum + (Number(r.percentage) || 0), 0);
  const totalOk = Math.abs(total - 100) < 0.01;

  const handleFormSubmit = (data: SplitFormValues) => {
    const pct = data.recipients.reduce((s, r) => s + Number(r.percentage), 0);
    if (Math.abs(pct - 100) >= 0.01) {
      setError('recipients', { message: `Percentages must sum to 100% (currently ${pct.toFixed(2)}%)` });
      return;
    }
    onSubmit(data);
  };

  return (
    <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-8">
      {error && (
        <div className="p-3 bg-destructive/10 text-destructive text-sm rounded-md border border-destructive/20">
          {error}
        </div>
      )}

      <div className="bg-card border border-card-border p-6 rounded-xl space-y-6">
        <h2 className="text-lg font-medium border-b border-card-border pb-2">General Details</h2>
        <div className="grid gap-6">
          <Field label="Vault Name" error={errors.name?.message}>
            <input
              {...register('name', { required: 'Vault name is required' })}
              className={inputCls(!!errors.name)}
              placeholder="e.g. Revenue Split"
            />
          </Field>
          <Field label="Description (Optional)">
            <textarea
              {...register('description')}
              className={`${inputCls(false)} min-h-[80px]`}
              placeholder="Details about this vault..."
            />
          </Field>
        </div>
      </div>

      <div className="bg-card border border-card-border p-6 rounded-xl space-y-6">
        <div className="flex items-center justify-between border-b border-card-border pb-2">
          <h2 className="text-lg font-medium">Recipients &amp; Allocation</h2>
          <span className={`text-sm font-medium tabular-nums ${totalOk ? 'text-green-500' : 'text-destructive'}`}>
            {total.toFixed(2)}% / 100%
          </span>
        </div>

        {errors.recipients?.message && (
          <div className="p-3 bg-destructive/10 text-destructive text-sm rounded-md border border-destructive/20">
            {errors.recipients.message}
          </div>
        )}

        <div className="space-y-3">
          {fields.map((field, index) => (
            <div key={field.id} className="flex items-start gap-3">
              <div className="flex-1">
                <input
                  {...register(`recipients.${index}.address`, {
                    required: 'Address required',
                    pattern: { value: STACKS_ADDR, message: 'Must be a valid Stacks address' },
                  })}
                  className={inputCls(!!(errors.recipients?.[index]?.address))}
                  placeholder="Stacks Address (SP… or ST…)"
                />
                {errors.recipients?.[index]?.address && (
                  <p className="text-xs text-destructive mt-1">{errors.recipients[index]?.address?.message}</p>
                )}
              </div>
              <div className="w-28">
                <div className="relative">
                  <input
                    type="number"
                    step="0.01"
                    {...register(`recipients.${index}.percentage`, {
                      required: '%  required',
                      validate: (v) => Number(v) > 0 || 'Must be > 0',
                    })}
                    className={`${inputCls(!!(errors.recipients?.[index]?.percentage))} pr-7`}
                    placeholder="0"
                  />
                  <span className="absolute right-3 top-2 text-sm text-muted-foreground">%</span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => remove(index)}
                disabled={fields.length === 1}
                className="p-2 text-muted-foreground hover:text-destructive transition-colors mt-0.5 disabled:opacity-30"
              >
                <Trash2 className="w-5 h-5" />
              </button>
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={() => append({ address: '', percentage: '0' })}
          className="flex items-center gap-2 text-sm text-primary hover:underline font-medium"
        >
          <Plus className="w-4 h-4" /> Add Recipient
        </button>
      </div>

      <div className="flex justify-end">
        <SubmitButton isPending={isPending} label="Create Split Vault" />
      </div>
    </form>
  );
}

// ── Shared UI helpers ─────────────────────────────────────────────────────────

function inputCls(hasError: boolean) {
  return `w-full bg-input border ${hasError ? 'border-destructive' : 'border-border'} rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary`;
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium">{label}</label>
      {children}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

function SubmitButton({ isPending, label }: { isPending: boolean; label: string }) {
  return (
    <button
      type="submit"
      disabled={isPending}
      className="bg-primary text-primary-foreground px-8 py-2.5 rounded-md font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 inline-flex items-center gap-2"
    >
      {isPending && (
        <span className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
      )}
      {isPending ? 'Creating…' : label}
    </button>
  );
}
