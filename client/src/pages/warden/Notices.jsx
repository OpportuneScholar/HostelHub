import { useState } from 'react';
import { api } from '../../api';
import { Badge, Confirm, Field, Load, Msg, Table, fmt, useLoad, useMsg } from '../../ui';

const BLANK = { title: '', description: '', category: 'General', priority: 'NORMAL', expiresAt: '' };

export default function Notices() {
  const st = useLoad('/admin/notices'); const [msg, run] = useMsg(); const [del, setDel] = useState(null);
  const [f, setF] = useState(BLANK); const [editId, setEditId] = useState(null); const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const save = async (e) => {
    e.preventDefault(); const body = { ...f, expiresAt: new Date(f.expiresAt + 'T23:59:59').toISOString() };
    const call = editId ? () => api(`/admin/notices/${editId}`, { method: 'PATCH', body }) : () => api('/admin/notices', { method: 'POST', body });
    if (await run(call)) { setF(BLANK); setEditId(null); st.reload(); }
  };
  const startEdit = (n) => { setEditId(n._id); setF({ title: n.title, description: n.description, category: n.category, priority: n.priority, expiresAt: new Date(n.expiresAt).toLocaleDateString('en-CA') }); window.scrollTo(0, 0); };
  const remove = async () => { const id = del; setDel(null); if (await run(() => api(`/admin/notices/${id}`, { method: 'DELETE' }))) st.reload(); };
  const now = new Date();
  return (
    <>
      <h1>Notices</h1><Msg m={msg} />
      <form className="card" onSubmit={save}><h2 style={{ marginTop: 0 }}>{editId ? 'Edit notice' : 'New notice'}</h2><div className="grid2">
        <Field label="Title"><input value={f.title} onChange={set('title')} required /></Field><Field label="Category"><input value={f.category} onChange={set('category')} /></Field>
        <Field label="Priority"><select value={f.priority} onChange={set('priority')}><option value="NORMAL">Normal</option><option value="IMPORTANT">Important</option></select></Field>
        <Field label="Show until"><input type="date" value={f.expiresAt} onChange={set('expiresAt')} required /></Field></div>
        <Field label="Description"><textarea value={f.description} onChange={set('description')} required /></Field>
        <div className="row" style={{ marginTop: 12 }}><button className="btn primary">{editId ? 'Save changes' : 'Publish notice'}</button>{editId && <button type="button" className="btn" onClick={() => { setEditId(null); setF(BLANK); }}>Cancel edit</button>}</div></form>
      <Load st={st} what="notices" empty={st.data?.items.length === 0 && 'No notices published yet.'}>
        <Table head={['Title', 'Category', 'Priority', 'Published', 'Expires', 'State', '']}>
          {st.data?.items.map((n) => <tr key={n._id}><td>{n.title}</td><td>{n.category}</td><td>{n.priority === 'IMPORTANT' ? <Badge s="HIGH" /> : 'Normal'}</td><td>{fmt(n.publishAt)}</td><td>{fmt(n.expiresAt)}</td>
            <td><Badge s={new Date(n.expiresAt) < now ? 'EXPIRED' : 'ACTIVE'} /></td><td><button className="btn sm" onClick={() => startEdit(n)}>Edit</button> <button className="btn sm" onClick={() => setDel(n._id)}>Delete</button></td></tr>)}
        </Table>
      </Load>
      {del && <Confirm title="Delete this notice?" label="Delete" danger onConfirm={remove} onCancel={() => setDel(null)} />}
    </>
  );
}
