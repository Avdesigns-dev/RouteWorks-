import { useWallet } from '@/context/WalletContext';
import { useCreateVault, getListVaultsQueryKey, getGetVaultStatsQueryKey } from '@workspace/api-client-react';
import { useState } from 'react';
import { useLocation, Link } from 'wouter';
import { useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Lock, Split, ArrowLeft, Plus, Trash2, CheckCircle2 } from 'lucide-react';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';

const lockVaultSchema = z.object({
  name: z.string().min(1, 'Vault name is required'),
  description: z.string().optional(),
  recipientAddress: z.string().min(1, 'Recipient address is required').regex(/^(SP|ST)/, 'Must be a valid Stacks address'),
  amountStx: z.coerce.number().positive('Amount must be positive'),
  releaseSchedule: z.enum(['one_time', 'monthly', 'quarterly', 'annually']),
  durationMonths: z.coerce.number().int().positive('Duration must be positive'),
});

const splitVaultSchema = z.object({
  name: z.string().min(1, 'Vault name is required'),
  description: z.string().optional(),
  recipients: z.array(z.object({
    address: z.string().min(1, 'Address is required').regex(/^(SP|ST)/, 'Must be a valid Stacks address'),
    percentage: z.coerce.number().positive('Must be positive').max(100, 'Max 100%')
  })).min(1, 'At least one recipient is required')
}).refine(data => {
  const total = data.recipients.reduce((sum, r) => sum + (r.percentage || 0), 0);
  return Math.abs(total - 100) < 0.01;
}, {
  message: 'Percentages must sum to exactly 100%',
  path: ['recipients']
});

