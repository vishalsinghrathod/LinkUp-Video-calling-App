import http from "http"
import { WebSocketServer } from "ws"
import dotenv from "dotenv"
import crypto from "crypto"

dotenv.config()

const server = http.createServer()
const port = process.env.PORT || 8000

const wss = new WebSocketServer({ server })

const clients = new Map() // ws.id -> ws instance
const waitingQueue = []   // Array of ws.id
const activePairs = new Map() // ws.id -> partner ws.id

wss.on("connection", (ws) => {
  ws.id = crypto.randomUUID()
  clients.set(ws.id, ws)
  ws.isReady = false
  console.log("Connected:", ws.id)

  ws.on("message", (messageData) => {
    let parsed
    try {
      parsed = JSON.parse(messageData)
    } catch (e) {
      console.error("Invalid JSON received:", messageData)
      return
    }

    const { type, payload, message, reaction, question, filter, isTyping, tags } = parsed

    if (type === "start") {
      // Prevent duplicate matching/queuing
      if (waitingQueue.includes(ws.id) || activePairs.has(ws.id)) {
        return
      }

      ws.tags = (tags || []).map(t => t.toLowerCase().trim()).filter(Boolean)
      ws.joinedQueueAt = Date.now()

      let matchedPartnerIdx = -1
      for (let i = 0; i < waitingQueue.length; i++) {
        const partnerId = waitingQueue[i]
        const partnerWs = clients.get(partnerId)
        if (partnerWs && partnerWs.readyState === partnerWs.OPEN) {
          const hasCommonTag = ws.tags.some(tag => (partnerWs.tags || []).includes(tag))
          const isWildcard = ws.tags.length === 0 || (partnerWs.tags || []).length === 0
          const hasWaitedLong = (Date.now() - (partnerWs.joinedQueueAt || 0)) > 5000

          if (hasCommonTag || isWildcard || hasWaitedLong) {
            matchedPartnerIdx = i
            break
          }
        }
      }

      if (matchedPartnerIdx !== -1) {
        const partnerId = waitingQueue.splice(matchedPartnerIdx, 1)[0]
        const partnerWs = clients.get(partnerId)
        if (partnerWs) {
          const roomId = crypto.randomUUID()
          activePairs.set(ws.id, partnerId)
          activePairs.set(partnerId, ws.id)

          const isWsInitiator = ws.id < partnerId
          ws.send(JSON.stringify({ type: "matched", roomId, isInitiator: isWsInitiator }))
          partnerWs.send(JSON.stringify({ type: "matched", roomId, isInitiator: !isWsInitiator }))
          return
        }
      }

      // No partner found, put in queue
      waitingQueue.push(ws.id)
    }

    else if (type === "ready") {
      const partnerId = activePairs.get(ws.id)
      if (partnerId) {
        const partnerWs = clients.get(partnerId)
        ws.isReady = true
        // If both peers in the pair are ready (have camera streams active), trigger initiator
        if (partnerWs && partnerWs.isReady) {
          // Deterministic initiator role based on lexicographical order of UUIDs
          const initiatorId = ws.id < partnerId ? ws.id : partnerId
          const initiatorWs = clients.get(initiatorId)
          if (initiatorWs) {
            initiatorWs.send(JSON.stringify({ type: "initiate" }))
          }
        }
      }
    }

    else if (type === "signal") {
      const partnerId = activePairs.get(ws.id)
      if (partnerId) {
        const partnerWs = clients.get(partnerId)
        if (partnerWs && partnerWs.readyState === partnerWs.OPEN) {
          partnerWs.send(JSON.stringify({ type: "signal", data: payload }))
        }
      }
    }

    else if (type === "chat") {
      const partnerId = activePairs.get(ws.id)
      if (partnerId) {
        const partnerWs = clients.get(partnerId)
        if (partnerWs && partnerWs.readyState === partnerWs.OPEN) {
          partnerWs.send(JSON.stringify({ type: "chat", sender: "partner", message }))
        }
      }
    }

    else if (type === "reaction") {
      const partnerId = activePairs.get(ws.id)
      if (partnerId) {
        const partnerWs = clients.get(partnerId)
        if (partnerWs && partnerWs.readyState === partnerWs.OPEN) {
          partnerWs.send(JSON.stringify({ type: "reaction", reaction }))
        }
      }
    }

    else if (type === "icebreaker") {
      const partnerId = activePairs.get(ws.id)
      if (partnerId) {
        const partnerWs = clients.get(partnerId)
        if (partnerWs && partnerWs.readyState === partnerWs.OPEN) {
          partnerWs.send(JSON.stringify({ type: "icebreaker", question }))
        }
      }
    }

    else if (type === "filter") {
      const partnerId = activePairs.get(ws.id)
      if (partnerId) {
        const partnerWs = clients.get(partnerId)
        if (partnerWs && partnerWs.readyState === partnerWs.OPEN) {
          partnerWs.send(JSON.stringify({ type: "filter", filter }))
        }
      }
    }

    else if (type === "typing") {
      const partnerId = activePairs.get(ws.id)
      if (partnerId) {
        const partnerWs = clients.get(partnerId)
        if (partnerWs && partnerWs.readyState === partnerWs.OPEN) {
          partnerWs.send(JSON.stringify({ type: "typing", isTyping }))
        }
      }
    }

    else if (type === "leave") {
      handleLeave(ws)
    }
  })

  const handleLeave = (socket) => {
    // Remove from queue
    const idx = waitingQueue.indexOf(socket.id)
    if (idx !== -1) {
      waitingQueue.splice(idx, 1)
    }

    // Clean up active pair
    if (activePairs.has(socket.id)) {
      const partnerId = activePairs.get(socket.id)
      activePairs.delete(socket.id)
      activePairs.delete(partnerId)

      const partnerWs = clients.get(partnerId)
      if (partnerWs) {
        partnerWs.isReady = false
        partnerWs.send(JSON.stringify({ type: "partnerDisconnected" }))
      }
    }
    socket.isReady = false
  }

  ws.on("close", () => {
    console.log("Disconnected:", ws.id)
    handleLeave(ws)
    clients.delete(ws.id)
  })

  ws.on("error", (err) => {
    console.error(`Socket error for ${ws.id}:`, err)
  })
})

server.listen(port, () => {
  console.log("server is started at", port)
})