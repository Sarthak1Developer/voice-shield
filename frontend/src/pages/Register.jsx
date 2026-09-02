import { useState } from 'react';
import { Link } from 'react-router-dom';
import { registerUser, sendEmailVerification } from '../services/api';
import './Auth.css';

function Register() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [countryCode, setCountryCode] = useState('+91');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [verifyingEmail, setVerifyingEmail] = useState(false);
  const [emailVerificationSent, setEmailVerificationSent] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handleVerifyEmail = async () => {
    if (!email || !email.includes('@')) {
      setError('Please enter a valid email address first.');
      return;
    }
    setError('');
    setSuccess('');
    setVerifyingEmail(true);

    try {
      const phone = phoneNumber ? `${countryCode} ${phoneNumber.trim()}` : '';
      // Store pending form inputs so they can be restored upon verification redirect
      localStorage.setItem('voiceshield_pending_registration', JSON.stringify({
        name,
        email,
        phone,
        password
      }));

      const redirectUrl = `${window.location.origin}/verify-success`;
      const res = await sendEmailVerification(email, name, phone, redirectUrl);
      setEmailVerificationSent(true);
      setSuccess(res.message || `Verification link sent to ${email}! Please check your email.`);
    } catch (err) {
      setError(err.message || 'Failed to send verification email.');
    } finally {
      setVerifyingEmail(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name || !email || !phoneNumber || !password) {
      setError('Please fill in all fields.');
      return;
    }
    setError('');
    setSuccess('');
    setLoading(true);
    try {
      const phone = `${countryCode} ${phoneNumber.trim()}`;
      await registerUser(name, email, phone, password);
      setSuccess('Account created successfully! You can now sign in.');
      setName('');
      setEmail('');
      setPhoneNumber('');
      setPassword('');
    } catch (err) {
      setError(err.message || 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-container">
      <div className="auth-card">
        <div className="auth-brand">
          <div className="auth-logo">V</div>
          <span className="auth-brand-name">VoiceShield</span>
        </div>

        <div className="auth-header">
          <h2 className="auth-title">Create account</h2>
          <p className="auth-subtitle">Monitor calls and keep conversations safer.</p>
        </div>

        {error && <div className="auth-alert error">{error}</div>}
        {success && <div className="auth-alert success">{success}</div>}

        <form onSubmit={handleSubmit} className="auth-form">
          <div className="form-group">
            <label className="form-label">Full Name</label>
            <input 
              type="text" 
              className="form-input"
              placeholder="Your name" 
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={loading}
            />
          </div>

          <div className="form-group">
            <label className="form-label">Email Address</label>
            <div className="email-verify-row">
              <input 
                type="email" 
                className="form-input email-input-with-btn"
                placeholder="you@example.com" 
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setEmailVerificationSent(false);
                }}
                disabled={loading || verifyingEmail}
              />
              <button 
                type="button" 
                className="verify-email-blue-btn"
                onClick={handleVerifyEmail}
                disabled={loading || verifyingEmail || !email.trim()}
              >
                {verifyingEmail ? 'Sending...' : emailVerificationSent ? 'Resend' : 'Verify'}
              </button>
            </div>
            {emailVerificationSent && (
              <p className="email-verify-hint-text">
                ✓ Verification email sent. Please check your inbox and click the link to verify.
              </p>
            )}
          </div>

          <div className="form-group">
            <label className="form-label">Mobile Number</label>
            <div className="phone-input-container">
              <select 
                className="form-input country-code-select"
                value={countryCode}
                onChange={(e) => setCountryCode(e.target.value)}
                disabled={loading}
              >
                <option value="+91">🇮🇳 +91</option>
                <option value="+1">🇺🇸 +1</option>
                <option value="+44">🇬🇧 +44</option>
                <option value="+61">🇦🇺 +61</option>
                <option value="+49">🇩🇪 +49</option>
                <option value="+33">🇫🇷 +33</option>
                <option value="+971">🇦🇪 +971</option>
                <option value="+966">🇸🇦 +966</option>
                <option value="+65">🇸🇬 +65</option>
                <option value="+81">🇯🇵 +81</option>
                <option value="+86">🇨🇳 +86</option>
                <option value="+7">🇷🇺 +7</option>
              </select>
              <input 
                type="tel" 
                className="form-input phone-number-input"
                placeholder="99999 99999" 
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                disabled={loading}
              />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Password</label>
            <input 
              type="password" 
              className="form-input"
              placeholder="Choose a password" 
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={loading}
            />
          </div>

          <button type="submit" className="auth-btn" disabled={loading}>
            {loading ? 'Creating account...' : 'Create account'}
          </button>
        </form>

        <div className="auth-footer">
          Already registered? <Link to="/login" className="auth-link">Sign in</Link>
        </div>
      </div>
    </div>
  );
}

export default Register;
