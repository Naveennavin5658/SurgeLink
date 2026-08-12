import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { capacityApi, capacityLevel } from '../api/client';

const BED_LABELS = {
  icu: 'ICU',
  oxygen: 'Oxygen',
  general: 'General',
  ventilator: 'Ventilator',
};

const ALL_BED_TYPES = ['icu', 'oxygen', 'general', 'ventilator'];

export default function Dashboard() {
  const { user } = useAuth();
  const [hospitals, setHospitals] = useState([]);
  const [capacities, setCapacities] = useState({});
  const [region, setRegion] = useState('');
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState(null);

  const fetchData = useCallback(async () => {
    try {
      const hospitalList = await capacityApi.getHospitals(region || undefined);
      setHospitals(hospitalList);

      const capMap = hospitalList.length
        ? await capacityApi.getBulkCapacity(hospitalList.map((h) => h._id))
        : {};

      setCapacities(capMap);
      setLastRefresh(new Date());
    } catch (err) {
      console.error('Dashboard fetch error:', err);
      setCapacities({});
    } finally {
      setLoading(false);
    }
  }, [region]);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 60 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const getBedCapacity = (hospitalId, bedType) => {
    const caps = capacities[hospitalId] || [];
    const cap = caps.find((c) => c.bed_type === bedType);
    return cap || { available: '—', total: '—' };
  };

  const activeBedTypes = ALL_BED_TYPES.filter((bt) =>
    hospitals.some((h) => h.bed_types?.includes(bt))
  );

  const roleCapabilities = {
    super_admin: ['Manage capacity for any hospital', 'View all regions and facilities', 'Coordinate regional transfer oversight'],
    regional_coordinator: ['Review all hospitals in the region', 'Monitor transfer activity', 'Access audit history'],
    hospital_admin: ['Update capacity for your assigned hospital', 'Review your hospital trend charts', 'Coordinate bed availability for your facility'],
    clinician: ['Create transfer requests', 'Track transfer status', 'View live capacity before requesting a bed'],
    receiving_staff: ['Accept or reject transfer requests', 'Reserve beds safely', 'Operate within the hospital you support'],
  };

  const assignedHospital = hospitals.find((hospital) => hospital._id === user?.hospital_id);
  const visibleRegions = [...new Set(hospitals.map((hospital) => hospital.region).filter(Boolean))];
  const statCards = [
    { label: 'Hospitals in view', value: hospitals.length },
    { label: 'Regions covered', value: visibleRegions.length },
    { label: 'Bed types tracked', value: activeBedTypes.length },
  ];

  return (
    <>
      <div className="page-header">
        <h2>Regional Dashboard</h2>
        <p>
          Live bed capacity across the region
          {lastRefresh && (
            <span className="text-muted" style={{ marginLeft: 12 }}>
              <span className="status-dot live" />
              Updated {lastRefresh.toLocaleTimeString()} · refreshes every 1 hour
            </span>
          )}
        </p>
      </div>

      <div className="panel hero-panel" style={{ marginBottom: 16 }}>
        <div className="dashboard-role-summary">
          <div>
            <div className="tour-badge">Your role</div>
            <h3>{user?.role ? user.role.replace(/_/g, ' ') : 'User'}</h3>
            <p>
              {user?.role === 'hospital_admin' && assignedHospital
                ? `You can update capacity for ${assignedHospital.name} in the ${assignedHospital.region} region.`
                : user?.role === 'super_admin'
                  ? 'You can update capacity for any hospital across every region.'
                  : 'Your capabilities are tailored to your role and current workflow.'}
            </p>
          </div>
          <div className="capability-list">
            {(roleCapabilities[user?.role] || roleCapabilities.clinician).map((item) => (
              <span key={item} className="capability-pill">{item}</span>
            ))}
          </div>
        </div>

        <div className="stat-grid" style={{ marginTop: 16 }}>
          {statCards.map((card) => (
            <div key={card.label} className="stat-card">
              <div className="stat-value">{card.value}</div>
              <div className="stat-label">{card.label}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="filters-bar">
        <select className="form-select" value={region} onChange={(e) => setRegion(e.target.value)}>
          <option value="">All regions</option>
          <option value="north">North</option>
          <option value="central">Central</option>
          <option value="south">South</option>
        </select>
      </div>

      <div className="panel capacity-grid">
        {loading ? (
          <div className="panel-body text-muted">Loading capacity data…</div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th className="hospital-col">Hospital</th>
                {activeBedTypes.map((bt) => (
                  <th key={bt} style={{ textAlign: 'center' }}>{BED_LABELS[bt] || bt}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {hospitals.map((h) => (
                <tr key={h._id}>
                  <td>
                    <Link to={`/hospital/${h._id}`}>{h.name}</Link>
                    <div className="region-tag">{h.region}</div>
                  </td>
                  {activeBedTypes.map((bt) => {
                    if (!h.bed_types?.includes(bt)) {
                      return <td key={bt} style={{ textAlign: 'center' }} className="text-muted">—</td>;
                    }
                    const cap = getBedCapacity(h._id, bt);
                    const level = typeof cap.available === 'number' && typeof cap.total === 'number'
                      ? capacityLevel(cap.available, cap.total)
                      : 'low';
                    return (
                      <td key={bt} style={{ textAlign: 'center' }}>
                        <div className={`capacity-cell capacity-${level}`}>
                          {cap.available}/{cap.total}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
