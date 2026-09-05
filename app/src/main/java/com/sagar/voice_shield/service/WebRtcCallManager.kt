package com.sagar.voice_shield.service

import android.content.Context
import android.media.AudioManager
import android.util.Log
import com.google.gson.JsonObject
import org.webrtc.*
import org.webrtc.audio.JavaAudioDeviceModule

class WebRtcCallManager(
    private val context: Context,
    private val sendSignalingMessage: (JsonObject) -> Unit
) {
    private val TAG = "WebRtcCallManager"

    private var peerConnectionFactory: PeerConnectionFactory? = null
    private var peerConnection: PeerConnection? = null
    private var localAudioSource: AudioSource? = null
    private var localAudioTrack: AudioTrack? = null
    private var activePeerPhone: String = ""

    // Candidate queuing: candidates arriving before remote description is set are saved here
    private val queuedRemoteCandidates = mutableListOf<IceCandidate>()
    @Volatile
    private var isRemoteDescriptionSet = false

    // High-availability STUN + Open Relay TURN servers for seamless cross-network & CGNAT traversal
    private val iceServers = listOf(
        PeerConnection.IceServer.builder("stun:stun.l.google.com:19302").createIceServer(),
        PeerConnection.IceServer.builder("stun:stun1.l.google.com:19302").createIceServer(),
        PeerConnection.IceServer.builder("stun:stun2.l.google.com:19302").createIceServer(),
        PeerConnection.IceServer.builder("stun:stun3.l.google.com:19302").createIceServer(),
        PeerConnection.IceServer.builder("stun:stun4.l.google.com:19302").createIceServer(),
        PeerConnection.IceServer.builder("stun:stun.services.mozilla.com:3478").createIceServer(),
        PeerConnection.IceServer.builder("stun:stun.relay.metered.ca:80").createIceServer(),
        // Free open TURN relays allowing WebRTC audio across differing networks, cellular LTE/5G & Wi-Fi
        PeerConnection.IceServer.builder("turn:openrelay.metered.ca:80")
            .setUsername("openrelayproject")
            .setPassword("openrelayproject")
            .createIceServer(),
        PeerConnection.IceServer.builder("turn:openrelay.metered.ca:443")
            .setUsername("openrelayproject")
            .setPassword("openrelayproject")
            .createIceServer(),
        PeerConnection.IceServer.builder("turn:openrelay.metered.ca:443?transport=tcp")
            .setUsername("openrelayproject")
            .setPassword("openrelayproject")
            .createIceServer()
    )

    init {
        initPeerConnectionFactory()
    }

    private fun initPeerConnectionFactory() {
        try {
            val initOptions = PeerConnectionFactory.InitializationOptions.builder(context)
                .setEnableInternalTracer(false)
                .createInitializationOptions()
            PeerConnectionFactory.initialize(initOptions)

            // Explicitly configure JavaAudioDeviceModule with hardware AEC and noise suppression
            val adm = JavaAudioDeviceModule.builder(context)
                .setUseHardwareAcousticEchoCanceler(true)
                .setUseHardwareNoiseSuppressor(true)
                .createAudioDeviceModule()

            val options = PeerConnectionFactory.Options()
            peerConnectionFactory = PeerConnectionFactory.builder()
                .setAudioDeviceModule(adm)
                .setOptions(options)
                .createPeerConnectionFactory()
            Log.d(TAG, "PeerConnectionFactory with JavaAudioDeviceModule initialized successfully")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to initialize PeerConnectionFactory", e)
        }
    }

    private fun createPeerConnection(): PeerConnection? {
        val rtcConfig = PeerConnection.RTCConfiguration(iceServers).apply {
            sdpSemantics = PeerConnection.SdpSemantics.UNIFIED_PLAN
            continualGatheringPolicy = PeerConnection.ContinualGatheringPolicy.GATHER_CONTINUALLY
            iceTransportsType = PeerConnection.IceTransportsType.ALL
            bundlePolicy = PeerConnection.BundlePolicy.MAXBUNDLE
            rtcpMuxPolicy = PeerConnection.RtcpMuxPolicy.REQUIRE
            tcpCandidatePolicy = PeerConnection.TcpCandidatePolicy.ENABLED
        }

        val pcObserver = object : PeerConnection.Observer {
            override fun onSignalingChange(state: PeerConnection.SignalingState) {
                Log.d(TAG, "SignalingState: $state")
            }

            override fun onIceConnectionChange(state: PeerConnection.IceConnectionState) {
                Log.d(TAG, "IceConnectionState: $state")
                if (state == PeerConnection.IceConnectionState.CONNECTED || state == PeerConnection.IceConnectionState.COMPLETED) {
                    routeAudioToSpeaker()
                }
            }

            override fun onIceConnectionReceivingChange(receiving: Boolean) {}

            override fun onIceGatheringChange(state: PeerConnection.IceGatheringState) {
                Log.d(TAG, "IceGatheringState: $state")
            }

            override fun onIceCandidate(candidate: IceCandidate) {
                Log.d(TAG, "Gathered local ICE candidate: ${candidate.sdpMid}")
                val msg = JsonObject().apply {
                    addProperty("type", "ice_candidate")
                    val candidateObj = JsonObject().apply {
                        addProperty("candidate", candidate.sdp)
                        addProperty("sdpMid", candidate.sdpMid)
                        addProperty("sdpMLineIndex", candidate.sdpMLineIndex)
                    }
                    add("candidate", candidateObj)
                    addProperty("to_phone", activePeerPhone)
                }
                sendSignalingMessage(msg)
            }

            override fun onIceCandidatesRemoved(candidates: Array<out IceCandidate>?) {}

            override fun onAddStream(stream: MediaStream) {
                Log.d(TAG, "onAddStream with audio tracks: ${stream.audioTracks.size}")
                if (stream.audioTracks.isNotEmpty()) {
                    stream.audioTracks[0].setEnabled(true)
                    routeAudioToSpeaker()
                }
            }

            override fun onRemoveStream(stream: MediaStream) {}

            override fun onDataChannel(channel: DataChannel) {}

            override fun onRenegotiationNeeded() {}

            override fun onAddTrack(receiver: RtpReceiver, mediaStreams: Array<out MediaStream>) {
                Log.d(TAG, "onAddTrack received track kind: ${receiver.track()?.kind()}")
                val track = receiver.track()
                if (track is AudioTrack) {
                    track.setEnabled(true)
                    routeAudioToSpeaker()
                }
            }

            override fun onTrack(transceiver: RtpTransceiver) {
                Log.d(TAG, "onTrack transceiver received kind: ${transceiver.receiver.track()?.kind()}")
                val track = transceiver.receiver.track()
                if (track is AudioTrack) {
                    track.setEnabled(true)
                    routeAudioToSpeaker()
                }
            }
        }

        val pc = peerConnectionFactory?.createPeerConnection(rtcConfig, pcObserver)

        // Attach local microphone audio track
        try {
            val constraints = MediaConstraints().apply {
                mandatory.add(MediaConstraints.KeyValuePair("googEchoCancellation", "true"))
                mandatory.add(MediaConstraints.KeyValuePair("googAutoGainControl", "true"))
                mandatory.add(MediaConstraints.KeyValuePair("googHighpassFilter", "true"))
                mandatory.add(MediaConstraints.KeyValuePair("googNoiseSuppression", "true"))
            }
            localAudioSource = peerConnectionFactory?.createAudioSource(constraints)
            localAudioTrack = peerConnectionFactory?.createAudioTrack("101", localAudioSource)
            localAudioTrack?.setEnabled(true)

            if (localAudioTrack != null && pc != null) {
                pc.addTrack(localAudioTrack, listOf("ARDAMS"))
                Log.d(TAG, "Added local audio track to PeerConnection")
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error adding audio track", e)
        }

        return pc
    }

    private fun routeAudioToSpeaker() {
        try {
            val audioManager = context.getSystemService(Context.AUDIO_SERVICE) as AudioManager
            audioManager.mode = AudioManager.MODE_IN_COMMUNICATION
            @Suppress("DEPRECATION")
            audioManager.isSpeakerphoneOn = true
            @Suppress("DEPRECATION")
            audioManager.requestAudioFocus(
                null,
                AudioManager.STREAM_VOICE_CALL,
                AudioManager.AUDIOFOCUS_GAIN_TRANSIENT
            )
            Log.d(TAG, "Audio routed to speakerphone with communication mode")
        } catch (e: Exception) {
            Log.w(TAG, "Failed setting speakerphone", e)
        }
    }

    private fun drainQueuedCandidates() {
        val count = queuedRemoteCandidates.size
        if (count > 0) {
            Log.d(TAG, "Draining $count queued ICE candidates")
            for (cand in queuedRemoteCandidates) {
                try {
                    peerConnection?.addIceCandidate(cand)
                } catch (e: Exception) {
                    Log.w(TAG, "Error adding queued candidate", e)
                }
            }
            queuedRemoteCandidates.clear()
        }
    }

    fun startCallerFlow(peerPhone: String) {
        activePeerPhone = peerPhone
        cleanupPeerConnection()
        peerConnection = createPeerConnection()

        val sdpConstraints = MediaConstraints().apply {
            mandatory.add(MediaConstraints.KeyValuePair("OfferToReceiveAudio", "true"))
            mandatory.add(MediaConstraints.KeyValuePair("OfferToReceiveVideo", "false"))
        }

        peerConnection?.createOffer(object : SdpObserver {
            override fun onCreateSuccess(sessionDescription: SessionDescription) {
                Log.d(TAG, "createOffer success")
                peerConnection?.setLocalDescription(object : SdpObserver {
                    override fun onCreateSuccess(desc: SessionDescription?) {}
                    override fun onSetSuccess() {
                        Log.d(TAG, "setLocalDescription success for caller offer")
                        val offerMsg = JsonObject().apply {
                            addProperty("type", "webrtc_offer")
                            val offerObj = JsonObject().apply {
                                addProperty("type", "offer")
                                addProperty("sdp", sessionDescription.description)
                            }
                            add("offer", offerObj)
                            addProperty("to_phone", peerPhone)
                        }
                        sendSignalingMessage(offerMsg)
                    }
                    override fun onCreateFailure(s: String?) {}
                    override fun onSetFailure(s: String?) {
                        Log.e(TAG, "setLocalDescription failure: $s")
                    }
                }, sessionDescription)
            }

            override fun onSetSuccess() {}
            override fun onCreateFailure(s: String?) {
                Log.e(TAG, "createOffer failure: $s")
            }
            override fun onSetFailure(s: String?) {}
        }, sdpConstraints)
    }

    fun handleRemoteOffer(offerSdp: String, peerPhone: String) {
        activePeerPhone = peerPhone
        cleanupPeerConnection()
        peerConnection = createPeerConnection()

        val remoteSession = SessionDescription(SessionDescription.Type.OFFER, offerSdp)
        peerConnection?.setRemoteDescription(object : SdpObserver {
            override fun onSetSuccess() {
                Log.d(TAG, "setRemoteDescription success for incoming offer")
                isRemoteDescriptionSet = true
                drainQueuedCandidates()

                val sdpConstraints = MediaConstraints().apply {
                    mandatory.add(MediaConstraints.KeyValuePair("OfferToReceiveAudio", "true"))
                    mandatory.add(MediaConstraints.KeyValuePair("OfferToReceiveVideo", "false"))
                }
                peerConnection?.createAnswer(object : SdpObserver {
                    override fun onCreateSuccess(answerDesc: SessionDescription) {
                        peerConnection?.setLocalDescription(object : SdpObserver {
                            override fun onCreateSuccess(p0: SessionDescription?) {}
                            override fun onSetSuccess() {
                                Log.d(TAG, "setLocalDescription success for answer")
                                val answerMsg = JsonObject().apply {
                                    addProperty("type", "webrtc_answer")
                                    val answerObj = JsonObject().apply {
                                        addProperty("type", "answer")
                                        addProperty("sdp", answerDesc.description)
                                    }
                                    add("answer", answerObj)
                                    addProperty("to_phone", peerPhone)
                                }
                                sendSignalingMessage(answerMsg)
                            }
                            override fun onCreateFailure(s: String?) {}
                            override fun onSetFailure(s: String?) {
                                Log.e(TAG, "Failed setLocalDescription for answer: $s")
                            }
                        }, answerDesc)
                    }

                    override fun onSetSuccess() {}
                    override fun onCreateFailure(s: String?) {
                        Log.e(TAG, "Failed createAnswer: $s")
                    }
                    override fun onSetFailure(s: String?) {}
                }, sdpConstraints)
            }

            override fun onCreateSuccess(p0: SessionDescription?) {}
            override fun onCreateFailure(s: String?) {}
            override fun onSetFailure(s: String?) {
                Log.e(TAG, "Failed setRemoteDescription on offer: $s")
            }
        }, remoteSession)
    }

    fun handleRemoteAnswer(answerSdp: String) {
        Log.d(TAG, "Setting remote description for incoming answer")
        val remoteSession = SessionDescription(SessionDescription.Type.ANSWER, answerSdp)
        peerConnection?.setRemoteDescription(object : SdpObserver {
            override fun onSetSuccess() {
                Log.d(TAG, "setRemoteDescription success for answer. WebRTC audio active.")
                isRemoteDescriptionSet = true
                drainQueuedCandidates()
                routeAudioToSpeaker()
            }
            override fun onCreateSuccess(p0: SessionDescription?) {}
            override fun onCreateFailure(s: String?) {}
            override fun onSetFailure(s: String?) {
                Log.e(TAG, "Failed setRemoteDescription on answer: $s")
            }
        }, remoteSession)
    }

    fun handleRemoteCandidate(sdpMid: String, sdpMLineIndex: Int, sdp: String) {
        try {
            val candidate = IceCandidate(sdpMid, sdpMLineIndex, sdp)
            if (isRemoteDescriptionSet && peerConnection != null) {
                peerConnection?.addIceCandidate(candidate)
                Log.d(TAG, "Added remote ICE candidate immediately: $sdpMid")
            } else {
                Log.d(TAG, "Queued remote ICE candidate (pending remote desc): $sdpMid")
                queuedRemoteCandidates.add(candidate)
            }
        } catch (e: Exception) {
            Log.w(TAG, "Failed adding remote ice candidate", e)
        }
    }

    fun setMute(muted: Boolean) {
        localAudioTrack?.setEnabled(!muted)
    }

    fun cleanupPeerConnection() {
        try {
            isRemoteDescriptionSet = false
            queuedRemoteCandidates.clear()

            localAudioTrack?.setEnabled(false)
            localAudioTrack?.dispose()
            localAudioTrack = null

            localAudioSource?.dispose()
            localAudioSource = null

            peerConnection?.close()
            peerConnection?.dispose()
            peerConnection = null

            val audioManager = context.getSystemService(Context.AUDIO_SERVICE) as AudioManager
            audioManager.mode = AudioManager.MODE_NORMAL
            @Suppress("DEPRECATION")
            audioManager.isSpeakerphoneOn = false
        } catch (e: Exception) {
            Log.w(TAG, "Error cleaning up peer connection", e)
        }
    }
}
