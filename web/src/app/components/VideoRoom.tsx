"use client"

import React, { useEffect, useRef, useState } from 'react'
import { motion } from 'motion/react'
import { Mic, MicOff, Video as VideoIcon, VideoOff, Send, Loader2, Sparkles, MessageSquare } from 'lucide-react'

interface VideoRoomProps {
  roomId: string;
  ws: WebSocket;
  isInitiator: boolean;
}

interface Message {
  sender: 'me' | 'stranger' | 'system';
  text: string;
  timestamp: Date;
}

function VideoRoom({ roomId, ws, isInitiator }: VideoRoomProps) {
  const [localStream, setLocalStream] = useState<MediaStream | null>(null)
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null)
  const [connectionState, setConnectionState] = useState<string>("new")
  const [isMuted, setIsMuted] = useState(false)
  const [isVideoOff, setIsVideoOff] = useState(false)
  const [messages, setMessages] = useState<Message[]>([
    { sender: 'system', text: 'You are now matched! Connect to begin.', timestamp: new Date() }
  ])
  const [inputText, setInputText] = useState("")
  const [isMyVideoMain, setIsMyVideoMain] = useState(false)

  const localVideoRef = useRef<HTMLVideoElement | null>(null)
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null)
  const localStreamRef = useRef<MediaStream | null>(null)
  const remoteStreamRef = useRef<MediaStream | null>(null)
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null)
  const queuedCandidatesRef = useRef<any[]>([])
  const pendingOfferRef = useRef<RTCSessionDescriptionInit | null>(null)
  const chatEndRef = useRef<HTMLDivElement | null>(null)

  // Auto-scroll chat to bottom
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Attach local stream to element when ready
  useEffect(() => {
    if (localStream && localVideoRef.current) {
      localVideoRef.current.srcObject = localStream
    }
  }, [localStream])

  // Attach remote stream to element when ready
  useEffect(() => {
    if (remoteStream && remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = remoteStream
    }
  }, [remoteStream])

  // Diagnostic check for ICE Servers on mount
  useEffect(() => {
    let rawIce = process.env.NEXT_PUBLIC_ICE_SERVERS;
    if (rawIce) {
      rawIce = rawIce.trim();
      if (rawIce.startsWith("'") && rawIce.endsWith("'")) {
        rawIce = rawIce.slice(1, -1);
      }
      if (rawIce.startsWith('"') && rawIce.endsWith('"')) {
        rawIce = rawIce.slice(1, -1);
      }
      try {
        const parsed = JSON.parse(rawIce);
        const hasTurn = parsed.some((s: any) => s.urls && (String(s.urls).startsWith("turn:") || String(s.urls).startsWith("turns:")));
        setMessages(prev => [...prev, {
          sender: 'system',
          text: `ICE Config: Loaded (${parsed.length} servers, TURN: ${hasTurn ? "YES" : "NO"})`,
          timestamp: new Date()
        }]);
      } catch (e: any) {
        setMessages(prev => [...prev, {
          sender: 'system',
          text: `ICE Config Error: ${e.message}`,
          timestamp: new Date()
        }]);
      }
    } else {
      setMessages(prev => [...prev, {
        sender: 'system',
        text: "ICE Config: Default public STUN only (No TURN config loaded)",
        timestamp: new Date()
      }]);
    }
  }, []);

  // Get user media and signal ready state
  useEffect(() => {
    let localStreamInstance: MediaStream | null = null;

    const startMedia = async () => {
      try {
        console.log("Accessing camera and microphone...");
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 640 },
            height: { ideal: 480 },
            frameRate: { ideal: 30 }
          },
          audio: true
        });
        localStreamInstance = stream;
        localStreamRef.current = stream;
        setLocalStream(stream);

        // Check if there was a pending offer waiting for this local stream
        if (pendingOfferRef.current) {
          console.log("Processing pending WebRTC offer...");
          handleOffer(pendingOfferRef.current, stream);
          pendingOfferRef.current = null;
        }

        // Notify signaling server that we have loaded camera streams and are ready to connect
        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: "ready" }));
        }
      } catch (err) {
        console.error("Camera/Mic access error:", err);
        setMessages(prev => [...prev, {
          sender: 'system',
          text: 'Error: Could not access camera or microphone. Please check site permissions.',
          timestamp: new Date()
        }]);
      }
    };

    startMedia();

    return () => {
      console.log("Cleaning up VideoRoom...");
      if (peerConnectionRef.current) {
        peerConnectionRef.current.close();
        peerConnectionRef.current = null;
      }
      if (localStreamInstance) {
        localStreamInstance.getTracks().forEach(track => track.stop());
      }
    };
  }, [roomId, ws]);

  // Set up RTCPeerConnection
  const setupPeerConnection = (stream: MediaStream) => {
    if (peerConnectionRef.current) {
      return peerConnectionRef.current;
    }

    console.log("Setting up RTCPeerConnection...");
    let iceServers = [
      { urls: "stun:stun.l.google.com:19302" },
      { urls: "stun:stun1.l.google.com:19302" },
      { urls: "stun:stun2.l.google.com:19302" }
    ];

    let rawIce = process.env.NEXT_PUBLIC_ICE_SERVERS;
    if (rawIce) {
      rawIce = rawIce.trim();
      if (rawIce.startsWith("'") && rawIce.endsWith("'")) {
        rawIce = rawIce.slice(1, -1);
      }
      if (rawIce.startsWith('"') && rawIce.endsWith('"')) {
        rawIce = rawIce.slice(1, -1);
      }
      try {
        iceServers = JSON.parse(rawIce);
        console.log("Custom ICE/TURN servers loaded successfully.");
      } catch (e) {
        console.error("Error parsing NEXT_PUBLIC_ICE_SERVERS env:", e);
      }
    }

    const pc = new RTCPeerConnection({ iceServers });

    // Add local media tracks
    stream.getTracks().forEach(track => {
      pc.addTrack(track, stream);
    });

    pc.onicecandidate = (event) => {
      if (event.candidate && ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
          type: "signal",
          payload: { candidate: event.candidate }
        }));
      }
    };

    pc.ontrack = (event) => {
      console.log("Received remote track:", event.track.kind);

      let stream = remoteStreamRef.current;
      if (!stream) {
        stream = event.streams[0] || new MediaStream();
        remoteStreamRef.current = stream;
        setRemoteStream(stream);
      }

      const hasTrack = stream.getTracks().some(t => t.id === event.track.id);
      if (!hasTrack) {
        stream.addTrack(event.track);
      }

      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = stream;
      }
    };

    pc.onconnectionstatechange = () => {
      console.log("WebRTC status:", pc.connectionState);
      setConnectionState(pc.connectionState);

      if (pc.connectionState === "connected") {
        setMessages(prev => [...prev, {
          sender: 'system',
          text: 'Call connected! Have a great conversation.',
          timestamp: new Date()
        }]);
      } else if (pc.connectionState === "disconnected" || pc.connectionState === "closed") {
        setMessages(prev => [...prev, {
          sender: 'system',
          text: 'Stranger disconnected.',
          timestamp: new Date()
        }]);
        setRemoteStream(null);
      } else if (pc.connectionState === "failed") {
        setMessages(prev => [...prev, {
          sender: 'system',
          text: 'WebRTC Connection failed. Trying to reconnect...',
          timestamp: new Date()
        }]);
      }
    };

    peerConnectionRef.current = pc;
    return pc;
  };

  // Initiate call (Offer side)
  const initiateCall = async (stream: MediaStream) => {
    const pc = setupPeerConnection(stream);
    try {
      console.log("Creating WebRTC offer...");
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      ws.send(JSON.stringify({
        type: "signal",
        payload: { sdp: offer }
      }));
    } catch (err) {
      console.error("Failed to create offer:", err);
    }
  };

  // Handle Offer (Answer side)
  const handleOffer = async (sdp: RTCSessionDescriptionInit, stream: MediaStream) => {
    const pc = setupPeerConnection(stream);
    try {
      console.log("Setting remote description (offer)...");
      await pc.setRemoteDescription(new RTCSessionDescription(sdp));
      console.log("Creating answer...");
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      ws.send(JSON.stringify({
        type: "signal",
        payload: { sdp: answer }
      }));

      // Flush queued candidates
      console.log("Flushing queued candidates...");
      for (const candidate of queuedCandidatesRef.current) {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      }
      queuedCandidatesRef.current = [];
    } catch (err) {
      console.error("Error handling offer:", err);
    }
  };

  // Handle Answer
  const handleAnswer = async (sdp: RTCSessionDescriptionInit) => {
    const pc = peerConnectionRef.current;
    if (!pc) return;
    try {
      console.log("Setting remote description (answer)...");
      await pc.setRemoteDescription(new RTCSessionDescription(sdp));

      // Flush queued candidates
      console.log("Flushing queued candidates...");
      for (const candidate of queuedCandidatesRef.current) {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      }
      queuedCandidatesRef.current = [];
    } catch (err) {
      console.error("Error handling answer:", err);
    }
  };

  // Handle ICE Candidate
  const handleCandidate = async (candidate: RTCIceCandidateInit) => {
    const pc = peerConnectionRef.current;
    if (pc && pc.remoteDescription) {
      try {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (err) {
        console.error("Error adding ICE candidate:", err);
      }
    } else {
      queuedCandidatesRef.current.push(candidate);
    }
  };

  // Handle incoming messages
  useEffect(() => {
    const onMessage = async (event: MessageEvent) => {
      let data;
      try {
        data = JSON.parse(event.data);
      } catch (e) {
        return;
      }

      if (data.type === "initiate") {
        if (isInitiator && localStreamRef.current) {
          initiateCall(localStreamRef.current);
        }
      } else if (data.type === "signal") {
        const { sdp, candidate } = data.data;
        if (sdp) {
          if (sdp.type === "offer") {
            if (localStreamRef.current) {
              handleOffer(sdp, localStreamRef.current);
            } else {
              pendingOfferRef.current = sdp;
            }
          } else if (sdp.type === "answer") {
            handleAnswer(sdp);
          }
        } else if (candidate) {
          handleCandidate(candidate);
        }
      } else if (data.type === "chat") {
        setMessages(prev => [...prev, {
          sender: "stranger",
          text: data.message,
          timestamp: new Date()
        }]);
      }
    };

    ws.addEventListener("message", onMessage);
    return () => {
      ws.removeEventListener("message", onMessage);
    };
  }, [ws, isInitiator]);

  // Toggle Mute Audio
  const toggleMute = () => {
    if (localStream) {
      const audioTrack = localStream.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setIsMuted(!audioTrack.enabled);
      }
    }
  };

  // Toggle Video Camera
  const toggleVideo = () => {
    if (localStream) {
      const videoTrack = localStream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        setIsVideoOff(!videoTrack.enabled);
      }
    }
  };

  // Send text chat message
  const sendChatMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim()) return;

    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: "chat",
        message: inputText.trim()
      }));

      setMessages(prev => [...prev, {
        sender: 'me',
        text: inputText.trim(),
        timestamp: new Date()
      }]);
      setInputText("");
    }
  };

  return (
    <div className="flex flex-col md:flex-row h-full w-full bg-zinc-950 overflow-hidden">
      
      {/* LEFT COLUMN: Video Feeds */}
      <div className="flex-1 flex flex-col p-4 gap-4 h-1/2 md:h-full justify-between items-center relative overflow-hidden">
        <div className="relative w-full h-full max-h-[75vh] bg-zinc-950 rounded-2xl overflow-hidden border border-white/5 shadow-2xl flex items-center justify-center">
          
          {/* STRANGER VIDEO WINDOW */}
          <div 
            onClick={() => isMyVideoMain && setIsMyVideoMain(false)}
            className={`${
              isMyVideoMain 
                ? 'absolute bottom-4 right-4 w-32 sm:w-48 aspect-video rounded-xl border border-white/20 shadow-2xl z-10 cursor-pointer hover:scale-105 hover:border-purple-500 transition-all duration-300' 
                : 'w-full h-full relative'
            } bg-zinc-900/60 overflow-hidden flex items-center justify-center`}
          >
            {remoteStream ? (
              <video
                ref={remoteVideoRef}
                autoPlay
                playsInline
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center bg-zinc-950/40 backdrop-blur-xs p-2">
                <Loader2 className="animate-spin text-purple-500 mb-1.5" size={isMyVideoMain ? 20 : 32} />
                {!isMyVideoMain && (
                  <>
                    <p className="text-zinc-300 font-medium text-[10px] sm:text-xs">Connecting media stream...</p>
                    <p className="text-zinc-500 text-[8px] mt-0.5">Establishing peer-to-peer connection</p>
                  </>
                )}
              </div>
            )}
            
            <div className={`absolute ${isMyVideoMain ? 'top-1.5 left-1.5 text-[8px]' : 'top-3 left-3 text-xs'} px-2.5 py-0.5 rounded-full bg-black/60 backdrop-blur-md font-semibold text-white/90 border border-white/10 flex items-center gap-1 shadow-md select-none`}>
              <span className="w-1.5 h-1.5 rounded-full bg-purple-500 animate-pulse"></span>
              Stranger
            </div>
          </div>

          {/* LOCAL VIDEO WINDOW */}
          <div 
            onClick={() => !isMyVideoMain && setIsMyVideoMain(true)}
            className={`${
              !isMyVideoMain 
                ? 'absolute bottom-4 right-4 w-32 sm:w-48 aspect-video rounded-xl border border-white/20 shadow-2xl z-10 cursor-pointer hover:scale-105 hover:border-green-500 transition-all duration-300' 
                : 'w-full h-full relative'
            } bg-zinc-900/60 overflow-hidden flex items-center justify-center`}
          >
            {!isVideoOff && localStream ? (
              <video
                ref={localVideoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover scale-x-[-1]"
              />
            ) : (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center bg-zinc-950/80 p-2">
                <VideoOff className="text-zinc-500 mb-1" size={!isMyVideoMain ? 20 : 32} />
                {isMyVideoMain && <p className="text-zinc-400 font-medium text-xs">Your Camera is Off</p>}
              </div>
            )}

            <div className={`absolute ${!isMyVideoMain ? 'top-1.5 left-1.5 text-[8px]' : 'top-3 left-3 text-xs'} px-2.5 py-0.5 rounded-full bg-black/60 backdrop-blur-md font-semibold text-white/90 border border-white/10 flex items-center gap-1 shadow-md select-none`}>
              <span className="w-1.5 h-1.5 rounded-full bg-green-500"></span>
              You
            </div>
          </div>

        </div>

        {/* Floating Controls Overlay */}
        <div className="w-full py-2 flex items-center justify-between border-t border-white/5 px-2">
          <div className="text-[10px] sm:text-xs text-zinc-500 font-mono">
            Room: <span className="text-zinc-400 select-all font-semibold">{roomId.substring(0, 8)}...</span>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={toggleMute}
              className={`p-3 rounded-full border transition duration-200 cursor-pointer shadow-md ${
                isMuted
                  ? 'bg-red-500/25 border-red-500/30 text-red-400 hover:bg-red-500/40'
                  : 'bg-zinc-800 border-white/10 text-zinc-300 hover:bg-zinc-700'
              }`}
              title={isMuted ? "Unmute Mic" : "Mute Mic"}
            >
              {isMuted ? <MicOff size={18} /> : <Mic size={18} />}
            </button>

            <button
              onClick={toggleVideo}
              className={`p-3 rounded-full border transition duration-200 cursor-pointer shadow-md ${
                isVideoOff
                  ? 'bg-red-500/25 border-red-500/30 text-red-400 hover:bg-red-500/40'
                  : 'bg-zinc-800 border-white/10 text-zinc-300 hover:bg-zinc-700'
              }`}
              title={isVideoOff ? "Turn Camera On" : "Turn Camera Off"}
            >
              {isVideoOff ? <VideoOff size={18} /> : <VideoIcon size={18} />}
            </button>
          </div>

          <div className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${
              connectionState === "connected" ? "bg-green-500 shadow-[0_0_8px_#22c55e]" : "bg-yellow-500 animate-pulse"
            }`} />
            <span className="text-[10px] sm:text-xs text-zinc-400 font-mono capitalize">
              {connectionState === "connected" ? "connected" : connectionState === "new" || connectionState === "connecting" ? "connecting" : "reconnecting"}
            </span>
          </div>
        </div>

      </div>

      {/* RIGHT COLUMN: Text Chat Section */}
      <div className="w-full md:w-80 lg:w-96 border-t md:border-t-0 md:border-l border-white/10 flex flex-col bg-zinc-900/40 backdrop-blur-md h-1/2 md:h-full relative overflow-hidden">
        
        {/* Chat Panel Title */}
        <div className="px-4 py-3 bg-zinc-950/60 border-b border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-2 text-zinc-300 font-semibold text-xs tracking-wide uppercase">
            <MessageSquare size={14} className="text-purple-400" />
            Conversation Log
          </div>
          <div className="text-[10px] text-zinc-500 px-2 py-0.5 rounded-full bg-white/5 border border-white/5 flex items-center gap-1 font-mono">
            <Sparkles size={10} className="text-yellow-400 animate-pulse" />
            stranger-chat
          </div>
        </div>

        {/* Chat History Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3 scrollbar-thin scrollbar-thumb-zinc-800 scrollbar-track-transparent">
          {messages.map((msg, index) => {
            if (msg.sender === 'system') {
              return (
                <div key={index} className="flex justify-center my-2">
                  <span className="text-[10px] text-zinc-500 bg-white/5 border border-white/5 px-3 py-1 rounded-full text-center max-w-[85%] select-none font-mono">
                    {msg.text}
                  </span>
                </div>
              )
            }
            
            const isMe = msg.sender === 'me';
            return (
              <div key={index} className={`flex w-full ${isMe ? 'justify-end' : 'justify-start'}`}>
                <div className={`flex flex-col max-w-[75%] ${isMe ? 'items-end' : 'items-start'}`}>
                  <div className={`px-3.5 py-2 text-sm shadow-md rounded-2xl break-words leading-relaxed ${
                    isMe 
                      ? 'bg-linear-to-r from-purple-600 to-indigo-600 text-white rounded-br-none' 
                      : 'bg-zinc-800 text-zinc-100 rounded-bl-none border border-white/5'
                  }`}>
                    {msg.text}
                  </div>
                  <span className="text-[9px] text-zinc-500 mt-1 px-1 font-mono">
                    {isMe ? 'You' : 'Stranger'} • {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              </div>
            )
          })}
          <div ref={chatEndRef} />
        </div>

        {/* Message Typing Box */}
        <form onSubmit={sendChatMessage} className="p-3 border-t border-white/10 bg-zinc-950/80 flex items-center gap-2">
          <input
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder="Type message to stranger..."
            className="flex-1 bg-zinc-900 text-white placeholder-zinc-500 px-4 py-2.5 rounded-xl border border-white/5 focus:outline-hidden focus:border-purple-500 text-sm transition"
          />
          <button
            type="submit"
            className="p-2.5 bg-purple-600 hover:bg-purple-500 active:scale-95 text-white rounded-xl transition duration-150 flex items-center justify-center cursor-pointer shadow-lg shadow-purple-500/10"
            title="Send Message"
          >
            <Send size={16} />
          </button>
        </form>

      </div>
      
    </div>
  )
}

export default VideoRoom;