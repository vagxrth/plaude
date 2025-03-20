import { createServer } from 'http';
import { parse } from 'url';
import next from 'next';
import { Server } from 'socket.io';

// Store active rooms and their users
const rooms = {};

const dev = process.env.NODE_ENV !== 'production';
const app = next({ dev });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const server = createServer((req, res) => {
    const parsedUrl = parse(req.url, true);
    handle(req, res, parsedUrl);
  });

  // Initialize Socket.IO
  const io = new Server(server, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST', 'OPTIONS'],
      credentials: true,
      allowedHeaders: ['Content-Type', 'Authorization']
    },
    path: '/socket.io',
    pingTimeout: 60000,
    pingInterval: 25000,
    transports: ['polling', 'websocket'],
    allowEIO3: true,
    connectTimeout: 20000,
    maxHttpBufferSize: 1e8,
    cookie: {
      name: 'io',
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production'
    }
  });

  // Set up your Socket.IO event handlers
  io.on('connection', (socket) => {
    console.log('[Server] Client connected:', socket.id);
    
    // Log all rooms on connection
    console.log('[Server] Current rooms:', Object.keys(rooms));
    console.log('[Server] Socket rooms:', Array.from(socket.rooms || []));
    
    // Handle room joining
    socket.on('join-room', ({ roomId, userName }) => {
      console.log(`[Server] Join room request:`, { roomId, userName, socketId: socket.id });
      
      try {
        // Validate input
        if (!roomId || typeof roomId !== 'string') {
          throw new Error('Invalid room ID');
        }
        
        if (!userName || typeof userName !== 'string') {
          throw new Error('Invalid username');
        }
        
        // Leave all other rooms first
        if (socket.rooms) {
          Array.from(socket.rooms).forEach(room => {
            if (room !== socket.id) {
              socket.leave(room);
              // Remove from room users list
              if (rooms[room]) {
                const index = rooms[room].users.findIndex(u => u.id === socket.id);
                if (index !== -1) {
                  rooms[room].users.splice(index, 1);
                  io.to(room).emit('user-left', {
                    userId: socket.id,
                    users: rooms[room].users
                  });
                }
              }
            }
          });
        }
        
        // Create room if it doesn't exist
        if (!rooms[roomId]) {
          rooms[roomId] = { id: roomId, users: [] };
          console.log(`[Server] Room ${roomId} created`);
        }
        
        // Check if user is already in room
        const existingUser = rooms[roomId].users.find(u => u.id === socket.id);
        if (existingUser) {
          console.log(`[Server] Updating existing user in room:`, existingUser);
          existingUser.name = userName;
        } else {
          // Add user to room
          const user = { id: socket.id, name: userName };
          rooms[roomId].users.push(user);
          console.log(`[Server] Added new user to room:`, user);
        }
        
        // Join the Socket.IO room
        socket.join(roomId);
        console.log(`[Server] Socket ${socket.id} joined room ${roomId}`);
        
        // Log room state
        console.log(`[Server] Room ${roomId} users:`, rooms[roomId].users);
        
        // Notify everyone in the room about the user
        io.to(roomId).emit('user-joined', {
          user: { id: socket.id, name: userName },
          users: rooms[roomId].users,
        });
        
        // Send join success event to the client who joined
        socket.emit('join-success', {
          roomId,
          user: { id: socket.id, name: userName },
          users: rooms[roomId].users,
        });
        
        console.log(`[Server] User ${userName} joined room ${roomId} successfully`);
      } catch (error) {
        console.error('[Server] Error in join-room:', error);
        socket.emit('server-error', { 
          message: error instanceof Error ? error.message : 'Failed to join room'
        });
      }
    });
    
    // Handle message sending
    socket.on('send-message', ({ roomId, message, sender }) => {
      try {
        // Validate input
        if (!roomId || typeof roomId !== 'string') {
          throw new Error('Invalid room ID');
        }
        
        if (!message || typeof message !== 'string') {
          throw new Error('Invalid message');
        }
        
        if (!sender || typeof sender !== 'object' || !sender.name) {
          throw new Error('Invalid sender information');
        }
        
        // Check if room exists
        if (!rooms[roomId]) {
          throw new Error('Room does not exist');
        }
        
        // Create message object
        const messageObj = {
          id: Date.now().toString(),
          text: message,
          sender,
          timestamp: new Date().toISOString(),
        };
        
        // Broadcast message to everyone in the room
        io.to(roomId).emit('new-message', messageObj);
        console.log(`[Server] Message sent in room ${roomId} by ${sender.name}`);
      } catch (error) {
        console.error('[Server] Error in send-message:', error);
        socket.emit('server-error', { 
          message: error instanceof Error ? error.message : 'Failed to send message'
        });
      }
    });
    
    // Handle disconnection
    socket.on('disconnect', (reason) => {
      console.log('[Server] Client disconnected:', socket.id, 'Reason:', reason);
      
      // Remove user from all rooms they were in
      Object.keys(rooms).forEach((roomId) => {
        const room = rooms[roomId];
        const userIndex = room.users.findIndex(u => u.id === socket.id);
        if (userIndex !== -1) {
          const user = room.users[userIndex];
          room.users.splice(userIndex, 1);
          
          // Notify everyone in the room about the user leaving
          io.to(roomId).emit('user-left', {
            userId: socket.id,
            users: room.users,
          });
          
          console.log(`[Server] User ${user.name} left room ${roomId}`);
          
          // Remove room if empty
          if (room.users.length === 0) {
            delete rooms[roomId];
            console.log(`[Server] Room ${roomId} removed (empty)`);
          }
        }
      });
    });
  });

  const PORT = process.env.PORT || 3000;
  server.listen(PORT, (err) => {
    if (err) throw err;
    console.log(`> Server ready on http://localhost:${PORT}`);
  });
});
