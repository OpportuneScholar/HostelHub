import { useState } from 'react';
import PassCard from '../../components/PassCard';
import { Load, Modal, Pager, StateBadge, Table, fmtTz, useLoad } from '../../ui';

const SOURCES = { AUTO: 'Outing', LEAVE: 'Leave', OVERRIDE: 'Exceptional' };

export default function Passes() {
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState({ q: '', date: '', state: '', source: '' });
  const [applied, setApplied] = useState(filters);
  const [open, setOpen] = useState(null);
  const query = `page=${page}&q=${encodeURIComponent(applied.q)}&date=${applied.date}&state=${applied.state}&source=${applied.source}`;
  const st = useLoad(`/admin/passes?${query}`);
  const items = st.data?.items;
  const set = (key) => (e) => setFilters({ ...filters, [key]: e.target.value });

  return (
    <>
      <h1>Gate passes</h1>
      <form className="row" onSubmit={(e) => { e.preventDefault(); setPage(1); setApplied(filters); }}>
        <input style={{ width: 220 }} placeholder="Student name or roll no." value={filters.q} onChange={set('q')} />
        <input type="date" style={{ width: 160 }} value={filters.date} onChange={set('date')} />
        <select style={{ width: 150 }} value={filters.state} onChange={set('state')}>
          <option value="">Any state</option><option value="NOT_EXITED">Not exited</option><option value="OUT">Out</option><option value="RETURNED">Returned</option><option value="EXPIRED">Expired</option><option value="CANCELLED">Cancelled</option>
        </select>
        <select style={{ width: 140 }} value={filters.source} onChange={set('source')}>
          <option value="">All types</option>{Object.entries(SOURCES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
        <button className="btn">Search</button>
      </form>
      <Load st={st} what="passes" empty={items?.length === 0 && 'No passes match these filters.'}>
        <Table head={['Student', 'Room', 'Type', 'Issued', 'Valid until', 'Went out', 'Came in', 'State', '']}>
          {items?.map((p) => (
            <tr key={p._id}>
              <td>{p.name} ({p.rollNumber})</td>
              <td>{[p.hostel, p.block, p.room].filter(Boolean).join(' / ') || '-'}</td>
              <td>{SOURCES[p.source]}</td>
              <td>{fmtTz(p.issuedAt, p.tz)}</td>
              <td>{fmtTz(p.validTo, p.tz)}</td>
              <td>{p.outAt ? fmtTz(p.outAt, p.tz) : '-'}</td>
              <td>{p.inAt ? fmtTz(p.inAt, p.tz) : '-'}</td>
              <td><StateBadge p={p} /></td>
              <td><button className="btn sm" onClick={() => setOpen(p)}>View</button></td>
            </tr>
          ))}
        </Table>
        <Pager data={st.data && { pages: items.length === 20 ? page + 1 : page }} page={page} setPage={setPage} />
      </Load>
      {open && (
        <Modal title="Pass details" onClose={() => setOpen(null)}>
          <PassCard pass={open} />
          <div className="row"><button className="btn" onClick={() => setOpen(null)}>Close</button></div>
        </Modal>
      )}
    </>
  );
}
