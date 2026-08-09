import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const NAV_ITEMS = [
  { to: '/dashboard', label: 'Regional Dashboard', roles: ['clinician', 'regional_coordinator', 'hospital_admin', 'receiving_staff'] },
  { to: '/hospital', label: 'Hospital Detail', roles: ['hospital_admin', 'clinician', 'regional_coordinator'] },
  { to: '/transfers', label: 'Transfer Requests', roles: ['clinician', 'receiving_staff', 'regional_coordinator'] },
  { to: '/audit', label: 'Audit Log', roles: ['regional_coordinator'] },
];

const ROLE_LABELS = {
  hospital_admin: 'Hospital Admin',
  clinician: 'Clinician',
  receiving_staff: 'Receiving Staff',
  regional_coordinator: 'Regional Coordinator',
};

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const visibleNav = NAV_ITEMS.filter((item) => item.roles.includes(user.role));

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="app-layout">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <h1>SurgeLink</h1>
          <span>Regional Capacity Coordination</span>
        </div>
        <nav className="sidebar-nav">
          {visibleNav.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-footer">
          <div>{user.email}</div>
          <div style={{ marginTop: 4 }}>{ROLE_LABELS[user.role] || user.role}</div>
          <button className="btn btn-secondary btn-sm" style={{ marginTop: 12, width: '100%' }} onClick={handleLogout}>
            Sign out
          </button>
        </div>
      </aside>
      <main className="main-content">
        <Outlet />
      </main>
    </div>
  );
}
