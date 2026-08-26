import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { RefreshCw, UserPlus, ShieldAlert, Check, Plus, X } from 'lucide-react';
import './Contacts.css';

const INITIAL_CONTACTS = [
  { id: '1', name: 'Rahul Kumar', relation: 'Family', phone: '+91 98765 43210' },
  { id: '2', name: 'Priya Sharma', relation: 'Family', phone: '+91 88888 11117' },
  { id: '3', name: 'Aman Verma', relation: 'Friend', phone: '+91 99999 55504' },
  { id: '4', name: 'Dr. Mehta', relation: 'Doctor', phone: '+91 98111 22233' },
  { id: '5', name: 'Neha Singh', relation: 'Work', phone: '+91 98777 66655' },
  { id: '6', name: 'Mom', relation: 'Family', phone: '+91 98000 11122' }
];

function Contacts() {
  const navigate = useNavigate();
  const [contacts, setContacts] = useState(INITIAL_CONTACTS);
  const [showModal, setShowModal] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  
  // New contact form inputs
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newRelation, setNewRelation] = useState('Family');

  const handleCall = (phone) => {
    navigate(`/calls?phone=${encodeURIComponent(phone)}`);
  };

  const handleSync = () => {
    setSyncing(true);
    setSuccessMsg('');
    setTimeout(() => {
      setSyncing(false);
      setSuccessMsg('Google contacts synchronized successfully.');
      setTimeout(() => setSuccessMsg(''), 4000);
    }, 2000);
  };

  const handleAddContactSubmit = (e) => {
    e.preventDefault();
    if (!newName || !newPhone) return;

    const newContact = {
      id: String(contacts.length + 1),
      name: newName,
      phone: newPhone,
      relation: newRelation
    };

    setContacts([...contacts, newContact]);
    setNewName('');
    setNewPhone('');
    setNewRelation('Family');
    setShowModal(false);

    setSuccessMsg(`Contact "${newName}" added successfully.`);
    setTimeout(() => setSuccessMsg(''), 4000);
  };

  return (
    <section className="contacts-page-container">
      <div className="contacts-header-row">
        <div className="header-title-section">
          <span className="contacts-subtitle">TRUST LAYER</span>
          <h2 className="contacts-title">Trusted contacts</h2>
          <p className="contacts-desc">People you trust get an extra verification path.</p>
        </div>
        <div className="header-actions-section">
          <button className={`sync-contacts-btn ${syncing ? 'sync-active' : ''}`} onClick={handleSync} disabled={syncing}>
            <RefreshCw size={14} className={syncing ? 'spin' : ''} />
            <span>{syncing ? 'Syncing...' : 'Sync Google Contacts'}</span>
          </button>
          <button className="add-contact-btn" onClick={() => setShowModal(true)}>
            <Plus size={16} />
            <span>Add contact</span>
          </button>
        </div>
      </div>

      {successMsg && <div className="toast-success-msg">{successMsg}</div>}

      <div className="contacts-grid-list">
        {contacts.map((contact) => (
          <div key={contact.id} className="contact-premium-card" onClick={() => handleCall(contact.phone)}>
            <div className="card-left">
              <div className="contact-avatar-wrapper">
                <span className="avatar-initials">
                  {contact.name.split(' ').map(n => n[0]).join('').toUpperCase()}
                </span>
                <div className="avatar-check-badge">
                  <Check size={10} strokeWidth={3} />
                </div>
              </div>
              <div className="contact-details-group">
                <span className="contact-full-name">{contact.name}</span>
                <span className="contact-relation-tag">{contact.relation}</span>
              </div>
            </div>
            <div className="card-right">
              <span className="trusted-badge-pill">TRUSTED</span>
            </div>
          </div>
        ))}
      </div>

      {/* Add Contact Modal Dialog */}
      {showModal && (
        <div className="modal-overlay">
          <div className="modal-content-card">
            <div className="modal-header">
              <h3>Add Trusted Contact</h3>
              <button className="modal-close-btn" onClick={() => setShowModal(false)}>
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleAddContactSubmit} className="modal-form">
              <div className="modal-form-group">
                <label>Full Name</label>
                <input 
                  type="text" 
                  placeholder="e.g. Aman Verma" 
                  value={newName} 
                  onChange={(e) => setNewName(e.target.value)} 
                  required
                />
              </div>
              <div className="modal-form-group">
                <label>Mobile Number</label>
                <input 
                  type="tel" 
                  placeholder="e.g. +91 99999 55504" 
                  value={newPhone} 
                  onChange={(e) => setNewPhone(e.target.value)} 
                  required
                />
              </div>
              <div className="modal-form-group">
                <label>Relationship Category</label>
                <select value={newRelation} onChange={(e) => setNewRelation(e.target.value)}>
                  <option value="Family">Family</option>
                  <option value="Friend">Friend</option>
                  <option value="Doctor">Doctor</option>
                  <option value="Work">Work</option>
                </select>
              </div>
              <button type="submit" className="modal-submit-btn">Save Contact</button>
            </form>
          </div>
        </div>
      )}
    </section>
  );
}

export default Contacts;
