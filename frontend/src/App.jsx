import { useState, useEffect } from 'react';
import { NavLink, Route, Routes, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { LayoutDashboard, Phone, Clock, ShieldAlert, BarChart3, Settings as SettingsIcon, LogOut, Shield } from 'lucide-react';
import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import Contacts from './pages/Contacts';
import Call from './pages/Call';
import CallHistory from './pages/CallHistory';
import ThreatAnalytics from './pages/ThreatAnalytics';
import Settings from './pages/Settings';
import { checkHealth } from './services/api';
import './App.css';

function App() {
  const navigate = useNavigate();
  const location = useLocation();
  const [user, setUser] = useState(null);
  const [backendOnline, setBackendOnline] = useState(null);

  // Load user from localStorage on mount
  useEffect(() => {
    const storedUser = localStorage.getItem('voiceshield_user');
    if (storedUser) {
      setUser(JSON.parse(storedUser));
    }
  }, []);

  // Poll health status
  useEffect(() => {
    let active = true;
    async function verifyHealth() {
      const isOnline = await checkHealth();
      if (active) {
        setBackendOnline(isOnline);
      }
    }
    verifyHealth();
    const interval = setInterval(verifyHealth, 5000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('voiceshield_user');
    setUser(null);
    navigate('/login');
  };

  const handleLoginSuccess = (userData) => {
    localStorage.setItem('voiceshield_user', JSON.stringify(userData));
    setUser(userData);
    navigate('/dashboard');
  };

  // Determine current page title
  const getPageTitle = () => {
    switch (location.pathname) {
      case '/dashboard': return 'Dashboard';
      case '/calls': return 'Live Call';
      case '/history': return 'Call History';
      case '/contacts': return 'Trusted Contacts';
      case '/analytics': return 'Threat Analytics';
      case '/settings': return 'Settings';
      default: return 'Dashboard';
    }
  };

  // Get user initials for avatar
  const getUserInitials = () => {
    if (!user || !user.name) return 'VS';
    return user.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
  };

  const isAuthPage = location.pathname === '/login' || location.pathname === '/register' || location.pathname === '/';

  if (!user && !isAuthPage) {
    return <Navigate to="/login" replace />;
  }

  if (isAuthPage && user) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <div className="app-shell">
      {!isAuthPage && (
        <aside className="app-sidebar">
          <div className="sidebar-brand">
            <div className="brand-logo-container">
              <span className="brand-logo-letter">V</span>
            </div>
            <div className="brand-text">
              <h1 className="brand-name">VoiceShield</h1>
              <p className="brand-tagline">AI CALL DEFENSE</p>
            </div>
          </div>

          <nav className="sidebar-nav">
            <NavLink to="/dashboard" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
              <LayoutDashboard size={18} />
              <span>Dashboard</span>
            </NavLink>
            <NavLink to="/calls" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
              <Phone size={18} />
              <span>Live Call</span>
              <span className="nav-dot-active" />
            </NavLink>
            <NavLink to="/history" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
              <Clock size={18} />
              <span>Call History</span>
            </NavLink>
            <NavLink to="/contacts" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
              <Shield size={18} />
              <span>Trusted Contacts</span>
            </NavLink>
            <NavLink to="/analytics" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
              <BarChart3 size={18} />
              <span>Threat Analytics</span>
            </NavLink>
            <NavLink to="/settings" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
              <SettingsIcon size={18} />
              <span>Settings</span>
            </NavLink>
          </nav>

          <div className="sidebar-footer">
            <div className="protection-card">
              <div className="protection-card-header">
                <span className="pulsing-green-dot" />
                <span className="protection-title">Protection Active</span>
              </div>
              <p className="protection-subtext">Realtime monitoring ON</p>
            </div>
            
            <button className="logout-btn" onClick={handleLogout}>
              <LogOut size={16} />
              <span>Log Out</span>
            </button>
            <div className="prototype-footer">VoiceShield Prototype - v0.1</div>
          </div>
        </aside>
      )}

      <div className="app-main-content">
        {!isAuthPage && (
          <header className="content-header">
            <div className="header-left">
              <p className="header-eyebrow">PERSONAL SECURITY CONSOLE</p>
              <h2 className="header-title">{getPageTitle()}</h2>
            </div>
            <div className="header-right">
              {backendOnline === true ? (
                <div className="connection-status online">
                  <span className="status-dot" />
                  <span>Backend connected</span>
                </div>
              ) : backendOnline === false ? (
                <div className="connection-status offline">
                  <span className="status-dot" />
                  <span>Backend disconnected</span>
                </div>
              ) : (
                <div className="connection-status checking">
                  <span className="status-dot" />
                  <span>Checking...</span>
                </div>
              )}

              <div className="notification-bell">
                <ShieldAlert size={18} />
                <span className="notification-badge">3</span>
              </div>

              <div className="user-profile-badge">
                {getUserInitials()}
              </div>
            </div>
          </header>
        )}

        <main className={`page-body ${isAuthPage ? 'auth-mode' : ''}`}>
          <Routes>
            <Route path="/" element={<Navigate to="/login" replace />} />
            <Route path="/login" element={<Login onLoginSuccess={handleLoginSuccess} />} />
            <Route path="/register" element={<Register />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/contacts" element={<Contacts />} />
            <Route path="/calls" element={<Call currentUser={user} />} />
            <Route path="/history" element={<CallHistory />} />
            <Route path="/analytics" element={<ThreatAnalytics />} />
            <Route path="/settings" element={<Settings backendOnline={backendOnline} />} />
          </Routes>
        </main>
      </div>
    </div>
  );
}

export default App;
