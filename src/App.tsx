import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { AppLayout } from "@/components/AppLayout";
import Login from "./pages/Login";
import OAuthConsent from "./pages/OAuthConsent";
import UploadPage from "./pages/UploadPage";
import RecordsPage from "./pages/RecordsPage";
import DashboardPage from "./pages/DashboardPage";
import NomenclaturePage from "./pages/NomenclaturePage";
import StatisticsPage from "./pages/StatisticsPage";
import ExportPage from "./pages/ExportPage";
import PrintPage from "./pages/PrintPage";
import SimulationsPage from "./pages/SimulationsPage";
import ControlePage from "./pages/ControlePage";
import GoalsPage from "./pages/GoalsPage";
import PensionOverviewPage from "./pages/PensionOverviewPage";
import PensionUploadPage from "./pages/PensionUploadPage";

import PensionRecordsPage from "./pages/PensionRecordsPage";
import PensionDashboardPage from "./pages/PensionDashboardPage";
import PortfolioPage from "./pages/PortfolioPage";
import NotFound from "./pages/NotFound";
import { Loader2 } from "lucide-react";
import { SecurityGuard } from "@/components/SecurityGuard";
import { isSupabaseConfigured, missingSupabaseConfig } from "@/integrations/supabase/client";

const queryClient = new QueryClient();

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;
  if (!user) return <Navigate to="/login" replace />;
  return <SecurityGuard><AppLayout>{children}</AppLayout></SecurityGuard>;
}

function AuthRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;
  const next = new URLSearchParams(window.location.search).get('next');
  if (user && !next) return <Navigate to="/" replace />;
  return <>{children}</>;
}

const App = () => {
  if (!isSupabaseConfigured) return <MissingSupabaseConfig />;

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <AuthProvider>
          <BrowserRouter>
            <Routes>
              <Route path="/login" element={<AuthRoute><Login /></AuthRoute>} />
              <Route path="/.lovable/oauth/consent" element={<OAuthConsent />} />

              <Route path="/" element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />
              <Route path="/upload" element={<ProtectedRoute><UploadPage /></ProtectedRoute>} />
              <Route path="/records" element={<ProtectedRoute><RecordsPage /></ProtectedRoute>} />
              <Route path="/dashboard" element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />
              <Route path="/statistics" element={<ProtectedRoute><StatisticsPage /></ProtectedRoute>} />
              <Route path="/export" element={<ProtectedRoute><ExportPage /></ProtectedRoute>} />
              <Route path="/print" element={<ProtectedRoute><PrintPage /></ProtectedRoute>} />
              <Route path="/nomenclature" element={<ProtectedRoute><NomenclaturePage /></ProtectedRoute>} />
              <Route path="/simulations" element={<ProtectedRoute><SimulationsPage /></ProtectedRoute>} />
              <Route path="/controle" element={<ProtectedRoute><ControlePage /></ProtectedRoute>} />
              <Route path="/goals" element={<ProtectedRoute><GoalsPage /></ProtectedRoute>} />
              <Route path="/pensioen" element={<ProtectedRoute><PensionOverviewPage /></ProtectedRoute>} />
              <Route path="/pensioen/upload" element={<ProtectedRoute><PensionUploadPage /></ProtectedRoute>} />
              <Route path="/pensioen/upload-ipt" element={<Navigate to="/pensioen/upload" replace />} />
              <Route path="/pensioen/overzicht" element={<ProtectedRoute><PensionRecordsPage /></ProtectedRoute>} />
              <Route path="/pensioen/dashboard" element={<ProtectedRoute><PensionDashboardPage /></ProtectedRoute>} />
              <Route path="/vermogen" element={<ProtectedRoute><PortfolioPage /></ProtectedRoute>} />
              <Route path="/aandelen" element={<Navigate to="/vermogen" replace />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </BrowserRouter>
        </AuthProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
};

function MissingSupabaseConfig() {
  return (
    <main className="min-h-screen bg-muted/30 px-4 py-10 text-foreground">
      <div className="mx-auto max-w-xl rounded-3xl border border-border bg-card p-6 shadow-sm">
        <p className="text-sm font-medium text-primary">MyFinState configuratie</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">De app is bijna klaar</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          De site is geladen, maar de Supabase-configuratie ontbreekt in de hostingomgeving. Voeg deze variabelen toe en deploy opnieuw.
        </p>
        <div className="mt-5 rounded-2xl bg-muted p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Ontbreekt</p>
          <ul className="mt-2 space-y-1 font-mono text-sm">
            {missingSupabaseConfig.map((key) => <li key={key}>{key}</li>)}
          </ul>
        </div>
        <p className="mt-4 text-xs text-muted-foreground">
          Zet minstens <span className="font-mono">VITE_SUPABASE_URL</span> en <span className="font-mono">VITE_SUPABASE_PUBLISHABLE_KEY</span> in je deployment settings.
        </p>
      </div>
    </main>
  );
}

export default App;
