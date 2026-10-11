import { useEffect, useRef, useState } from 'react';
import { api } from '../../api';
import { Badge, Msg, StateBadge, fmtTz, useMsg } from '../../ui';

export default function Gate() {
  const [mode, setMode] = useState('code');
  const [code, setCode] = useState('');
  const [pass, setPass] = useState(null);
  const [msg, run, setMsg] = useMsg();
  const [busy, setBusy] = useState(false);
  const video = useRef(null);
  const canScan = typeof window !== 'undefined' && 'BarcodeDetector' in window;

  const verify = async (body) => {
    setPass(null);
    setBusy(true);
    await run(async () => {
      const d = await api('/gate/verify', { method: 'POST', body });
      setPass(d.pass);
      return d;
    });
    setBusy(false);
  };
  const mark = async (action) => {
    setBusy(true);
    if (await run(() => api('/gate/mark', { method: 'POST', body: { passId: pass.passId, action } }))) {
      const d = await api('/gate/verify', { method: 'POST', body: { passId: pass.passId } }).catch(() => null);
      if (d) setPass(d.pass);
    }
    setBusy(false);
  };
  const reset = () => {
    setPass(null);
    setCode('');
    setMsg(null);
  };
  const onCode = (v) => {
    const c = v.replace(/\D/g, '').slice(0, 6);
    setCode(c);
    if (c.length === 6) verify({ code: c });
  };

  // Camera scanning needs BarcodeDetector (Chrome on Android) and HTTPS; the six-digit code always works.
  useEffect(() => {
    if (mode !== 'scan') return;
    let stream, timer, stopped = false;
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        video.current.srcObject = stream;
        await video.current.play();
        const det = new window.BarcodeDetector({ formats: ['qr_code'] });
        timer = setInterval(async () => { const c = await det.detect(video.current).catch(() => []); if (!stopped && c[0]) { stopped = true; setMode('code'); verify({ passId: c[0].rawValue }); } }, 500);
      } catch { setMsg({ ok: false, text: 'Camera is not available. Enter the 6-digit code instead.' });
      setMode('code');
      }
    })();
    return () => {
      clearInterval(timer);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [mode]);

  const bad = pass?.problem;
  return (
    <div style={{ maxWidth: 520 }}>
      <h1>Verify gate pass</h1><Msg m={msg} />
      <div className="tabs"><button className={mode === 'code' ? 'on' : ''} onClick={() => setMode('code')}>6-digit code</button>{canScan && <button className={mode === 'scan' ? 'on' : ''} onClick={() => setMode('scan')}>Scan QR</button>}</div>
      {mode === 'scan' ? <div className="card"><video ref={video} playsInline muted style={{ width: '100%' }} /><p className="muted">Point the camera at the student's QR code.</p></div>
        : <div className="card"><label className="field"><span>Verification code</span><input className="codeinput" inputMode="numeric" pattern="[0-9]*" maxLength={6} autoComplete="off" value={code} onChange={(e) => onCode(e.target.value)} placeholder="000000" /></label>
          <div className="row" style={{ marginTop: 12 }}><button className="btn primary" disabled={code.length !== 6 || busy} onClick={() => verify({ code })}>{busy ? 'Checking...' : 'Verify'}</button><button className="btn" onClick={reset}>Clear</button></div></div>}
      {pass && <div className="card">
        <div className={'banner ' + (bad ? 'bad' : 'ok')}>{bad || 'Pass verified.'}</div>
        <div className="row" style={{ justifyContent: 'space-between' }}><b style={{ fontSize: 18 }}>{pass.name}</b><span><Badge s={pass.status} /> <StateBadge p={pass} /></span></div>
        <dl className="kv"><dt>Roll no.</dt><dd>{pass.rollNumber}</dd><dt>Course</dt><dd>{[pass.course, pass.branch].filter(Boolean).join(' ')}{pass.year ? ` · Year ${pass.year}` : ''}{pass.semester ? ` · Sem ${pass.semester}` : ''}</dd>
          <dt>Room</dt><dd>{[pass.hostel, pass.block && `Block ${pass.block}`, pass.floor !== undefined && pass.floor !== null && `Floor ${pass.floor}`, pass.room && `Room ${pass.room}`].filter(Boolean).join(', ') || '-'}</dd>
          <dt>Pass</dt><dd>{pass.source === 'OVERRIDE' ? 'Exceptional (warden)' : pass.source === 'LEAVE' ? 'Leave' : 'Outing'} · {pass.code}</dd>
          <dt>Issued</dt><dd>{fmtTz(pass.issuedAt, pass.tz)}</dd><dt>Valid</dt><dd>{fmtTz(pass.validFrom, pass.tz)} to {fmtTz(pass.validTo, pass.tz)}</dd><dt>Return by</dt><dd>{fmtTz(pass.returnDeadline, pass.tz)}</dd>
          <dt>Went OUT</dt><dd>{pass.outAt ? fmtTz(pass.outAt, pass.tz) : 'Not yet'}</dd><dt>Came IN</dt><dd>{pass.inAt ? fmtTz(pass.inAt, pass.tz) : 'Not yet'}</dd></dl>
        <div className="gatebtns"><button className="btn lg out" disabled={!pass.canOut || busy} onClick={() => mark('OUT')}>OUT</button><button className="btn lg in" disabled={!pass.canIn || busy} onClick={() => mark('IN')}>IN</button></div>
        <div className="row" style={{ marginTop: 12 }}><button className="btn" onClick={reset}>Next student</button></div>
      </div>}
    </div>
  );
}
