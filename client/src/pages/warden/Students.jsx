import { Fragment, useState } from 'react';
import { api } from '../../api';
import { Badge, Confirm, Field, Load, Modal, Msg, Pager, Table, useLoad, useMsg } from '../../ui';

const FIELDS = [['firstName', 'First name'], ['lastName', 'Last name'], ['rollNumber', 'Roll number'], ['email', 'College email', 'email'], ['enrollmentNumber', 'Enrollment number (optional)'],
  ['phone', 'Phone'], ['course', 'Course'], ['branch', 'Branch'], ['year', 'Year', 'number'], ['semester', 'Semester', 'number'], ['roomNumber', 'Room number (e.g. B-205)'],
  ['bedNumber', 'Bed number (e.g. 1)'], ['guardianName', 'Guardian name'], ['guardianPhone', 'Guardian phone'], ['emergencyContact', 'Emergency contact'], ['address', 'Address'], ['joiningDate', 'Joining date', 'date']];
const EDITABLE = [['phone', 'Phone'], ['course', 'Course'], ['branch', 'Branch'], ['year', 'Year', 'number'], ['semester', 'Semester', 'number'], ['guardianName', 'Guardian name'], ['guardianPhone', 'Guardian phone'], ['emergencyContact', 'Emergency contact'], ['address', 'Address'], ['enrollmentNumber', 'Enrollment number']];
const EMPTY = Object.fromEntries(FIELDS.map(([k]) => [k, '']));

