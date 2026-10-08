import { useEffect, useRef, useState } from 'react';
import { api } from '../../api';
import { Field, Msg, fmt, useMsg } from '../../ui';

export default function Gate() {
  const [passId, setPassId] = useState('');
  const [pass, setPass] = useState(null);
  const [msg, run, setMsg] = useMsg();
  const [scanning, setScanning] = useState(false);
  const video = useRef(null);
  const canScan = typeof window !== 'undefined' && 'BarcodeDetector' in window;

  const verify = async (id = passId) => {
    setPass(null);
    await run(async () => { const d = await api('/gate/verify', { method: 'POST', body: { passId: id } }); setPass(d.pass); return d; });
  };
  const mark = async (action) => {
    const ok = await run(() => api('/gate/mark', { method: 'POST', body: { passId, action } }));
    if (ok) { const d = await api('/gate/verify', { method: 'POST', body: { passId } }).catch(() => null); if (d) setPass(d.pass); }
  };

  // Camera scanning works only where the browser supports BarcodeDetector (Chrome on Android). Manual entry always works.
  useEffect(() => {
    if (!scanning) return;
    let stream, timer, stopped = false;
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        video.current.srcObject = stream; await video.current.play();
        const det = new window.BarcodeDetector({ formats: ['qr_code'] });
        timer = setInterval(async () => {
          const codes = await det.detect(video.current).catch(() => []);
          if (!stopped && codes[0]) { stopped = true; setPassId(codes[0].rawValue); setScanning(false); verify(codes[0].rawValue); }
        }, 500);
      } catch { setMsg({ ok: false, text: 'Camera is not available. Enter the pass ID instead.' }); setScanning(false); }
    })();
    return () => { clearInterval(timer); stream?.getTracks().forEach((t) => t.stop()); };
  }, [scanning]);

  return (
    <div style={{ maxWidth: 520 }}>
      <h1>Verify Gate Pass</h1>
      <div className="card">
        {scanning && <video ref={video} playsInline muted style={{ width: '100%', marginBottom: 12 }} />}
        <Field label="Pass ID"><input value={passId} onChange={(e) => setPassId(e.target.value)} placeholder="Scan the QR code or type the pass ID" /></Field>
        <div className="row" style={{ marginTop: 12 }}>
          <button className="btn primary" disabled={!passId.trim()} onClick={() => verify()}>Verify</button>
          {canScan && <button className="btn" onClick={() => setScanning(!scanning)}>{scanning ? 'Stop camera' : 'Scan with camera'}</button>}
        </div>
      </div>
      <Msg m={msg} />
      {pass && (
        <div className="card">
          <dl className="kv"><dt>Student</dt><dd>{pass.student}</dd><dt>Roll</dt><dd>{pass.rollNumber}</dd><dt>Room</dt><dd>{pass.room}</dd>
            <dt>Pass ID</dt><dd style={{ wordBreak: 'break-all' }}>{pass.passId}</dd><dt>Pass type</dt><dd>{pass.type === 'OUTING' ? 'Outing' : 'Leave'}</dd><dt>Valid</dt><dd>{fmt(pass.validFrom)} to {fmt(pass.validTo)}</dd>
            <dt>Gate status</dt><dd>{pass.state === 'NONE' ? 'Not yet out' : pass.state === 'OUT' ? 'Currently OUT' : 'Returned (IN)'}</dd></dl>
          <div className="gatebtns"><button className="btn lg out" onClick={() => mark('OUT')}>OUT</button><button className="btn lg in" onClick={() => mark('IN')}>IN</button></div>
        </div>
      )}
    </div>
  );
}
