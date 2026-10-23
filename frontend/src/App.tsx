import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuthStore } from './store/authStore';
import AppLayout from './layouts/AppLayout';
import LoginPage from './pages/auth/LoginPage';
import MainDashboard from './pages/main/MainDashboard';
import SubDashboard from './pages/sub/SubDashboard';
import SubEmployeesBoard from './pages/sub/SubEmployeesBoard';
import SubStockRequests from './pages/sub/SubStockRequests';
import SubPaymentsPage from './pages/sub/SubPaymentsPage';
import SubEventsPage from './pages/sub/SubEventsPage';
import SubReportsPage from './pages/sub/SubReportsPage';
import EmployeesPage from './pages/EmployeesPage';
import ExpensesPage from './pages/ExpensesPage';
import EmployeeSessionPage from './pages/EmployeeSessionPage';
import MainPaymentsPage from './pages/main/MainPaymentsPage';
import {
  BranchesPage,
  ItemsPage,
  StockPage,
  RequestsPage,
  PaymentsReportsPage,
  EventsPage,
  NotificationsPage,
  AuditPage,
  FraudPage,
  BackupPage,
  SettingsPage,
} from './pages/ModulePages';

function Protected({ role, children }: { role?: 'MAIN_ADMIN' | 'SUB_ADMIN'; children: React.ReactNode }) {
  const user = useAuthStore((s) => s.user);
  const token = useAuthStore((s) => s.accessToken);
  if (!user || !token) return <Navigate to="/login" replace />;
  if (role && user.role !== role) {
    return <Navigate to={user.role === 'MAIN_ADMIN' ? '/main' : '/sub'} replace />;
  }
  return <>{children}</>;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/main"
        element={
          <Protected role="MAIN_ADMIN">
            <AppLayout />
          </Protected>
        }
      >
        <Route index element={<MainDashboard />} />
        <Route path="branches" element={<BranchesPage />} />
        <Route path="items" element={<ItemsPage />} />
        <Route path="stock" element={<StockPage />} />
        <Route path="requests" element={<RequestsPage />} />
        <Route path="employees" element={<EmployeesPage />} />
        <Route path="employees/:id" element={<EmployeeSessionPage />} />
        <Route path="payments" element={<MainPaymentsPage />} />
        <Route path="expenses" element={<ExpensesPage />} />
        <Route path="events" element={<EventsPage />} />
        <Route path="reports" element={<PaymentsReportsPage />} />
        <Route path="notifications" element={<NotificationsPage />} />
        <Route path="audit" element={<AuditPage />} />
        <Route path="fraud" element={<FraudPage />} />
        <Route path="backup" element={<BackupPage />} />
        <Route path="settings" element={<SettingsPage />} />
        {/* Same Madhapur-style workspace for ANY sub-branch */}
        <Route path="workspace/:branchId" element={<SubDashboard />} />
        <Route path="workspace/:branchId/employees" element={<SubEmployeesBoard />} />
        <Route path="workspace/:branchId/employees/:id" element={<EmployeeSessionPage />} />
        <Route path="workspace/:branchId/stock" element={<StockPage />} />
        <Route path="workspace/:branchId/requests" element={<SubStockRequests />} />
        <Route path="workspace/:branchId/payments" element={<SubPaymentsPage />} />
        <Route path="workspace/:branchId/expenses" element={<ExpensesPage />} />
        <Route path="workspace/:branchId/events" element={<SubEventsPage />} />
        <Route path="workspace/:branchId/reports" element={<SubReportsPage />} />
        <Route path="workspace/:branchId/settings" element={<SettingsPage />} />
      </Route>
      <Route
        path="/sub"
        element={
          <Protected role="SUB_ADMIN">
            <AppLayout />
          </Protected>
        }
      >
        <Route index element={<SubDashboard />} />
        <Route path="employees" element={<SubEmployeesBoard />} />
        <Route path="employees/:id" element={<EmployeeSessionPage />} />
        <Route path="stock" element={<StockPage />} />
        <Route path="requests" element={<SubStockRequests />} />
        <Route path="payments" element={<SubPaymentsPage />} />
        <Route path="expenses" element={<ExpensesPage />} />
        <Route path="events" element={<SubEventsPage />} />
        <Route path="reports" element={<SubReportsPage />} />
        <Route path="settings" element={<SettingsPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}
