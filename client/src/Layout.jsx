import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from './auth';

export const Brand = () => (
  <div className="brand"><span className="logo">H</span><div><b>HostelHub</b><small>Smart Hostel Management, Simplified.</small></div></div>
);
const ROLE = { WARDEN: 'Warden / Admin', STUDENT: 'Student', GUARD: 'Guard' };

export default function Layout({ links }) {
  const { user, logout } = useAuth();
  return (
    <div className="shell">
      <aside className="side">
        <Brand />
        <nav>{links.map(([to, label, icon]) => <NavLink key={to} to={to} end={links[0][0] === to}><span>{icon}</span>{label}</NavLink>)}</nav>
        <div className="user">{user.name}<br /><span style={{ opacity: .7 }}>{ROLE[user.role]}</span><br /><button className="link" onClick={logout}>Log out</button></div>
      </aside>
      <div className="content">
        <header className="topbar"><Brand /><span className="who">{user.name} · {ROLE[user.role]}</span><button className="btn sm mb" onClick={logout}>Log out</button></header>
        <main><Outlet /></main>
      </div>
      {links.length > 1 && <nav className="bottomnav">{links.map(([to, label, icon]) => <NavLink key={to} to={to} end={links[0][0] === to}><i>{icon}</i>{label}</NavLink>)}</nav>}
    </div>
  );
}
