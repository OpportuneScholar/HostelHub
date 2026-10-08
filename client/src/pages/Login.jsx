import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth';
import { Brand } from '../Layout';
import { Field } from '../ui';

const home = { WARDEN: '/warden', STUDENT: '/student', GUARD: '/guard' };
const PORTALS = [['STUDENT', '🎓', 'Student', 'Room, leave, gate pass, complaints and fees'],
  ['WARDEN', '🛡️', 'Warden / Admin', 'Manage students, rooms, requests and notices'], ['GUARD', '🚪', 'Guard', 'Verify gate passes and record IN / OUT']];

export default function Login() {
  const { login } = useAuth(); const nav = useNavigate();
  const [portal, setPortal] = useState(null); const [forgot, setForgot] = useState(false);
  const [id, setId] = useState(''); const [pw, setPw] = useState(''); const [show, setShow] = useState(false);
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault(); setErr(''); setBusy(true);
    try { const u = await login(id, pw, portal); nav(u.mustChangePassword ? '/change-password' : home[u.role]); }
    catch (e2) { setErr(e2.message); } finally { setBusy(false); }
  };
  const back = () => { setPortal(null); setForgot(false); setErr(''); setPw(''); };
  const p = PORTALS.find((x) => x[0] === portal);
  return (
    <div className="auth"><div className="glass">
      <Brand />
      {!portal && <>
        <h2 style={{ textAlign: 'center', margin: '8px 0 4px' }}>Welcome to HostelHub</h2>
        <p className="muted" style={{ textAlign: 'center', margin: 0 }}>Select your portal</p>
        {PORTALS.map(([key, icon, name, desc]) => <button key={key} className="portal" onClick={() => setPortal(key)}><i>{icon}</i><span><b>{name}</b><small>{desc}</small></span></button>)}
      </>}
      {portal && forgot && <>
        <h2>Forgot password</h2>
        <p className="muted">{portal === 'STUDENT' ? 'Ask the hostel warden to reset your password. You will get a temporary password and must set a new one when you log in.' : 'Ask the hostel administrator to reset your account.'}</p>
        <button className="btn" onClick={() => setForgot(false)}>Back to login</button>
      </>}
      {portal && !forgot && <form onSubmit={submit} style={{ display: 'grid', gap: 14, marginTop: 8 }}>
        <h2 style={{ margin: 0 }}>{p[1]} {p[2]} login</h2>
        {err && <div className="alert err" style={{ margin: 0 }}>{err}</div>}
        <Field label="Email / Roll number"><input value={id} onChange={(e) => setId(e.target.value)} autoComplete="username" required /></Field>
        <Field label="Password"><div className="pw"><input type={show ? 'text' : 'password'} value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="current-password" required />
          <button type="button" onClick={() => setShow(!show)}>{show ? 'Hide' : 'Show'}</button></div></Field>
        <button type="button" className="link" style={{ justifySelf: 'start' }} onClick={() => setForgot(true)}>Forgot password?</button>
        <button className="btn primary" disabled={busy}>{busy ? 'Logging in...' : 'Login'}</button>
        <button type="button" className="btn" onClick={back}>Back</button>
      </form>}
    </div></div>
  );
}