export default function Students() {
  const [page, setPage] = useState(1); const [q, setQ] = useState(''); const [course, setCourse] = useState(''); const [year, setYear] = useState('');
  const [applied, setApplied] = useState({ q: '', course: '', year: '' });
  const st = useLoad(`/students?page=${page}&q=${encodeURIComponent(applied.q)}&course=${encodeURIComponent(applied.course)}&year=${applied.year}`);
  const [msg, run] = useMsg(); const [form, setForm] = useState(null); const [confirm, setConfirm] = useState(null); const [room, setRoom] = useState(null); const [view, setView] = useState(null); const [edit, setEdit] = useState(null);

  const submit = async (e) => {
    e.preventDefault();
    const body = { ...form }; if (!body.joiningDate) delete body.joiningDate;
    if (await run(() => api('/students', { method: 'POST', body }))) { setForm(null); st.reload(); }
  };
  const act = async () => {
    const { type, s } = confirm; setConfirm(null);
    const call = type === 'reset' ? () => api(`/students/${s.user._id}/reset-password`, { method: 'POST' }) : () => api(`/students/${s.user._id}/active`, { method: 'PATCH', body: { isActive: type === 'reactivate' } });
    if (await run(call)) st.reload();
  };
  const moveRoom = async (e) => { e.preventDefault(); if (await run(() => api(`/students/${room.s.user._id}/change-room`, { method: 'POST', body: { roomNumber: room.roomNumber, bedNumber: room.bedNumber } }))) { setRoom(null); st.reload(); } };
  const saveEdit = async (e) => { e.preventDefault(); const { s, ...body } = edit; if (await run(() => api(`/students/${s.user._id}/profile`, { method: 'PATCH', body }))) { setEdit(null); st.reload(); } };
  const items = st.data?.items;
  return (
    <>
      <h1>Students</h1><Msg m={msg} />
      <form className="row" onSubmit={(e) => { e.preventDefault(); setPage(1); setApplied({ q, course, year }); }}>
        <input style={{ width: 220 }} placeholder="Search name, roll number, email" value={q} onChange={(e) => setQ(e.target.value)} />
        <input style={{ width: 120 }} placeholder="Course" value={course} onChange={(e) => setCourse(e.target.value)} />
        <select style={{ width: 100 }} value={year} onChange={(e) => setYear(e.target.value)}><option value="">All years</option>{[1, 2, 3, 4, 5].map((y) => <option key={y} value={y}>Year {y}</option>)}</select>
        <button className="btn">Search</button><button type="button" className="btn primary" onClick={() => setForm(EMPTY)}>Register student</button>
      </form>
      <Load st={st} what="students" empty={items?.length === 0 && (applied.q || applied.course || applied.year ? 'No students match these filters.' : 'No students registered yet.')}>
        <Table head={['Student', 'Roll no.', 'Course', 'Year', 'Hostel', 'Room', 'Bed', 'Status', 'Actions']}>
          {items?.map((s) => <tr key={s._id}><td>{s.firstName} {s.lastName}</td><td>{s.rollNumber}</td><td>{s.course} {s.branch}</td><td>{s.year}</td><td>{s.hostel || '-'}</td><td>{s.room || '-'}</td><td>{s.bed || '-'}</td>
            <td><Badge s={s.user?.isActive ? 'ACTIVE' : 'CANCELLED'} /></td>
            <td><button className="btn sm" onClick={() => setView(s)}>Details</button> <button className="btn sm" onClick={() => setEdit({ s, ...Object.fromEntries(EDITABLE.map(([k]) => [k, s[k] ?? ''])) })}>Edit</button> <button className="btn sm" onClick={() => setRoom({ s, roomNumber: '', bedNumber: '' })}>Change room</button> <button className="btn sm" onClick={() => setConfirm({ type: 'reset', s })}>Reset password</button>{' '}
              {s.user?.isActive ? <button className="btn sm" onClick={() => setConfirm({ type: 'deactivate', s })}>Deactivate</button> : <button className="btn sm" onClick={() => setConfirm({ type: 'reactivate', s })}>Reactivate</button>}</td></tr>)}
        </Table>
        <Pager data={st.data} page={page} setPage={setPage} />
      </Load>
      {form && <Modal title="Register student" onClose={() => setForm(null)}><form onSubmit={submit}>
        <p className="muted">The temporary password is set automatically from the first name and room number. The student must change it at first login.</p>
        <div className="grid2">{FIELDS.map(([k, label, type]) => <Field key={k} label={label}><input type={type || 'text'} value={form[k]} required={!['enrollmentNumber', 'joiningDate'].includes(k)} onChange={(e) => setForm({ ...form, [k]: e.target.value })} /></Field>)}</div>
        <div className="row" style={{ marginTop: 12 }}><button type="button" className="btn" onClick={() => setForm(null)}>Cancel</button><button className="btn primary">Register</button></div></form></Modal>}
      {room && <Modal title={`Change room: ${room.s.firstName} ${room.s.lastName}`} onClose={() => setRoom(null)}><form onSubmit={moveRoom}><div className="grid2">
        <Field label="New room number"><input value={room.roomNumber} onChange={(e) => setRoom({ ...room, roomNumber: e.target.value })} required /></Field>
        <Field label="Bed number"><input value={room.bedNumber} onChange={(e) => setRoom({ ...room, bedNumber: e.target.value })} required /></Field></div>
        <div className="row" style={{ marginTop: 12 }}><button type="button" className="btn" onClick={() => setRoom(null)}>Cancel</button><button className="btn primary">Change room</button></div></form></Modal>}
      {view && <Modal title={`${view.firstName} ${view.lastName}`} onClose={() => setView(null)}><dl className="kv">
        {[['Roll number', view.rollNumber], ['Email', view.email], ['Phone', view.phone], ['Course', `${view.course} ${view.branch}, year ${view.year}, sem ${view.semester}`], ['Hostel / Room / Bed', `${view.hostel || '-'} / ${view.room || '-'} / ${view.bed || '-'}`],
          ['Guardian', `${view.guardianName} (${view.guardianPhone})`], ['Emergency contact', view.emergencyContact], ['Address', view.address]].map(([k, v]) => <Fragment key={k}><dt>{k}</dt><dd>{v || '-'}</dd></Fragment>)}</dl>
        <div className="row"><button className="btn" onClick={() => setView(null)}>Close</button></div></Modal>}
      {edit && <Modal title={`Edit ${edit.s.firstName} ${edit.s.lastName}`} onClose={() => setEdit(null)}><form onSubmit={saveEdit}><div className="grid2">
        {EDITABLE.map(([k, label, type]) => <Field key={k} label={label}><input type={type || 'text'} value={edit[k]} onChange={(e) => setEdit({ ...edit, [k]: e.target.value })} /></Field>)}</div>
        <div className="row" style={{ marginTop: 12 }}><button type="button" className="btn" onClick={() => setEdit(null)}>Cancel</button><button className="btn primary">Save changes</button></div></form></Modal>}
      {confirm && <Confirm title={{ reset: 'Reset this password?', deactivate: 'Deactivate this student account?', reactivate: 'Reactivate this student account?' }[confirm.type]}
        text={confirm.type === 'reset' ? 'The password returns to the temporary one and the student must change it at next login.' : `${confirm.s.firstName} ${confirm.s.lastName} (${confirm.s.rollNumber})`}
        label={{ reset: 'Reset', deactivate: 'Deactivate', reactivate: 'Reactivate' }[confirm.type]} danger={confirm.type !== 'reactivate'} onConfirm={act} onCancel={() => setConfirm(null)} />}
    </>
  );
}
