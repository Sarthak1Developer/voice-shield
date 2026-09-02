import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { confirmVerifiedProfile } from '../services/api';

function parseJwt(token) {
  try {
    const base64Url = token.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
    return JSON.parse(jsonPayload);
  } catch (e) {
    return null;
  }
}

function VerifySuccess({ onLoginSuccess }) {
  const navigate = useNavigate();
  const [redirecting, setRedirecting] = useState(true);

  useEffect(() => {
    async function processVerification() {
      try {
        // 1. Check URL hash for access token (standard Supabase redirect format)
        const hash = window.location.hash.substring(1);
        const hashParams = new URLSearchParams(hash);
        const searchParams = new URLSearchParams(window.location.search);

        const accessToken = hashParams.get('access_token') || searchParams.get('access_token');
        const pendingDataStr = localStorage.getItem('voiceshield_pending_registration');
        const pendingData = pendingDataStr ? JSON.parse(pendingDataStr) : null;

        let userId = '';
        let email = '';
        let name = '';
        let phone = '';

        if (accessToken) {
          const payload = parseJwt(accessToken);
          if (payload) {
            userId = payload.sub || '';
            email = payload.email || '';
            const meta = payload.user_metadata || {};
            name = meta.name || '';
            phone = meta.phone || '';
          }
        }

        // Fallback to pending registration details if metadata was empty
        if (pendingData) {
          if (!email && pendingData.email) email = pendingData.email;
          if (!name && pendingData.name) name = pendingData.name;
          if (!phone && pendingData.phone) phone = pendingData.phone;
        }

        if (!userId) {
          userId = pendingData?.id || `user_${Date.now()}`;
        }
        if (!email) {
          email = pendingData?.email || 'user@voiceshield.internal';
        }
        if (!name) {
          name = pendingData?.name || email.split('@')[0];
        }

        // Ensure user profile is registered/confirmed in backend & database
        try {
          await confirmVerifiedProfile(userId, email, name, phone);
        } catch (err) {
          console.warn('Profile sync notice:', err);
        }

        const userData = {
          id: userId,
          name: name,
          email: email,
          phone: phone,
          verified: true,
        };

        // Persist session to local storage
        localStorage.setItem('voiceshield_user', JSON.stringify(userData));
        localStorage.removeItem('voiceshield_pending_registration');

        if (onLoginSuccess) {
          onLoginSuccess(userData);
        }

        // Redirect to dashboard after brief reading delay
        const timer = setTimeout(() => {
          navigate('/dashboard', { replace: true });
        }, 1800);

        return () => clearTimeout(timer);
      } catch (err) {
        console.error('Error handling verification callback:', err);
        const timer = setTimeout(() => {
          navigate('/dashboard', { replace: true });
        }, 2000);
        return () => clearTimeout(timer);
      }
    }

    processVerification();
  }, [navigate, onLoginSuccess]);

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100vw',
        height: '100vh',
        backgroundColor: '#ffffff',
        color: '#111827',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
        boxSizing: 'border-box',
        zIndex: 999999,
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
      }}
    >
      <h1
        style={{
          fontSize: '22px',
          fontWeight: '500',
          color: '#111827',
          textAlign: 'center',
          maxWidth: '680px',
          lineHeight: '1.6',
          letterSpacing: '-0.01em',
          margin: 0,
        }}
      >
        You have successfully registered we are redirecting you to the original site
      </h1>
    </div>
  );
}

export default VerifySuccess;
