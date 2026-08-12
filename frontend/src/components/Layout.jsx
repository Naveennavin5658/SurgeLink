import { useEffect, useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { capacityApi } from '../api/client';
import RoleTour from './RoleTour';

const NAV_ITEMS = [
  { to: '/dashboard', label: 'Regional Dashboard', roles: ['clinician', 'regional_coordinator', 'hospital_admin', 'receiving_staff'] },
  { to: '/hospital', label: 'Hospital Detail', roles: ['hospital_admin', 'clinician', 'regional_coordinator'] },
  { to: '/transfers', label: 'Transfer Requests', roles: ['clinician', 'receiving_staff', 'regional_coordinator'] },
  { to: '/audit', label: 'Audit Log', roles: ['regional_coordinator'] },
];

const ROLE_LABELS = {
  super_admin: 'Super Admin',
  hospital_admin: 'Hospital Admin',
  clinician: 'Clinician',
  receiving_staff: 'Receiving Staff',
  regional_coordinator: 'Regional Coordinator',
};

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [hospitals, setHospitals] = useState([]);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const visibleNav = NAV_ITEMS.filter((item) => item.roles.includes(user.role));

  useEffect(() => {
    if (!user) return;
    capacityApi.getHospitals().then(setHospitals).catch(() => setHospitals([]));
  }, [user]);

  const accessibleHospitals = (() => {
    if (!user) return [];
    if (user.role === 'super_admin') {
      return hospitals.map((hospital) => hospital.name);
    }
    if (user.role === 'regional_coordinator') {
      return hospitals.map((hospital) => hospital.name);
    }
    if (user.role === 'hospital_admin' && user.hospital_id) {
      const match = hospitals.find((hospital) => hospital._id === user.hospital_id);
      return match ? [match.name] : [];
    }
    if (user.role === 'clinician' || user.role === 'receiving_staff') {
      const match = hospitals.find((hospital) => hospital._id === user.hospital_id);
      return match ? [match.name] : [];
    }
    return [];
  })();

  const accessibleRegions = (() => {
    if (!user) return [];
    if (user.role === 'super_admin' || user.role === 'regional_coordinator') {
      return [...new Set(hospitals.map((hospital) => hospital.region))];
    }
    if (user.role === 'hospital_admin' || user.role === 'clinician' || user.role === 'receiving_staff') {
      const match = hospitals.find((hospital) => hospital._id === user.hospital_id);
      return match ? [match.region] : [];
    }
    return [];
  })();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="app-layout">
      <div className="mobile-nav-toggle">
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => setMobileMenuOpen((open) => !open)}>
          ☰ Menu
        </button>
      </div>
      <aside className={`sidebar ${mobileMenuOpen ? 'open' : 'collapsed'}`}>
        <div className="sidebar-brand">
          <div className="brand-mark">SL</div>
          <div>
            <h1>SurgeLink</h1>
            <span>Regional Capacity Coordination</span>
          </div>
        </div>
        <nav className="sidebar-nav">
          {visibleNav.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              onClick={() => setMobileMenuOpen(false)}
              className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-footer">
          <div className="sidebar-actions">
            <RoleTour />
          </div>
          <div>{user.email}</div>
          <div style={{ marginTop: 4 }}>{ROLE_LABELS[user.role] || user.role}</div>
          <button className="btn btn-secondary btn-sm" style={{ marginTop: 12, width: '100%' }} onClick={handleLogout}>
            Sign out
          </button>
        </div>
      </aside>
      <main className="main-content">
        <div className="top-bar">
          <div>
            <div className="eyebrow">Operations workspace</div>
            <h2>Manage capacity with calm, clear visibility</h2>
          </div>
          <div className="top-right-profile">
            <div className="profile-icon">{(user?.email || 'U').charAt(0).toUpperCase()}</div>
            <div>
              <div className="profile-role">{ROLE_LABELS[user.role] || user.role}</div>
              <div className="profile-access">Hospitals: {accessibleHospitals.length > 0 ? accessibleHospitals.join(', ') : 'None'}</div>
              <div className="profile-access">Regions: {accessibleRegions.length > 0 ? accessibleRegions.join(', ') : 'None'}</div>
            </div>
          </div>
        </div>
        <Outlet />
      </main>
    </div>
  );
}
