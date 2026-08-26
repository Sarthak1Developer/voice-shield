import { useNavigate } from 'react-router-dom';
import { Phone, UserPlus, UserCheck, ShieldCheck } from 'lucide-react';
import './Contacts.css';

const CONTACTS = [
  { id: '1', name: 'Amit', email: 'amit@voiceshield.internal', trustLevel: 'Highly Trusted', status: 'Secure' },
  { id: '2', name: 'Rahul', email: 'rahul@voiceshield.internal', trustLevel: 'Trusted', status: 'Secure' },
  { id: '3', name: 'Priya', email: 'priya@voiceshield.internal', trustLevel: 'Highly Trusted', status: 'Secure' },
];

function Contacts() {
  const navigate = useNavigate();

  const handleCall = (contactName) => {
    navigate(`/calls?contact=${encodeURIComponent(contactName)}`);
  };

  return (
    <section className="contacts-page-container">
      <div className="contacts-header-row">
        <div>
          <p className="eyebrow">Directory</p>
          <h1 className="contacts-title">Trusted Contacts</h1>
          <p className="contacts-desc">Manage verified profiles and initiate secure monitored voice sessions.</p>
        </div>
        <button type="button" className="add-contact-btn">
          <UserPlus size={16} />
          <span>Add Contact</span>
        </button>
      </div>

      <div className="contacts-grid-list">
        {CONTACTS.map((contact) => (
          <div key={contact.id} className="contact-card">
            <div className="contact-card-main">
              <div className="contact-avatar-badge">
                <span className="avatar-text">{contact.name[0]}</span>
                <ShieldCheck size={14} className="shield-trust-badge" />
              </div>
              <div className="contact-card-info">
                <h3>{contact.name}</h3>
                <span className="contact-email">{contact.email}</span>
                <div className="trust-indicator">
                  <UserCheck size={12} />
                  <span>{contact.trustLevel}</span>
                </div>
              </div>
            </div>
            
            <div className="contact-card-footer">
              <span className="security-status-label">{contact.status}</span>
              <button 
                type="button" 
                className="contact-call-btn"
                onClick={() => handleCall(contact.name)}
              >
                <Phone size={14} />
                <span>Call</span>
              </button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

export default Contacts;
