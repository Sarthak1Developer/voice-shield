import { useState, useEffect } from 'react';
import { NavLink, Route, Routes, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { LayoutDashboard, Phone, Clock, ShieldAlert, BarChart3, Settings as SettingsIcon, LogOut, Shield, X } from 'lucide-react';
import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import Contacts from './pages/Contacts';
import Call from './pages/Call';
import CallHistory from './pages/CallHistory';
import ThreatAnalytics from './pages/ThreatAnalytics';
import Settings from './pages/Settings';
import api, { checkHealth } from './services/api';
import { CallProvider } from './context/CallContext';
import IncomingCallModal from './components/IncomingCallModal';
import ActiveCallBar from './components/ActiveCallBar';
import './App.css';

function App() {
  const navigate = useNavigate();
  const location = useLocation();
  const [user, setUser] = useState(null);
  const [backendOnline, setBackendOnline] = useState(null);
  const [alerts, setAlerts] = useState([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  
  // Profile edit inputs
  const [profileName, setProfileName] = useState('');
  const [profileEmail, setProfileEmail] = useState('');
  const [profilePhone, setProfilePhone] = useState('');
  const [profileError, setProfileError] = useState('');
  const [profileSuccess, setProfileSuccess] = useState('');
  const [updatingProfile, setUpdatingProfile] = useState(false);

  // Load user from localStorage on mount
  useEffect(() => {
    const storedUser = localStorage.getItem('voiceshield_user');
    if (storedUser) {
      setUser(JSON.parse(storedUser));
    }
  }, []);

  // Fetch alerts and sync profile inputs once user is loaded
  useEffect(() => {
    if (user) {
      api.getUserAlerts(user.id)
        .then(data => {
          setAlerts(data.map(a => ({ ...a, read: false })));
        })
        .catch(err => {
          console.warn('Failed to load user alerts from API, using default mock:', err);
        });
      
      setProfileName(user.name || '');
      setProfileEmail(user.email || '');
      setProfilePhone(user.phone || '');
    }
  }, [user]);

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

  // Click outside to close notifications dropdown
  useEffect(() => {
    if (!showNotifications) return;
    const handleOutsideClick = () => {
      setShowNotifications(false);
    };
    window.addEventListener('click', handleOutsideClick);
    return () => window.removeEventListener('click', handleOutsideClick);
  }, [showNotifications]);

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

  const handleAddAlert = (alertData) => {
    const newAlert = {
      id: alertData.id || `alert_${Date.now()}`,
      severity: alertData.severity || 'HIGH',
      message: alertData.message,
      recommendation: alertData.recommendation || 'Exercise caution',
      created_at: new Date().toISOString(),
      read: false
    };
    setAlerts(prev => [newAlert, ...prev]);
  };

  const handleEditProfileClick = () => {
    if (user) {
      setProfileName(user.name || '');
      setProfileEmail(user.email || '');
      setProfilePhone(user.phone || '');
      setProfileError('');
      setProfileSuccess('');
      setShowProfileModal(true);
    }
  };

  const handleProfileSubmit = async (e) => {
    e.preventDefault();
    if (!profileName || !profileEmail) {
      setProfileError('Name and Email are required.');
      return;
    }
    setProfileError('');
    setProfileSuccess('');
    setUpdatingProfile(true);
    try {
      const updated = await api.updateUserProfile(user.id, profileName, profileEmail, profilePhone);
      const updatedUser = { ...user, name: updated.name, email: updated.email, phone: updated.phone };
      setUser(updatedUser);
      localStorage.setItem('voiceshield_user', JSON.stringify(updatedUser));
      setProfileSuccess('Profile updated successfully!');
      setTimeout(() => setShowProfileModal(false), 1500);
    } catch (err) {
      console.warn('Backend profile update failed, fallback to local storage update:', err);
      // Fallback local storage update
      const updatedUser = { ...user, name: profileName, email: profileEmail, phone: profilePhone };
      setUser(updatedUser);
      localStorage.setItem('voiceshield_user', JSON.stringify(updatedUser));
      setProfileSuccess('Profile updated successfully (local fallback).');
      setTimeout(() => setShowProfileModal(false), 1500);
    } finally {
      setUpdatingProfile(false);
    }
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

  const unreadAlertsCount = alerts.filter(a => !a.read).length;

  return (
    <CallProvider currentUser={user} onAddAlert={handleAddAlert}>
      {/* Persistent global audio element for WebRTC audio playback across all tabs */}
      <audio id="voiceshield-remote-audio" autoPlay playsInline style={{ display: 'none' }} />
      
      {/* Global incoming call popup modal */}
      <IncomingCallModal />

      {/* Floating active call bar for non-call tabs */}
      <ActiveCallBar />

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

                <div 
                  className="notification-bell" 
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowNotifications(!showNotifications);
                  }}
                  title="Notifications"
                >
                  <ShieldAlert size={18} />
                  {unreadAlertsCount > 0 && (
                    <span className="notification-badge">{unreadAlertsCount}</span>
                  )}

                  {showNotifications && (
                    <div className="notifications-dropdown" onClick={(e) => e.stopPropagation()}>
                      <div className="notifications-dropdown-header">
                        <h3>Alert Warnings</h3>
                        {alerts.length > 0 && (
                          <button 
                            className="clear-all-alerts-btn"
                            onClick={() => setAlerts([])}
                          >
                            Clear all
                          </button>
                        )}
                      </div>
                      <div className="notifications-dropdown-list">
                        {alerts.length === 0 ? (
                          <div className="empty-alerts">
                            <p>No warning notifications</p>
                          </div>
                        ) : (
                          alerts.map((alert) => (
                            <div 
                              key={alert.id} 
                              className={`alert-dropdown-item ${alert.read ? 'read' : 'unread'} ${alert.severity.toLowerCase()}`}
                              onClick={() => {
                                setAlerts(prev => prev.map(a => a.id === alert.id ? { ...a, read: true } : a));
                              }}
                            >
                              <div className="alert-dropdown-item-header">
                                <span className={`alert-severity-badge ${alert.severity.toLowerCase()}`}>{alert.severity}</span>
                                <span className="alert-time">
                                  {new Date(alert.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </span>
                              </div>
                              <p className="alert-message">{alert.message}</p>
                              {alert.recommendation && (
                                <p className="alert-recommendation"><strong>Rec:</strong> {alert.recommendation}</p>
                              )}
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  )}
                </div>

                <div className="user-profile-badge" onClick={handleEditProfileClick} title="Edit profile info">
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
              <Route path="/contacts" element={<Contacts currentUser={user} />} />
              <Route path="/calls" element={<Call currentUser={user} onAddAlert={handleAddAlert} />} />
              <Route path="/history" element={<CallHistory />} />
              <Route path="/analytics" element={<ThreatAnalytics />} />
              <Route path="/settings" element={<Settings backendOnline={backendOnline} />} />
            </Routes>
          </main>
        </div>

        {/* Edit Profile Modal Dialog */}
        {showProfileModal && (
          <div className="modal-overlay" onClick={() => setShowProfileModal(false)}>
            <div className="modal-content-card" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h3>Edit Profile Information</h3>
                <button className="modal-close-btn" onClick={() => setShowProfileModal(false)}>
                  <X size={18} />
                </button>
              </div>
              {profileError && <div className="modal-error-alert">{profileError}</div>}
              {profileSuccess && <div className="modal-success-alert">{profileSuccess}</div>}
              
              <form onSubmit={handleProfileSubmit} className="modal-form">
                <div className="modal-form-group">
                  <label>Full Name</label>
                  <input 
                    type="text" 
                    value={profileName} 
                    onChange={(e) => setProfileName(e.target.value)} 
                    required
                    disabled={updatingProfile}
                  />
                </div>
                <div className="modal-form-group">
                  <label>Email Address</label>
                  <input 
                    type="email" 
                    value={profileEmail} 
                    onChange={(e) => setProfileEmail(e.target.value)} 
                    required
                    disabled={updatingProfile}
                  />
                </div>
                <div className="modal-form-group">
                  <label>Mobile Number</label>
                  <input 
                    type="tel" 
                    value={profilePhone} 
                    onChange={(e) => setProfilePhone(e.target.value)} 
                    disabled={updatingProfile}
                  />
                </div>
                <button 
                  type="submit" 
                  className="modal-submit-btn"
                  disabled={updatingProfile}
                >
                  {updatingProfile ? 'Saving Changes...' : 'Save Changes'}
                </button>
              </form>
            </div>
          </div>
        )}
      </div>
    </CallProvider>
  );
}

export default App;