export default function CreateVault() {
  const { address } = useWallet();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [vaultType, setVaultType] = useState<'lock' | 'split' | null>(null);
  const createVault = useCreateVault();

  // Redirect if not connected
  if (!address) {
    setLocation('/');
    return null;
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <div className="mb-8">
        <Link href="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6">
          <ArrowLeft className="w-4 h-4" /> Back to Dashboard
        </Link>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium ${step >= 1 ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>1</div>
            <span className={`text-sm font-medium ${step >= 1 ? 'text-foreground' : 'text-muted-foreground'}`}>Type</span>
          </div>
          <div className={`h-px w-8 ${step >= 2 ? 'bg-primary' : 'bg-border'}`} />
          <div className="flex items-center gap-1.5">
            <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium ${step >= 2 ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>2</div>
            <span className={`text-sm font-medium ${step >= 2 ? 'text-foreground' : 'text-muted-foreground'}`}>Configure</span>
          </div>
          <div className={`h-px w-8 ${step >= 3 ? 'bg-primary' : 'bg-border'}`} />
          <div className="flex items-center gap-1.5">
            <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium ${step >= 3 ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>3</div>
            <span className={`text-sm font-medium ${step >= 3 ? 'text-foreground' : 'text-muted-foreground'}`}>Complete</span>
          </div>
        </div>
      </div>

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

      {step === 2 && vaultType === 'lock' && (
        <div className="animate-in fade-in slide-in-from-bottom-4">
          <div className="mb-6 flex items-center gap-3">
            <button onClick={() => setStep(1)} className="p-2 hover:bg-muted rounded-md transition-colors">
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">Configure Lock Vault</h1>
            </div>
          </div>
          <LockVaultForm 
            onSubmit={(data) => {
              createVault.mutate({
                data: {
                  name: data.name,
                  description: data.description,
                  type: 'lock',
                  ownerAddress: address,
                  lockDetails: {
                    recipientAddress: data.recipientAddress,
                    amountStx: data.amountStx,
                    releaseSchedule: data.releaseSchedule as any,
                    durationMonths: data.durationMonths
                  }
                }
              }, {
                onSuccess: () => {
                  queryClient.invalidateQueries({ queryKey: getListVaultsQueryKey() });
                  queryClient.invalidateQueries({ queryKey: getGetVaultStatsQueryKey() });
                  setStep(3);
                }
              });
            }}
            isPending={createVault.isPending}
          />
        </div>
      )}

      {step === 2 && vaultType === 'split' && (
        <div className="animate-in fade-in slide-in-from-bottom-4">
          <div className="mb-6 flex items-center gap-3">
            <button onClick={() => setStep(1)} className="p-2 hover:bg-muted rounded-md transition-colors">
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">Configure Split Vault</h1>
            </div>
          </div>
          <SplitVaultForm 
            onSubmit={(data) => {
              createVault.mutate({
                data: {
                  name: data.name,
                  description: data.description,
                  type: 'split',
                  ownerAddress: address,
                  splitRecipients: data.recipients.map(r => ({
                    address: r.address,
                    percentage: r.percentage
                  }))
                }
              }, {
                onSuccess: () => {
                  queryClient.invalidateQueries({ queryKey: getListVaultsQueryKey() });
                  queryClient.invalidateQueries({ queryKey: getGetVaultStatsQueryKey() });
                  setStep(3);
                }
              });
            }}
            isPending={createVault.isPending}
          />
        </div>
      )}

      {step === 3 && (
        <div className="text-center py-12 animate-in fade-in zoom-in-95">
          <div className="w-20 h-20 bg-green-500/10 text-green-500 rounded-full flex items-center justify-center mx-auto mb-6">
            <CheckCircle2 className="w-10 h-10" />
          </div>
          <h1 className="text-3xl font-semibold mb-2">Vault Created</h1>
          <p className="text-muted-foreground mb-8">Your {vaultType} vault is successfully configured and active.</p>
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

function LockVaultForm({ onSubmit, isPending }: { onSubmit: (data: z.infer<typeof lockVaultSchema>) => void, isPending: boolean }) {
  const form = useForm<z.infer<typeof lockVaultSchema>>({
    resolver: zodResolver(lockVaultSchema),
    defaultValues: {
      name: '',
      description: '',
      recipientAddress: '',
      amountStx: 0,
      releaseSchedule: 'monthly',
      durationMonths: 12
    }
  });

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
        <div className="bg-card border border-card-border p-6 rounded-xl space-y-6">
          <h2 className="text-lg font-medium border-b border-card-border pb-2">General Details</h2>
          <div className="grid gap-6">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Vault Name</FormLabel>
                  <FormControl>
                    <input {...field} className="w-full bg-input border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary" placeholder="e.g. Founder Vesting" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description (Optional)</FormLabel>
                  <FormControl>
                    <textarea {...field} className="w-full bg-input border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary min-h-[80px]" placeholder="Details about this vault..." />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </div>

        <div className="bg-card border border-card-border p-6 rounded-xl space-y-6">
          <h2 className="text-lg font-medium border-b border-card-border pb-2">Lock Configuration</h2>
          <div className="grid gap-6">
            <FormField
              control={form.control}
              name="recipientAddress"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Recipient Stacks Address</FormLabel>
                  <FormControl>
                    <input {...field} className="w-full bg-input border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary" placeholder="SP..." />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="grid sm:grid-cols-2 gap-6">
              <FormField
                control={form.control}
                name="amountStx"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Amount to Lock (STX)</FormLabel>
                    <FormControl>
                      <input type="number" step="0.000001" {...field} className="w-full bg-input border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="durationMonths"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Duration (Months)</FormLabel>
                    <FormControl>
                      <input type="number" {...field} className="w-full bg-input border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <FormField
              control={form.control}
              name="releaseSchedule"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Release Schedule</FormLabel>
                  <FormControl>
                    <select {...field} className="w-full bg-input border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary">
                      <option value="one_time">One-time at end of duration</option>
                      <option value="monthly">Monthly linear release</option>
                      <option value="quarterly">Quarterly release</option>
                      <option value="annually">Annually</option>
                    </select>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </div>

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={isPending}
            className="bg-primary text-primary-foreground px-8 py-2.5 rounded-md font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {isPending ? 'Creating Vault...' : 'Create Vault'}
          </button>
        </div>
      </form>
    </Form>
  );
}

function SplitVaultForm({ onSubmit, isPending }: { onSubmit: (data: z.infer<typeof splitVaultSchema>) => void, isPending: boolean }) {
  const form = useForm<z.infer<typeof splitVaultSchema>>({
    resolver: zodResolver(splitVaultSchema),
    defaultValues: {
      name: '',
      description: '',
      recipients: [{ address: '', percentage: 100 }]
    }
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: 'recipients'
  });

  const watchedRecipients = form.watch('recipients');
  const totalPercentage = watchedRecipients.reduce((sum, r) => sum + (Number(r.percentage) || 0), 0);
  
  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
        <div className="bg-card border border-card-border p-6 rounded-xl space-y-6">
          <h2 className="text-lg font-medium border-b border-card-border pb-2">General Details</h2>
          <div className="grid gap-6">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Vault Name</FormLabel>
                  <FormControl>
                    <input {...field} className="w-full bg-input border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary" placeholder="e.g. Revenue Split" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description (Optional)</FormLabel>
                  <FormControl>
                    <textarea {...field} className="w-full bg-input border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary min-h-[80px]" placeholder="Details about this vault..." />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </div>

        <div className="bg-card border border-card-border p-6 rounded-xl space-y-6">
          <div className="flex items-center justify-between border-b border-card-border pb-2">
            <h2 className="text-lg font-medium">Recipients & Allocation</h2>
            <div className={`text-sm font-medium ${Math.abs(totalPercentage - 100) < 0.01 ? 'text-green-500' : 'text-destructive'}`}>
              Total: {totalPercentage}%
            </div>
          </div>
          
          {form.formState.errors.recipients?.root?.message && (
            <div className="p-3 bg-destructive/10 text-destructive text-sm rounded-md border border-destructive/20">
              {form.formState.errors.recipients.root.message}
            </div>
          )}

          <div className="space-y-4">
            {fields.map((field, index) => (
              <div key={field.id} className="flex items-start gap-4">
                <div className="flex-1">
                  <FormField
                    control={form.control}
                    name={`recipients.${index}.address`}
                    render={({ field }) => (
                      <FormItem>
                        <FormControl>
                          <input {...field} className="w-full bg-input border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary" placeholder="Stacks Address (SP...)" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <div className="w-32">
                  <FormField
                    control={form.control}
                    name={`recipients.${index}.percentage`}
                    render={({ field }) => (
                      <FormItem>
                        <FormControl>
                          <div className="relative">
                            <input type="number" step="0.01" {...field} className="w-full bg-input border border-border rounded-md pl-3 pr-8 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary" placeholder="0" />
                            <span className="absolute right-3 top-2 text-sm text-muted-foreground">%</span>
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <button
                  type="button"
                  onClick={() => remove(index)}
                  disabled={fields.length === 1}
                  className="p-2 text-muted-foreground hover:text-destructive transition-colors mt-0.5 disabled:opacity-50 disabled:hover:text-muted-foreground"
                >
                  <Trash2 className="w-5 h-5" />
                </button>
              </div>
            ))}
          </div>
          
          <button
            type="button"
            onClick={() => append({ address: '', percentage: 0 })}
            className="flex items-center gap-2 text-sm text-primary hover:underline font-medium"
          >
            <Plus className="w-4 h-4" /> Add Recipient
          </button>
        </div>

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={isPending}
            className="bg-primary text-primary-foreground px-8 py-2.5 rounded-md font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {isPending ? 'Creating Vault...' : 'Create Vault'}
          </button>
        </div>
      </form>
    </Form>
  );
}
