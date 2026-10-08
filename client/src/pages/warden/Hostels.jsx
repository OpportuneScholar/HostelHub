import { api } from '../../api';
import { Load, Msg, useLoad, useMsg } from '../../ui';

export default function Hostels() {
  const st = useLoad('/hostels/tree'); const [msg, run] = useMsg();
  const toggle = async (b) => {
    if (b.status === 'OCCUPIED') return;
    if (await run(() => api(`/hostels/beds/${b._id}/maintenance`, { method: 'PATCH', body: { maintenance: b.status === 'AVAILABLE' } }))) st.reload();
  };
  return (
    <>
      <h1>Hostels</h1><Msg m={msg} />
      <p className="muted">🟢 Available &nbsp; 🔴 Occupied &nbsp; 🟠 Maintenance. Tap a free bed to mark it for maintenance, or tap an orange bed to make it available.</p>
      <Load st={st} what="hostels" empty={st.data?.items.length === 0 && 'No hostels yet. Add a room on the Rooms & Beds page to create the first hostel and block.'}>
        {st.data?.items.map((h) => <div className="card" key={h._id}><h2 style={{ marginTop: 0 }}>🏢 {h.name}</h2>
          {h.blocks.map((b) => <div key={b._id}><b>Block {b.name}</b>
            {b.rooms.map((r) => <div className="roomcard" key={r._id}><div style={{ marginBottom: 6 }}>Room {r.number} <span className="muted">· floor {r.floor}</span></div>
              <div className="row" style={{ marginBottom: 0 }}>{r.beds.map((bd) => <button key={bd._id} className={'bed ' + bd.status.toLowerCase()} title={bd.student || bd.status} onClick={() => toggle(bd)}>
                {bd.status === 'AVAILABLE' ? '🟢' : bd.status === 'OCCUPIED' ? '🔴' : '🟠'} {bd.label}{bd.student ? ` · ${bd.student}` : ''}</button>)}</div></div>)}
            {b.rooms.length === 0 && <p className="muted">No rooms in this block.</p>}</div>)}</div>)}
      </Load>
    </>
  );
}
