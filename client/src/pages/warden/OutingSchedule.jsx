import { useEffect, useState } from 'react';
import { api } from '../../api';
import PassCard from '../../components/PassCard';
import { Badge, Confirm, Field, Load, Modal, Msg, Table, useLoad, useMsg } from '../../ui';

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const ZONES = ['Asia/Kolkata', 'Asia/Dubai', 'Asia/Karachi', 'Asia/Dhaka', 'Asia/Kathmandu', 'Europe/London', 'America/New_York', 'UTC'];
const BLANK_SPECIAL = { date: '', endDate: '', label: '', closed: true, start: '10:00', lastIssue: '17:00', returnBy: '19:00' };
const BLANK_OVERRIDE = { rollNumber: '', destination: '', reason: '', departAt: '', returnBy: '' };

const toForm = ({ timezone, closure, weekly, rules }) => ({ timezone, closure: { ...closure }, weekly: weekly.map((w) => ({ ...w })), rules: { ...rules } });
const hours = (s) => (s.open ? `${s.start} to ${s.returnBy} (passes until ${s.lastIssue})` : s.reason);

export default function OutingSchedule() {
  const st = useLoad('/outing/settings');
  const [msg, run] = useMsg();
  const [form, setForm] = useState(null);
  const [special, setSpecial] = useState(null);
  const [removing, setRemoving] = useState(null);
  const [override, setOverride] = useState(null);
  const [issued, setIssued] = useState(null);

  useEffect(() => {
    if (st.data) setForm(toForm(st.data.settings));
  }, [st.data]);

  const setDay = (dow, key, value) => setForm({ ...form, weekly: form.weekly.map((w) => (w.dow === dow ? { ...w, [key]: value } : w)) });
  const setRule = (key, value) => setForm({ ...form, rules: { ...form.rules, [key]: value } });
  const setClosure = (key, value) => setForm({ ...form, closure: { ...form.closure, [key]: value } });

  const copyMonday = () => {
    const monday = form.weekly.find((w) => w.dow === 1);
    setForm({ ...form, weekly: form.weekly.map((w) => (w.dow >= 1 && w.dow <= 5 ? { ...monday, dow: w.dow } : w)) });
  };

  const save = async (e) => {
    e.preventDefault();
    if (await run(() => api('/outing/settings', { method: 'PUT', body: form }))) st.reload();
  };

  const saveSpecial = async (e) => {
    e.preventDefault();
    const { id, ...body } = special;
    const call = id ? api(`/outing/special/${id}`, { method: 'PATCH', body }) : api('/outing/special', { method: 'POST', body });
    if (await run(() => call)) {
      setSpecial(null);
      st.reload();
    }
  };

  const removeSpecial = async () => {
    const id = removing.id;
    setRemoving(null);
    if (await run(() => api(`/outing/special/${id}`, { method: 'DELETE' }))) st.reload();
  };

  const issue = async (e) => {
    e.preventDefault();
    const body = { ...override, departAt: new Date(override.departAt).toISOString(), returnBy: new Date(override.returnBy).toISOString() };
    if (await run(async () => {
      const r = await api('/outing/override', { method: 'POST', body });
      setIssued(r.pass);
      return r;
    })) setOverride(null);
  };

  const data = st.data;
  const today = data?.today.today;

  return (
    <>
      <h1>Outing schedule</h1>
      <Msg m={msg} />
      <Load st={st} what="the outing schedule">
        {data && form && (
          <>
            <div className={`banner ${data.today.open ? 'ok' : 'bad'}`}>
              {data.today.open ? `Pass desk is open now (${hours(data.today.schedule)}).` : `Pass desk is closed now. ${data.today.reason}`}
            </div>
            {!data.settings.configured && <div className="banner warn">No schedule has been saved yet, so students cannot generate outing passes. Choose the days and times below and save.</div>}

            <form className="card" onSubmit={save}>
              <h2 style={{ marginTop: 0 }}>Weekly timetable</h2>
              <p className="muted">Passes are generated automatically inside these hours. Times use the hostel timezone.</p>
              <Table head={['Day', 'Outings allowed', 'Outing starts', 'Last pass', 'Back by']}>
                {form.weekly.map((w) => (
                  <tr key={w.dow}>
                    <td>{DAYS[w.dow]}</td>
                    <td><input type="checkbox" checked={w.open} aria-label={`${DAYS[w.dow]} open`} onChange={(e) => setDay(w.dow, 'open', e.target.checked)} /></td>
                    {['start', 'lastIssue', 'returnBy'].map((key) => (
                      <td key={key}><input type="time" value={w[key]} disabled={!w.open} aria-label={`${DAYS[w.dow]} ${key}`} onChange={(e) => setDay(w.dow, key, e.target.value)} /></td>
                    ))}
                  </tr>
                ))}
              </Table>
              <button type="button" className="btn sm" onClick={copyMonday}>Copy Monday to Tuesday-Friday</button>

              <h2>Hostel timezone and rules</h2>
              <div className="grid2">
                <Field label="Timezone">
                  <input list="zones" value={form.timezone} onChange={(e) => setForm({ ...form, timezone: e.target.value })} required />
                  <datalist id="zones">{ZONES.map((z) => <option key={z} value={z} />)}</datalist>
                </Field>
                <Field label="Book ahead (days, 0 = same day only)"><input type="number" min="0" max="30" value={form.rules.maxDaysAhead} onChange={(e) => setRule('maxDaysAhead', e.target.value)} /></Field>
                <Field label="Shortest outing (minutes)"><input type="number" min="0" max="720" value={form.rules.minDurationMinutes} onChange={(e) => setRule('minDurationMinutes', e.target.value)} /></Field>
                <Field label="Passes per student per day"><input type="number" min="1" max="10" value={form.rules.maxPassesPerDay} onChange={(e) => setRule('maxPassesPerDay', e.target.value)} /></Field>
              </div>
              <label className="check"><input type="checkbox" checked={form.rules.blockOverdueFees} onChange={(e) => setRule('blockOverdueFees', e.target.checked)} /> No pass for students with overdue fees</label>

              <h2>Temporary closure</h2>
              <label className="check"><input type="checkbox" checked={form.closure.active} onChange={(e) => setClosure('active', e.target.checked)} /> Close outing passes for everyone</label>
              {form.closure.active && (
                <div className="grid2" style={{ marginTop: 8 }}>
                  <Field label="Reopens after (optional date)"><input type="date" value={form.closure.until} onChange={(e) => setClosure('until', e.target.value)} /></Field>
                  <Field label="Message for students"><input value={form.closure.message} maxLength={200} onChange={(e) => setClosure('message', e.target.value)} /></Field>
                </div>
              )}
              <div className="row" style={{ marginTop: 16 }}><button className="btn primary">Save schedule</button></div>
            </form>

            <div className="card">
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <h2 style={{ margin: 0 }}>Holidays and special dates</h2>
                <button className="btn primary" onClick={() => setSpecial({ ...BLANK_SPECIAL, date: today })}>Add special date</button>
              </div>
              <p className="muted">A special date replaces the weekly timetable for that day only. The normal schedule returns by itself afterwards.</p>
              {data.settings.specialDates.length === 0 ? <p className="empty">No special dates.</p> : (
                <Table head={['Date', 'Name', 'Rule', '']}>
                  {[...data.settings.specialDates].sort((a, b) => a.date.localeCompare(b.date)).map((s) => {
                    const past = (s.endDate || s.date) < today;
                    return (
                      <tr key={s.id} style={past ? { opacity: 0.55 } : null}>
                        <td>{s.date}{s.endDate ? ` to ${s.endDate}` : ''}</td>
                        <td>{s.label || '-'}</td>
                        <td>{s.closed ? 'Closed' : `${s.start} to ${s.returnBy} (last pass ${s.lastIssue})`}{past && ' · past'}</td>
                        <td>
                          {!past && <button className="btn sm" onClick={() => setSpecial({ ...s, endDate: s.endDate || '' })}>Edit</button>}{' '}
                          <button className="btn sm" onClick={() => setRemoving(s)}>Delete</button>
                        </td>
                      </tr>
                    );
                  })}
                </Table>
              )}
            </div>

            <h2>Schedule preview (next 14 days)</h2>
            <Table head={['Date', 'Day', 'Rule', 'Outings']}>
              {data.upcoming.map((u) => (
                <tr key={u.date}>
                  <td>{u.date}</td>
                  <td>{DAYS[u.dow]}</td>
                  <td><Badge s={u.schedule.source === 'WEEKLY' ? 'Normal' : u.schedule.source} /></td>
                  <td>{u.schedule.open ? hours(u.schedule) : <span className="muted">{u.schedule.reason}</span>}</td>
                </tr>
              ))}
            </Table>

            <div className="card">
              <h2 style={{ marginTop: 0 }}>Exceptional pass</h2>
              <p className="muted">For emergencies outside the schedule. Only wardens can issue it, a reason is required, and it is recorded in the audit log.</p>
              <button className="btn" onClick={() => setOverride(BLANK_OVERRIDE)}>Issue exceptional pass</button>
            </div>
          </>
        )}
      </Load>

      {special && (
        <Modal title={special.id ? 'Edit special date' : 'Add special date'} onClose={() => setSpecial(null)}>
          <form onSubmit={saveSpecial}>
            <div className="grid2">
              <Field label="Date"><input type="date" value={special.date} min={today} onChange={(e) => setSpecial({ ...special, date: e.target.value })} required /></Field>
              <Field label="Until (optional, for a range)"><input type="date" value={special.endDate} min={special.date} onChange={(e) => setSpecial({ ...special, endDate: e.target.value })} /></Field>
              <Field label="Name (e.g. Diwali)"><input value={special.label} maxLength={60} onChange={(e) => setSpecial({ ...special, label: e.target.value })} /></Field>
            </div>
            <label className="check"><input type="checkbox" checked={special.closed} onChange={(e) => setSpecial({ ...special, closed: e.target.checked })} /> Outing passes are closed on this date</label>
            {!special.closed && (
              <div className="grid2" style={{ marginTop: 8 }}>
                {[['start', 'Outing starts'], ['lastIssue', 'Last pass'], ['returnBy', 'Back by']].map(([key, label]) => (
                  <Field key={key} label={label}><input type="time" value={special[key]} onChange={(e) => setSpecial({ ...special, [key]: e.target.value })} required /></Field>
                ))}
              </div>
            )}
            <div className="row" style={{ marginTop: 12 }}>
              <button type="button" className="btn" onClick={() => setSpecial(null)}>Cancel</button>
              <button className="btn primary">Save</button>
            </div>
          </form>
        </Modal>
      )}

      {removing && (
        <Confirm title="Delete this special date?" text={`${removing.date}${removing.label ? ` (${removing.label})` : ''} will follow the normal weekly timetable.`} label="Delete" danger onConfirm={removeSpecial} onCancel={() => setRemoving(null)} />
      )}

      {override && (
        <Modal title="Exceptional pass" onClose={() => setOverride(null)}>
          <form onSubmit={issue}>
            <div className="grid2">
              <Field label="Student roll number"><input value={override.rollNumber} onChange={(e) => setOverride({ ...override, rollNumber: e.target.value })} required /></Field>
              <Field label="Destination"><input value={override.destination} onChange={(e) => setOverride({ ...override, destination: e.target.value })} required /></Field>
              <Field label="Leaves at"><input type="datetime-local" value={override.departAt} onChange={(e) => setOverride({ ...override, departAt: e.target.value })} required /></Field>
              <Field label="Back by"><input type="datetime-local" value={override.returnBy} onChange={(e) => setOverride({ ...override, returnBy: e.target.value })} required /></Field>
            </div>
            <Field label="Reason (recorded in the audit log)"><textarea value={override.reason} minLength={5} onChange={(e) => setOverride({ ...override, reason: e.target.value })} required /></Field>
            <div className="row" style={{ marginTop: 12 }}>
              <button type="button" className="btn" onClick={() => setOverride(null)}>Cancel</button>
              <button className="btn primary">Issue pass</button>
            </div>
          </form>
        </Modal>
      )}

      {issued && (
        <Modal title="Pass issued" onClose={() => setIssued(null)}>
          <PassCard pass={issued} />
          <div className="row"><button className="btn" onClick={() => setIssued(null)}>Close</button></div>
        </Modal>
      )}
    </>
  );
}
