import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth';
import { Field } from '../ui';

const home = { WARDEN: '/warden', STUDENT: '/student', GUARD: '/guard' };

export default function ChangePassword() {
  const { user, setUser, logout } = useAuth(); const nav = useNavigate();
  const [f, setF] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  if (user === undefined) return <p className="muted pad">Loading...</p>;
  if (!user) return <Navigate to="/login" replace />;
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const submit = async (e) => {
    e.preventDefault(); setErr('');
    if (f.newPassword !== f.confirmPassword) return setErr('New passwords do not match');
    setBusy(true);
    try { const d = await api('/auth/change-password', { method: 'POST', body: f }); setUser(d.user); nav(home[d.user.role]); }
    catch (e2) { setErr(e2.message); } finally { setBusy(false); }
  };
  return (
    <div className="pad" style={{ maxWidth: 420 }}>
      <h1>Change password</h1>
      {user.mustChangePassword && <p className="muted">You are using a temporary password. Set a new one to continue.</p>}
      {err && <div className="alert err">{err}</div>}
      <form onSubmit={submit} className="card">
        <Field label="Current password"><input type="password" value={f.currentPassword} onChange={set('currentPassword')} required /></Field><br />
        <Field label="New password (8+ characters)"><input type="password" value={f.newPassword} onChange={set('newPassword')} required minLength={8} /></Field><br />
        <Field label="Confirm new password"><input type="password" value={f.confirmPassword} onChange={set('confirmPassword')} required /></Field><br />
        <div className="row"><button className="btn primary" disabled={busy}>Change password</button><button type="button" className="btn" onClick={logout}>Log out</button></div>
      </form>
    </div>
  );
}
