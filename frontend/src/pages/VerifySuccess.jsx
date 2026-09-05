import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { confirmVerifiedProfile, googleSignIn } from '../services/api';
import { supabase } from '../services/supabaseClient';

/**
 * Establishes a Supabase session from the current URL.
 * Handles both implicit flow (hash tokens) and PKCE flow (code param).
 * Returns the session object or null.
 */
async function establishSession() {
  // 1. Check if a session already exists (e.g. from a previous login)
  try {
    const { data } = await supabase.auth.getSession();
    if (data?.session?.user?.id) {
      return data.session;
    }
  } catch (e) {
    console.warn('Existing session check failed:', e);
  }

  // 2. Try implicit flow: extract access_token + refresh_token from URL hash
  const hash = window.location.hash.substring(1);
  if (hash) {
    const hashParams = new URLSearchParams(hash);
    const accessToken = hashParams.get('access_token');
    const refreshToken = hashParams.get('refresh_token');

    if (accessToken && refreshToken) {
      try {
        const { data, error } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });
        if (!error && data?.session?.user?.id) {
          // Clean the hash from URL to prevent reprocessing
          window.history.replaceState(null, '', window.location.pathname + window.location.search);
          return data.session;
        }
        if (error) console.warn('setSession from hash failed:', error.message);
      } catch (e) {
        console.warn('Hash session exchange failed:', e);
      }
    }
  }

  // 3. Try PKCE flow: extract code from query params
  const searchParams = new URLSearchParams(window.location.search);
  const code = searchParams.get('code');
  if (code) {
    try {
      const { data, error } = await supabase.auth.exchangeCodeForSession(code);
      if (!error && data?.session?.user?.id) {
        // Clean the code from URL
        window.history.replaceState(null, '', window.location.pathname);
        return data.session;
      }
      if (error) console.warn('PKCE code exchange failed:', error.message);
    } catch (e) {
      console.warn('PKCE session exchange failed:', e);
    }
  }

  return null;
}

function VerifySuccess({ onLoginSuccess }) {
  const navigate = useNavigate();
  const [statusText, setStatusText] = useState('Verifying your account...');

  useEffect(() => {
    async function processVerification() {
      try {
        const session = await establishSession();

        // Also load pending manual registration data (for email signup flow)
        const pendingDataStr = localStorage.getItem('voiceshield_pending_registration');
        const pendingData = pendingDataStr ? JSON.parse(pendingDataStr) : null;

        let userId = '';
        let email = '';
        let name = '';
        let phone = '';

        if (session) {
          // ✅ Valid Supabase session (Google OAuth or magic link)
          const user = session.user;
          const meta = user.user_metadata || {};

          userId = user.id;
          email = user.email || '';
          name = meta.full_name || meta.name || '';
          phone = meta.phone || '';

          // Fill blanks from pending registration data if available
          if (pendingData) {
            if (!name && pendingData.name) name = pendingData.name;
            if (!phone && pendingData.phone) phone = pendingData.phone;
          }
          if (!name) name = email.split('@')[0];

          setStatusText('Sign-in successful! Setting up your account...');

          // Insert into Supabase profiles table directly
          try {
            const { error: upsertError } = await supabase.from('profiles').upsert({
              id: userId,
              name: name,
              email: email,
              phone: phone || '',
              role: 'user'
            }, { onConflict: 'id' });
            if (upsertError) console.warn('Profile upsert error:', upsertError.message);
          } catch (dbErr) {
            console.warn('Profile upsert notice:', dbErr);
          }

          // Notify backend API
          try {
            const result = await googleSignIn(session.access_token, session.provider_token);
            if (result?.user) {
              name = result.user.name || name;
              phone = result.user.phone || phone;
            }
          } catch (err) {
            console.warn('Backend auth sync notice:', err.message);
            try {
              await confirmVerifiedProfile(userId, email, name, phone);
            } catch (e) {
              console.warn('Profile confirm notice:', e.message);
            }
          }

        } else if (pendingData) {
          // Manual email verification flow
          userId = pendingData.id || '';
          email = pendingData.email || '';
          name = pendingData.name || email.split('@')[0] || '';
          phone = pendingData.phone || '';

          if (!userId) {
            setStatusText('Verification incomplete. Redirecting to register...');
            setTimeout(() => navigate('/register', { replace: true }), 1500);
            return;
          }

          setStatusText('Email verified! Setting up your account...');

          try {
            await confirmVerifiedProfile(userId, email, name, phone);
          } catch (err) {
            console.warn('Profile sync notice:', err.message);
          }

        } else {
          // No session AND no pending data — nothing to work with
          setStatusText('Session expired. Redirecting to login...');
          setTimeout(() => navigate('/login', { replace: true }), 1500);
          return;
        }

        // Save user data to localStorage
        const userData = {
          id: userId,
          name: name,
          email: email,
          phone: phone || '',
          verified: true,
        };

        localStorage.setItem('voiceshield_user', JSON.stringify(userData));
        localStorage.removeItem('voiceshield_pending_registration');

        // Prompt for phone number if missing
        if (!phone || phone.trim() === '') {
          localStorage.setItem('voiceshield_prompt_phone', 'true');
        }

        if (onLoginSuccess) {
          onLoginSuccess(userData);
        }

        setStatusText('Success! Redirecting to dashboard...');
        setTimeout(() => {
          navigate('/dashboard', { replace: true });
        }, 1200);

      } catch (err) {
        console.error('Verification error:', err);
        setStatusText('Something went wrong. Redirecting...');
        setTimeout(() => navigate('/login', { replace: true }), 2000);
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
