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

/**
 * Tries multiple methods to establish a Supabase session after OAuth redirect.
 * Returns { userId, email, name, phone, accessToken, providerToken } or null.
 */
async function resolveSupabaseSession() {
  // Method 0: Wait for Supabase to process the URL hash asynchronously
  // The onAuthStateChange fires once Supabase detects and processes the hash fragment
  const sessionFromEvent = await new Promise((resolve) => {
    const timeout = setTimeout(() => resolve(null), 3000); // Max 3s wait
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (session?.user?.id) {
        clearTimeout(timeout);
        subscription.unsubscribe();
        resolve(session);
      }
    });
    // Also check immediately in case the session is already established
    supabase.auth.getSession().then(({ data }) => {
      if (data?.session?.user?.id) {
        clearTimeout(timeout);
        subscription.unsubscribe();
        resolve(data.session);
      }
    });
  });

  if (sessionFromEvent?.user?.id) {
    const s = sessionFromEvent;
    const u = s.user;
    const meta = u.user_metadata || {};
    return {
      userId: u.id,
      email: u.email || '',
      name: meta.full_name || meta.name || '',
      phone: meta.phone || '',
      accessToken: s.access_token,
      providerToken: s.provider_token || null,
    };
  }

  // Method 1: getSession (works if Supabase auto-detected the hash)
  try {
    const { data } = await supabase.auth.getSession();
    if (data?.session?.user?.id) {
      const s = data.session;
      const u = s.user;
      const meta = u.user_metadata || {};
      return {
        userId: u.id,
        email: u.email || '',
        name: meta.full_name || meta.name || '',
        phone: meta.phone || '',
        accessToken: s.access_token,
        providerToken: s.provider_token || null,
      };
    }
  } catch (e) {
    console.warn('getSession attempt failed:', e);
  }

  // Method 2: Manually extract tokens from URL hash and set session
  const hash = window.location.hash.substring(1);
  const hashParams = new URLSearchParams(hash);
  const accessToken = hashParams.get('access_token');
  const refreshToken = hashParams.get('refresh_token');
  const providerToken = hashParams.get('provider_token');

  if (accessToken && refreshToken) {
    try {
      const { data, error } = await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      });
      if (!error && data?.session?.user?.id) {
        const s = data.session;
        const u = s.user;
        const meta = u.user_metadata || {};
        return {
          userId: u.id,
          email: u.email || '',
          name: meta.full_name || meta.name || '',
          phone: meta.phone || '',
          accessToken: s.access_token,
          providerToken: providerToken || s.provider_token || null,
        };
      }
    } catch (e) {
      console.warn('setSession attempt failed:', e);
    }
  }

  // Method 3: Parse the JWT directly to extract user info (last resort but still gets real UUID)
  if (accessToken) {
    const payload = parseJwt(accessToken);
    if (payload?.sub) {
      return {
        userId: payload.sub,
        email: payload.email || '',
        name: payload.user_metadata?.full_name || payload.user_metadata?.name || '',
        phone: payload.user_metadata?.phone || '',
        accessToken: accessToken,
        providerToken: providerToken || null,
      };
    }
  }

  // Method 4: Check query params (some Supabase configurations use query params)
  const searchParams = new URLSearchParams(window.location.search);
  const queryAccessToken = searchParams.get('access_token');
  if (queryAccessToken) {
    const payload = parseJwt(queryAccessToken);
    if (payload?.sub) {
      return {
        userId: payload.sub,
        email: payload.email || '',
        name: payload.user_metadata?.full_name || payload.user_metadata?.name || '',
        phone: payload.user_metadata?.phone || '',
        accessToken: queryAccessToken,
        providerToken: null,
      };
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
        // Try to resolve a proper Supabase session (with real UUID)
        const session = await resolveSupabaseSession();

        // Check for pending manual registration data
        const pendingDataStr = localStorage.getItem('voiceshield_pending_registration');
        const pendingData = pendingDataStr ? JSON.parse(pendingDataStr) : null;

        let userId, email, name, phone;

        if (session) {
          // We have a valid Supabase session with a real UUID
          userId = session.userId;
          email = session.email;
          name = session.name;
          phone = session.phone;

          // Fill in any blanks from pending registration data
          if (pendingData) {
            if (!name && pendingData.name) name = pendingData.name;
            if (!phone && pendingData.phone) phone = pendingData.phone;
          }
          if (!name) name = email.split('@')[0];

          setStatusText('Sign-in successful! Setting up your account...');

          // Ensure profile exists in Supabase profiles table (direct insert)
          try {
            const { error: upsertError } = await supabase.from('profiles').upsert({
              id: userId,
              name: name,
              email: email,
              phone: phone || '',
              role: 'user'
            }, { onConflict: 'id' });
            if (upsertError) {
              console.warn('Profile upsert error:', upsertError);
            }
          } catch (dbErr) {
            console.warn('Direct Supabase profile upsert notice:', dbErr);
          }

          // Also notify backend
          try {
            const result = await googleSignIn(session.accessToken, session.providerToken);
            if (result?.user) {
              name = result.user.name || name;
              phone = result.user.phone || phone;
            }
          } catch (err) {
            console.warn('Backend auth sync notice:', err);
            try {
              await confirmVerifiedProfile(userId, email, name, phone);
            } catch (e) {
              console.warn('Profile confirm fallback notice:', e);
            }
          }
        } else if (pendingData?.id) {
          // Manual email verification flow — use pending registration data
          userId = pendingData.id;
          email = pendingData.email || '';
          name = pendingData.name || email.split('@')[0];
          phone = pendingData.phone || '';

          setStatusText('Email verified! Redirecting...');

          try {
            await confirmVerifiedProfile(userId, email, name, phone);
          } catch (err) {
            console.warn('Profile sync notice:', err);
          }
        } else {
          // No session and no pending data — redirect to login
          console.error('No valid session or pending data found');
          setStatusText('Session expired. Redirecting to login...');
          setTimeout(() => navigate('/login', { replace: true }), 1500);
          return;
        }

        const userData = {
          id: userId,
          name: name,
          email: email,
          phone: phone || '',
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

        // Redirect to dashboard after brief delay
        const timer = setTimeout(() => {
          navigate('/dashboard', { replace: true });
        }, 1800);

        return () => clearTimeout(timer);
      } catch (err) {
        console.error('Error handling verification callback:', err);
        setStatusText('Something went wrong. Redirecting...');
        const timer = setTimeout(() => {
          navigate('/login', { replace: true });
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
