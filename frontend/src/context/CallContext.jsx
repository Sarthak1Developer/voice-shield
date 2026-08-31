import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { API_BASE } from '../services/api';

const CallContext = createContext(null);

const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun3.l.google.com:19302' },
    { urls: 'stun:stun4.l.google.com:19302' },
  ],
};

export function CallProvider({ children, currentUser, onAddAlert }) {
  // Call state: 'idle' | 'dialing' | 'ringing' | 'connected' | 'offline'
  const [callState, setCallState] = useState('idle');
  const [isIncomingCall, setIsIncomingCall] = useState(false);
  const [incomingCallData, setIncomingCallData] = useState(null);

  // Active call peer information
  const [activePeerName, setActivePeerName] = useState('');
  const [activePeerPhone, setActivePeerPhone] = useState('');

  // Call metrics
  const [duration, setDuration] = useState(0);
  const [voiceAuth, setVoiceAuth] = useState(98);
  const [speakerMatch, setSpeakerMatch] = useState(98);
  const [riskScore, setRiskScore] = useState(18);
  const [isMuted, setIsMuted] = useState(false);

  // Directory cache
  const [directory, setDirectory] = useState([]);

  // WebRTC & WebSocket references
  const wsRef = useRef(null);
  const pcRef = useRef(null);
  const localStreamRef = useRef(null);
  const remoteAudioRef = useRef(null);
  const iceCandidatesQueueRef = useRef([]);
  const initializingPcPromiseRef = useRef(null);

  const timerRef = useRef(null);
  const fluctuationRef = useRef(null);
  const alertTriggeredRef = useRef(false);
  const reconnectTimeoutRef = useRef(null);

  const myPhone = currentUser?.phone || '';
  const myName = currentUser?.name || 'Anonymous';

  // Keep references to state inside callbacks without re-triggering effects
  const callStateRef = useRef(callState);
  const isIncomingCallRef = useRef(isIncomingCall);
  const incomingCallDataRef = useRef(incomingCallData);
  const activePeerPhoneRef = useRef(activePeerPhone);
  const activePeerNameRef = useRef(activePeerName);
  const riskScoreRef = useRef(riskScore);
  const durationRef = useRef(duration);

  useEffect(() => { callStateRef.current = callState; }, [callState]);
  useEffect(() => { isIncomingCallRef.current = isIncomingCall; }, [isIncomingCall]);
  useEffect(() => { incomingCallDataRef.current = incomingCallData; }, [incomingCallData]);
  useEffect(() => { activePeerPhoneRef.current = activePeerPhone; }, [activePeerPhone]);
  useEffect(() => { activePeerNameRef.current = activePeerName; }, [activePeerName]);
  useEffect(() => { riskScoreRef.current = riskScore; }, [riskScore]);
  useEffect(() => { durationRef.current = duration; }, [duration]);

  // Lookup contact name from directory or format phone number
  const getContactNameByPhone = useCallback((phone) => {
    if (!phone) return 'Unknown';
    const contact = directory.find((c) => c.phone === phone);
    if (contact) return contact.name;
    const digits = phone.replace(/[^\d]/g, '');
    return digits.length >= 10 ? `+91 ${digits.slice(-10)}` : phone;
  }, [directory]);

  // Process any queued ICE candidates once remote description is set
  const processQueuedCandidates = async (pc) => {
    if (!pc || !pc.remoteDescription) return;
    const queue = [...iceCandidatesQueueRef.current];
    iceCandidatesQueueRef.current = [];
    for (const candidate of queue) {
      if (candidate) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (err) {
          console.warn('Error adding queued ICE candidate:', err);
        }
      }
    }
  };

  // Safe WebRTC cleanup
  const cleanupWebRTC = useCallback(() => {
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;
    }
    if (pcRef.current) {
      try {
        pcRef.current.onicecandidate = null;
        pcRef.current.ontrack = null;
        pcRef.current.onconnectionstatechange = null;
        pcRef.current.oniceconnectionstatechange = null;
        pcRef.current.close();
      } catch (e) {
        console.warn('Error closing peer connection:', e);
      }
      pcRef.current = null;
    }
    if (remoteAudioRef.current) {
      remoteAudioRef.current.srcObject = null;
    }
    const globalAudio = document.getElementById('voiceshield-remote-audio');
    if (globalAudio) {
      globalAudio.srcObject = null;
    }
    iceCandidatesQueueRef.current = [];
    initializingPcPromiseRef.current = null;
  }, []);

  // Save call to local history
  const saveCallToHistory = useCallback((name, phone, finalScore, seconds) => {
    try {
      const historyStr = localStorage.getItem('voiceshield_call_history') || '[]';
      const history = JSON.parse(historyStr);
      const risk = finalScore < 34 ? 'low' : finalScore < 67 ? 'medium' : 'high';
      const status = risk === 'low' ? 'Safe' : risk === 'medium' ? 'Warned' : 'Blocked';
      const formattedTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

      const newRecord = {
        id: String(Date.now()),
        name: name || 'Unknown',
        phone: phone || 'Unknown',
        time: `Today, ${formattedTime}`,
        risk: risk,
        score: finalScore,
        status: status,
      };

      localStorage.setItem('voiceshield_call_history', JSON.stringify([newRecord, ...history]));
    } catch (err) {
      console.error('Failed to log call history:', err);
    }
  }, []);

  // Reset entire call state
  const resetCallState = useCallback(() => {
    cleanupWebRTC();
    setCallState('idle');
    setIsIncomingCall(false);
    setIncomingCallData(null);
    setActivePeerName('');
    setActivePeerPhone('');
    setDuration(0);
    setVoiceAuth(98);
    setSpeakerMatch(98);
    setRiskScore(18);
    setIsMuted(false);
    alertTriggeredRef.current = false;
  }, [cleanupWebRTC]);

  // Initialize RTCPeerConnection and acquire microphone
  const getOrCreatePeerConnection = useCallback(async (peerPhone) => {
    // If an initialization is already in flight, await it
    if (initializingPcPromiseRef.current) {
      return await initializingPcPromiseRef.current;
    }

    if (pcRef.current && pcRef.current.signalingState !== 'closed') {
      return pcRef.current;
    }

    const initPromise = (async () => {
      try {
        console.log('[WebRTC] Creating new RTCPeerConnection for peer:', peerPhone);
        const pc = new RTCPeerConnection(ICE_SERVERS);
        pcRef.current = pc;

        // Obtain local mic stream if not already active
        if (!localStreamRef.current) {
          const stream = await navigator.mediaDevices.getUserMedia({
            audio: {
              echoCancellation: true,
              noiseSuppression: true,
              autoGainControl: true,
            },
            video: false,
          });
          localStreamRef.current = stream;
        }

        // Add local audio tracks to peer connection
        localStreamRef.current.getAudioTracks().forEach((track) => {
          track.enabled = !isMuted;
          pc.addTrack(track, localStreamRef.current);
        });

        // Send gathered ICE candidates via WebSocket
        pc.onicecandidate = (event) => {
          if (event.candidate && wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({
              type: 'ice_candidate',
              candidate: event.candidate,
              to_phone: peerPhone || activePeerPhoneRef.current,
            }));
          }
        };

        // Handle incoming remote audio track
        pc.ontrack = (event) => {
          console.log('[WebRTC] Remote track received:', event.track.id, event.streams);
          const inboundStream = event.streams && event.streams[0] ? event.streams[0] : new MediaStream([event.track]);
          
          const audioElem = document.getElementById('voiceshield-remote-audio') || remoteAudioRef.current;
          if (audioElem) {
            audioElem.srcObject = inboundStream;
            audioElem.muted = false;
            audioElem.volume = 1.0;
            audioElem.play().catch((err) => {
              console.warn('[WebRTC] Audio auto-play prompt required:', err);
            });
          }
        };

        pc.oniceconnectionstatechange = () => {
          console.log('[WebRTC] ICE Connection State:', pc.iceConnectionState);
        };

        pc.onconnectionstatechange = () => {
          console.log('[WebRTC] Connection State:', pc.connectionState);
          if (pc.connectionState === 'connected') {
            const audioElem = document.getElementById('voiceshield-remote-audio') || remoteAudioRef.current;
            if (audioElem && audioElem.srcObject) {
              audioElem.play().catch((e) => console.warn('[WebRTC] Play failed on connected:', e));
            }
          }
        };

        return pc;
      } finally {
        initializingPcPromiseRef.current = null;
      }
    })();

    initializingPcPromiseRef.current = initPromise;
    return await initPromise;
  }, [isMuted]);

  // Handle caller side WebRTC offer generation
  const startCallerWebRTC = useCallback(async (peerPhone) => {
    try {
      console.log('[WebRTC] Starting Caller WebRTC flow for:', peerPhone);
      const pc = await getOrCreatePeerConnection(peerPhone);
      const offer = await pc.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: false,
      });
      await pc.setLocalDescription(offer);

      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({
          type: 'webrtc_offer',
          offer: offer,
          to_phone: peerPhone,
        }));
      }
    } catch (err) {
      console.error('[WebRTC] Caller WebRTC setup failed:', err);
    }
  }, [getOrCreatePeerConnection]);

  // Handle callee side WebRTC offer reception & answer generation
  const handleWebRTCOffer = useCallback(async (offer, peerPhone) => {
    try {
      console.log('[WebRTC] Handling WebRTC Offer from:', peerPhone);
      const pc = await getOrCreatePeerConnection(peerPhone);
      
      await pc.setRemoteDescription(new RTCSessionDescription(offer));
      await processQueuedCandidates(pc);

      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({
          type: 'webrtc_answer',
          answer: answer,
          to_phone: peerPhone,
        }));
      }
    } catch (err) {
      console.error('[WebRTC] Failed handling WebRTC offer:', err);
    }
  }, [getOrCreatePeerConnection]);

  // Handle caller side WebRTC answer reception
  const handleWebRTCAnswer = useCallback(async (answer) => {
    try {
      console.log('[WebRTC] Handling WebRTC Answer');
      const pc = pcRef.current;
      if (pc) {
        await pc.setRemoteDescription(new RTCSessionDescription(answer));
        await processQueuedCandidates(pc);
      }
    } catch (err) {
      console.error('[WebRTC] Failed setting remote description from answer:', err);
    }
  }, []);

  // Handle incoming ICE candidate
  const handleIceCandidate = useCallback(async (candidate) => {
    if (!candidate) return;
    const pc = pcRef.current;
    if (pc && pc.remoteDescription && pc.remoteDescription.type) {
      try {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (err) {
        console.warn('[WebRTC] Error adding ICE candidate:', err);
      }
    } else {
      iceCandidatesQueueRef.current.push(candidate);
    }
  }, []);

  // Start simulated demo call
  const startDemoCall = useCallback((phone, name) => {
    const displayName = name || (phone === '000' ? 'VoiceShield Echo (Demo)' : 'Demo Session');
    setActivePeerName(displayName);
    setActivePeerPhone(phone || '000');
    setCallState('connected');

    navigator.mediaDevices.getUserMedia({ audio: true })
      .then((stream) => {
        localStreamRef.current = stream;
        const audioElem = document.getElementById('voiceshield-remote-audio') || remoteAudioRef.current;
        if (audioElem) {
          audioElem.srcObject = stream;
          audioElem.muted = true; // Mute local feedback to prevent squeals
        }
      })
      .catch((err) => console.warn('Demo call mic capture failed:', err));
  }, []);

  // User Actions: Initiate call
  const initiateCall = useCallback((targetPhone, targetName) => {
    if (!targetPhone) return;

    if (targetPhone === '000' || targetPhone === 'echo') {
      startDemoCall('000', 'VoiceShield Echo (Demo)');
      return;
    }

    const resolvedName = targetName || getContactNameByPhone(targetPhone);
    setActivePeerPhone(targetPhone);
    setActivePeerName(resolvedName);
    setCallState('dialing');

    // Pre-request mic so user gesture authorizes permission immediately
    navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    }).then((stream) => {
      localStreamRef.current = stream;
    }).catch((err) => {
      console.warn('Microphone permission pre-fetch failed:', err);
    });

    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'call_initiate',
        to_phone: targetPhone,
        from_name: myName,
      }));
    }
  }, [getContactNameByPhone, myName, startDemoCall]);

  // User Actions: Answer incoming call
  const answerCall = useCallback(async () => {
    const data = incomingCallDataRef.current;
    if (!data) return;

    const callerPhone = data.from_phone;
    const callerName = data.from_name || getContactNameByPhone(callerPhone);

    setIsIncomingCall(false);
    setIncomingCallData(null);
    setActivePeerPhone(callerPhone);
    setActivePeerName(callerName);
    setCallState('connected');

    // Ensure audio element is unmuted and primed
    const audioElem = document.getElementById('voiceshield-remote-audio') || remoteAudioRef.current;
    if (audioElem) {
      audioElem.muted = false;
      audioElem.play().catch(() => {});
    }

    // Send accept status
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'call_status',
        status: 'accepted',
        to_phone: callerPhone,
      }));
    }

    // Initialize callee WebRTC peer connection
    try {
      await getOrCreatePeerConnection(callerPhone);
    } catch (err) {
      console.error('Failed to initialize callee peer connection:', err);
    }
  }, [getContactNameByPhone, getOrCreatePeerConnection]);

  // User Actions: Decline incoming call
  const declineCall = useCallback(() => {
    const data = incomingCallDataRef.current;
    if (!data) return;

    setIsIncomingCall(false);
    setIncomingCallData(null);

    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'call_status',
        status: 'declined',
        to_phone: data.from_phone,
      }));
    }
  }, []);

  // User Actions: Hang up active call
  const hangUp = useCallback(() => {
    const peerPhone = activePeerPhoneRef.current || (incomingCallDataRef.current ? incomingCallDataRef.current.from_phone : '');

    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN && peerPhone) {
      wsRef.current.send(JSON.stringify({
        type: 'call_status',
        status: 'ended',
        to_phone: peerPhone,
      }));
    }

    saveCallToHistory(
      activePeerNameRef.current || 'Unknown',
      peerPhone,
      riskScoreRef.current,
      durationRef.current
    );

    resetCallState();
  }, [resetCallState, saveCallToHistory]);

  // User Actions: Toggle Mute
  const toggleMute = useCallback(() => {
    setIsMuted((prev) => {
      const next = !prev;
      if (localStreamRef.current) {
        localStreamRef.current.getAudioTracks().forEach((track) => {
          track.enabled = !next;
        });
      }
      return next;
    });
  }, []);

  // Maintain WebSocket connection throughout user session
  useEffect(() => {
    if (!myPhone) return;

    let isSubscribed = true;

    const connectWebSocket = () => {
      if (!isSubscribed) return;

      const cleanPhone = encodeURIComponent(myPhone);
      const wsBase = API_BASE.replace(/^http/, 'ws');
      const wsUrl = `${wsBase}/api/calls/ws/${cleanPhone}`;
      
      console.log('[WebSocket] Connecting signaling to:', wsUrl);
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('[WebSocket] Connected successfully for phone:', myPhone);
      };

      ws.onmessage = async (event) => {
        try {
          const data = JSON.parse(event.data);
          console.log('[WebSocket] Message received:', data.type);

          switch (data.type) {
            case 'call_initiate':
              // If idle and not already in call, present incoming call modal
              if (callStateRef.current === 'idle' && !isIncomingCallRef.current) {
                setIncomingCallData(data);
                setIsIncomingCall(true);
              } else {
                // Busy response
                ws.send(JSON.stringify({
                  type: 'call_status',
                  status: 'busy',
                  to_phone: data.from_phone,
                }));
              }
              break;

            case 'call_status':
              if (data.status === 'offline') {
                setCallState('offline');
              } else if (data.status === 'busy') {
                alert('User is currently busy on another call.');
                resetCallState();
              } else if (data.status === 'accepted') {
                setCallState('connected');
                const callerPeerName = getContactNameByPhone(data.from_phone);
                setActivePeerName(callerPeerName);
                setActivePeerPhone(data.from_phone);
                await startCallerWebRTC(data.from_phone);
              } else if (data.status === 'declined') {
                alert('Call was declined.');
                resetCallState();
              } else if (data.status === 'ended') {
                saveCallToHistory(
                  activePeerNameRef.current,
                  activePeerPhoneRef.current,
                  riskScoreRef.current,
                  durationRef.current
                );
                resetCallState();
              }
              break;

            case 'webrtc_offer':
              setCallState('connected');
              setActivePeerPhone(data.from_phone);
              setActivePeerName(data.from_name || getContactNameByPhone(data.from_phone));
              await handleWebRTCOffer(data.offer, data.from_phone);
              break;

            case 'webrtc_answer':
              await handleWebRTCAnswer(data.answer);
              break;

            case 'ice_candidate':
              await handleIceCandidate(data.candidate);
              break;

            default:
              break;
          }
        } catch (err) {
          console.error('[WebSocket] Message processing error:', err);
        }
      };

      ws.onclose = () => {
        console.log('[WebSocket] Connection closed. Will attempt reconnect...');
        if (isSubscribed) {
          reconnectTimeoutRef.current = setTimeout(connectWebSocket, 3000);
        }
      };

      ws.onerror = (err) => {
        console.warn('[WebSocket] Error encountered:', err);
        ws.close();
      };
    };

    connectWebSocket();

    return () => {
      isSubscribed = false;
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      cleanupWebRTC();
    };
  }, [myPhone, getContactNameByPhone, startCallerWebRTC, handleWebRTCOffer, handleWebRTCAnswer, handleIceCandidate, cleanupWebRTC, resetCallState, saveCallToHistory]);

  // Active call duration and metric fluctuations
  useEffect(() => {
    if (callState === 'connected') {
      setDuration(0);
      timerRef.current = setInterval(() => {
        setDuration((prev) => prev + 1);
      }, 1000);

      fluctuationRef.current = setInterval(() => {
        setVoiceAuth((prev) => {
          const delta = (Math.random() - 0.5) * 4;
          return Math.max(90, Math.min(99, Math.round(prev + delta)));
        });
        setSpeakerMatch((prev) => {
          const delta = (Math.random() - 0.5) * 3;
          return Math.max(92, Math.min(99, Math.round(prev + delta)));
        });
        setRiskScore((prev) => {
          const delta = (Math.random() - 0.5) * 5;
          return Math.max(10, Math.min(28, Math.round(prev + delta)));
        });
      }, 2500);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
      if (fluctuationRef.current) clearInterval(fluctuationRef.current);
    }

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (fluctuationRef.current) clearInterval(fluctuationRef.current);
    };
  }, [callState]);

  // Trigger high-risk security alert if risk crosses 35% during connected call
  useEffect(() => {
    if (callState !== 'connected') {
      alertTriggeredRef.current = false;
      return;
    }

    if (riskScore > 35 && !alertTriggeredRef.current) {
      alertTriggeredRef.current = true;
      if (onAddAlert) {
        onAddAlert({
          severity: 'HIGH',
          message: `Elevated call risk detected: ${riskScore}% spoofing markers in call with ${activePeerName || activePeerPhone}.`,
          recommendation: 'Review credentials, do not share OTPs, and verify caller identity.',
        });
      }
    }
  }, [riskScore, callState, activePeerName, activePeerPhone, onAddAlert]);

  const value = {
    callState,
    setCallState,
    isIncomingCall,
    incomingCallData,
    activePeerName,
    activePeerPhone,
    duration,
    voiceAuth,
    speakerMatch,
    riskScore,
    setRiskScore,
    isMuted,
    directory,
    setDirectory,
    getContactNameByPhone,
    initiateCall,
    answerCall,
    declineCall,
    hangUp,
    toggleMute,
    resetCallState,
    startDemoCall,
    remoteAudioRef,
  };

  return (
    <CallContext.Provider value={value}>
      {children}
    </CallContext.Provider>
  );
}

export function useCall() {
  const context = useContext(CallContext);
  if (!context) {
    throw new Error('useCall must be used within a CallProvider');
  }
  return context;
}

export default CallContext;
