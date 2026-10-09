import { useCallback, useEffect, useState } from 'react';
import { api } from './api';

export function useLoad(path) {
  const [st, set] = useState({ data: null, loading: true, error: '' });
  const load = useCallback(() => {
    set((s) => ({ ...s, loading: true, error: '' }));
    api(path).then((data) => set({ data, loading: false, error: '' })).catch((e) => set({ data: null, loading: false, error: e.message }));
  }, [path]);
  useEffect(load, [load]);
  return { ...st, reload: load };
}

// Shows loading / error / empty text, otherwise the children.
export function Load({ st, what, empty, children }) {
  if (st.loading) return <div className="skel-list" aria-label={`Loading ${what}`}><div className="skel" /><div className="skel" /><div className="skel" /></div>;
  if (st.error) return <div className="alert err">Unable to load {what}. Please try again. <button className="link" onClick={st.reload}>Retry</button></div>;
  if (empty) return <p className="empty">{empty}</p>;
  return children;
}

export const fmt = (d) => (d ? new Date(d).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' }) : '-');
// Date-only values (joining date) are stored as midnight UTC, so format them in UTC to show the same day everywhere.
export const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('en-GB', { timeZone: 'UTC', day: '2-digit', month: 'short', year: 'numeric' }) : '-');
export const Badge = ({ s }) => <span className={'badge ' + String(s).toLowerCase().replace('_', '-')}>{String(s).replace('_', ' ')}</span>;
// Toast: shows each new message for a few seconds.
export function Msg({ m }) {
  const [shown, setShown] = useState(null);
  useEffect(() => { if (!m) return; setShown(m); const t = setTimeout(() => setShown(null), 4500); return () => clearTimeout(t); }, [m]);
  return shown ? <div className={'toast ' + (shown.ok ? 'ok' : 'err')} role="status" onClick={() => setShown(null)}>{shown.text}</div> : null;
}
export const Field = ({ label, children }) => <label className="field"><span>{label}</span>{children}</label>;
export const Table = ({ head, children }) => (
  <div className="tablewrap"><table><thead><tr>{head.map((h) => <th key={h}>{h}</th>)}</tr></thead><tbody>{children}</tbody></table></div>
);

export function Modal({ title, onClose, children }) {
  return <div className="modal-bg" onClick={onClose}><div className="modal" onClick={(e) => e.stopPropagation()}><h2>{title}</h2>{children}</div></div>;
}
export function Confirm({ title, text, label, danger, onConfirm, onCancel }) {
  return (
    <Modal title={title} onClose={onCancel}>
      {text && <p className="muted">{text}</p>}
      <div className="row"><button className="btn" onClick={onCancel}>Cancel</button>
        <button className={'btn ' + (danger ? 'danger' : 'primary')} onClick={onConfirm}>{label}</button></div>
    </Modal>
  );
}

// run(fn) calls the API function, shows its message or error, and returns true on success.
export function useMsg() {
  const [msg, setMsg] = useState(null);
  const run = async (fn) => {
    try { const r = await fn(); setMsg({ ok: true, text: r?.message || 'Done' }); return true; }
    catch (e) { setMsg({ ok: false, text: e.message }); return false; }
  };
  return [msg, run, setMsg];
}

export function Pager({ data, page, setPage }) {
  if (!data || data.pages <= 1) return null;
  return <div className="row"><button className="btn sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button>
    <span className="muted">Page {page} of {data.pages}</span><button className="btn sm" disabled={page >= data.pages} onClick={() => setPage(page + 1)}>Next</button></div>;
}
