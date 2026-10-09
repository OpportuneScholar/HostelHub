import { useEffect, useState } from 'react';
import { api } from '../api';
import { Field } from '../ui';

// Three steps: ask for a code, check the code, choose a new password. The code is kept only in this component's state.
export default function ForgotPassword({ portal, initialId, onBack, onDone }) {
  const [step, setStep] = useState('request');
  const [id, setId] = useState(initialId || ''); const [otp, setOtp] = useState('');
  const [pw, setPw] = useState(''); const [pw2, setPw2] = useState(''); const [show, setShow] = useState(false);
  const [err, setErr] = useState(''); const [info, setInfo] = useState(''); const [busy, setBusy] = useState(false); const [wait, setWait] = useState(0);
  useEffect(() => { if (wait <= 0) return; const t = setTimeout(() => setWait(wait - 1), 1000); return () => clearTimeout(t); }, [wait]);

  const run = async (fn) => { setErr(''); setBusy(true); try { await fn(); } catch (e) { setErr(e.message); } finally { setBusy(false); } };
  const request = (e) => { e?.preventDefault(); return run(async () => {
    if (!id.trim()) throw new Error('Enter your email or roll number');
    const d = await api('/auth/forgot-password', { method: 'POST', body: { identifier: id.trim(), portal } });
    setInfo(d.message); setStep('verify'); setWait(60);
  }); };
  const verify = (e) => { e.preventDefault(); return run(async () => {
    if (!/^\d{6}$/.test(otp)) throw new Error('Enter the 6-digit code');
    await api('/auth/verify-reset-otp', { method: 'POST', body: { identifier: id.trim(), portal, otp } });
    setInfo(''); setStep('reset');
  }); };
  const reset = (e) => { e.preventDefault(); return run(async () => {
    if (pw.length < 8) throw new Error('Password must be at least 8 characters');
    if (pw !== pw2) throw new Error('Passwords do not match');
    await api('/auth/reset-password', { method: 'POST', body: { identifier: id.trim(), portal, otp, newPassword: pw, confirmPassword: pw2 } });
    onDone(id.trim());
  }); };
  const back = () => { setErr(''); if (step === 'request') onBack(); else setStep(step === 'verify' ? 'request' : 'verify'); };
  const noFix = { autoCapitalize: 'none', autoCorrect: 'off', spellCheck: false };

  return (
    <form onSubmit={step === 'request' ? request : step === 'verify' ? verify : reset} style={{ display: 'grid', gap: 14, marginTop: 8 }}>
      <h2 style={{ margin: 0 }}>{step === 'request' ? 'Forgot password' : step === 'verify' ? 'Check your email' : 'Set a new password'}</h2>
      {err && <div className="alert err" style={{ margin: 0 }}>{err}</div>}
      {info && <div className="alert ok" style={{ margin: 0 }}>{info}</div>}
      {step === 'request' && <>
        <p className="muted" style={{ margin: 0 }}>Enter your registered email or roll number. We will email you a 6-digit code.</p>
        <Field label="Email / Roll number"><input value={id} onChange={(e) => setId(e.target.value)} autoComplete="username" required {...noFix} /></Field>
        <button className="btn primary" disabled={busy}>{busy ? 'Sending...' : 'Send code'}</button>
      </>}
      {step === 'verify' && <>
        <Field label="6-digit code"><input value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" pattern="[0-9]*" maxLength={6} autoComplete="one-time-code" required {...noFix} /></Field>
        <button className="btn primary" disabled={busy}>{busy ? 'Checking...' : 'Verify code'}</button>
        <button type="button" className="link" style={{ justifySelf: 'start' }} disabled={busy || wait > 0} onClick={request}>{wait > 0 ? `Send a new code in ${wait}s` : 'Send a new code'}</button>
      </>}
      {step === 'reset' && <>
        <Field label="New password (8+ characters)"><div className="pw"><input type={show ? 'text' : 'password'} value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" required minLength={8} {...noFix} />
          <button type="button" onClick={() => setShow(!show)}>{show ? 'Hide' : 'Show'}</button></div></Field>
        <Field label="Confirm new password"><input type={show ? 'text' : 'password'} value={pw2} onChange={(e) => setPw2(e.target.value)} autoComplete="new-password" required {...noFix} /></Field>
        <button className="btn primary" disabled={busy}>{busy ? 'Saving...' : 'Update password'}</button>
      </>}
      <button type="button" className="btn" onClick={back}>Back</button>
    </form>
  );
}
