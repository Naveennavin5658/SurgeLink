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
      <div className="login-card">
        <h1>SurgeLink</h1>
        <p className="subtitle">Sign in to the regional capacity coordination platform</p>

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

        <div style={{ marginTop: 24, borderTop: '1px solid var(--border)', paddingTop: 16 }}>
          <p className="text-muted" style={{ fontSize: 11, marginBottom: 8 }}>Demo accounts</p>
          {DEMO_ACCOUNTS.map((a) => (
            <button
              key={a.email}
              className="btn btn-secondary btn-sm"
              style={{ marginRight: 6, marginBottom: 6 }}
              onClick={() => fillDemo(a)}
              type="button"
            >
              {a.role}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
