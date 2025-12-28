import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Layout, Spin } from 'antd';
import AppHeader from './components/AppHeader';
import DataImportPage from './pages/DataImportPage';
import QueryPage from './pages/QueryPage';
import SchedulePage from './pages/SchedulePage';
import WeeklyExportPage from './pages/WeeklyExportPage';
import LoginPage from './pages/LoginPage';
import { AuthProvider, useAuth } from './contexts/AuthContext';

const { Content } = Layout;

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
    return <Navigate to="/schedule" replace />;
  }

  return children;
};

function AppContent() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' }}>
        <Spin size="large" />
      </div>
    );
  }

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      {!user ? (
        <Route path="*" element={<Navigate to="/login" replace />} />
      ) : user.role === 'user' ? (
        // 普通用户路由（包含 duty_schedule 功能）
        <>
          <Route path="/" element={<Navigate to="/schedule" replace />} />
          <Route
            path="/schedule"
            element={
              <Layout style={{ minHeight: '100vh' }}>
                <AppHeader />
                <Content style={{ padding: '24px', background: '#f0f2f5' }}>
                  <SchedulePage />
                </Content>
              </Layout>
            }
          />
          <Route
            path="/query"
            element={
              <Layout style={{ minHeight: '100vh' }}>
                <AppHeader />
                <Content style={{ padding: '24px', background: '#f0f2f5' }}>
                  <QueryPage />
                </Content>
              </Layout>
            }
          />
          <Route path="*" element={<Navigate to="/schedule" replace />} />
        </>
      ) : (
        <>
          <Route path="/" element={<Navigate to="/schedule" replace />} />
          <Route
            path="/schedule"
            element={
              <Layout style={{ minHeight: '100vh' }}>
                <AppHeader />
                <Content style={{ padding: '24px', background: '#f0f2f5' }}>
                  <ProtectedRoute>
                    <SchedulePage />
                  </ProtectedRoute>
                </Content>
              </Layout>
            }
          />
          <Route path="/query" element={
            <Layout style={{ minHeight: '100vh' }}>
              <AppHeader />
              <Content style={{ padding: '24px', background: '#f0f2f5' }}>
                <ProtectedRoute><QueryPage /></ProtectedRoute>
              </Content>
            </Layout>
          } />
          <Route
            path="/weekly-export"
            element={
              <Layout style={{ minHeight: '100vh' }}>
                <AppHeader />
                <Content style={{ padding: '24px', background: '#f0f2f5' }}>
                  <ProtectedRoute requireAdmin><WeeklyExportPage /></ProtectedRoute>
                </Content>
              </Layout>
            }
          />
          <Route path="/import" element={
            <Layout style={{ minHeight: '100vh' }}>
              <AppHeader />
              <Content style={{ padding: '24px', background: '#f0f2f5' }}>
                <ProtectedRoute requireAdmin><DataImportPage /></ProtectedRoute>
              </Content>
            </Layout>
          } />
        </>
      )}
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


