import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Layout, Spin } from 'antd';
import AppSidebar, { AppTopBar } from './components/AppHeader';
import QueryPage from './pages/QueryPage';
import SchedulePage from './pages/SchedulePage';
import SemesterPage from './pages/SemesterPage';
import ScheduleVersionPage from './pages/ScheduleVersionPage';
import ReminderPage from './pages/ReminderPage';
import CourseQueryPage from './pages/CourseQueryPage';
import BookingPage from './pages/BookingPage';
import LoginPage from './pages/LoginPage';
import { AuthProvider, useAuth } from './contexts/AuthContext';

const { Content } = Layout;

const SIDEBAR_WIDTH = 160;

// 统一的页面布局
function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <Layout style={{ minHeight: '100vh' }}>
      <AppSidebar />
      <Layout style={{ marginLeft: SIDEBAR_WIDTH }}>
        <AppTopBar />
        <Content style={{ marginTop: 64, padding: '24px', background: '#f0f2f5', minHeight: 'calc(100vh - 64px)' }}>
          {children}
        </Content>
      </Layout>
    </Layout>
  );
}

// 受保护的路由组件
const ProtectedRoute = ({ children, requireAdmin = false }: { children: React.ReactElement; requireAdmin?: boolean }) => {
  const { user, loading, isAdmin } = useAuth();

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' }}>
        <Spin size="large" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (requireAdmin && !isAdmin()) {
    return <Navigate to="/course-query" replace />;
  }

  return children;
};

function AppContent() {
  const { user, loading, isAdmin } = useAuth();

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' }}>
        <Spin size="large" />
      </div>
    );
  }

  if (!user) {
    return (
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }

  return (
    <Routes>
      <Route path="/login" element={<Navigate to="/course-query" replace />} />

      {/* 所有用户可访问 */}
      <Route path="/" element={<Navigate to="/course-query" replace />} />
      <Route path="/course-query" element={
        <AppLayout><CourseQueryPage /></AppLayout>
      } />
      <Route path="/query" element={
        <AppLayout><QueryPage /></AppLayout>
      } />

      {/* 管理员专用 */}
      <Route path="/semester" element={
        <AppLayout>
          <ProtectedRoute requireAdmin><SemesterPage /></ProtectedRoute>
        </AppLayout>
      } />
      <Route path="/booking" element={
        <AppLayout>
          <ProtectedRoute requireAdmin><BookingPage /></ProtectedRoute>
        </AppLayout>
      } />
      <Route path="/schedule" element={
        <AppLayout>
          <ProtectedRoute requireAdmin><SchedulePage /></ProtectedRoute>
        </AppLayout>
      } />
      <Route path="/schedule-version" element={
        <AppLayout>
          <ProtectedRoute requireAdmin><ScheduleVersionPage /></ProtectedRoute>
        </AppLayout>
      } />
      <Route path="/reminder" element={
        <AppLayout>
          <ProtectedRoute requireAdmin><ReminderPage /></ProtectedRoute>
        </AppLayout>
      } />

      <Route path="*" element={<Navigate to="/course-query" replace />} />
    </Routes>
  );
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
