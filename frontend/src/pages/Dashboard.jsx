import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Phone, User, Wifi, WifiOff } from 'lucide-react';
import { checkHealth } from '../services/api';
import './Dashboard.css';

const CONTACTS = [
  { id: '1', name: 'Amit', initial: 'A', status: 'Trusted' },
  { id: '2', name: 'Rahul', initial: 'R', status: 'Trusted' },
  { id: '3', name: 'Priya', initial: 'P', status: 'Trusted' },
];

function Dashboard() {
  const navigate = useNavigate();
  const [backendOnline, setBackendOnline] = useState(null);

  useEffect(() => {
    let active = true;
    async function verifyHealth() {
      const isOnline = await checkHealth();
      if (active) {
        setBackendOnline(isOnline);
      }
    }
    verifyHealth();
    
    // Poll health status every 5 seconds
    const interval = setInterval(verifyHealth, 5000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, []);

  const handleCall = (contactName) => {
    navigate(`/calls?contact=${encodeURIComponent(contactName)}`);
  };

  return (
    <section className="dashboard-page-container">
      {/* Top Banner for Backend Status */}
      <div className="status-banner">
        {backendOnline === true ? (
          <div className="health-badge online">
            <Wifi className="badge-icon pulse" size={16} />
            <span>VoiceShield Backend Online</span>
          </div>
        ) : backendOnline === false ? (
          <div className="health-badge offline">
            <WifiOff className="badge-icon" size={16} />
            <span>VoiceShield Backend Offline</span>
          </div>
        ) : (
          <div className="health-badge checking">
            <div className="spinner-dot" />
            <span>Connecting to backend...</span>
          </div>
        )}
      </div>

      <div className="dashboard-welcome">
        <h1 className="welcome-title">Welcome back</h1>
        <p className="welcome-subtitle">Stay protected against voice spoofing and deepfakes.</p>
      </div>

      {/* Stats Cards Section */}
      <div className="stats-row">
        <div className="stat-card">
          <div className="stat-value">12 Calls</div>
          <div className="stat-label">Total Monitored</div>
        </div>
        <div className="stat-card alert-card">
          <div className="stat-value">2 Alerts</div>
          <div className="stat-label">Flagged Issues</div>
        </div>
        <div className="stat-card risk-card">
          <div className="stat-value">Risk: Low</div>
          <div className="stat-label">System Health</div>
        </div>
      </div>

      {/* Contacts List Section */}
      <div className="contacts-section">
        <div className="contacts-header">
          <h2>Contacts</h2>
        </div>
        
        <div className="contacts-list">
          {CONTACTS.map((contact) => (
            <div key={contact.id} className="contact-row">
              <div className="contact-info">
                <div className="contact-avatar">
                  <User size={18} className="avatar-icon" />
                </div>
                <div className="contact-details">
                  <span className="contact-name">{contact.name}</span>
                  <span className="contact-trust">{contact.status}</span>
                </div>
              </div>
              
              <button 
                type="button" 
                className="call-action-button" 
                onClick={() => handleCall(contact.name)}
              >
                <Phone size={14} className="phone-icon-button" />
                <span>Call</span>
              </button>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export default Dashboard;
