import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth, roleRedirect } from '../context/AuthContext';

const DEMO_ACCOUNTS = [
  { email: 'coordinator@region', password: 'coord123', role: 'Regional Coordinator' },
  { email: 'clinician@metro.general', password: 'clin123', role: 'Clinician' },
  { email: 'admin@metro.general', password: 'admin123', role: 'Hospital Admin' },
  { email: 'receiving@lakeside.regional', password: 'recv123', role: 'Receiving Staff' },
];

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const { login, loading } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      const user = await login(email, password);
      navigate(roleRedirect(user.role));
    } catch (err) {
      setError(err.message || 'Login failed');
    }
  };

  const fillDemo = (account) => {
    setEmail(account.email);
    setPassword(account.password);
  };

  return (
    <div className="login-page">
      <div className="login-shell">
        <div className="login-hero">
          <div className="hero-pill">Operational clarity</div>
          <h2>Coordinate patient transfers without the usual friction.</h2>
          <p>
            SurgeLink keeps bed availability, transfer requests, and hospital context visible in one calm workspace so teams can act confidently.
          </p>
          <ul>
            <li>Monitor live bed capacity across hospitals</li>
            <li>Route and approve transfers in minutes</li>
            <li>Keep every change visible with an audit trail</li>
          </ul>
          <div className="hero-footnote">Built for clinicians, receiving staff, and coordinators.</div>
        </div>

        <div className="login-card">
          <div className="login-topbar">
            <div>
              <h1>Welcome back</h1>
              <p className="subtitle">Sign in to continue your operations workflow</p>
            </div>
          </div>

          {error && <div className="login-error">{error}</div>}

          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label>Email</label>
              <input
                className="form-input"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoFocus
              />
            </div>
            <div className="form-group">
              <label>Password</label>
              <input
                className="form-input"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            <button className="btn btn-primary" type="submit" disabled={loading} style={{ width: '100%' }}>
              {loading ? 'Signing in…' : 'Sign in'}
            </button>
          </form>

          <div className="demo-section">
            <p className="text-muted">Demo accounts</p>
            {DEMO_ACCOUNTS.map((a) => (
              <button
                key={a.email}
                className="btn btn-secondary btn-sm"
                onClick={() => fillDemo(a)}
                type="button"
              >
                {a.role}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
