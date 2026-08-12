import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { capacityApi, transferApi, generateCaseId, generateIdempotencyKey } from '../api/client';

const STATUS_BADGE = {
  requested: 'badge-requested',
  pending: 'badge-pending',
  accepted: 'badge-accepted',
  rejected: 'badge-rejected',
  expired: 'badge-expired',
};

export default function Transfers() {
  const { user } = useAuth();
  const [transfers, setTransfers] = useState([]);
  const [hospitals, setHospitals] = useState([]);
  const [hospitalCapacities, setHospitalCapacities] = useState({});
  const [statusFilter, setStatusFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({
    patient_case_id: generateCaseId(),
    from_hospital_id: user.hospital_id || '',
    to_hospital_id: '',
    bed_type_requested: '',
  });
  const [message, setMessage] = useState(null);
  const [error, setError] = useState(null);
  const [actionLoading, setActionLoading] = useState(null);

  const fetchTransfers = useCallback(async () => {
    try {
      const params = {};
      if (statusFilter) params.status = statusFilter;
      const data = await transferApi.getTransfers(params);
      setTransfers(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    fetchTransfers();
    loadHospitals();

    const es = new EventSource(transferApi.streamUrl);
    es.onmessage = () => fetchTransfers();
    const interval = setInterval(fetchTransfers, 15000);

    return () => {
      es.close();
      clearInterval(interval);
    };
  }, [fetchTransfers]);

  async function loadHospitals() {
    const list = await capacityApi.getHospitals();
    setHospitals(list);

    if (!list.length) {
      setHospitalCapacities({});
      return;
    }

    const caps = await capacityApi.getBulkCapacity(list.map((h) => h._id));
    const mappedCaps = {};
    for (const hospital of list) {
      mappedCaps[hospital._id] = (caps[hospital._id] || []).filter((c) => c.available > 0);
    }
    setHospitalCapacities(mappedCaps);
  }

  const hospitalName = (id) => hospitals.find((h) => h._id === id)?.name || id;

  const availableBedTypes = (hospitalId) => {
    if (!hospitalId) return [];
    return (hospitalCapacities[hospitalId] || []).map((c) => c.bed_type);
  };

  async function handleCreate(e) {
    e.preventDefault();
    setMessage(null);
    setError(null);
    try {
      await transferApi.createTransfer(form, generateIdempotencyKey());
      setMessage('Transfer request created');
      setShowCreate(false);
      setForm({ ...form, patient_case_id: generateCaseId(), to_hospital_id: '', bed_type_requested: '' });
      fetchTransfers();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleAccept(id) {
    setActionLoading(id);
    setError(null);
    try {
      await transferApi.acceptTransfer(id);
      setMessage('Transfer accepted — bed reserved atomically');
      fetchTransfers();
      loadHospitals();
    } catch (err) {
      setError(err.message);
    } finally {
      setActionLoading(null);
    }
  }

  async function handleReject(id) {
    setActionLoading(id);
    setError(null);
    try {
      await transferApi.rejectTransfer(id);
      setMessage('Transfer rejected');
      fetchTransfers();
    } catch (err) {
      setError(err.message);
    } finally {
      setActionLoading(null);
    }
  }

  const incomingForUser = (t) =>
    user.role === 'receiving_staff' &&
    t.to_hospital_id === user.hospital_id &&
    ['requested', 'pending'].includes(t.current_status);

  const transferRoleSummary = user?.role === 'clinician'
    ? 'You can create transfer requests for patients and track their progress through the network.'
    : user?.role === 'receiving_staff'
      ? 'You can review and act on incoming transfer requests for your hospital.'
      : user?.role === 'hospital_admin'
        ? 'You can monitor transfer activity related to your assigned hospital and keep operations aligned.'
        : 'You can oversee transfer coordination and review the overall regional workflow.';

  const transferCapabilities = user?.role === 'clinician'
    ? ['Create new transfer requests', 'Track request status', 'Coordinate bed handoff']
    : user?.role === 'receiving_staff'
      ? ['Accept or reject incoming requests', 'Reserve beds safely', 'Support patient transfers']
      : user?.role === 'hospital_admin'
        ? ['Monitor hospital transfer activity', 'Review request status', 'Support operational coordination']
        : ['Review regional transfers', 'Monitor workflow health', 'Support cross-hospital coordination'];

  return (
    <>
      <div className="page-header">
        <h2>Transfer Requests</h2>
        <p>Patient transfer coordination between regional hospitals</p>
      </div>

      {message && <div className="alert alert-success">{message}</div>}
      {error && <div className="alert alert-error">{error}</div>}

      <div className="panel intro-card dashboard-card" style={{ marginBottom: 16 }}>
        <div className="dashboard-role-summary">
          <div>
            <div className="tour-badge">Your workflow</div>
            <h3>{user?.role ? user.role.replace(/_/g, ' ') : 'User'}</h3>
            <p>{transferRoleSummary}</p>
          </div>
          <div className="capability-list">
            {transferCapabilities.map((item) => (
              <span key={item} className="capability-pill">{item}</span>
            ))}
          </div>
        </div>
      </div>

      <div className="filters-bar">
        <select className="form-select" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="">All statuses</option>
          <option value="requested">Requested</option>
          <option value="pending">Pending</option>
          <option value="accepted">Accepted</option>
          <option value="rejected">Rejected</option>
          <option value="expired">Expired</option>
        </select>

        {user.role === 'clinician' && (
          <button className="btn btn-primary" onClick={() => setShowCreate(!showCreate)}>
            {showCreate ? 'Cancel' : 'Create Request'}
          </button>
        )}
      </div>

      {showCreate && user.role === 'clinician' && (
        <div className="panel mb-16">
          <div className="panel-header"><h3>New Transfer Request</h3></div>
          <div className="panel-body">
            <form onSubmit={handleCreate} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div className="form-group">
                <label>Case ID</label>
                <input className="form-input mono" value={form.patient_case_id} readOnly />
              </div>
              <div className="form-group">
                <label>From Hospital</label>
                <select
                  className="form-select"
                  value={form.from_hospital_id}
                  onChange={(e) => setForm({ ...form, from_hospital_id: e.target.value })}
                  required
                >
                  {hospitals.map((h) => (
                    <option key={h._id} value={h._id}>{h.name}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label>To Hospital (with available beds)</label>
                <select
                  className="form-select"
                  value={form.to_hospital_id}
                  onChange={(e) => setForm({ ...form, to_hospital_id: e.target.value, bed_type_requested: '' })}
                  required
                >
                  <option value="">Select hospital…</option>
                  {hospitals
                    .filter((h) => h._id !== form.from_hospital_id && (hospitalCapacities[h._id]?.length > 0))
                    .map((h) => (
                      <option key={h._id} value={h._id}>{h.name}</option>
                    ))}
                </select>
              </div>
              <div className="form-group">
                <label>Bed Type</label>
                <select
                  className="form-select"
                  value={form.bed_type_requested}
                  onChange={(e) => setForm({ ...form, bed_type_requested: e.target.value })}
                  required
                >
                  <option value="">Select bed type…</option>
                  {availableBedTypes(form.to_hospital_id).map((bt) => (
                    <option key={bt} value={bt}>{bt}</option>
                  ))}
                </select>
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <button className="btn btn-primary" type="submit">Submit Transfer Request</button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="panel">
        <div className="panel-body" style={{ padding: 0 }}>
          {loading ? (
            <div style={{ padding: 16 }} className="text-muted">Loading transfers…</div>
          ) : transfers.length === 0 ? (
            <div style={{ padding: 16 }} className="text-muted">No transfer requests found.</div>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Case ID</th>
                  <th>From</th>
                  <th>To</th>
                  <th>Bed Type</th>
                  <th>Status</th>
                  <th>Created</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {transfers.map((t) => (
                  <tr key={t._id}>
                    <td className="mono">{t.patient_case_id}</td>
                    <td>{hospitalName(t.from_hospital_id)}</td>
                    <td>{hospitalName(t.to_hospital_id)}</td>
                    <td style={{ textTransform: 'uppercase' }}>{t.bed_type_requested}</td>
                    <td>
                      <span className={`badge ${STATUS_BADGE[t.current_status] || ''}`}>
                        {t.current_status}
                      </span>
                    </td>
                    <td className="text-secondary">{new Date(t.created_at).toLocaleString()}</td>
                    <td>
                      {incomingForUser(t) && (
                        <div className="flex gap-12">
                          <button
                            className="btn btn-success btn-sm"
                            disabled={actionLoading === t._id}
                            onClick={() => handleAccept(t._id)}
                          >
                            Accept
                          </button>
                          <button
                            className="btn btn-danger btn-sm"
                            disabled={actionLoading === t._id}
                            onClick={() => handleReject(t._id)}
                          >
                            Reject
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </>
  );
}
