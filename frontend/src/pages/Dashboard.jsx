import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { capacityApi, capacityLevel } from '../api/client';

const BED_LABELS = {
  icu: 'ICU',
  oxygen: 'Oxygen',
  general: 'General',
  ventilator: 'Ventilator',
};

const ALL_BED_TYPES = ['icu', 'oxygen', 'general', 'ventilator'];

export default function Dashboard() {
  const [hospitals, setHospitals] = useState([]);
  const [capacities, setCapacities] = useState({});
  const [region, setRegion] = useState('');
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState(null);

  const fetchData = useCallback(async () => {
    try {
      const hospitalList = await capacityApi.getHospitals(region || undefined);
      setHospitals(hospitalList);

      const capMap = {};
      await Promise.all(
        hospitalList.map(async (h) => {
          try {
            const data = await capacityApi.getCapacity(h._id);
            capMap[h._id] = data.capacity;
          } catch {
            capMap[h._id] = [];
          }
        })
      );
      setCapacities(capMap);
      setLastRefresh(new Date());
    } catch (err) {
      console.error('Dashboard fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, [region]);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 10000);
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

  return (
    <>
      <div className="page-header">
        <h2>Regional Dashboard</h2>
        <p>
          Live bed capacity across the region
          {lastRefresh && (
            <span className="text-muted" style={{ marginLeft: 12 }}>
              <span className="status-dot live" />
              Updated {lastRefresh.toLocaleTimeString()} · refreshes every 10s
            </span>
          )}
        </p>
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
