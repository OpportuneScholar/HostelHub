import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api';
import { useAuth } from '../../auth';
import { Badge, Confirm, Field, Load, Modal, Msg, Pager, Table, fmt, useLoad, useMsg } from '../../ui';

export default function Users() {
  const { user: me } = useAuth();
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState({ q: '', role: '', status: '' });
  const [applied, setApplied] = useState(filters);
  const query = `page=${page}&q=${encodeURIComponent(applied.q)}&role=${applied.role}&status=${applied.status}`;
  const st = useLoad(`/users?${query}`);
  const [msg, run] = useMsg();
  const [guard, setGuard] = useState(null);
  const [edit, setEdit] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [credentials, setCredentials] = useState(null);

  const createGuard = async (e) => {
    e.preventDefault();
    const ok = await run(async () => {
      const r = await api('/users/guards', { method: 'POST', body: guard });
      setCredentials(r.credentials);
      return r;
    });
    if (ok) {
      setGuard(null);
      st.reload();
    }
  };

  const saveEdit = async (e) => {
    e.preventDefault();
    if (await run(() => api(`/users/${edit._id}`, { method: 'PATCH', body: { name: edit.name, email: edit.email } }))) {
      setEdit(null);
      st.reload();
    }
  };

  const confirmAction = async () => {
    const { type, user } = confirm;
    setConfirm(null);
    let call;
    if (type === 'reset' && user.role === 'STUDENT') call = () => api(`/students/${user._id}/reset-password`, { method: 'POST' });
    else if (type === 'reset') call = async () => { const r = await api(`/users/${user._id}/reset-password`, { method: 'POST' }); setCredentials(r.credentials); return r; };
    else call = () => api(`/users/${user._id}/active`, { method: 'PATCH', body: { isActive: type === 'activate' } });
    if (await run(call)) st.reload();
  };

  const canEdit = (u) => u.role === 'GUARD' || (u.role === 'WARDEN' && u._id === me.id);
  const canReset = (u) => u.role !== 'WARDEN';
  const copy = () => navigator.clipboard?.writeText(`${credentials.identifier} / ${credentials.temporaryPassword}`);

  return (
    <>
      <h1>User management</h1>
      <Msg m={msg} />
      <form className="row" onSubmit={(e) => { e.preventDefault(); setPage(1); setApplied(filters); }}>
        <input style={{ width: 220 }} placeholder="Search name, email, roll number" value={filters.q} onChange={(e) => setFilters({ ...filters, q: e.target.value })} />
        <select style={{ width: 130 }} value={filters.role} onChange={(e) => setFilters({ ...filters, role: e.target.value })}>
          <option value="">All roles</option><option value="WARDEN">Warden</option><option value="STUDENT">Student</option><option value="GUARD">Guard</option>
        </select>
        <select style={{ width: 130 }} value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}>
          <option value="">Any status</option><option value="active">Active</option><option value="inactive">Inactive</option>
        </select>
        <button className="btn">Search</button>
        <button type="button" className="btn primary" onClick={() => setGuard({ name: '', email: '' })}>Add guard</button>
      </form>
      <p className="muted">Students are registered on the <Link to="/warden/students">Students</Link> page. Warden accounts are created by the server administrator.</p>

      <Load st={st} what="users" empty={st.data?.items.length === 0 && 'No users match these filters.'}>
        <Table head={['Name', 'Login', 'Role', 'Status', 'Last login', 'Actions']}>
          {st.data?.items.map((u) => (
            <tr key={u._id}>
              <td>{u.name}</td>
              <td>{u.rollNumber || u.email}</td>
              <td>{u.role}</td>
              <td><Badge s={u.isActive ? 'ACTIVE' : 'CANCELLED'} />{u.mustChangePassword && <span className="muted"> · must change password</span>}</td>
              <td>{u.lastLoginAt ? fmt(u.lastLoginAt) : 'Never'}</td>
              <td>
                {canEdit(u) && <button className="btn sm" onClick={() => setEdit({ _id: u._id, name: u.name, email: u.email })}>Edit</button>}{' '}
                {canReset(u) && <button className="btn sm" onClick={() => setConfirm({ type: 'reset', user: u })}>Reset password</button>}{' '}
                {u._id !== me.id && (u.isActive
                  ? <button className="btn sm" onClick={() => setConfirm({ type: 'deactivate', user: u })}>Deactivate</button>
                  : <button className="btn sm" onClick={() => setConfirm({ type: 'activate', user: u })}>Activate</button>)}
              </td>
            </tr>
          ))}
        </Table>
        <Pager data={st.data} page={page} setPage={setPage} />
      </Load>

      {guard && (
        <Modal title="Add guard" onClose={() => setGuard(null)}>
          <form onSubmit={createGuard}>
            <p className="muted">A temporary password is generated and shown once. The guard must change it at first login.</p>
            <div className="grid2">
              <Field label="Full name"><input value={guard.name} onChange={(e) => setGuard({ ...guard, name: e.target.value })} required /></Field>
              <Field label="Email (login)"><input type="email" value={guard.email} onChange={(e) => setGuard({ ...guard, email: e.target.value })} required /></Field>
            </div>
            <div className="row" style={{ marginTop: 12 }}>
              <button type="button" className="btn" onClick={() => setGuard(null)}>Cancel</button>
              <button className="btn primary">Create guard</button>
            </div>
          </form>
        </Modal>
      )}

      {edit && (
        <Modal title="Edit user" onClose={() => setEdit(null)}>
          <form onSubmit={saveEdit}>
            <div className="grid2">
              <Field label="Full name"><input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} required /></Field>
              <Field label="Email"><input type="email" value={edit.email} onChange={(e) => setEdit({ ...edit, email: e.target.value })} required /></Field>
            </div>
            <div className="row" style={{ marginTop: 12 }}>
              <button type="button" className="btn" onClick={() => setEdit(null)}>Cancel</button>
              <button className="btn primary">Save</button>
            </div>
          </form>
        </Modal>
      )}

      {confirm && (
        <Confirm
          title={{ reset: 'Reset this password?', deactivate: 'Deactivate this account?', activate: 'Activate this account?' }[confirm.type]}
          text={`${confirm.user.name} (${confirm.user.role.toLowerCase()})`}
          label={{ reset: 'Reset', deactivate: 'Deactivate', activate: 'Activate' }[confirm.type]}
          danger={confirm.type !== 'activate'}
          onConfirm={confirmAction}
          onCancel={() => setConfirm(null)}
        />
      )}

      {credentials && (
        <Modal title="Login details" onClose={() => setCredentials(null)}>
          <p className="muted">Give these to the guard now. The password is not stored in readable form and cannot be shown again.</p>
          <dl className="kv"><dt>Login</dt><dd>{credentials.identifier}</dd><dt>Password</dt><dd><b style={{ fontFamily: 'ui-monospace, monospace', fontSize: 18 }}>{credentials.temporaryPassword}</b></dd></dl>
          <div className="row"><button className="btn" onClick={copy}>Copy</button><button className="btn primary" onClick={() => setCredentials(null)}>Done</button></div>
        </Modal>
      )}
    </>
  );
}
