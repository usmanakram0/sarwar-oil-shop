import { lazy, Suspense } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/contexts/AuthContext";
import { SyncProvider } from "@/contexts/SyncContext";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import AppLayout from "@/components/layout/AppLayout";
import PageLoader from "@/components/layout/PageLoader";
import ErrorBoundary from "@/components/ErrorBoundary";
import { queryClient } from "@/lib/query/client";
import Login from "@/pages/Login";
import Register from "@/pages/Register";
import ForgotPassword from "@/pages/ForgotPassword";
import ResetPassword from "@/pages/ResetPassword";

const Dashboard = lazy(() => import("@/pages/Dashboard"));
const Products = lazy(() => import("@/pages/Products"));
const Categories = lazy(() => import("@/pages/Categories"));
const Customers = lazy(() => import("@/pages/Customers"));
const Invoices = lazy(() => import("@/pages/Invoices"));
const InvoiceCreate = lazy(() => import("@/pages/InvoiceCreate"));
const InvoiceView = lazy(() => import("@/pages/InvoiceView"));
const Ledger = lazy(() => import("@/pages/Ledger"));
const Suppliers = lazy(() => import("@/pages/Suppliers"));
const StockIn = lazy(() => import("@/pages/StockIn"));
const StockInCreate = lazy(() => import("@/pages/StockInCreate"));
const StockInView = lazy(() => import("@/pages/StockInView"));
const SettingsPage = lazy(() => import("@/pages/SettingsPage"));
const Profile = lazy(() => import("@/pages/Profile"));
const NotFound = lazy(() => import("./pages/NotFound"));

function LazyPage({ children }: { children: React.ReactNode }) {
  return (
    <ErrorBoundary>
      <Suspense fallback={<PageLoader />}>{children}</Suspense>
    </ErrorBoundary>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <SyncProvider>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route path="/register" element={<Register />} />
              <Route path="/forgot-password" element={<ForgotPassword />} />
              <Route path="/reset-password" element={<ResetPassword />} />

              <Route element={<ProtectedRoute />}>
                <Route element={<AppLayout />}>
                  <Route path="/" element={<LazyPage><Dashboard /></LazyPage>} />
                  <Route path="/products" element={<LazyPage><Products /></LazyPage>} />
                  <Route path="/categories" element={<LazyPage><Categories /></LazyPage>} />
                  <Route path="/suppliers" element={<LazyPage><Suppliers /></LazyPage>} />
                  <Route path="/stock-in" element={<LazyPage><StockIn /></LazyPage>} />
                  <Route path="/stock-in/new" element={<LazyPage><StockInCreate /></LazyPage>} />
                  <Route path="/stock-in/:id" element={<LazyPage><StockInView /></LazyPage>} />
                  <Route path="/customers" element={<LazyPage><Customers /></LazyPage>} />
                  <Route path="/invoices" element={<LazyPage><Invoices /></LazyPage>} />
                  <Route path="/invoices/new" element={<LazyPage><InvoiceCreate /></LazyPage>} />
                  <Route path="/invoices/:id" element={<LazyPage><InvoiceView /></LazyPage>} />
                  <Route path="/ledger" element={<LazyPage><Ledger /></LazyPage>} />
                  <Route path="/settings" element={<LazyPage><SettingsPage /></LazyPage>} />
                  <Route path="/profile" element={<LazyPage><Profile /></LazyPage>} />
                </Route>
              </Route>

              <Route path="*" element={<LazyPage><NotFound /></LazyPage>} />
            </Routes>
          </BrowserRouter>
        </TooltipProvider>
      </SyncProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
