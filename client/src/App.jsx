import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './auth';
import Layout from './Layout';
import Login from './pages/Login';
import ChangePassword from './pages/ChangePassword';
import WDash from './pages/warden/Dashboard';
import WStudents from './pages/warden/Students';
import WHostels from './pages/warden/Hostels';
import WRooms from './pages/warden/Rooms';
import WLeave from './pages/warden/Leave';
import WPasses from './pages/warden/Passes';
import WGate from './pages/warden/GateActivity';
import WComplaints from './pages/warden/Complaints';
import WFees from './pages/warden/Fees';
import WNotices from './pages/warden/Notices';
import SHome from './pages/student/Home';
import SProfile from './pages/student/Profile';
import SRoom from './pages/student/MyRoom';
import SRequests from './pages/student/Requests';
import SPass from './pages/student/GatePass';
import SComplaints from './pages/student/Complaints';
import SFees from './pages/student/Fees';
import SNotices from './pages/student/Notices';
import SActivity from './pages/student/Activity';
import GuardGate from './pages/guard/Gate';

const home = { WARDEN: '/warden', STUDENT: '/student', GUARD: '/guard' };
const wardenLinks = [['/warden', 'Dashboard', '📊'], ['/warden/students', 'Students', '🎓'], ['/warden/hostels', 'Hostels', '🏢'], ['/warden/rooms', 'Rooms & Beds', '🛏️'],
  ['/warden/leave', 'Leave Requests', '📝'], ['/warden/passes', 'Gate Passes', '🎫'], ['/warden/gate', 'Gate Activity', '🚪'], ['/warden/complaints', 'Complaints', '🛠️'], ['/warden/fees', 'Fees', '💳'], ['/warden/notices', 'Notices', '📢']];
const studentLinks = [['/student', 'Dashboard', '🏠'], ['/student/profile', 'My Profile', '👤'], ['/student/room', 'My Room', '🛏️'], ['/student/leave', 'Leave', '📝'], ['/student/pass', 'Gate Pass', '🎫'],
  ['/student/complaints', 'Complaints', '🛠️'], ['/student/fees', 'Fees', '💳'], ['/student/notices', 'Notices', '📢'], ['/student/activity', 'Activity', '🕘']];

// The backend enforces roles too; this only decides what the browser shows.
function Protected({ role, links }) {
  const { user } = useAuth();
  if (user === undefined) return <p className="muted pad">Loading...</p>;
  if (!user) return <Navigate to="/login" replace />;
  if (user.mustChangePassword) return <Navigate to="/change-password" replace />;
  if (user.role !== role) return <Navigate to={home[user.role]} replace />;
  return <Layout links={links} />;
}

export default function App() {
  const { user } = useAuth();
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/change-password" element={<ChangePassword />} />
      <Route path="/warden" element={<Protected role="WARDEN" links={wardenLinks} />}>
        <Route index element={<WDash />} /><Route path="students" element={<WStudents />} /><Route path="hostels" element={<WHostels />} /><Route path="rooms" element={<WRooms />} />
        <Route path="leave" element={<WLeave />} /><Route path="passes" element={<WPasses />} /><Route path="gate" element={<WGate />} />
        <Route path="complaints" element={<WComplaints />} /><Route path="fees" element={<WFees />} /><Route path="notices" element={<WNotices />} />
      </Route>
      <Route path="/student" element={<Protected role="STUDENT" links={studentLinks} />}>
        <Route index element={<SHome />} /><Route path="profile" element={<SProfile />} /><Route path="room" element={<SRoom />} /><Route path="leave" element={<SRequests />} />
        <Route path="pass" element={<SPass />} /><Route path="complaints" element={<SComplaints />} /><Route path="fees" element={<SFees />} /><Route path="notices" element={<SNotices />} /><Route path="activity" element={<SActivity />} />
      </Route>
      <Route path="/guard" element={<Protected role="GUARD" links={[['/guard', 'Verify Pass', '🚪']]} />}><Route index element={<GuardGate />} /></Route>
      <Route path="*" element={<Navigate to={user ? home[user.role] : '/login'} replace />} />
    </Routes>
  );
}
