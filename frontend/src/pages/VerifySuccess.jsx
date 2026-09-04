import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { confirmVerifiedProfile, googleSignIn } from '../services/api';
import { supabase } from '../services/supabaseClient';

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
  const [statusText, setStatusText] = useState('Verifying your account...');

  useEffect(() => {
    async function processVerification() {
      try {
        // 1. Try to get a Supabase session (works for both OAuth and magic link)
        const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
        
        let userId = '';
        let email = '';
        let name = '';
        let phone = '';
        let accessToken = '';

        if (sessionData?.session) {
          // Supabase OAuth session exists (Google sign-in or magic link)
          const session = sessionData.session;
          const user = session.user;
          accessToken = session.access_token;
          
          userId = user.id || '';
          email = user.email || '';
          const meta = user.user_metadata || {};
          name = meta.full_name || meta.name || '';
          phone = meta.phone || '';

          setStatusText('Google sign-in successful! Setting up your account...');

          // Confirm profile in backend
          try {
            const result = await googleSignIn(accessToken, session.provider_token);
            if (result?.user) {
              name = result.user.name || name;
              email = result.user.email || email;
              phone = result.user.phone || phone;
            }
          } catch (err) {
            console.warn('Backend Google auth sync notice:', err);
            // Still try confirm-profile as fallback
            try {
              await confirmVerifiedProfile(userId, email, name, phone);
            } catch (e) {
              console.warn('Profile confirm fallback notice:', e);
            }
          }
        } else {
          // 2. Fallback: Check URL hash for access token (standard Supabase redirect format)
          const hash = window.location.hash.substring(1);
          const hashParams = new URLSearchParams(hash);
          const searchParams = new URLSearchParams(window.location.search);

          accessToken = hashParams.get('access_token') || searchParams.get('access_token') || '';
          const pendingDataStr = localStorage.getItem('voiceshield_pending_registration');
          const pendingData = pendingDataStr ? JSON.parse(pendingDataStr) : null;

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

          setStatusText('Email verified! Redirecting...');

          // Ensure user profile is registered/confirmed in backend & database
          try {
            await confirmVerifiedProfile(userId, email, name, phone);
          } catch (err) {
            console.warn('Profile sync notice:', err);
          }
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

        if (!phone || phone.trim() === '') {
          localStorage.setItem('voiceshield_prompt_phone', 'true');
        }

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
        setStatusText('Something went wrong. Redirecting...');
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
        {statusText}
      </h1>
    </div>
  );
}

export default VerifySuccess;
