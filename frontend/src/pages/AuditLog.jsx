import { useState, useEffect } from 'react';
import { transferApi } from '../api/client';

export default function AuditLog() {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    transferApi.getAuditLog(200)
      .then(setEntries)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  return (
    <>
      <div className="page-header">
        <h2>Audit Log</h2>
        <p>Append-only record of all system mutations — regional coordinator access only</p>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      <div className="panel">
        <div className="panel-body" style={{ padding: 0 }}>
          {loading ? (
            <div style={{ padding: 16 }} className="text-muted">Loading audit log…</div>
          ) : entries.length === 0 ? (
            <div style={{ padding: 16 }} className="text-muted">No audit entries yet.</div>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Timestamp</th>
                  <th>Actor</th>
                  <th>Action</th>
                  <th>Target</th>
                  <th>Details</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((e) => (
                  <tr key={e._id}>
                    <td className="text-secondary mono" style={{ whiteSpace: 'nowrap' }}>
                      {new Date(e.timestamp).toLocaleString()}
                    </td>
                    <td className="mono">{e.actor_id?.slice(-8)}</td>
                    <td>{e.action}</td>
                    <td>
                      <span className="text-muted">{e.target_collection}</span>
                      <span className="mono" style={{ marginLeft: 6 }}>{e.target_id?.slice(-8)}</span>
                    </td>
                    <td className="text-secondary" style={{ maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {e.after ? JSON.stringify(e.after).slice(0, 80) : '—'}
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
