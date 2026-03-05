const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] }
});

// Waiting queue and active pairs
let waitingUsers = [];
let activePairs = {};

app.get('/', (req, res) => {
  res.send('Chattr Server Running! ⚡');
});

app.get('/stats', (req, res) => {
  res.json({
    online: Object.keys(io.sockets.sockets).length,
    waiting: waitingUsers.length,
    activePairs: Object.keys(activePairs).length / 2
  });
});

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  // User wants to find a stranger
  socket.on('find_stranger', (data) => {
    const interests = data?.interests || [];

    // Try to match with someone in queue
    if (waitingUsers.length > 0) {
      const partnerId = waitingUsers.shift();
      const partnerSocket = io.sockets.sockets.get(partnerId);

      if (partnerSocket) {
        // Pair them
        activePairs[socket.id] = partnerId;
        activePairs[partnerId] = socket.id;

        socket.emit('stranger_found', { message: 'Connected to a stranger!' });
        partnerSocket.emit('stranger_found', { message: 'Connected to a stranger!' });

        console.log(`Paired: ${socket.id} <-> ${partnerId}`);
      } else {
        // Partner disconnected, add current user to queue
        waitingUsers.push(socket.id);
        socket.emit('searching', { message: 'Searching for stranger...' });
      }
    } else {
      // No one waiting, add to queue
      waitingUsers.push(socket.id);
      socket.emit('searching', { message: 'Searching for stranger...' });
    }
  });

  // User sends a message
  socket.on('send_message', (data) => {
    const partnerId = activePairs[socket.id];
    if (partnerId) {
      io.to(partnerId).emit('receive_message', {
        message: data.message,
        time: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
      });
    }
  });

  // Typing indicator
  socket.on('typing', () => {
    const partnerId = activePairs[socket.id];
    if (partnerId) io.to(partnerId).emit('stranger_typing');
  });

  socket.on('stop_typing', () => {
    const partnerId = activePairs[socket.id];
    if (partnerId) io.to(partnerId).emit('stranger_stop_typing');
  });

  // User wants next stranger
  socket.on('next_stranger', () => {
    disconnectPair(socket.id, 'stranger_skipped');
    // Auto find new one
    if (waitingUsers.length > 0) {
      const partnerId = waitingUsers.shift();
      const partnerSocket = io.sockets.sockets.get(partnerId);
      if (partnerSocket) {
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

  // User disconnects or stops chat
  socket.on('stop_chat', () => {
    disconnectPair(socket.id, 'stranger_left');
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
    disconnectPair(socket.id, 'stranger_left');
    waitingUsers = waitingUsers.filter(id => id !== socket.id);
  });

  function disconnectPair(socketId, event) {
    const partnerId = activePairs[socketId];
    if (partnerId) {
      io.to(partnerId).emit(event, { message: 'Stranger disconnected.' });
      delete activePairs[partnerId];
      delete activePairs[socketId];
    }
  }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Chattr server running on port ${PORT}`);
});
