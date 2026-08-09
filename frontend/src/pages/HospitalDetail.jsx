import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { useAuth } from '../context/AuthContext';
import { capacityApi } from '../api/client';

const BED_COLORS = {
  icu: '#0891b2',
  oxygen: '#059669',
  general: '#6366f1',
  ventilator: '#d97706',
};

export default function HospitalDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const hospitalId = id || user.hospital_id;

  const [hospital, setHospital] = useState(null);
  const [capacity, setCapacity] = useState([]);
  const [history, setHistory] = useState({});
  const [hours, setHours] = useState(24);
  const [form, setForm] = useState({ bed_type: '', available: '', total: '' });
  const [message, setMessage] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  const canUpdateCapacity = user.role === 'super_admin' || (user.role === 'hospital_admin' && user.hospital_id === hospitalId);

  const roleSummary = user?.role === 'super_admin'
    ? 'You can review and update capacity for any hospital in the system.'
    : user?.role === 'hospital_admin'
      ? canUpdateCapacity
        ? `You can update capacity for ${hospital?.name || 'this hospital'} because it is your assigned facility.`
        : 'You can view this hospital’s capacity, but updates are restricted to your assigned facility.'
      : 'You can review the hospital’s capacity and trend data from this view.';

  const capabilityItems = user?.role === 'super_admin'
    ? ['Update any hospital capacity', 'Review all regional trends', 'Coordinate cross-region operations']
    : user?.role === 'hospital_admin'
      ? ['Update your assigned hospital', 'Track bed availability trends', 'Support local coordination']
      : ['Review current capacity', 'Inspect historical trends', 'Monitor bed availability'];

  useEffect(() => {
    if (!hospitalId) return;
    loadData();
  }, [hospitalId, hours]);

  async function loadData() {
    setLoading(true);
    try {
      const hospitals = await capacityApi.getHospitals();
      const h = hospitals.find((x) => x._id === hospitalId);
      setHospital(h);

      const capData = await capacityApi.getCapacity(hospitalId);
      setCapacity(capData.capacity);

      const histData = await capacityApi.getCapacityHistory(hospitalId, hours);
      setHistory(histData.history);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  const chartData = buildChartData(history);

  async function handleUpdate(e) {
    e.preventDefault();
    setMessage(null);
    setError(null);
    try {
      await capacityApi.updateCapacity(hospitalId, {
        bed_type: form.bed_type,
        available: parseInt(form.available, 10),
        total: parseInt(form.total, 10),
      });
      setMessage('Capacity updated successfully');
      setForm({ bed_type: '', available: '', total: '' });
      loadData();
    } catch (err) {
      setError(err.message);
    }
  }

  if (!hospitalId) {
    return <div className="alert alert-error">No hospital assigned to your account.</div>;
  }

  if (loading && !hospital) {
    return <div className="text-muted">Loading hospital data…</div>;
  }

  return (
    <>
      <div className="page-header">
        <h2>{hospital?.name || 'Hospital Detail'}</h2>
        <p className="text-secondary">
          {hospital?.region} region · Bed capacity overview and trends
        </p>
      </div>

      {message && <div className="alert alert-success">{message}</div>}
      {error && <div className="alert alert-error">{error}</div>}

      <div className="panel intro-card dashboard-card" style={{ marginBottom: 16 }}>
        <div className="dashboard-role-summary">
          <div>
            <div className="tour-badge">Your access</div>
            <h3>{user?.role ? user.role.replace(/_/g, ' ') : 'User'}</h3>
            <p>{roleSummary}</p>
          </div>
          <div className="capability-list">
            {capabilityItems.map((item) => (
              <span key={item} className="capability-pill">{item}</span>
            ))}
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: canUpdateCapacity ? '1fr 320px' : '1fr', gap: 24 }}>
        <div>
          <div className="panel mb-16">
            <div className="panel-header">
              <h3>Current Capacity</h3>
            </div>
            <div className="panel-body" style={{ padding: 0 }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Bed Type</th>
                    <th>Available</th>
                    <th>Total</th>
                    <th>Utilization</th>
                  </tr>
                </thead>
                <tbody>
                  {capacity.map((c) => {
                    const util = c.total > 0 ? Math.round(((c.total - c.available) / c.total) * 100) : 0;
                    return (
                      <tr key={c.bed_type}>
                        <td style={{ textTransform: 'uppercase', fontWeight: 600 }}>{c.bed_type}</td>
                        <td className="mono">{c.available}</td>
                        <td className="mono">{c.total}</td>
                        <td className="mono">{util}%</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="panel">
            <div className="panel-header">
              <h3>Capacity Trend</h3>
              <select className="form-select" value={hours} onChange={(e) => setHours(Number(e.target.value))} style={{ width: 120 }}>
                <option value={24}>Last 24h</option>
                <option value={48}>Last 48h</option>
                <option value={72}>Last 72h</option>
              </select>
            </div>
            <div className="panel-body">
              {chartData.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#2e4058" />
                    <XAxis dataKey="time" stroke="#5a6d85" fontSize={11} />
                    <YAxis stroke="#5a6d85" fontSize={11} />
                    <Tooltip
                      contentStyle={{ background: '#1a2332', border: '1px solid #2e4058', borderRadius: 4, fontSize: 12 }}
                    />
                    <Legend />
                    {Object.keys(history).map((bt) => (
                      <Line
                        key={bt}
                        type="monotone"
                        dataKey={bt}
                        stroke={BED_COLORS[bt] || '#8b9cb3'}
                        dot={false}
                        strokeWidth={2}
                      />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-muted">No historical data available for this period.</p>
              )}
            </div>
          </div>
        </div>

        {canUpdateCapacity && (
          <div className="panel" style={{ height: 'fit-content' }}>
            <div className="panel-header">
              <h3>Update Capacity</h3>
            </div>
            <div className="panel-body">
              <form onSubmit={handleUpdate}>
                <div className="form-group">
                  <label>Bed Type</label>
                  <select
                    className="form-select"
                    value={form.bed_type}
                    onChange={(e) => setForm({ ...form, bed_type: e.target.value })}
                    required
                  >
                    <option value="">Select…</option>
                    {hospital?.bed_types?.map((bt) => (
                      <option key={bt} value={bt}>{bt}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label>Available</label>
                  <input
                    className="form-input"
                    type="number"
                    min="0"
                    value={form.available}
                    onChange={(e) => setForm({ ...form, available: e.target.value })}
                    required
                  />
                </div>
                <div className="form-group">
                  <label>Total</label>
                  <input
                    className="form-input"
                    type="number"
                    min="0"
                    value={form.total}
                    onChange={(e) => setForm({ ...form, total: e.target.value })}
                    required
                  />
                </div>
                <button className="btn btn-primary" type="submit" style={{ width: '100%' }}>
                  Update Capacity
                </button>
              </form>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

function buildChartData(history) {
  const allTimestamps = new Set();
  Object.values(history).forEach((series) => {
    series.forEach((point) => allTimestamps.add(point.timestamp));
  });

  const sorted = [...allTimestamps].sort();
  // Sample down if too many points
  const step = Math.max(1, Math.floor(sorted.length / 48));

  return sorted.filter((_, i) => i % step === 0).map((ts) => {
    const entry = { time: new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', month: 'short', day: 'numeric' }) };
    Object.entries(history).forEach(([bedType, series]) => {
      const point = series.find((p) => p.timestamp === ts);
      if (point) entry[bedType] = point.available;
    });
    return entry;
  });
}
