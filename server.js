const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(cors({ origin: '*' }));
app.use(express.static(path.join(__dirname)));

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
  allowEIO3: true,
  transports: ['websocket', 'polling']
});

let waitingUsers = [];
let activePairs = {};

app.get('/', (req, res) => {
  res.send(`
    <html><body style="font-family:sans-serif;background:#0f0c29;color:white;padding:40px;text-align:center">
    <h1>⚡ Chattr Server</h1>
    <p style="color:#34d399">● Online & Running</p>
    <p>Connected users: <b id="u">${Object.keys(io.sockets.sockets).length}</b></p>
    <p>Waiting: <b>${waitingUsers.length}</b></p>
    <p>Active pairs: <b>${Object.keys(activePairs).length / 2}</b></p>
    </body></html>
  `);
});

io.on('connection', (socket) => {
  console.log('✅ Connected:', socket.id);

  socket.on('find_stranger', (data) => {
    // Remove if already in queue
    waitingUsers = waitingUsers.filter(id => id !== socket.id);

    if (waitingUsers.length > 0) {
      const partnerId = waitingUsers.shift();
      const partnerSocket = io.sockets.sockets.get(partnerId);

      if (partnerSocket && partnerSocket.connected) {
        activePairs[socket.id] = partnerId;
        activePairs[partnerId] = socket.id;
        socket.emit('stranger_found', {});
        partnerSocket.emit('stranger_found', {});
        console.log(`🔗 Paired: ${socket.id} <-> ${partnerId}`);
      } else {
        waitingUsers.push(socket.id);
        socket.emit('searching', {});
      }
    } else {
      waitingUsers.push(socket.id);
      socket.emit('searching', {});
    }
  });

  socket.on('send_message', (data) => {
    const partnerId = activePairs[socket.id];
    if (partnerId) {
      io.to(partnerId).emit('receive_message', {
        message: data.message,
        time: new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
      });
    }
  });

  socket.on('typing', () => {
    const p = activePairs[socket.id];
    if (p) io.to(p).emit('stranger_typing');
  });

  socket.on('stop_typing', () => {
    const p = activePairs[socket.id];
    if (p) io.to(p).emit('stranger_stop_typing');
  });

  socket.on('next_stranger', () => {
    pairDisconnect(socket.id, 'stranger_left');
    waitingUsers = waitingUsers.filter(id => id !== socket.id);

    if (waitingUsers.length > 0) {
      const partnerId = waitingUsers.shift();
      const partnerSocket = io.sockets.sockets.get(partnerId);
      if (partnerSocket && partnerSocket.connected) {
        activePairs[socket.id] = partnerId;
        activePairs[partnerId] = socket.id;
        socket.emit('stranger_found', {});
        partnerSocket.emit('stranger_found', {});
      } else {
        waitingUsers.push(socket.id);
        socket.emit('searching', {});
      }
    } else {
      waitingUsers.push(socket.id);
      socket.emit('searching', {});
    }
  });

  socket.on('stop_chat', () => {
    pairDisconnect(socket.id, 'stranger_left');
    waitingUsers = waitingUsers.filter(id => id !== socket.id);
  });

  socket.on('disconnect', () => {
    console.log('❌ Disconnected:', socket.id);
    pairDisconnect(socket.id, 'stranger_left');
    waitingUsers = waitingUsers.filter(id => id !== socket.id);
  });

  function pairDisconnect(id, event) {
    const partnerId = activePairs[id];
    if (partnerId) {
      io.to(partnerId).emit(event, {});
      delete activePairs[partnerId];
      delete activePairs[id];
    }
  }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`⚡ Chattr server running on port ${PORT}`);
});

