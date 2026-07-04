import http from "http"
import { Server } from "socket.io"
import dotenv from "dotenv"
import {v4 as uuid} from "uuid"

dotenv.config()
const server = http.createServer()
const port = process.env.PORT || 5000
const io = new Server(server, { cors: { origin: "*" } })
const waitingQueue = []
const activePairs = new Map()  // [user a , user b]
io.on("connection", (socket)=>{
    console.log("Connected:", socket.id);

    socket.on("start", ()=>{
        // Prevent duplicate queuing or matching if already in queue or chatting
        if (waitingQueue.includes(socket.id) || activePairs.has(socket.id)) {
            return;
        }

        while (waitingQueue.length > 0) {
            const partner = waitingQueue.shift();
            // Check if partner is still connected
            if (io.sockets.sockets.has(partner)) {
                const roomId = uuid();
                activePairs.set(socket.id, partner);
                activePairs.set(partner, socket.id);
                
                socket.emit("matched", { roomId });
                io.to(partner).emit("matched", { roomId });
                return;
            }
        }

        // If no active partner in queue, add to queue
        waitingQueue.push(socket.id);
    });

    const handleLeave = () => {
        // Remove from waitingQueue
        const queueIndex = waitingQueue.indexOf(socket.id);
        if (queueIndex !== -1) {
            waitingQueue.splice(queueIndex, 1);
        }

        // If in an active match, notify partner and clean up
        if (activePairs.has(socket.id)) {
            const partner = activePairs.get(socket.id);
            activePairs.delete(socket.id);
            activePairs.delete(partner);
            
            io.to(partner).emit("partnerDisconnected");
        }
    };

    socket.on("leave", handleLeave);

    socket.on("disconnect", () => {
        console.log("Disconnected:", socket.id);
        handleLeave();
    });
})

server.listen(port, () => {
    console.log("server is started at", port);

})