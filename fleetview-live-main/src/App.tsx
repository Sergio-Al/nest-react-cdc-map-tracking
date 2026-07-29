import { lazy, Suspense, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ThemeProvider } from "@/components/theme/ThemeProvider";
import { ProtectedRoute } from "@/components/layout/ProtectedRoute";
import { AppLayout } from "@/components/layout/AppLayout";
// LoginPage stays eager — it's the first paint for unauthenticated users.
import LoginPage from "./pages/LoginPage";
// Everything else is route-split so the live-map user doesn't download Recharts
// (Reports), dnd-kit (Routes), etc. up front.
const SignupPage = lazy(() => import("./pages/SignupPage"));
const Index = lazy(() => import("./pages/Index"));
const HistoryPage = lazy(() => import("./pages/HistoryPage"));
const MonitoringPage = lazy(() => import("./pages/MonitoringPage"));
const ReportsPage = lazy(() => import("./pages/ReportsPage"));
const SettingsPage = lazy(() => import("./pages/SettingsPage"));
const RoutesPage = lazy(() => import("./pages/RoutesPage"));
const DriversPage = lazy(() => import("./pages/DriversPage"));
const VehiclesPage = lazy(() => import("./pages/VehiclesPage"));
const NotFound = lazy(() => import("./pages/NotFound"));
const CustomersPage = lazy(() => import("./pages/CustomersPage"));
const OrdersPage = lazy(() => import("./pages/OrdersPage"));

const PageFallback = () => (
  <div className="flex h-screen w-full items-center justify-center bg-background" />
);

const HtmlLangSync = () => {
  const { i18n } = useTranslation();
  useEffect(() => {
    const apply = (lng: string) => {
      const base = (lng ?? "es").split("-")[0];
      document.documentElement.lang = base;
    };
    apply(i18n.language);
    i18n.on("languageChanged", apply);
    return () => i18n.off("languageChanged", apply);
  }, [i18n]);
  return null;
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <HtmlLangSync />
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
        <Suspense fallback={<PageFallback />}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/signup" element={<SignupPage />} />
          <Route element={<ProtectedRoute />}>
            <Route element={<AppLayout />}>
              <Route path="/" element={<Index />} />
              <Route path="/history" element={<HistoryPage />} />
              <Route path="/routes" element={<RoutesPage />} />
              <Route path="/drivers" element={<DriversPage />} />
              <Route path="/vehicles" element={<VehiclesPage />} />
              <Route path="/customers" element={<CustomersPage />} />
              <Route path="/orders" element={<OrdersPage />} />
              <Route path="/monitoring" element={<MonitoringPage />} />
              <Route path="/reports" element={<ReportsPage />} />
              <Route path="/settings" element={<SettingsPage />} />
            </Route>
          </Route>
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
        </Suspense>
      </BrowserRouter>
      </TooltipProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
