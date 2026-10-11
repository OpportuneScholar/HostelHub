import { useState } from 'react';
import { api } from '../../api';
import PassCard from '../../components/PassCard';
import { Confirm, Field, Load, Msg, useLoad, useMsg } from '../../ui';

export default function Outing() {
  const st = useLoad('/student/outing/status');
  const [msg, run] = useMsg();
  const [f, setF] = useState({ destination: '', reason: '', date: '', departTime: '', returnTime: '' });
  const [cancel, setCancel] = useState(false);
  const d = st.data;
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const date = f.date || d?.today;
  const isToday = date === d?.today;
  const sched = isToday ? d?.schedule : d?.upcoming.find((u) => u.date === date)?.schedule;
  const canAsk = d && d.hasRoom && !d.openPass && (isToday ? d.open : !!sched?.open);
  const submit = async (e) => {
    e.preventDefault();
    const body = Object.fromEntries(Object.entries(f).filter(([, v]) => v));
    if (await run(() => api('/student/outing', { method: 'POST', body }))) {
      setF({ ...f, destination: '', reason: '' });
      st.reload();
    }
  };
  const doCancel = async () => { setCancel(false); if (await run(() => api(`/student/passes/${d.openPass._id}/cancel`, { method: 'PATCH' }))) st.reload(); };
  return (
    <>
      <h1>Outing pass</h1><Msg m={msg} />
      <Load st={st} what="outing status">{d && <>
        {d.openPass && <><div className="banner ok">You have an outing pass. Show the QR code or tell the guard the code.</div><PassCard pass={d.openPass} />
          {d.openPass.gateState === 'NOT_EXITED' && <div className="row"><button className="btn" onClick={() => setCancel(true)}>Cancel this pass</button></div>}</>}
        {!d.openPass && (isToday ? <div className={'banner ' + (d.open ? 'ok' : 'bad')}>{d.open ? `Pass desk is open until ${d.schedule.lastIssue}. Be back by ${d.schedule.returnBy}.` : d.reason}</div>
          : <div className={'banner ' + (sched?.open ? 'ok' : 'bad')}>{sched?.open ? `${date}: outings ${sched.start} to ${sched.returnBy}.` : sched?.reason}</div>)}
        {!d.hasRoom && <div className="banner warn">No room has been allotted to you yet, so you cannot get a pass. Contact the warden.</div>}
        {!d.openPass && <form className="card" onSubmit={submit}><div className="grid2">
          <Field label="Destination"><input value={f.destination} onChange={set('destination')} maxLength={100} required /></Field>
          <Field label="Reason"><input value={f.reason} onChange={set('reason')} maxLength={300} required /></Field>
          {d.rules.maxDaysAhead > 0 && <Field label="Date"><input type="date" value={date} min={d.today} onChange={set('date')} /></Field>}
          <Field label="Leaving at (optional, default now)"><input type="time" value={f.departTime} onChange={set('departTime')} /></Field>
          <Field label={`Back by${sched?.returnBy ? ` (latest ${sched.returnBy})` : ''}`}><input type="time" value={f.returnTime} max={sched?.returnBy} onChange={set('returnTime')} /></Field></div>
          <div className="row" style={{ marginTop: 12 }}><button className="btn primary" disabled={!canAsk}>Generate pass</button></div></form>}
        <h2>Outing hours</h2>
        <p className="muted">Times are in {d.timezone}. Passes are generated instantly when the desk is open; the warden is not asked.</p>
        <div className="tablewrap"><table><thead><tr><th>Day</th><th>Outings</th><th>Last pass</th><th>Back by</th></tr></thead><tbody>
          {d.upcoming.map((u) => <tr key={u.date}><td>{u.date}{u.schedule.label ? ` (${u.schedule.label})` : ''}</td>{u.schedule.open ? <><td>{u.schedule.start}</td><td>{u.schedule.lastIssue}</td><td>{u.schedule.returnBy}</td></> : <td colSpan={3} className="muted">Closed</td>}</tr>)}</tbody></table></div>
      </>}</Load>
      {cancel && <Confirm title="Cancel this pass?" text="The QR code and code stop working. You can generate a new one if the desk is open." label="Cancel pass" danger onConfirm={doCancel} onCancel={() => setCancel(false)} />}
    </>
  );
}
