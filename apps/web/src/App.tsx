import { Routes, Route, Navigate } from 'react-router';
import { useAuth } from './context/auth.tsx';
import { Layout } from './components/Layout.tsx';
import { InboxPage } from './pages/Inbox.tsx';
import { BookingDetailPage } from './pages/BookingDetail.tsx';
import { CalendarPage } from './pages/Calendar.tsx';
import { ActionQueuePage } from './pages/ActionQueue.tsx';
import { AnalyticsPage } from './pages/Analytics.tsx';
import { SettingsPage } from './pages/Settings.tsx';
import { DashboardPage } from './pages/Dashboard.tsx';
import { StudioManagementPage } from './pages/StudioManagement.tsx';
import { FinancePage } from './pages/Finance.tsx';
import { AssetsPage } from './pages/Assets.tsx';
import { InvoicesPage } from './pages/Invoices.tsx';
import { PublicBookingPage } from './pages/PublicBooking.tsx';
import { ProfilePage } from './pages/Profile.tsx';
import { GuestsPage } from './pages/Guests.tsx';
import { QuotesPage } from './pages/Quotes.tsx';
import { ContractsPage } from './pages/Contracts.tsx';
import { SchedulingPage } from './pages/Scheduling.tsx';
import { TasksPage } from './pages/Tasks.tsx';
import { InventoryPage } from './pages/Inventory.tsx';
import { DocumentsPage } from './pages/Documents.tsx';
import { NotificationsPage } from './pages/Notifications.tsx';

function AuthenticatedApp() {
  const { staff, loading, error } = useAuth();

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-blue-600">
            <svg className="h-6 w-6 animate-pulse text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
            </svg>
          </div>
          <p className="mt-4 text-sm font-medium text-gray-500">Loading StudioFlow360...</p>
        </div>
      </div>
    );
  }

  if (error || !staff) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-gray-100">
            <svg className="h-7 w-7 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
            </svg>
          </div>
          <h1 className="text-lg font-bold text-gray-900">Authentication Required</h1>
          <p className="mt-1.5 text-sm text-gray-500">
            {error ?? 'Please log in via Cloudflare Access to continue.'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/inbox" element={<InboxPage />} />
        <Route path="/bookings/:id" element={<BookingDetailPage />} />
        <Route path="/calendar" element={<CalendarPage />} />
        <Route path="/action-queue" element={<ActionQueuePage />} />
        <Route path="/analytics" element={<AnalyticsPage />} />
        <Route path="/studio" element={<StudioManagementPage />} />
        <Route path="/finance" element={<FinancePage />} />
        <Route path="/assets" element={<AssetsPage />} />
        <Route path="/invoices" element={<InvoicesPage />} />
        <Route path="/guests" element={<GuestsPage />} />
        <Route path="/quotes" element={<QuotesPage />} />
        <Route path="/contracts" element={<ContractsPage />} />
        <Route path="/scheduling" element={<SchedulingPage />} />
        <Route path="/tasks" element={<TasksPage />} />
        <Route path="/inventory" element={<InventoryPage />} />
        <Route path="/documents" element={<DocumentsPage />} />
        <Route path="/notifications" element={<NotificationsPage />} />
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Routes>
    </Layout>
  );
}

export function App() {
  return (
    <Routes>
      <Route path="/book" element={<PublicBookingPage />} />
      <Route path="/*" element={<AuthenticatedApp />} />
    </Routes>
  );
}
