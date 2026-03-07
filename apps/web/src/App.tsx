import { Routes, Route, Navigate } from 'react-router';
import { useAuth } from './context/auth.tsx';
import { Layout } from './components/Layout.tsx';
import { InboxPage } from './pages/Inbox.tsx';
import { BookingDetailPage } from './pages/BookingDetail.tsx';
import { CalendarPage } from './pages/Calendar.tsx';
import { ActionQueuePage } from './pages/ActionQueue.tsx';
import { AnalyticsPage } from './pages/Analytics.tsx';
import { SettingsPage } from './pages/Settings.tsx';

export function App() {
  const { staff, loading, error } = useAuth();

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-center">
          <div className="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
          <p className="mt-4 text-gray-600">Loading StudioFlow360...</p>
        </div>
      </div>
    );
  }

  if (error || !staff) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900">Authentication Required</h1>
          <p className="mt-2 text-gray-600">
            {error ?? 'Please log in via Cloudflare Access to continue.'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Navigate to="/inbox" replace />} />
        <Route path="/inbox" element={<InboxPage />} />
        <Route path="/bookings/:id" element={<BookingDetailPage />} />
        <Route path="/calendar" element={<CalendarPage />} />
        <Route path="/action-queue" element={<ActionQueuePage />} />
        <Route path="/analytics" element={<AnalyticsPage />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Routes>
    </Layout>
  );
}
