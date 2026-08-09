import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import Layout from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import HospitalDetail from './pages/HospitalDetail';
import Transfers from './pages/Transfers';
import AuditLog from './pages/AuditLog';

function ProtectedRoute({ children, roles }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/dashboard" replace />;
  return children;
}

export default function App() {
  const { user } = useAuth();

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/dashboard" /> : <Login />} />
      <Route element={<ProtectedRoute><Layout /></ProtectedRoute>}>
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/hospital" element={<HospitalDetail />} />
        <Route path="/hospital/:id" element={<HospitalDetail />} />
        <Route path="/transfers" element={<Transfers />} />
        <Route
          path="/audit"
          element={
            <ProtectedRoute roles={['regional_coordinator']}>
              <AuditLog />
            </ProtectedRoute>
          }
        />
      </Route>
      <Route path="*" element={<Navigate to={user ? '/dashboard' : '/login'} />} />
    </Routes>
  );
}
