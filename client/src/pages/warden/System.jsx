import { useState } from 'react';
import { api } from '../../api';
import { Badge, Confirm, Load, Msg, Table, fmt, useLoad, useMsg } from '../../ui';

function AuditLog() {
  const st = useLoad('/admin/audit');
  return (
    <Load st={st} what="the audit log" empty={st.data?.items.length === 0 && 'Nothing has been recorded yet.'}>
      <Table head={['When', 'Who', 'Action', 'About', 'Details']}>
        {st.data?.items.map((a) => (
          <tr key={a._id}>
            <td>{fmt(a.at)}</td>
            <td>{a.actor?.name || '-'}</td>
            <td>{a.action.replaceAll('_', ' ').toLowerCase()}</td>
            <td>{a.target?.name || '-'}</td>
            <td style={{ maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.details ? JSON.stringify(a.details) : ''}</td>
          </tr>
        ))}
      </Table>
    </Load>
  );
}

function Indexes() {
  const st = useLoad('/system/indexes');
  const [msg, run] = useMsg();
  const [confirming, setConfirming] = useState(false);
  const fix = async () => {
    setConfirming(false);
    if (await run(() => api('/system/indexes/migrate', { method: 'POST' }))) st.reload();
  };
  return (
    <>
      <Msg m={msg} />
      <Load st={st} what="database indexes">
        {st.data && (
          <>
            {st.data.needsMigration && !st.data.hasConflicts && <div className="banner warn">Old campus-wide indexes are still in the database. They stop the same room number from being used in a second hostel.</div>}
            {st.data.hasConflicts && <div className="banner bad">Some records clash, so the indexes cannot be changed yet. See the list below.</div>}
            {!st.data.needsMigration && <div className="banner ok">Room and bed indexes are up to date.</div>}
            {st.data.items.map((c) => (
              <div className="card" key={c.name}>
                <b>{c.name}</b>
                <ul>{c.indexes.map((i) => <li key={i.name}>{i.name}{i.unique ? ' (unique)' : ''}{c.obsolete.includes(i.name) && <> <Badge s="CANCELLED" /> old</>}</li>)}</ul>
                {c.conflicts.map((x, i) => <p key={i} className="muted">Clash: {JSON.stringify(x.key)} ({x.ids.length} records)</p>)}
              </div>
            ))}
            {st.data.needsMigration && !st.data.hasConflicts && <button className="btn primary" onClick={() => setConfirming(true)}>Fix indexes</button>}
          </>
        )}
      </Load>
      {confirming && <Confirm title="Fix room and bed indexes?" text="Only the old indexes are removed and the per-block ones are created. No rooms, beds or students are changed or deleted." label="Fix indexes" onConfirm={fix} onCancel={() => setConfirming(false)} />}
    </>
  );
}

export default function System() {
  const [tab, setTab] = useState('audit');
  return (
    <>
      <h1>System</h1>
      <div className="tabs">
        <button className={tab === 'audit' ? 'on' : ''} onClick={() => setTab('audit')}>Audit log</button>
        <button className={tab === 'indexes' ? 'on' : ''} onClick={() => setTab('indexes')}>Database indexes</button>
      </div>
      {tab === 'audit' ? <AuditLog /> : <Indexes />}
    </>
  );
}
