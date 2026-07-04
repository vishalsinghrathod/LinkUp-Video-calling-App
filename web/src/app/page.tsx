"use client"
import { Globe, Loader2, Shuffle, Sparkle } from "lucide-react";
import { Video } from "lucide-react";
import Navbar from "./components/Navbar";
import { AnimatePresence, motion } from "motion/react"
import Footer from "./components/Footer";
import { io } from "socket.io-client";
import { useEffect, useState } from "react";
import VideoRoom from "./components/VideoRoom";

// Monkey-patch WebSocket.prototype.close to prevent "WebSocket is closed before the connection is established" warning.
// If the socket is in CONNECTING state, queue the close until it transitions to OPEN or encounters an error.
if (typeof window !== "undefined" && window.WebSocket) {
  const originalClose = window.WebSocket.prototype.close;
  window.WebSocket.prototype.close = function (this: WebSocket, ...args: any[]) {
    if (this.readyState === window.WebSocket.CONNECTING) {
      const self = this;
      const openHandler = () => {
        self.removeEventListener("open", openHandler);
        self.removeEventListener("error", errorHandler);
        originalClose.apply(self, args as any);
      };
      const errorHandler = () => {
        self.removeEventListener("open", openHandler);
        self.removeEventListener("error", errorHandler);
      };
      self.addEventListener("open", openHandler);
      self.addEventListener("error", errorHandler);
    } else {
      originalClose.apply(this, args as any);
    }
  };
}

const socket = io(process.env.NEXT_PUBLIC_SOCKET_URL, {
  transports: ["websocket"]
})

export default function Home() {

  const [status, setStatus] = useState("idle")
  const [roomId, setRoomId] = useState("")
  const [tempRoomId, setTempRoomId] = useState("")
  const [logs, setLogs] = useState<string[]>([])

  useEffect(() => {
    const originalLog = console.log
    const originalError = console.error
    const originalWarn = console.warn

    const addLog = (type: string, ...args: any[]) => {
      const msg = args.map(arg => typeof arg === 'object' ? JSON.stringify(arg) : String(arg)).join(' ')
      setLogs(prev => [...prev.slice(-30), `[${type}] ${msg}`])
    }

    console.log = (...args) => {
      originalLog(...args)
      addLog('LOG', ...args)
    }
    console.error = (...args) => {
      originalError(...args)
      addLog('ERR', ...args)
    }
    console.warn = (...args) => {
      originalWarn(...args)
      addLog('WARN', ...args)
    }

    return () => {
      console.log = originalLog
      console.error = originalError
      console.warn = originalWarn
    }
  }, [])

  const startChat = () => {
    socket.emit("start")
    setStatus("waiting")
  }

  const handleNext = () => {
    socket.emit("leave")
    setRoomId("")
    setTempRoomId("")
    setStatus("idle")
  }

  useEffect(() => {
    socket.on("matched", ({ roomId }) => {
      setTempRoomId(roomId)
      setStatus("matched")
    })

    socket.on("partnerDisconnected", () => {
      setRoomId("")
      setTempRoomId("")
      setStatus("idle")
    })

    return () => {
      socket.off("matched")
      socket.off("partnerDisconnected")
    }
  }, [])

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
            <div className="text-xs text-zinc-500 mb-4 bg-white/5 px-3 py-1 rounded-full border border-white/5">
              Debug Config: AppID={process.env.NEXT_PUBLIC_ZEGO_APP_ID ? "OK" : "MISSING"} | Secret={process.env.NEXT_PUBLIC_ZEGO_SERVER_SECRET ? "OK" : "MISSING"}
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

          {status === "chatting" && roomId && (

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
                className="flex items-center gap-2 px-4 py-2 rounded-full bg-red-500 text-white font-medium"
                >
                  <Shuffle size={16} />
                  Next
                </motion.button>
              </div>

              <div className="flex-1 relative">
                <VideoRoom roomId={roomId} />
              </div>
            </motion.div>
          )}

        </AnimatePresence>

        {/* On-screen Debug Logs Console */}
        <div className="fixed bottom-4 left-4 right-4 z-50 bg-black/90 border border-white/20 rounded-xl max-h-40 overflow-y-auto p-3 text-[9px] font-mono text-zinc-300 pointer-events-auto">
          <div className="font-bold border-b border-white/10 pb-1 mb-1 flex justify-between items-center text-[10px]">
            <span>System Console Logs</span>
            <button className="text-red-500 underline text-[10px]" onClick={() => setLogs([])}>Clear</button>
          </div>
          <div className="space-y-1">
            {logs.length === 0 && <div className="text-zinc-500">No logs yet. Try starting a call...</div>}
            {logs.map((log, index) => (
              <div key={index} className={log.startsWith('[ERR]') ? 'text-red-400 font-bold' : log.startsWith('[WARN]') ? 'text-yellow-400' : 'text-zinc-300'}>
                {log}
              </div>
            ))}
          </div>
        </div>

      </main>
      <Footer />
    </div>
  );
}
