import { useWallet } from '@/context/WalletContext';
import { useGetVaultStats, useListVaults, useListActivity, getGetVaultStatsQueryKey, getListVaultsQueryKey, getListActivityQueryKey } from '@workspace/api-client-react';
import { Link } from 'wouter';
import { ArrowRight, Lock, Split, ArrowUpRight, CheckCircle2, PauseCircle, Layers, FileClock } from 'lucide-react';

export default function Dashboard() {
  const { address, isConnected, isConnecting, connect } = useWallet();
  const listVaultsParams = { ownerAddress: address || '' };
  const listActivityParams = { ownerAddress: address || '', limit: 10 };
  const { data: stats } = useGetVaultStats({ ownerAddress: address || '' }, { query: { enabled: !!address, queryKey: getGetVaultStatsQueryKey({ ownerAddress: address || '' }) } });
  const { data: vaults, isLoading: isLoadingVaults } = useListVaults(listVaultsParams, { query: { enabled: !!address, queryKey: getListVaultsQueryKey(listVaultsParams) } });
  const { data: activity } = useListActivity(listActivityParams, { query: { enabled: !!address, queryKey: getListActivityQueryKey(listActivityParams) } });

  if (!isConnected) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[calc(100vh-64px)] px-4">
        <div className="text-center max-w-md">
          <div className="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center mx-auto mb-6">
            <Layers className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-3xl font-semibold mb-3">Treasury Automation</h1>
          <p className="text-muted-foreground mb-8">
            Connect your Stacks wallet to manage programmable vaults, automated distributions, and team treasury flows.
          </p>
          <button
            onClick={connect}
            disabled={isConnecting}
            className="w-full sm:w-auto bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-70 disabled:cursor-not-allowed px-8 py-3 rounded-md font-medium transition-colors inline-flex items-center justify-center gap-2"
          >
            {isConnecting ? (
              <>
                <span className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                Connecting…
              </>
            ) : (
              'Connect Wallet'
            )}
          </button>
          <p className="text-xs text-muted-foreground mt-4">
            Compatible with Xverse, Leather, and other Stacks wallets
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 space-y-10">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Overview</h1>
          <p className="text-sm text-muted-foreground mt-1">Manage your vault positions and automated payments.</p>
        </div>
        <Link href="/create-vault" className="inline-flex items-center justify-center bg-primary text-primary-foreground hover:bg-primary/90 px-4 py-2.5 rounded-md font-medium text-sm transition-colors shadow-sm">
          Create Vault
        </Link>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Total Balance" value={stats ? `${stats.totalBalance} STX` : '0 STX'} />
        <StatCard title="Active Vaults" value={stats?.activeVaults || 0} />
        <StatCard title="Upcoming Payments" value={stats?.upcomingPayments || 0} />
        <StatCard title="Total Distributed" value={stats ? `${stats.totalDistributed} STX` : '0 STX'} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-medium">Active Vaults</h2>
            <Link href="/vaults" className="text-sm text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1">
              View all <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
          
          {isLoadingVaults ? (
            <div className="grid sm:grid-cols-2 gap-4">
              {[1, 2, 3, 4].map(i => (
                <div key={i} className="h-40 bg-card border border-card-border rounded-lg animate-pulse" />
              ))}
            </div>
          ) : vaults && vaults.length > 0 ? (
            <div className="grid sm:grid-cols-2 gap-4">
              {vaults.map(vault => (
                <Link key={vault.id} href={`/vaults/${vault.id}`} className="block group">
                  <div className="bg-card border border-card-border rounded-lg p-5 hover:border-primary/50 transition-colors h-full flex flex-col relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-primary/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                    <div className="flex items-start justify-between mb-4">
                      <div>
                        <h3 className="font-medium text-foreground group-hover:text-primary transition-colors">{vault.name}</h3>
                        <p className="text-xs text-muted-foreground mt-1">Created {new Date(vault.createdAt).toLocaleDateString()}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        {vault.type === 'lock' ? (
                          <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider font-semibold bg-blue-500/10 text-blue-400 px-2 py-1 rounded">
                            <Lock className="w-3 h-3" /> Lock
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider font-semibold bg-purple-500/10 text-purple-400 px-2 py-1 rounded">
                            <Split className="w-3 h-3" /> Split
                          </span>
                        )}
                      </div>
                    </div>
                    
                    <div className="mt-auto pt-4 border-t border-card-border/50 flex items-center justify-between">
                      <div>
                        <p className="text-xs text-muted-foreground mb-0.5">Balance</p>
                        <p className="text-sm font-semibold">{vault.balance} STX</p>
                      </div>
                      <div className="flex items-center gap-1.5 text-xs font-medium">
                        {vault.status === 'active' && <span className="text-green-500 flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" /> Active</span>}
                        {vault.status === 'paused' && <span className="text-yellow-500 flex items-center gap-1"><PauseCircle className="w-3.5 h-3.5" /> Paused</span>}
                        {vault.status === 'completed' && <span className="text-muted-foreground flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" /> Completed</span>}
                      </div>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <div className="bg-card border border-card-border border-dashed rounded-lg p-10 text-center flex flex-col items-center">
              <div className="w-12 h-12 bg-muted/50 rounded-full flex items-center justify-center mb-4 text-muted-foreground">
                <Lock className="w-5 h-5" />
              </div>
              <h3 className="text-sm font-medium mb-1">No vaults yet</h3>
              <p className="text-xs text-muted-foreground mb-4 max-w-sm">Create your first vault to lock funds or set up automated splits.</p>
              <Link href="/create-vault" className="text-sm text-primary font-medium hover:underline">
                Create Vault
              </Link>
            </div>
          )}
        </div>

        <div className="space-y-6">
          <h2 className="text-lg font-medium">Recent Activity</h2>
          <div className="bg-card border border-card-border rounded-lg overflow-hidden">
            {activity && activity.length > 0 ? (
              <div className="divide-y divide-card-border/50">
                {activity.map(event => (
                  <div key={event.id} className="p-4 text-sm flex gap-3">
                    <div className="mt-0.5">
                      {event.eventType === 'vault_created' && <FileClock className="w-4 h-4 text-primary" />}
                      {event.eventType === 'funds_locked' && <Lock className="w-4 h-4 text-blue-400" />}
                      {event.eventType === 'payment_released' && <ArrowUpRight className="w-4 h-4 text-green-400" />}
                      {event.eventType === 'split_executed' && <Split className="w-4 h-4 text-purple-400" />}
                      {event.eventType === 'vault_paused' && <PauseCircle className="w-4 h-4 text-yellow-500" />}
                      {event.eventType === 'vault_completed' && <CheckCircle2 className="w-4 h-4 text-muted-foreground" />}
                      {event.eventType === 'recipient_added' && <ArrowRight className="w-4 h-4 text-muted-foreground" />}
                    </div>
                    <div>
                      <p className="text-foreground">{event.description}</p>
                      <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                        <Link href={`/vaults/${event.vaultId}`} className="hover:text-primary transition-colors">
                          {event.vaultName}
                        </Link>
                        <span>•</span>
                        <span>{new Date(event.createdAt).toLocaleDateString()}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-8 text-center text-sm text-muted-foreground">
                No recent activity to show.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ title, value }: { title: string; value: string | number }) {
  return (
    <div className="bg-card border border-card-border rounded-lg p-5">
      <p className="text-sm font-medium text-muted-foreground mb-1">{title}</p>
      <p className="text-2xl font-semibold tracking-tight">{value}</p>
    </div>
  );
}
