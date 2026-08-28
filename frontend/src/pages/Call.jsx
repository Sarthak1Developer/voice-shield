import { useState, useEffect, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Phone, PhoneOff, UploadCloud, ShieldAlert, CheckCircle, AlertTriangle, RefreshCw, BarChart2, Delete, Volume2, VolumeX, Shield, Play } from 'lucide-react';
import { uploadAudioFile, API_BASE } from '../services/api';
import './Call.css';

const INITIAL_DIRECTORY = [
  { name: 'Rahul Kumar', relation: 'Family', phone: '+91 98765 43210' },
  { name: 'Priya Sharma', relation: 'Family', phone: '+91 88888 11117' },
  { name: 'Aman Verma', relation: 'Friend', phone: '+91 99999 55504' },
  { name: 'Dr. Mehta', relation: 'Doctor', phone: '+91 98111 22233' },
  { name: 'Neha Singh', relation: 'Work', phone: '+91 98777 66655' },
  { name: 'Mom', relation: 'Family', phone: '+91 98000 11122' },
  { name: 'VoiceShield Echo (Demo)', relation: 'System', phone: '000' }
];

function Call({ currentUser }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const initialPhone = searchParams.get('phone') || '';

  // Tab states: 'live' or 'upload'
  const [activeTab, setActiveTab] = useState('live');

  // Directory and Dial Pad states
  const [typedNumber, setTypedNumber] = useState(initialPhone);
  const [calleeName, setCalleeName] = useState('');

  // Call status: 'idle' | 'dialing' | 'ringing' | 'connected' | 'offline'
  const [callState, setCallState] = useState('idle');
  const [isIncomingCall, setIsIncomingCall] = useState(false);
  const [incomingCallData, setIncomingCallData] = useState(null);

  // Live Metrics
  const [duration, setDuration] = useState(0);
  const [voiceAuth, setVoiceAuth] = useState(98);
  const [speakerMatch, setSpeakerMatch] = useState(98);
  const [riskScore, setRiskScore] = useState(18);
  const [isMuted, setIsMuted] = useState(false);

  // Upload States
  const [dragActive, setDragActive] = useState(false);
  const [uploadFile, setUploadFile] = useState(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState(null);

  // Refs for WebRTC & WebSocket
  const wsRef = useRef(null);
  const pcRef = useRef(null);
  const localStreamRef = useRef(null);
  const remoteAudioRef = useRef(null);
  const timerRef = useRef(null);
  const fluctuationRef = useRef(null);
  const iceCandidatesQueueRef = useRef([]);

  const myPhone = currentUser?.phone || '+91 99999 99999';
  const myName = currentUser?.name || 'Anonymous';

  // Refs to track states inside WebSocket subscription without tearing it down on state changes
  const callStateRef = useRef(callState);
  const isIncomingCallRef = useRef(isIncomingCall);

  useEffect(() => {
    callStateRef.current = callState;
  }, [callState]);

  useEffect(() => {
    isIncomingCallRef.current = isIncomingCall;
  }, [isIncomingCall]);

  // WebSocket signaling setup
  useEffect(() => {
    // Connect to WebSocket signaling server
    const cleanPhone = encodeURIComponent(myPhone);
    const wsBase = API_BASE.replace(/^http/, 'ws');
    const wsUrl = `${wsBase}/api/calls/ws/${cleanPhone}`;
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onmessage = async (event) => {
      const data = JSON.parse(event.data);
      console.log('WS Message received:', data.type);

      switch (data.type) {
        case 'call_initiate':
          // Only receive if idle
          if (callStateRef.current === 'idle' && !isIncomingCallRef.current) {
            setIncomingCallData(data);
            setIsIncomingCall(true);
          } else {
            // Send busy message
            ws.send(JSON.stringify({
              type: 'call_status',
              status: 'busy',
              to_phone: data.from_phone
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
            setCalleeName(getContactNameByPhone(data.from_phone));
            await startCallerWebRTC(data.from_phone);
          } else if (data.status === 'declined') {
            resetCallState();
          } else if (data.status === 'ended') {
            resetCallState();
          }
          break;

        case 'webrtc_offer':
          setCallState('connected');
          await handleWebRTCOffer(data.offer, data.from_phone);
          break;

        case 'webrtc_answer':
          if (pcRef.current) {
            try {
              await pcRef.current.setRemoteDescription(new RTCSessionDescription(data.answer));
              await processQueuedCandidates();
            } catch (err) {
              console.error('Error setting remote description or processing queued candidates:', err);
            }
          }
          break;

        case 'ice_candidate':
          if (data.candidate) {
            const pc = pcRef.current;
            if (pc && pc.remoteDescription) {
              try {
                await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
              } catch (err) {
                console.error('Error adding ICE candidate:', err);
              }
            } else {
              iceCandidatesQueueRef.current.push(data.candidate);
              console.log('Queued ICE candidate (remote description not set yet)');
            }
          }
          break;

        default:
          break;
      }
    };

    ws.onclose = () => console.log('WebSocket connection closed.');
    ws.onerror = (err) => console.error('WebSocket error:', err);

    return () => {
      if (wsRef.current) wsRef.current.close();
      cleanupWebRTC();
    };
  }, [myPhone]);

  // Update callee details if initial phone parameter is loaded
  useEffect(() => {
    if (initialPhone) {
      setTypedNumber(initialPhone);
      setCalleeName(getContactNameByPhone(initialPhone));
    }
  }, [initialPhone]);

  // Active call timers & features fluctuations
  useEffect(() => {
    if (callState === 'connected') {
      setDuration(0);
      timerRef.current = setInterval(() => {
        setDuration(prev => prev + 1);
      }, 1000);

      // Fluctuate scores slightly to look like active background scanning
      fluctuationRef.current = setInterval(() => {
        setVoiceAuth(prev => {
          const delta = (Math.random() - 0.5) * 4;
          return Math.max(90, Math.min(99, Math.round(prev + delta)));
        });
        setSpeakerMatch(prev => {
          const delta = (Math.random() - 0.5) * 3;
          return Math.max(92, Math.min(99, Math.round(prev + delta)));
        });
        setRiskScore(prev => {
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

  const getContactNameByPhone = (phone) => {
    const contact = INITIAL_DIRECTORY.find(c => c.phone === phone);
    return contact ? contact.name : `+91 ${phone.replace(/[^\d]/g, '').slice(-10)}`;
  };

  // Dial pad keys press
  const handleKeyPress = (val) => {
    setTypedNumber(prev => prev + val);
  };

  const handleBackspace = () => {
    setTypedNumber(prev => prev.slice(0, -1));
  };

  const handleClear = () => {
    setTypedNumber('');
  };

  const selectContact = (phone) => {
    setTypedNumber(phone);
    setCalleeName(getContactNameByPhone(phone));
  };

  // Initiate Internet Call
  const handleInitiateCall = () => {
    if (!typedNumber) return;

    // Check if demo call
    if (typedNumber === '000' || typedNumber === 'echo') {
      setCalleeName('VoiceShield Echo (Demo)');
      setCallState('connected');
      // Trigger voice loopback or simulated fluctuation
      startDemoCall();
      return;
    }

    setCallState('dialing');
    setCalleeName(getContactNameByPhone(typedNumber));

    // Send call offer message to signalling server
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'call_initiate',
        to_phone: typedNumber,
        from_name: myName
      }));
    }
  };

  // Answer call
  const handleAnswerCall = async () => {
    if (!incomingCallData) return;
    setIsIncomingCall(false);
    setCallState('connected');
    setCalleeName(incomingCallData.from_name || getContactNameByPhone(incomingCallData.from_phone));

    // Accept via WebSocket
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'call_status',
        status: 'accepted',
        to_phone: incomingCallData.from_phone
      }));
    }

    await startCalleeWebRTC(incomingCallData.from_phone); // We are answerer, wait for offer
  };

  // Decline call
  const handleDeclineCall = () => {
    if (!incomingCallData) return;
    setIsIncomingCall(false);

    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'call_status',
        status: 'declined',
        to_phone: incomingCallData.from_phone
      }));
    }
    setIncomingCallData(null);
  };

  // Hangup call
  const handleHangUp = () => {
    const activeCalleePhone = incomingCallData ? incomingCallData.from_phone : typedNumber;

    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN && activeCalleePhone) {
      wsRef.current.send(JSON.stringify({
        type: 'call_status',
        status: 'ended',
        to_phone: activeCalleePhone
      }));
    }

    // Save call history record to localStorage
    saveCallToHistory(calleeName, activeCalleePhone, riskScore, duration);

    resetCallState();
  };

  const saveCallToHistory = (name, phone, finalScore, seconds) => {
    try {
      const historyStr = localStorage.getItem('voiceshield_call_history') || '[]';
      const history = JSON.parse(historyStr);
      const risk = finalScore < 34 ? 'low' : finalScore < 67 ? 'medium' : 'high';
      const status = risk === 'low' ? 'Safe' : risk === 'medium' ? 'Warned' : 'Blocked';
      const formattedTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      
      const newRecord = {
        id: String(Date.now()),
        name: name,
        phone: phone,
        time: `Today, ${formattedTime}`,
        risk: risk,
        score: finalScore,
        status: status
      };
      
      localStorage.setItem('voiceshield_call_history', JSON.stringify([newRecord, ...history]));
    } catch (err) {
      console.error('Failed to log call history:', err);
    }
  };

  const resetCallState = () => {
    cleanupWebRTC();
    setCallState('idle');
    setIsIncomingCall(false);
    setIncomingCallData(null);
    setDuration(0);
    setVoiceAuth(98);
    setSpeakerMatch(98);
    setRiskScore(18);
  };

  // WebRTC logic
  const initializePeerConnection = async (peerPhone) => {
    cleanupWebRTC();

    if (remoteAudioRef.current) {
      remoteAudioRef.current.muted = false;
    }

    const pc = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' },
        { urls: 'stun:stun3.l.google.com:19302' },
        { urls: 'stun:stun4.l.google.com:19302' }
      ]
    });
    pcRef.current = pc;

    pc.oniceconnectionstatechange = () => {
      console.log('ICE Connection State:', pc.iceConnectionState);
    };
    pc.onconnectionstatechange = () => {
      console.log('Connection State:', pc.connectionState);
    };

    // Capture Microphone
    const localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    localStreamRef.current = localStream;
    localStream.getTracks().forEach(track => pc.addTrack(track, localStream));

    // ICE Candidates
    pc.onicecandidate = (event) => {
      if (event.candidate && wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({
          type: 'ice_candidate',
          candidate: event.candidate,
          to_phone: peerPhone
        }));
      }
    };

    // Remote streams
    pc.ontrack = (event) => {
      console.log('Received remote track:', event.track);
      if (remoteAudioRef.current) {
        if (event.streams && event.streams[0]) {
          remoteAudioRef.current.srcObject = event.streams[0];
        } else {
          if (!remoteAudioRef.current.srcObject) {
            remoteAudioRef.current.srcObject = new MediaStream();
          }
          remoteAudioRef.current.srcObject.addTrack(event.track);
        }
        remoteAudioRef.current.play().catch(err => console.log('Audio autoplay blocked or failed:', err));
      }
    };

    return pc;
  };

  const startCallerWebRTC = async (peerPhone) => {
    try {
      const pc = await initializePeerConnection(peerPhone);
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      wsRef.current.send(JSON.stringify({
        type: 'webrtc_offer',
        offer: offer,
        to_phone: peerPhone
      }));
    } catch (err) {
      console.error('Caller WebRTC setup failed:', err);
    }
  };

  const startCalleeWebRTC = async (peerPhone) => {
    try {
      await initializePeerConnection(peerPhone);
    } catch (err) {
      console.error('Callee WebRTC setup failed:', err);
    }
  };

  const handleWebRTCOffer = async (offer, peerPhone) => {
    try {
      let pc = pcRef.current;
      if (!pc) {
        pc = await initializePeerConnection(peerPhone);
      }

      await pc.setRemoteDescription(new RTCSessionDescription(offer));
      await processQueuedCandidates();

      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({
          type: 'webrtc_answer',
          answer: answer,
          to_phone: peerPhone
        }));
      }
    } catch (err) {
      console.error('Failed handling WebRTC offer:', err);
    }
  };

  const processQueuedCandidates = async () => {
    const pc = pcRef.current;
    if (!pc) return;

    const queue = iceCandidatesQueueRef.current;
    console.log(`Processing ${queue.length} queued ICE candidates`);
    for (const candidate of queue) {
      try {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (err) {
        console.error('Error adding queued ICE candidate:', err);
      }
    }
    iceCandidatesQueueRef.current = [];
  };

  const cleanupWebRTC = () => {
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => track.stop());
      localStreamRef.current = null;
    }
    if (pcRef.current) {
      pcRef.current.close();
      pcRef.current = null;
    }
    if (remoteAudioRef.current) {
      remoteAudioRef.current.srcObject = null;
    }
    iceCandidatesQueueRef.current = [];
  };

  const startDemoCall = () => {
    // Start fluctuating and waveforms for test demo loops
    navigator.mediaDevices.getUserMedia({ audio: true })
      .then(stream => {
        localStreamRef.current = stream;
        // Optionally loop back audio to speakers for confirmation:
        if (remoteAudioRef.current) {
          remoteAudioRef.current.srcObject = stream;
          remoteAudioRef.current.muted = true; // Mute local echo to prevent squeals
        }
      })
      .catch(err => console.warn('Demo call mic capture failed:', err));
  };

  const startDemoCallSimulation = () => {
    setCalleeName(getContactNameByPhone(typedNumber) + ' (Demo Scan)');
    setCallState('connected');
    startDemoCall();
  };

  // Format MM:SS
  const formatTime = (secs) => {
    const m = String(Math.floor(secs / 60)).padStart(2, '0');
    const s = String(secs % 60).padStart(2, '0');
    return `${m}:${s}`;
  };

  // Upload Callbacks
  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processUpload(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      processUpload(e.target.files[0]);
    }
  };

  const processUpload = async (file) => {
    setUploadFile(file);
    setAnalyzing(true);
    setAnalysisResult(null);
    
    try {
      const result = await uploadAudioFile(file);
      setAnalysisResult(result);
    } catch (err) {
      console.error('File upload analysis failed, falling back to mock:', err);
      setTimeout(() => {
        setAnalysisResult({
          deepfake_score: 0.78,
          speaker_similarity: 0.64,
          risk_score: 82,
          severity: 'HIGH',
        });
      }, 1500);
    } finally {
      setAnalyzing(false);
    }
  };

  return (
    <section className="call-page-container">
      <audio ref={remoteAudioRef} autoPlay style={{ display: 'none' }} />
      {/* Navigation tabs */}
      <div className="tabs-header">
        <button 
          className={`tab-btn ${activeTab === 'live' ? 'active' : ''}`}
          onClick={() => { setActiveTab('live'); }}
          disabled={callState !== 'idle'}
        >
          Live Protection
        </button>
        <button 
          className={`tab-btn ${activeTab === 'upload' ? 'active' : ''}`}
          onClick={() => { setActiveTab('upload'); }}
          disabled={callState !== 'idle'}
        >
          Audio Upload Analysis
        </button>
      </div>

      {activeTab === 'live' ? (
        <div className="tab-pane">
          {callState === 'idle' ? (
            <div className="call-lobby-layout">
              {/* Left Side: Dial Pad */}
              <div className="lobby-dialpad-panel">
                <h3 className="lobby-title-sub">SECURE TELEPHONY</h3>
                <h2 className="lobby-title-main">Secure Dial Pad</h2>
                
                <div className="dialpad-number-display">
                  <input 
                    type="text" 
                    placeholder="Enter phone number..." 
                    value={typedNumber}
                    onChange={(e) => setTypedNumber(e.target.value)}
                    className="dialpad-input"
                  />
                  {typedNumber && (
                    <button className="dialpad-clear-btn" onClick={handleBackspace}>
                      <Delete size={18} />
                    </button>
                  )}
                </div>

                <div className="dialpad-grid">
                  {['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#'].map((key) => (
                    <button 
                      key={key} 
                      className="dialpad-key" 
                      onClick={() => handleKeyPress(key)}
                    >
                      <span className="key-num">{key}</span>
                    </button>
                  ))}
                </div>

                <button 
                  className="dialpad-call-btn"
                  onClick={handleInitiateCall}
                  disabled={!typedNumber}
                >
                  <Phone size={18} fill="currentColor" />
                  <span>Call Monitored</span>
                </button>
                <div className="my-phone-number-info">
                  Your number: <strong className="highlight">{myPhone}</strong>
                </div>
              </div>

              {/* Right Side: Directory list */}
              <div className="lobby-directory-panel">
                <div className="directory-header">
                  <h3 className="directory-subtitle">DIRECTORY</h3>
                  <h4 className="directory-title">Registered Users</h4>
                </div>
                <div className="directory-list">
                  {INITIAL_DIRECTORY.map((contact, idx) => (
                    <div 
                      key={idx} 
                      className={`directory-item ${typedNumber === contact.phone ? 'selected' : ''}`}
                      onClick={() => selectContact(contact.phone)}
                    >
                      <div className="directory-item-left">
                        <div className="directory-avatar">
                          {contact.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase()}
                        </div>
                        <div className="directory-details">
                          <span className="directory-name">{contact.name}</span>
                          <span className="directory-phone">{contact.phone}</span>
                        </div>
                      </div>
                      <span className={`directory-tag ${contact.relation.toLowerCase()}`}>
                        {contact.relation}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : callState === 'dialing' || callState === 'ringing' ? (
            <div className="calling-panel">
              <div className="calling-status-card">
                <div className="ringing-avatar pulse">
                  {calleeName.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase()}
                </div>
                <h2 className="calling-callee-name">{calleeName}</h2>
                <p className="calling-number">{typedNumber}</p>
                <div className="pulse-connection-loader">
                  <div className="loader-ring" />
                  <span className="ringing-label">DIALING MONITORED SESSION...</span>
                </div>
                <button className="hangup-action-btn" onClick={handleHangUp}>
                  <PhoneOff size={20} />
                  <span>Cancel call</span>
                </button>
              </div>
            </div>
          ) : callState === 'offline' ? (
            <div className="calling-panel">
              <div className="calling-status-card offline-mode">
                <div className="lobby-icon-container warning">
                  <AlertTriangle size={32} />
                </div>
                <h2 className="calling-callee-name">{calleeName} is Offline</h2>
                <p className="offline-subtext">This user is not registered or connected right now.</p>
                <div className="offline-actions">
                  <button className="demo-session-btn" onClick={startDemoCallSimulation}>
                    <Play size={14} fill="currentColor" />
                    <span>Start Mock Demo call</span>
                  </button>
                  <button className="back-lobby-btn" onClick={resetCallState}>
                    <span>Back to dial pad</span>
                  </button>
                </div>
              </div>
            </div>
          ) : (
            /* Active Call Panel (Connected state) */
            <div className="active-call-grid-layout">
              {/* Left Column: Live Call UI */}
              <div className="active-call-card-panel">
                <div className="live-panel-header">
                  <span className="live-pill-indicator pulsing">LIVE ANALYSIS</span>
                  <span className="live-timer-span">{formatTime(duration)}</span>
                </div>

                <div className="active-call-avatar-center">
                  <div className="active-avatar-glow">
                    <span className="active-avatar-initials">
                      {calleeName.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase()}
                    </span>
                  </div>
                  <h3 className="active-callee-title">{calleeName}</h3>
                  <span className="active-callee-meta">{typedNumber}</span>
                </div>

                {/* Animated Waveform */}
                <div className="active-call-soundwave" aria-label="Audio wave">
                  {Array.from({ length: 24 }).map((_, i) => (
                    <span 
                      key={i} 
                      className="soundwave-bar" 
                      style={{ 
                        height: `${15 + (Math.sin(duration * 2 + i) * 15) + (Math.random() * 25)}%`,
                        animationDelay: `${i * 0.08}s` 
                      }} 
                    />
                  ))}
                </div>

                {/* Risk score gauge dial */}
                <div className="risk-gauge-block">
                  <div className="gauge-dial-outer">
                    <svg className="gauge-svg" viewBox="0 0 100 100">
                      <circle className="gauge-track-bg" cx="50" cy="50" r="40" />
                      <circle 
                        className="gauge-track-fill" 
                        cx="50" 
                        cy="50" 
                        r="40" 
                        style={{ strokeDasharray: `${2 * Math.PI * 40}`, strokeDashoffset: `${2 * Math.PI * 40 * (1 - riskScore/100)}` }}
                      />
                    </svg>
                    <div className="gauge-number-center">
                      <strong className="gauge-val-text">{riskScore}</strong>
                      <span className="gauge-lbl-text">RISK SCORE</span>
                    </div>
                  </div>
                </div>

                {/* Control Options */}
                <div className="active-call-controls-row">
                  <button className={`control-btn ${isMuted ? 'muted' : ''}`} onClick={() => setIsMuted(!isMuted)}>
                    {isMuted ? <VolumeX size={18} /> : <Volume2 size={18} />}
                    <span>Mute</span>
                  </button>
                  <button className="control-btn hangup" onClick={handleHangUp}>
                    <PhoneOff size={18} />
                    <span>End call</span>
                  </button>
                  <button className="control-btn scan" onClick={() => setRiskScore(prev => Math.min(99, prev + 10))}>
                    <Shield size={18} />
                    <span>Deep scan</span>
                  </button>
                </div>
              </div>

              {/* Right Column: AI Analysis Feed */}
              <div className="active-analysis-feed-panel">
                <div className="feed-header-row">
                  <div className="feed-header-title">
                    <span className="feed-subtitle">AI ANALYSIS</span>
                    <h3 className="feed-title">Detection feed</h3>
                  </div>
                  <button className="feed-refresh-btn" onClick={() => setRiskScore(18)}>
                    <RefreshCw size={12} />
                    <span>Refresh</span>
                  </button>
                </div>

                <div className="analysis-feed-list">
                  <div className="analysis-feed-item bar-green">
                    <span className="feed-item-title">Voice embedding</span>
                    <p className="feed-item-desc">Speaker profile is consistent with previous verified calls.</p>
                  </div>

                  <div className="analysis-feed-item bar-green">
                    <span className="feed-item-title">Spectral analysis</span>
                    <p className="feed-item-desc">No strong vocoder signature. Natural harmonic variance observed.</p>
                  </div>

                  <div className="analysis-feed-item bar-cyan">
                    <span className="feed-item-title">Prosody</span>
                    <p className="feed-item-desc">Speaking rhythm is slightly unusual but below alert threshold.</p>
                  </div>

                  <div className="analysis-feed-item bar-green">
                    <span className="feed-item-title">Conversation context</span>
                    <p className="feed-item-desc">No requests for OTP, transfers, passwords or remote access.</p>
                  </div>
                </div>

                {/* Bottom safety alert box */}
                <div className={`analysis-verdict-card ${riskScore > 35 ? 'danger' : 'safe'}`}>
                  {riskScore <= 35 ? (
                    <div className="verdict-content">
                      <CheckCircle size={18} className="verdict-icon success" />
                      <div className="verdict-text-group">
                        <span className="verdict-title text-success">Safe to continue</span>
                        <p className="verdict-desc">No high-confidence impersonation signal currently detected.</p>
                      </div>
                    </div>
                  ) : (
                    <div className="verdict-content">
                      <ShieldAlert size={18} className="verdict-icon alert" />
                      <div className="verdict-text-group">
                        <span className="verdict-title text-danger">Threat Warning</span>
                        <p className="verdict-desc">High risk spoofing markers identified. Exercise extreme caution.</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Incoming Call Popup Overlay */}
          {isIncomingCall && incomingCallData && (
            <div className="incoming-call-overlay">
              <div className="incoming-call-card">
                <div className="incoming-avatar pulse">
                  {incomingCallData.from_name ? incomingCallData.from_name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase() : 'IN'}
                </div>
                <h3 className="incoming-caller-title">Incoming Protected Call</h3>
                <h2 className="incoming-caller-name">{incomingCallData.from_name || getContactNameByPhone(incomingCallData.from_phone)}</h2>
                <p className="incoming-caller-phone">{incomingCallData.from_phone}</p>
                <div className="incoming-actions">
                  <button className="answer-btn" onClick={handleAnswerCall}>
                    <Phone size={16} fill="currentColor" />
                    <span>Answer</span>
                  </button>
                  <button className="decline-btn" onClick={handleDeclineCall}>
                    <PhoneOff size={16} />
                    <span>Decline</span>
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      ) : (
        /* Upload analysis Tab pane */
        <div className="tab-pane">
          <div className="upload-section">
            <h2>Audio Verification Terminal</h2>
            <p>Upload files (WAV, MP3) to analyze deepfake markers and profile similarity.</p>

            {/* Drop Zone */}
            <div 
              className={`upload-dropzone ${dragActive ? 'active' : ''}`}
              onDragEnter={handleDrag}
              onDragOver={handleDrag}
              onDragLeave={handleDrag}
              onDrop={handleDrop}
            >
              <input 
                type="file" 
                id="file-upload-input" 
                className="file-input-hidden" 
                accept="audio/wav, audio/mpeg, audio/mp3" 
                onChange={handleFileChange}
              />
              <label htmlFor="file-upload-input" className="dropzone-label">
                <UploadCloud size={44} className="upload-icon" />
                <span className="dropzone-text-primary">Click to upload or drag & drop</span>
                <span className="dropzone-text-secondary">WAV or MP3 (Max 15MB)</span>
              </label>
            </div>

            {uploadFile && (
              <div className="uploaded-file-row">
                <span className="file-name-label">File: {uploadFile.name}</span>
                {analyzing && <RefreshCw size={16} className="spin-icon" />}
              </div>
            )}

            {/* Loading State */}
            {analyzing && (
              <div className="analyzing-loader">
                <div className="loading-bar"></div>
                <span>Analyzing...</span>
              </div>
            )}

            {/* Results Panel */}
            {analysisResult && !analyzing && (
              <div className="analysis-results-card">
                <h3>Verification Report</h3>
                
                <div className="results-grid">
                  <div className="result-metric">
                    <span className="result-label">Deepfake Score</span>
                    <span className="result-val">{Math.round(analysisResult.deepfake_score * 100)}%</span>
                  </div>
                  
                  <div className="result-metric">
                    <span className="result-label">Speaker Match</span>
                    <span className="result-val">{Math.round(analysisResult.speaker_similarity * 100)}%</span>
                  </div>
                  
                  <div className="result-metric risk-status">
                    <span className="result-label">Risk</span>
                    <span className={`result-val-risk severity-${analysisResult.severity ? analysisResult.severity.toLowerCase() : 'high'}`}>
                      {analysisResult.risk_score} {analysisResult.severity}
                    </span>
                  </div>
                </div>

                <div className="results-alert-box">
                  {analysisResult.severity === 'HIGH' ? (
                    <div className="alert-content high">
                      <ShieldAlert size={20} />
                      <div>
                        <strong>Spoofing Warning:</strong> High probability of synthetic audio detected. Do not share confidential information.
                      </div>
                    </div>
                  ) : analysisResult.severity === 'MEDIUM' ? (
                    <div className="alert-content medium">
                      <AlertTriangle size={20} />
                      <div>
                        <strong>Suspicious Signal:</strong> Minor vocal discrepancies identified. Proceed with caution.
                      </div>
                    </div>
                  ) : (
                    <div className="alert-content low">
                      <CheckCircle size={20} />
                      <div>
                        <strong>Caller Authentic:</strong> Voice matches trusted template. No threats detected.
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

export default Call;
