import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { RefreshCw, Check, Plus, X, Trash2, Mail, ShieldAlert } from 'lucide-react';
import api from '../services/api';
import './Contacts.css';

function Contacts({ currentUser }) {
  const navigate = useNavigate();
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showGoogleModal, setShowGoogleModal] = useState(false);
  
  // Google Auth Simulation states
  const [googleStep, setGoogleStep] = useState(1); // 1 = Email input, 2 = Password/Consent, 3 = Loading/Success
  const [googleEmail, setGoogleEmail] = useState('');
  const [consentGranted, setConsentGranted] = useState(true);
  
  // Sync state
  const [syncing, setSyncing] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  
  // New contact form inputs
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newRelation, setNewRelation] = useState('Family');

  const userId = currentUser?.id || 'default_user';

  // Load contacts on mount
  useEffect(() => {
    fetchContacts();
  }, [userId]);

  const fetchContacts = async () => {
    setLoading(true);
    setErrorMsg('');
    try {
      const data = await api.getContacts(userId);
      setContacts(data);
    } catch (err) {
      console.warn('Backend contacts endpoint failed, loading from local cache:', err.message);
      // Fallback local storage
      const cached = localStorage.getItem(`voiceshield_contacts_${userId}`);
      if (cached) {
        setContacts(JSON.parse(cached));
      } else {
        setContacts([]);
      }
    } finally {
      setLoading(false);
    }
  };

  const saveContactsCache = (updatedContacts) => {
    localStorage.setItem(`voiceshield_contacts_${userId}`, JSON.stringify(updatedContacts));
  };

  const handleCall = (phone) => {
    navigate(`/calls?phone=${encodeURIComponent(phone)}`);
  };

  const handleDeleteContact = async (contactId) => {
    setErrorMsg('');
    try {
      await api.deleteContact(contactId);
      const updated = contacts.filter(c => c.id !== contactId);
      setContacts(updated);
      saveContactsCache(updated);
      setSuccessMsg('Contact removed successfully.');
      setTimeout(() => setSuccessMsg(''), 3000);
    } catch (err) {
      console.warn('Backend delete contact failed, updating local cache only:', err.message);
      // Local fallback
      const updated = contacts.filter(c => c.id !== contactId);
      setContacts(updated);
      saveContactsCache(updated);
      setSuccessMsg('Contact removed successfully (local).');
      setTimeout(() => setSuccessMsg(''), 3000);
    }
  };

  const handleAddContactSubmit = async (e) => {
    e.preventDefault();
    if (!newName || !newPhone) return;
    setErrorMsg('');

    const contactData = {
      name: newName,
      phone: newPhone,
      relation: newRelation
    };

    try {
      const saved = await api.addContact(userId, newName, newPhone, newRelation);
      const updated = [...contacts, saved];
      setContacts(updated);
      saveContactsCache(updated);
      setSuccessMsg(`Contact "${newName}" added successfully.`);
      setTimeout(() => setSuccessMsg(''), 4000);
    } catch (err) {
      console.warn('Backend add contact failed, saving to local cache only:', err.message);
      // Local mock fallback
      const localSaved = {
        id: `local_${Date.now()}`,
        ...contactData,
        created_at: new Date().toISOString()
      };
      const updated = [...contacts, localSaved];
      setContacts(updated);
      saveContactsCache(updated);
      setSuccessMsg(`Contact "${newName}" added successfully (local).`);
      setTimeout(() => setSuccessMsg(''), 4000);
    }

    setNewName('');
    setNewPhone('');
    setNewRelation('Family');
    setShowAddModal(false);
  };

  const triggerGoogleAuthSync = async () => {
    if (!googleEmail || !consentGranted) return;
    setSyncing(true);
    setErrorMsg('');
    
    // Perform mock sync with backend
    try {
      const response = await api.syncGoogleContacts(userId, googleEmail, `mock_google_token_${Date.now()}`);
      setContacts(response.contacts);
      saveContactsCache(response.contacts);
      setGoogleStep(3);
      setTimeout(() => {
        setShowGoogleModal(false);
        setGoogleStep(1);
        setGoogleEmail('');
        setSuccessMsg(response.message || 'Google contacts synchronized successfully.');
        setTimeout(() => setSuccessMsg(''), 4000);
      }, 1500);
    } catch (err) {
      console.warn('Backend sync Google contacts failed, simulating local sync:', err.message);
      // Mock local sync fallback
      setTimeout(() => {
        const prefix = googleEmail.split("@")[0].toUpperCase();
        const syncedMock = [
          ...contacts,
          { id: `g1_${Date.now()}`, name: `${prefix}'s Dad`, phone: '+91 98989 12345', relation: 'Family' },
          { id: `g2_${Date.now()}`, name: `${prefix}'s Sister`, phone: '+91 98888 54321', relation: 'Family' },
          { id: `g3_${Date.now()}`, name: 'Riya Sen', phone: '+91 95555 44433', relation: 'Friend' },
          { id: `g4_${Date.now()}`, name: 'Aarav Sharma', phone: '+91 96666 77788', relation: 'Friend' }
        ];
        
        // Remove duplicates based on phone
        const uniqueContacts = [];
        const seenPhones = new Set();
        syncedMock.forEach(c => {
          if (!seenPhones.has(c.phone)) {
            seenPhones.add(c.phone);
            uniqueContacts.push(c);
          }
        });

        setContacts(uniqueContacts);
        saveContactsCache(uniqueContacts);
        setGoogleStep(3);
        
        setTimeout(() => {
          setShowGoogleModal(false);
          setGoogleStep(1);
          setGoogleEmail('');
          setSuccessMsg('Google contacts synchronized successfully (local fallback).');
          setTimeout(() => setSuccessMsg(''), 4000);
        }, 1500);
      }, 1500);
    } finally {
      setSyncing(false);
    }
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
          <button 
            className="sync-contacts-btn" 
            onClick={() => {
              setGoogleStep(1);
              setGoogleEmail(currentUser?.email || '');
              setShowGoogleModal(true);
            }}
          >
            <RefreshCw size={14} />
            <span>Sync Google Contacts</span>
          </button>
          <button className="add-contact-btn" onClick={() => setShowAddModal(true)}>
            <Plus size={16} />
            <span>Add contact</span>
          </button>
        </div>
      </div>

      {successMsg && <div className="toast-success-msg">{successMsg}</div>}
      {errorMsg && <div className="toast-error-msg">{errorMsg}</div>}

      {loading ? (
        <div className="contacts-loading">Loading contacts...</div>
      ) : contacts.length === 0 ? (
        <div className="no-contacts-card">
          <ShieldAlert size={36} className="no-contacts-icon" />
          <h3>No Trusted Contacts</h3>
          <p>Add contacts manually or sync with Google Contacts to build your security registry.</p>
        </div>
      ) : (
        <div className="contacts-grid-list">
          {contacts.map((contact) => (
            <div key={contact.id} className="contact-premium-card" onClick={() => handleCall(contact.phone)}>
              <div className="card-left">
                <div className="contact-avatar-wrapper">
                  <span className="avatar-initials">
                    {contact.name ? contact.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase() : 'C'}
                  </span>
                  <div className="avatar-check-badge">
                    <Check size={10} strokeWidth={3} />
                  </div>
                </div>
                <div className="contact-details-group">
                  <span className="contact-full-name">{contact.name}</span>
                  <span className="contact-relation-tag">{contact.relation || 'Friend'}</span>
                </div>
              </div>
              <div className="card-right">
                <span className="trusted-badge-pill">TRUSTED</span>
                <button 
                  className="delete-contact-btn" 
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDeleteContact(contact.id);
                  }}
                  title="Remove from Trusted List"
                >
                  <Trash2 size={15} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add Contact Modal Dialog */}
      {showAddModal && (
        <div className="modal-overlay">
          <div className="modal-content-card">
            <div className="modal-header">
              <h3>Add Trusted Contact</h3>
              <button className="modal-close-btn" onClick={() => setShowAddModal(false)}>
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

      {/* Google Sign-In & Sync Modal */}
      {showGoogleModal && (
        <div className="modal-overlay">
          <div className="google-auth-card">
            <div className="google-auth-header">
              <div className="google-logo-wrapper">
                <svg className="google-svg-logo" viewBox="0 0 24 24" width="24" height="24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                </svg>
                <span className="google-logo-text">Google</span>
              </div>
              <button className="google-close-btn" onClick={() => setShowGoogleModal(false)}>
                <X size={16} />
              </button>
            </div>

            {googleStep === 1 && (
              <div className="google-step-container">
                <h2 className="google-title">Sign in with Google</h2>
                <p className="google-subtitle">to continue to VoiceShield Contact Sync</p>
                
                <div className="google-input-group">
                  <input 
                    type="email" 
                    placeholder="Email or phone" 
                    value={googleEmail}
                    onChange={(e) => setGoogleEmail(e.target.value)}
                    required
                    className="google-input"
                  />
                  <div className="google-link-text">Forgot email?</div>
                </div>

                <p className="google-disclosure">
                  To continue, Google will share your name, email address, language preference, and profile picture with VoiceShield.
                </p>

                <div className="google-actions-row">
                  <div className="google-link-text">Create account</div>
                  <button 
                    className="google-btn-primary" 
                    onClick={() => {
                      if (googleEmail) setGoogleStep(2);
                    }}
                    disabled={!googleEmail}
                  >
                    Next
                  </button>
                </div>
              </div>
            )}

            {googleStep === 2 && (
              <div className="google-step-container">
                <h2 className="google-title">VoiceShield wants to access your Google Account</h2>
                <div className="google-account-pill">
                  <Mail size={14} />
                  <span>{googleEmail}</span>
                </div>

                <div className="google-permission-box">
                  <p className="permission-heading">Select what VoiceShield can access:</p>
                  <label className="google-checkbox-label">
                    <input 
                      type="checkbox" 
                      checked={consentGranted} 
                      onChange={(e) => setConsentGranted(e.target.checked)} 
                    />
                    <div className="checkbox-text-wrapper">
                      <strong>View your Google Contacts</strong>
                      <p>Allows VoiceShield to fetch names, numbers, and relationships to add them to your trust dashboard.</p>
                    </div>
                  </label>
                </div>

                <div className="google-actions-row border-top">
                  <button className="google-btn-flat" onClick={() => setGoogleStep(1)}>Cancel</button>
                  <button 
                    className="google-btn-primary" 
                    onClick={triggerGoogleAuthSync}
                    disabled={!consentGranted || syncing}
                  >
                    {syncing ? 'Syncing...' : 'Allow & Sync'}
                  </button>
                </div>
              </div>
            )}

            {googleStep === 3 && (
              <div className="google-step-container centering">
                <div className="google-sync-spinner">
                  <RefreshCw className="spin" size={32} />
                </div>
                <h3 className="sync-success-heading">Syncing your contacts...</h3>
                <p className="sync-success-sub">Connecting secure channels to import trust network</p>
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

export default Contacts;
