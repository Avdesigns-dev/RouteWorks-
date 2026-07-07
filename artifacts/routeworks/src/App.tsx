import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import { Route, Switch, Router as WouterRouter, Link } from 'wouter';
import { WalletProvider, useWallet } from './context/WalletContext';

import Dashboard from './pages/Dashboard';
import CreateVault from './pages/CreateVault';
import VaultDetails from './pages/VaultDetails';
import { Boxes, LogOut } from 'lucide-react';

const queryClient = new QueryClient();

function Layout({ children }: { children: React.ReactNode }) {
  const { isConnected, address, disconnect } = useWallet();

  return (
    <div className="min-h-[100dvh] flex flex-col bg-background text-foreground">
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 text-primary hover:opacity-90 transition-opacity">
            <Boxes className="w-6 h-6" />
            <span className="font-bold text-lg tracking-tight text-foreground">RouteWorks</span>
          </Link>

          <div className="flex items-center gap-3">
            {/* Stacks Testnet badge — always shown */}
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
              Stacks Testnet
            </span>

            {isConnected && (
              <div className="flex items-center gap-3 pl-3 border-l border-border">
                <div className="text-sm font-mono bg-muted px-2.5 py-1 rounded text-muted-foreground">
                  {address?.substring(0, 5)}...{address?.substring(address.length - 4)}
                </div>
                <button onClick={disconnect} className="text-muted-foreground hover:text-destructive transition-colors p-1" title="Disconnect">
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        </div>
      </header>
      <main className="flex-1">
        {children}
      </main>
    </div>
  );
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={Dashboard} />
      <Route path="/create-vault" component={CreateVault} />
      <Route path="/vaults/:id" component={VaultDetails} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <WalletProvider>
        <TooltipProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
            <Layout>
              <Router />
            </Layout>
          </WouterRouter>
          <Toaster />
        </TooltipProvider>
      </WalletProvider>
    </QueryClientProvider>
  );
}

export default App;
