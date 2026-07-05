"use client"
import { Globe, Loader2, Shuffle, Sparkle } from "lucide-react";
import { Video } from "lucide-react";
import Navbar from "./components/Navbar";
import { AnimatePresence, motion } from "motion/react"
import Footer from "./components/Footer";
import { useEffect, useState, useRef } from "react";
import VideoRoom from "./components/VideoRoom";

export default function Home() {

  const [status, setStatus] = useState("idle")
  const [roomId, setRoomId] = useState("")
  const [tempRoomId, setTempRoomId] = useState("")
  const [isInitiator, setIsInitiator] = useState(false)
  const [ws, setWs] = useState<WebSocket | null>(null)

  const PREDEFINED_TAGS = ["Gaming", "Music", "Tech", "Movies", "Sports", "Chatting", "Anime", "Coding"]
  const [selectedTags, setSelectedTags] = useState<string[]>([])
  const [customTag, setCustomTag] = useState("")

  const toggleTag = (tag: string) => {
    setSelectedTags(prev =>
      prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]
    )
  }

  const addCustomTag = () => {
    const trimmed = customTag.trim().toLowerCase()
    if (trimmed && !selectedTags.includes(trimmed)) {
      setSelectedTags(prev => [...prev, trimmed])
      setCustomTag("")
    }
  }

  const connectSocket = (tagsToSend: string[]) => {
    const rawUrl = process.env.NEXT_PUBLIC_SOCKET_URL || "http://localhost:8000";
    const wsUrl = rawUrl.replace(/^http/, "ws");
    console.log("Connecting to WebSocket:", wsUrl);
    const socket = new WebSocket(wsUrl);

    socket.onopen = () => {
      console.log("WebSocket connected successfully");
      socket.send(JSON.stringify({ type: "start", tags: tagsToSend }));
      setStatus("waiting");
    };

    socket.onmessage = (event) => {
      let data;
      try {
        data = JSON.parse(event.data);
      } catch (e) {
        console.error("Error parsing message:", event.data);
        return;
      }

      console.log("Signal received:", data.type);

      if (data.type === "matched") {
        setTempRoomId(data.roomId);
        setIsInitiator(data.isInitiator);
        setStatus("matched");
      } else if (data.type === "partnerDisconnected") {
        console.log("Partner disconnected");
        setRoomId("");
        setTempRoomId("");
        setIsInitiator(false);
        setStatus("idle");
      }
    };

    socket.onclose = () => {
      console.log("WebSocket closed");
      setWs(null);
      setRoomId("");
      setTempRoomId("");
      setIsInitiator(false);
      setStatus("idle");
    };

    socket.onerror = (err) => {
      console.error("WebSocket error:", err);
    };

    setWs(socket);
  };

  const startChat = () => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "start", tags: selectedTags }));
      setStatus("waiting");
    } else {
      connectSocket(selectedTags);
    }
  };

  const handleNext = () => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "leave" }));
    }
    setRoomId("");
    setTempRoomId("");
    setIsInitiator(false);
    setStatus("idle");
  };

  useEffect(() => {
    return () => {
      if (ws) {
        ws.close();
      }
    };
  }, [ws]);

  return (
    <div>
      <Navbar show={status!=="chatting"} />
      <main className="relative min-h-screen w-full bg-linear-to-br from-black via-zinc-900 to-black text-white overflow-hidden">
        <div className="absolute -top-32 -left-32 w-96 h-96 bg-purple-600/20 rounded-full blur-3xl" />
        <div className="absolute top-1/3 -right-32 w-96 h-96 bg-blue-600/20 rounded-full blur-3xl" />
        <AnimatePresence>
          {status === "idle" && <motion.div
            initial={{ y: 40 }}
            animate={{ y: 0 }}
            exit={{ y: 40, opacity: 0 }}
            transition={{ duration: 0.4 }}
            className="relative z-10 flex flex-col items-center justify-center min-h-screen px-6 text-center"
          >
            <div className="mb-6 flex items-center justify-center w-16 h-16 rounded-2xl bg-white/10 backdrop-blur border-b border-white/10">
              <Sparkle />
            </div>
            <div className="text-4xl sm:text-5xl font-bold tracking-tight mb-3">
              LinkUp
            </div>
            <p className="text-zinc-400 max-w-md mb-8 text-sm sm:text-base">
              Anonymous video conversations with strangers worldwide.
              No sign-up. No identity. Just pure connection.
            </p>


            {/* Tag Selection UI */}
            <div className="w-full max-w-md mb-8 p-5 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-xs text-left">
              <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-3">
                Select your interests (Optional)
              </label>
              
              <div className="flex flex-wrap gap-2 mb-3.5">
                {PREDEFINED_TAGS.map((tag) => {
                  const isSelected = selectedTags.includes(tag.toLowerCase());
                  return (
                    <button
                      key={tag}
                      onClick={() => toggleTag(tag.toLowerCase())}
                      className={`px-3 py-1.5 rounded-full text-xs font-medium cursor-pointer transition duration-150 border ${
                        isSelected
                          ? "bg-purple-600 border-purple-500 text-white shadow-lg shadow-purple-500/20"
                          : "bg-white/5 border-white/5 text-zinc-300 hover:bg-white/10"
                      }`}
                    >
                      {tag}
                    </button>
                  );
                })}
              </div>

              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Add custom tag (e.g. travel, books)"
                  value={customTag}
                  onChange={(e) => setCustomTag(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addCustomTag();
                    }
                  }}
                  className="flex-1 min-w-0 bg-white/5 text-white placeholder-zinc-500 px-3.5 py-2 rounded-xl border border-white/5 focus:outline-hidden focus:border-purple-500 text-xs transition"
                />
                <button
                  type="button"
                  onClick={addCustomTag}
                  className="px-4 py-2 bg-zinc-850 hover:bg-zinc-700 active:scale-95 border border-white/5 text-white rounded-xl text-xs font-medium transition cursor-pointer"
                >
                  Add
                </button>
              </div>

              {selectedTags.some(t => !PREDEFINED_TAGS.map(pt => pt.toLowerCase()).includes(t)) && (
                <div className="flex flex-wrap gap-1.5 mt-3 pt-3 border-t border-white/5">
                  {selectedTags
                    .filter(t => !PREDEFINED_TAGS.map(pt => pt.toLowerCase()).includes(t))
                    .map((tag) => (
                      <span
                        key={tag}
                        onClick={() => toggleTag(tag)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-purple-600/35 border border-purple-500/30 text-[10px] text-purple-300 font-medium cursor-pointer hover:bg-red-950/40 hover:border-red-500/30 hover:text-red-300 transition"
                        title="Click to remove"
                      >
                        #{tag} &times;
                      </span>
                    ))}
                </div>
              )}
            </div>

            <motion.button
              whileHover={{ scale: 1.09 }}
              whileTap={{ scale: 0.97 }}
              className="flex items-center gap-3 px-8 py-4 rounded-2xl bg-linear-to-r from-white to-zinc-200 text-black font-semibold text-lg shadow-xl"
              onClick={startChat}
            >
              <Video size={22} /> Start Anonymous Chat
            </motion.button>

          </motion.div>}

          {status === "waiting" &&
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.7 }}
              className="relative z-10 flex flex-col items-center justify-center min-h-screen gap-6">

              <motion.div
                animate={{ rotate: 360 }}
                transition={{ repeat: Infinity, ease: "linear", duration: 1.1 }}
              >
                <Loader2 size={56} />
              </motion.div>
              <motion.p
                animate={{ opacity: [0.4, 1, 0.4] }}
                transition={{ repeat: Infinity, ease: "linear", duration: 1.1 }}
                className="text-lg sm:text-xl text-zinc-400"
              >
                Matching you with someone new...
              </motion.p>
            </motion.div>}

          {status === "matched" && (
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              transition={{ duration: 0.4 }}
              className="relative z-10 flex flex-col items-center justify-center min-h-screen px-6 text-center"
            >
              <div className="mb-6 flex items-center justify-center w-16 h-16 rounded-2xl bg-green-500/10 text-green-400 border border-green-500/20 animate-pulse">
                <Sparkle size={28} />
              </div>
              <h2 className="text-3xl font-bold tracking-tight mb-2">Match Found! ⚡</h2>
              <p className="text-zinc-400 max-w-sm mb-8 text-sm sm:text-base">
                A stranger is ready to chat. Tap the button below to connect your video & audio.
              </p>
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => {
                  setRoomId(tempRoomId)
                  setStatus("chatting")
                }}
                className="flex items-center gap-3 px-8 py-4 rounded-2xl bg-linear-to-r from-emerald-500 to-green-600 text-white font-semibold text-lg shadow-xl shadow-green-500/20 cursor-pointer"
              >
                <Video size={22} /> Connect Video Call
              </motion.button>
            </motion.div>
          )}

          {status === "chatting" && roomId && ws && (

            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.7 }}
              className="fixed inset-0 flex flex-col bg-black z-20"
            >

              <div className="flex items-center justify-between px-4 sm:px-6 py-4 bg-black/60 backdrop-blur border-b border-white/10">
                <div className="flex items-center gap-2 text-zinc-400 text-sm">
                  <Globe />
                  LinkUp | connected
                </div>
                <motion.button 
                whileHover={{scale: 1.05}} 
                whileTap={{scale: 0.95}}
                onClick={handleNext}
                className="flex items-center gap-2 px-4 py-2 rounded-full bg-red-500 text-white font-medium cursor-pointer"
                >
                  <Shuffle size={16} />
                  Next
                </motion.button>
              </div>

              <div className="flex-1 relative overflow-hidden">
                <VideoRoom roomId={roomId} ws={ws} isInitiator={isInitiator} />
              </div>
            </motion.div>
          )}

        </AnimatePresence>



      </main>
      <Footer />
    </div>
  );
}
