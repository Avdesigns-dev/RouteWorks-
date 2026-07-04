import { useGetVault, useGetVaultActivity, useUpdateVault, getGetVaultQueryKey, getGetVaultActivityQueryKey, getGetVaultStatsQueryKey } from '@workspace/api-client-react';
import { useWallet } from '@/context/WalletContext';
import { useRoute, Link } from 'wouter';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Lock, Split, CheckCircle2, PauseCircle, Settings, ExternalLink, CalendarDays, RefreshCw } from 'lucide-react';

export default function VaultDetails() {
  const [, params] = useRoute('/vaults/:id');
  const id = Number(params?.id);
  const { address } = useWallet();
  const queryClient = useQueryClient();
  
  const { data: vault, isLoading } = useGetVault(id, { query: { enabled: !!id && !!address } });
  const { data: activity } = useGetVaultActivity(id, { query: { enabled: !!id && !!address } });
  const updateVault = useUpdateVault();

  if (isLoading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8 animate-pulse">
        <div className="h-8 w-48 bg-card rounded-md mb-8"></div>
        <div className="h-40 bg-card rounded-xl mb-8"></div>
        <div className="h-64 bg-card rounded-xl"></div>
      </div>
    );
  }

  if (!vault) return <div className="p-8 text-center">Vault not found</div>;

  const handleToggleStatus = () => {
    const newStatus = vault.status === 'active' ? 'paused' : 'active';
    updateVault.mutate(
      { id, data: { status: newStatus } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetVaultQueryKey(id) });
          queryClient.invalidateQueries({ queryKey: getGetVaultActivityQueryKey(id) });
          queryClient.invalidateQueries({ queryKey: getGetVaultStatsQueryKey() });
        }
      }
    );
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <Link href="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6">
        <ArrowLeft className="w-4 h-4" /> Back to Dashboard
      </Link>

      <div className="flex flex-col md:flex-row md:items-start justify-between gap-6 mb-8">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <h1 className="text-3xl font-semibold tracking-tight">{vault.name}</h1>
            {vault.type === 'lock' ? (
              <span className="inline-flex items-center gap-1 text-xs uppercase tracking-wider font-semibold bg-blue-500/10 text-blue-400 px-2.5 py-1 rounded">
                <Lock className="w-3.5 h-3.5" /> Lock
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-xs uppercase tracking-wider font-semibold bg-purple-500/10 text-purple-400 px-2.5 py-1 rounded">
                <Split className="w-3.5 h-3.5" /> Split
              </span>
            )}
            <span className={`inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded border ${
              vault.status === 'active' ? 'border-green-500/30 text-green-500 bg-green-500/10' :
              vault.status === 'paused' ? 'border-yellow-500/30 text-yellow-500 bg-yellow-500/10' :
              'border-muted-border text-muted-foreground bg-muted'
            }`}>
              {vault.status === 'active' && <CheckCircle2 className="w-3 h-3" />}
              {vault.status === 'paused' && <PauseCircle className="w-3 h-3" />}
              {vault.status.charAt(0).toUpperCase() + vault.status.slice(1)}
            </span>
          </div>
          {vault.description && <p className="text-muted-foreground mt-2 max-w-2xl">{vault.description}</p>}
        </div>
        
        <div className="flex items-center gap-3">
          {vault.status !== 'completed' && (
            <button 
              onClick={handleToggleStatus}
              disabled={updateVault.isPending}
              className={`px-4 py-2 rounded-md font-medium text-sm flex items-center gap-2 border transition-colors ${
                vault.status === 'active' 
                  ? 'border-yellow-500/30 text-yellow-500 hover:bg-yellow-500/10' 
                  : 'border-green-500/30 text-green-500 hover:bg-green-500/10'
              }`}
            >
              <RefreshCw className={`w-4 h-4 ${updateVault.isPending ? 'animate-spin' : ''}`} />
              {vault.status === 'active' ? 'Pause Vault' : 'Resume Vault'}
            </button>
          )}
          <button className="p-2 border border-input rounded-md hover:bg-muted text-muted-foreground transition-colors">
            <Settings className="w-5 h-5" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="bg-card border border-card-border p-6 rounded-xl">
          <p className="text-sm font-medium text-muted-foreground mb-1">Current Balance</p>
          <p className="text-3xl font-semibold text-primary">{vault.balance} STX</p>
        </div>
        <div className="bg-card border border-card-border p-6 rounded-xl">
          <p className="text-sm font-medium text-muted-foreground mb-1">Created</p>
          <p className="text-lg font-medium">{new Date(vault.createdAt).toLocaleDateString()}</p>
        </div>
        <div className="bg-card border border-card-border p-6 rounded-xl overflow-hidden">
          <p className="text-sm font-medium text-muted-foreground mb-1">Owner</p>
          <p className="text-sm font-mono truncate">{vault.ownerAddress}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="space-y-6">
          <h2 className="text-xl font-medium tracking-tight">Vault Rules</h2>
          <div className="bg-card border border-card-border rounded-xl overflow-hidden">
            {vault.type === 'lock' && vault.lockDetails && (
              <div className="divide-y divide-card-border">
                <div className="p-5 flex items-start justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground mb-1">Recipient</p>
                    <p className="font-mono text-sm">{vault.lockDetails.recipientAddress}</p>
                  </div>
                  <ExternalLink className="w-4 h-4 text-muted-foreground" />
                </div>
                <div className="p-5 grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-muted-foreground mb-1">Locked Amount</p>
                    <p className="font-medium">{vault.lockDetails.amountStx} STX</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground mb-1">Duration</p>
                    <p className="font-medium">{vault.lockDetails.durationMonths} Months</p>
                  </div>
                </div>
                <div className="p-5 flex items-center gap-3 bg-muted/30">
                  <CalendarDays className="w-5 h-5 text-blue-400" />
                  <div>
                    <p className="font-medium text-sm">Release Schedule: <span className="capitalize">{vault.lockDetails.releaseSchedule.replace('_', '-')}</span></p>
                    <p className="text-xs text-muted-foreground mt-0.5">Automated release based on on-chain time.</p>
                  </div>
                </div>
              </div>
            )}

            {vault.type === 'split' && vault.splitRecipients && (
              <div>
                <div className="p-5 border-b border-card-border flex items-center justify-between bg-muted/30">
                  <p className="font-medium text-sm">Distribution Breakdown</p>
                  <p className="text-xs text-muted-foreground">{vault.splitRecipients.length} Recipients</p>
                </div>
                <div className="divide-y divide-card-border">
                  {vault.splitRecipients.map((recipient, i) => (
                    <div key={i} className="p-4 flex items-center justify-between">
                      <p className="font-mono text-sm">{recipient.address}</p>
                      <div className="flex items-center gap-3">
                        <div className="w-24 h-1.5 bg-input rounded-full overflow-hidden">
                          <div className="h-full bg-primary" style={{ width: `${recipient.percentage}%` }} />
                        </div>
                        <span className="font-medium text-sm w-12 text-right">{recipient.percentage}%</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="space-y-6">
          <h2 className="text-xl font-medium tracking-tight">Activity Log</h2>
          <div className="bg-card border border-card-border rounded-xl">
            {activity && activity.length > 0 ? (
              <div className="relative pl-6 py-6 pr-4">
                <div className="absolute left-[31px] top-6 bottom-6 w-px bg-card-border" />
                <div className="space-y-6 relative z-10">
                  {activity.map((event, i) => (
                    <div key={event.id} className="flex gap-4">
                      <div className={`w-3 h-3 rounded-full mt-1.5 shrink-0 outline outline-4 outline-card ${
                        event.eventType === 'vault_created' ? 'bg-primary' :
                        event.eventType.includes('completed') ? 'bg-green-500' :
                        event.eventType.includes('paused') ? 'bg-yellow-500' :
                        'bg-blue-400'
                      }`} />
                      <div>
                        <p className="text-sm font-medium">{event.description}</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {new Date(event.createdAt).toLocaleString(undefined, { 
                            dateStyle: 'medium', timeStyle: 'short' 
                          })}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="p-8 text-center text-muted-foreground text-sm">
                No activity yet.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
