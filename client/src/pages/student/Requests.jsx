import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { api } from '../../api';
import { Badge, Confirm, Field, Load, Msg, Table, fmt, useLoad, useMsg } from '../../ui';

export function PassQR({ pass }) {
  const [url, setUrl] = useState('');
  useEffect(() => { QRCode.toDataURL(pass.passId, { width: 200, margin: 1 }).then(setUrl); }, [pass.passId]);
  return <div className="passbox card">{url && <img src={url} alt="Pass QR code" />}<p className="muted">Pass ID: {pass.passId}</p><p>Valid {fmt(pass.validFrom)} to {fmt(pass.validTo)}</p></div>;
}

export default function Requests() {
  const st = useLoad('/student/leave'); const passes = useLoad('/student/passes');
  const [f, setF] = useState({ type: 'OUTING', reason: '', destination: '', departAt: '', returnBy: '', emergencyContact: '' });
  const [msg, run] = useMsg(); const [cancel, setCancel] = useState(null); const [show, setShow] = useState(null);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const submit = async (e) => {
    e.preventDefault();
    const ok = await run(() => api('/student/leave', { method: 'POST', body: { ...f, departAt: f.departAt && new Date(f.departAt).toISOString(), returnBy: f.returnBy && new Date(f.returnBy).toISOString() } }));
    if (ok) { setF({ ...f, reason: '', destination: '', departAt: '', returnBy: '' }); st.reload(); }
  };
  const doCancel = async () => { const id = cancel; setCancel(null); if (await run(() => api(`/student/leave/${id}/cancel`, { method: 'PATCH' }))) { st.reload(); passes.reload(); } };
  const passFor = (id) => passes.data?.items.find((p) => p.leave === id && p.status === 'ACTIVE');
  return (
    <>
      <h1>Leave & Outing Passes</h1><Msg m={msg} />
      <form className="card" onSubmit={submit}><div className="grid2">
        <Field label="Type"><select value={f.type} onChange={set('type')}><option value="OUTING">Outing</option><option value="LEAVE">Leave</option></select></Field>
        <Field label="Destination"><input value={f.destination} onChange={set('destination')} required /></Field>
        <Field label="Departure"><input type="datetime-local" value={f.departAt} onChange={set('departAt')} required /></Field>
        <Field label="Expected return"><input type="datetime-local" value={f.returnBy} onChange={set('returnBy')} required /></Field>
        <Field label="Reason"><textarea value={f.reason} onChange={set('reason')} required /></Field>
        <Field label="Emergency contact (optional)"><input value={f.emergencyContact} onChange={set('emergencyContact')} /></Field></div>
        <div className="row" style={{ marginTop: 12 }}><button className="btn primary">Submit request</button></div></form>
      <h2>My requests</h2>
      <Load st={st} what="requests" empty={st.data?.items.length === 0 && 'No requests yet.'}>
        <Table head={['Type', 'Destination', 'Leaves', 'Returns', 'Status', '']}>
          {st.data?.items.map((l) => <tr key={l._id}><td>{l.type}</td><td>{l.destination}</td><td>{fmt(l.departAt)}</td><td>{fmt(l.returnBy)}</td><td><Badge s={l.status} /></td>
            <td>{passFor(l._id) && <button className="btn sm" onClick={() => setShow(show === l._id ? null : l._id)}>Pass</button>} {['PENDING', 'APPROVED'].includes(l.status) && <button className="btn sm" onClick={() => setCancel(l._id)}>Cancel</button>}</td></tr>)}
        </Table>
      </Load>
      {show && passFor(show) && <PassQR pass={passFor(show)} />}
      {cancel && <Confirm title="Cancel this request?" label="Cancel request" danger onConfirm={doCancel} onCancel={() => setCancel(null)} />}
    </>
  );
}
