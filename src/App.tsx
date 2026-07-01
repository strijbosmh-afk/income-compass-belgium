import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { lazy, Suspense } from "react";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { AppLayout } from "@/components/AppLayout";
import { Loader2 } from "lucide-react";

const queryClient = new QueryClient();

const Login = lazy(() => import("./pages/Login"));
const UploadPage = lazy(() => import("./pages/UploadPage"));
const RecordsPage = lazy(() => import("./pages/RecordsPage"));
const DashboardPage = lazy(() => import("./pages/DashboardPage"));
const NomenclaturePage = lazy(() => import("./pages/NomenclaturePage"));
const StatisticsPage = lazy(() => import("./pages/StatisticsPage"));
const ExportPage = lazy(() => import("./pages/ExportPage"));
const SimulationsPage = lazy(() => import("./pages/SimulationsPage"));
const ControlePage = lazy(() => import("./pages/ControlePage"));
const GoalsPage = lazy(() => import("./pages/GoalsPage"));
const PensionOverviewPage = lazy(() => import("./pages/PensionOverviewPage"));
const PensionUploadPage = lazy(() => import("./pages/PensionUploadPage"));
const PensionIptUploadPage = lazy(() => import("./pages/PensionIptUploadPage"));
const PensionRecordsPage = lazy(() => import("./pages/PensionRecordsPage"));
const PensionDashboardPage = lazy(() => import("./pages/PensionDashboardPage"));
const PortfolioPage = lazy(() => import("./pages/PortfolioPage"));
const NotFound = lazy(() => import("./pages/NotFound"));

function RouteFallback() {
  return <div className="min-h-screen flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <RouteFallback />;
  if (!user) return <Navigate to="/login" replace />;
  return <AppLayout>{children}</AppLayout>;
}

function AuthRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <RouteFallback />;
  if (user) return <Navigate to="/" replace />;
  return <>{children}</>;
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <AuthProvider>
        <BrowserRouter>
          <Suspense fallback={<RouteFallback />}>
            <Routes>
              <Route path="/login" element={<AuthRoute><Login /></AuthRoute>} />
              <Route path="/" element={<ProtectedRoute><UploadPage /></ProtectedRoute>} />
              <Route path="/records" element={<ProtectedRoute><RecordsPage /></ProtectedRoute>} />
              <Route path="/dashboard" element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />
              <Route path="/statistics" element={<ProtectedRoute><StatisticsPage /></ProtectedRoute>} />
              <Route path="/export" element={<ProtectedRoute><ExportPage /></ProtectedRoute>} />
              <Route path="/nomenclature" element={<ProtectedRoute><NomenclaturePage /></ProtectedRoute>} />
              <Route path="/simulations" element={<ProtectedRoute><SimulationsPage /></ProtectedRoute>} />
              <Route path="/controle" element={<ProtectedRoute><ControlePage /></ProtectedRoute>} />
              <Route path="/goals" element={<ProtectedRoute><GoalsPage /></ProtectedRoute>} />
              <Route path="/pensioen" element={<ProtectedRoute><PensionOverviewPage /></ProtectedRoute>} />
              <Route path="/pensioen/upload" element={<ProtectedRoute><PensionUploadPage /></ProtectedRoute>} />
              <Route path="/pensioen/upload-ipt" element={<ProtectedRoute><PensionIptUploadPage /></ProtectedRoute>} />
              <Route path="/pensioen/overzicht" element={<ProtectedRoute><PensionRecordsPage /></ProtectedRoute>} />
              <Route path="/pensioen/dashboard" element={<ProtectedRoute><PensionDashboardPage /></ProtectedRoute>} />
              <Route path="/aandelen" element={<ProtectedRoute><PortfolioPage /></ProtectedRoute>} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
        </BrowserRouter>
      </AuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
