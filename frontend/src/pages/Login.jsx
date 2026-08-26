import { useState } from 'react';
import { Link } from 'react-router-dom';
import { loginUser } from '../services/api';
import './Auth.css';

function Login({ onLoginSuccess }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!username || !password) {
      setError('Please fill in all fields.');
      return;
    }
    setError('');
    setLoading(true);
    try {
      const data = await loginUser(username, password);
      if (data.user) {
        onLoginSuccess(data.user);
      } else {
        setError('Login failed: Invalid server response');
      }
    } catch (err) {
      setError(err.message || 'Invalid username or password');
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
          <h2 className="auth-title">Sign in</h2>
          <p className="auth-subtitle">Monitor calls and keep conversations safer.</p>
        </div>

        {error && <div className="auth-alert error">{error}</div>}

        <form onSubmit={handleSubmit} className="auth-form">
          <div className="form-group">
            <label className="form-label">Name or Email</label>
            <input 
              type="text" 
              className="form-input"
              placeholder="Enter your name or email" 
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              disabled={loading}
            />
          </div>

          <div className="form-group">
            <label className="form-label">Password</label>
            <input 
              type="password" 
              className="form-input"
              placeholder="Your password" 
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={loading}
            />
          </div>

          <button type="submit" className="auth-btn" disabled={loading}>
            {loading ? 'Signing in...' : 'Sign in'}
          </button>
        </form>

        <div className="auth-footer">
          New here? <Link to="/register" className="auth-link">Create an account</Link>
        </div>
      </div>
    </div>
  );
}

export default Login;
