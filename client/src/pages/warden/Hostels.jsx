import { useState } from 'react';
import { api } from '../../api';
import { Badge, Confirm, Field, Load, Modal, Msg, useLoad, useMsg } from '../../ui';

const TYPES = { BOYS: 'Boys', GIRLS: 'Girls', MIXED: 'Mixed' };
const BLANK = { name: '', type: 'MIXED', description: '' };

const totals = (hostel) => {
  const rooms = hostel.blocks.flatMap((b) => b.rooms);
  const beds = rooms.flatMap((r) => r.beds);
  return { blocks: hostel.blocks.length, rooms: rooms.length, beds: beds.length, occupied: beds.filter((b) => b.status === 'OCCUPIED').length };
};

export default function Hostels() {
  const st = useLoad('/hostels/tree');
  const [msg, run, setMsg] = useMsg();
  const [form, setForm] = useState(null);
  const [removing, setRemoving] = useState(null);
  const [blocked, setBlocked] = useState('');

  const toggleBed = async (bed) => {
    if (bed.status === 'OCCUPIED') return;
    const body = { maintenance: bed.status === 'AVAILABLE' };
    if (await run(() => api(`/hostels/beds/${bed._id}/maintenance`, { method: 'PATCH', body }))) st.reload();
  };

  const save = async (e) => {
    e.preventDefault();
    const { id, ...body } = form;
    const call = id ? () => api(`/hostels/${id}`, { method: 'PATCH', body }) : () => api('/hostels', { method: 'POST', body });
    if (await run(call)) {
      setForm(null);
      st.reload();
    }
  };

  const toggleArchive = async (hostel) => {
    if (await run(() => api(`/hostels/${hostel._id}/archive`, { method: 'PATCH', body: { archived: !hostel.archived } }))) st.reload();
  };

  const remove = async () => {
    const hostel = removing;
    setRemoving(null);
    try {
      const r = await api(`/hostels/${hostel._id}`, { method: 'DELETE' });
      setMsg({ ok: true, text: r.message });
      st.reload();
    } catch (err) {
      setBlocked(err.message);
    }
  };

  return (
    <>
      <h1>Hostels</h1>
      <Msg m={msg} />
      <div className="row">
        <button className="btn primary" onClick={() => setForm(BLANK)}>Add hostel</button>
        <span className="muted">🟢 Available &nbsp; 🔴 Occupied &nbsp; 🟠 Maintenance. Tap a free bed to switch maintenance on or off.</span>
      </div>
      <Load st={st} what="hostels" empty={st.data?.items.length === 0 && 'No hostels yet. Add a hostel, then add its rooms on the Rooms & Beds page.'}>
        {st.data?.items.map((h) => {
          const t = totals(h);
          return (
            <div className="card" key={h._id} style={h.archived ? { opacity: 0.8 } : null}>
              <div className="row" style={{ justifyContent: 'space-between', marginBottom: 4 }}>
                <h2 style={{ margin: 0 }}>🏢 {h.name} <span className="muted" style={{ fontSize: 13 }}>{TYPES[h.type]}</span> {h.archived && <Badge s="EXPIRED" />}</h2>
                <span>
                  <button className="btn sm" onClick={() => setForm({ id: h._id, name: h.name, type: h.type, description: h.description })}>Edit</button>{' '}
                  <button className="btn sm" onClick={() => toggleArchive(h)}>{h.archived ? 'Restore' : 'Archive'}</button>{' '}
                  <button className="btn sm" onClick={() => setRemoving(h)}>Delete</button>
                </span>
              </div>
              {h.description && <p className="muted" style={{ margin: '0 0 6px' }}>{h.description}</p>}
              <p className="muted" style={{ margin: '0 0 8px' }}>{t.blocks} block(s), {t.rooms} room(s), {t.beds} bed(s), {t.occupied} occupied</p>
              {h.blocks.map((b) => (
                <details key={b._id}>
                  <summary><b>Block {b.name}</b> <span className="muted">({b.rooms.length} rooms)</span></summary>
                  {b.rooms.map((r) => (
                    <div className="roomcard" key={r._id}>
                      <div style={{ marginBottom: 6 }}>Room {r.number} <span className="muted">· floor {r.floor}</span></div>
                      <div className="row" style={{ marginBottom: 0 }}>
                        {r.beds.map((bed) => (
                          <button key={bed._id} className={`bed ${bed.status.toLowerCase()}`} title={bed.student || bed.status} onClick={() => toggleBed(bed)}>
                            {bed.status === 'AVAILABLE' ? '🟢' : bed.status === 'OCCUPIED' ? '🔴' : '🟠'} {bed.label}{bed.student ? ` · ${bed.student}` : ''}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </details>
              ))}
            </div>
          );
        })}
      </Load>

      {form && (
        <Modal title={form.id ? 'Edit hostel' : 'Add hostel'} onClose={() => setForm(null)}>
          <form onSubmit={save}>
            <div className="grid2">
              <Field label="Hostel name"><input value={form.name} maxLength={60} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></Field>
              <Field label="Type">
                <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                  {Object.entries(TYPES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </Field>
            </div>
            <Field label="Description (optional)"><input value={form.description} maxLength={200} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field>
            <div className="row" style={{ marginTop: 12 }}>
              <button type="button" className="btn" onClick={() => setForm(null)}>Cancel</button>
              <button className="btn primary">Save</button>
            </div>
          </form>
        </Modal>
      )}

      {removing && (
        <Confirm
          title={`Delete ${removing.name}?`}
          text="Only a hostel with no blocks, rooms or gate-pass history can be deleted. If it has any, archive it instead. Nothing is deleted along with it."
          label="Delete hostel"
          danger
          onConfirm={remove}
          onCancel={() => setRemoving(null)}
        />
      )}

      {blocked && (
        <Modal title="This hostel cannot be deleted" onClose={() => setBlocked('')}>
          <p>{blocked}</p>
          <div className="row"><button className="btn" onClick={() => setBlocked('')}>Close</button></div>
        </Modal>
      )}
    </>
  );
}
