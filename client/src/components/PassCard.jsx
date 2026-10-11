import { Fragment, useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { Badge, StateBadge, fmtTz } from '../ui';

const TITLE = { AUTO: 'Outing pass', LEAVE: 'Leave pass', OVERRIDE: 'Exceptional outing pass' };

export default function PassCard({ pass: p }) {
  const [qr, setQr] = useState('');
  const live = p.status === 'ACTIVE';
  useEffect(() => { if (live) QRCode.toDataURL(p.passId, { width: 220, margin: 1 }).then(setQr); }, [p.passId, live]);
  const rows = [['Student', p.name], ['Roll no.', p.rollNumber], ['Course', [p.course, p.branch].filter(Boolean).join(' ') + (p.year ? ` · Year ${p.year}` : '') + (p.semester ? ` · Sem ${p.semester}` : '')],
    ['Hostel', p.hostel], ['Block', p.block], ['Floor', p.floor], ['Room', p.room && `${p.room}${p.bed ? ` (bed ${p.bed})` : ''}`], ['Destination', p.destination],
    ['Valid from', fmtTz(p.validFrom, p.tz)], ['Return by', fmtTz(p.validTo, p.tz)], ['Issued', fmtTz(p.issuedAt, p.tz)], ['Went OUT', p.outAt ? fmtTz(p.outAt, p.tz) : 'Not yet'], ['Came IN', p.inAt ? fmtTz(p.inAt, p.tz) : 'Not yet']];
  return (
    <div className="card passbox">
      <div className="row" style={{ justifyContent: 'space-between', marginBottom: 4 }}><b>{TITLE[p.source] || 'Pass'}</b><span><Badge s={p.status} /> <StateBadge p={p} /></span></div>
      {live && qr && <img src={qr} alt="Pass QR code" />}
      {live && p.code && <><div className="muted" style={{ fontSize: 13 }}>Verification code</div><div className="codebox" aria-label={`Verification code ${p.code}`}>{p.code.slice(0, 3)} {p.code.slice(3)}</div></>}
      <dl className="kv" style={{ textAlign: 'left' }}>{rows.filter(([, v]) => v || v === 0).map(([k, v]) => <Fragment key={k}><dt>{k}</dt><dd>{v}</dd></Fragment>)}</dl>
    </div>
  );
}
