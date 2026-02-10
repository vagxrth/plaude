import { createServer } from 'http';
import { parse } from 'url';
import next from 'next';
import { Server } from 'socket.io';

// Store active rooms and their users
const rooms = {};

// Track which users have already announced media ready to prevent loops
const userMediaReadyTracker = new Map(); // roomId-userId -> boolean

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

    // Handle request for existing room users
    socket.on('get-room-users', ({ roomId }) => {
      try {
        console.log(`[Server] Get room users request for room ${roomId} from ${socket.id}`);
        
        // Validate input
        if (!roomId || typeof roomId !== 'string') {
          throw new Error('Invalid room ID');
        }
        
        // Check if room exists
        if (!rooms[roomId]) {
          console.log(`[Server] Room ${roomId} not found`);
          socket.emit('room-users-response', { roomId, users: [] });
          return;
        }
        
        // Get current user
        const currentUser = rooms[roomId].users.find(u => u.id === socket.id);
        if (!currentUser) {
          throw new Error(`User ${socket.id} not found in room ${roomId}`);
        }
        
        // Get other users in the room (excluding current user)
        const otherUsers = rooms[roomId].users.filter(u => u.id !== socket.id);
        
        console.log(`[Server] Sending ${otherUsers.length} existing users to ${currentUser.name}`);
        
        // Send the list of other users
        socket.emit('room-users-response', { 
          roomId, 
          users: otherUsers 
        });
        
      } catch (error) {
        console.error('[Server] Error in get-room-users:', error);
        socket.emit('server-error', { 
          message: error instanceof Error ? error.message : 'Failed to get room users'
        });
      }
    });
    
    // Handle message sending
    socket.on('send-message', ({ roomId, message, sender, attachment }) => {
      try {
        // Validate input
        if (!roomId || typeof roomId !== 'string') {
          throw new Error('Invalid room ID');
        }
        
        // Allow empty message if there's an attachment
        if ((!message || typeof message !== 'string') && !attachment) {
          throw new Error('Invalid message');
        }
        
        if (!sender || typeof sender !== 'object' || !sender.name) {
          throw new Error('Invalid sender information');
        }
        
        // Validate attachment if present
        if (attachment) {
          if (!attachment.id || !attachment.name || !attachment.type || !attachment.data || !attachment.size) {
            throw new Error('Invalid attachment data');
          }
          
          // Check file size (limit to 5MB)
          if (attachment.size > 5 * 1024 * 1024) {
            throw new Error('File size exceeds 5MB limit');
          }
          
          // Check file type (only allow images, PDFs, and docx)
          const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
          if (!allowedTypes.includes(attachment.type)) {
            throw new Error('Invalid file type. Only images, PDFs, and DOCX files are allowed');
          }
        }
        
        // Check if room exists
        if (!rooms[roomId]) {
          throw new Error('Room does not exist');
        }
        
        // Create message object
        const messageObj = {
          id: Date.now().toString(),
          text: message || '',
          sender,
          timestamp: new Date().toISOString(),
        };
        
        // Add attachment if present
        if (attachment) {
          messageObj.attachment = attachment;
          console.log(`[Server] Message with ${attachment.type} attachment sent in room ${roomId} by ${sender.name}`);
        } else {
          console.log(`[Server] Message sent in room ${roomId} by ${sender.name}`);
        }
        
        // Broadcast message to everyone in the room
        io.to(roomId).emit('new-message', messageObj);
      } catch (error) {
        console.error('[Server] Error in send-message:', error);
        socket.emit('server-error', { 
          message: error instanceof Error ? error.message : 'Failed to send message'
        });
      }
    });
    
    // Handle user explicitly leaving room
    socket.on('leave-room', ({ roomId, userName }) => {
      try {
        console.log(`[Server] User ${userName} is leaving room ${roomId}`);
        
        // Validate input
        if (!roomId || typeof roomId !== 'string') {
          throw new Error('Invalid room ID');
        }
        
        if (!userName || typeof userName !== 'string') {
          throw new Error('Invalid username');
        }
        
        // Check if room exists
        if (!rooms[roomId]) {
          console.log(`[Server] Room ${roomId} not found, may have been removed already`);
          return;
        }
        
        // Find and remove user from room
        const userIndex = rooms[roomId].users.findIndex(u => u.id === socket.id);
        if (userIndex !== -1) {
          const user = rooms[roomId].users[userIndex];
          rooms[roomId].users.splice(userIndex, 1);
          
          // Leave the Socket.IO room
          socket.leave(roomId);
          
          // Notify everyone in the room about the user leaving with the user's name
          io.to(roomId).emit('user-left', {
            userId: socket.id,
            userName: user.name, // Include the user's name
            users: rooms[roomId].users
          });
          
          console.log(`[Server] User ${user.name} left room ${roomId} explicitly`);
          
          // Clean up media ready tracker
          const trackerKey = `${roomId}-${socket.id}`;
          userMediaReadyTracker.delete(trackerKey);
          
          // Remove room if empty
          if (rooms[roomId].users.length === 0) {
            delete rooms[roomId];
            console.log(`[Server] Room ${roomId} removed (empty after explicit leave)`);
          }
        } else {
          console.log(`[Server] User not found in room ${roomId}`);
        }
      } catch (error) {
        console.error('[Server] Error in leave-room:', error);
        socket.emit('server-error', { 
          message: error instanceof Error ? error.message : 'Failed to leave room'
        });
      }
    });
    
    // Handle connection readiness - a user is ready to receive connection offers
    socket.on('user-ready', ({ userId, roomId }) => {
      console.log(`[Server] User ${socket.id} is ready for user ${userId} in room ${roomId}`);
      
      try {
        // Validate input
        if (!roomId) {
          throw new Error('Invalid room ID');
        }
        
        // Check if room exists
        const room = rooms[roomId];
        if (!room) {
          throw new Error(`Room ${roomId} not found`);
        }
        
        // Get the current user
        const currentUser = room.users.find(u => u.id === socket.id);
        if (!currentUser) {
          throw new Error(`User ${socket.id} not found in room ${roomId}`);
        }
        
        // If userId is specified, notify only that user
        if (userId) {
          const targetUser = room.users.find(u => u.id === userId);
          if (targetUser) {
            io.to(userId).emit('user-ready', {
              userId: socket.id,
              userName: currentUser.name,
              roomId
            });
            console.log(`[Server] Notified ${targetUser.name} that ${currentUser.name} is ready`);
          }
        } else {
          // Notify all users in the room that this user is ready
          socket.to(roomId).emit('user-ready', {
            userId: socket.id,
            userName: currentUser.name,
            roomId
          });
          console.log(`[Server] Notified all users in room ${roomId} that ${currentUser.name} is ready`);
        }
      } catch (error) {
        console.error('[Server] Error in user-ready:', error);
        socket.emit('server-error', { 
          message: error instanceof Error ? error.message : 'Failed to process user ready event'
        });
      }
    });
    
    // Handle media ready event - user has media initialized and ready to share
    socket.on('user-media-ready', ({ userId, roomId }) => {
      console.log(`[Server] User ${socket.id} has media ready in room ${roomId}`);
      
      try {
        // Validate input
        if (!roomId) {
          throw new Error('Invalid room ID');
        }
        
        // Check if room exists
        const room = rooms[roomId];
        if (!room) {
          throw new Error(`Room ${roomId} not found`);
        }
        
        // Get the current user
        const currentUser = room.users.find(u => u.id === socket.id);
        if (!currentUser) {
          throw new Error(`User ${socket.id} not found in room ${roomId}`);
        }
        
        // Create a unique key for this user-room combination
        const trackerKey = `${roomId}-${socket.id}`;
        
        // Check if we've already processed this user's media ready event
        if (userMediaReadyTracker.get(trackerKey)) {
          console.log(`[Server] User ${currentUser.name} media ready already processed, skipping`);
          return;
        }
        
        // Mark this user as having announced media ready
        userMediaReadyTracker.set(trackerKey, true);
        
        // If userId is specified, notify only that user
        if (userId) {
          const targetUser = room.users.find(u => u.id === userId);
          if (targetUser) {
            io.to(userId).emit('user-media-ready', {
              userId: socket.id,
              userName: currentUser.name,
              roomId
            });
            console.log(`[Server] Notified ${targetUser.name} that ${currentUser.name} has media ready`);
          }
        } else {
          // Notify all users in the room that this user has media ready
          socket.to(roomId).emit('user-media-ready', {
            userId: socket.id,
            userName: currentUser.name,
            roomId
          });
          console.log(`[Server] Notified all users in room ${roomId} that ${currentUser.name} has media ready`);
        }
        
        // Tell this user to initiate connections with all other users in the room
        const otherUsers = room.users.filter(u => u.id !== socket.id);
        if (otherUsers.length > 0) {
          console.log(`[Server] Telling ${currentUser.name} to initiate connections with ${otherUsers.length} other users`);
          
          otherUsers.forEach(user => {
            socket.emit('initiate-connection', {
              senderId: user.id,
              senderName: user.name
            });
          });
        }
      } catch (error) {
        console.error('[Server] Error in user-media-ready:', error);
        socket.emit('server-error', { 
          message: error instanceof Error ? error.message : 'Failed to process media ready event'
        });
      }
    });
    
    // Handle media error event
    socket.on('media-error', ({ roomId, userName, error }) => {
      // Keeping event handler as a no-op to maintain compatibility
      console.log(`[Server] User ${userName} (${socket.id}) had media error in room ${roomId}: ${error} (DEPRECATED)`);
      // No action needed - keeping for compatibility
    });
    
    // WebRTC signaling events
    
    // Handle direct connection initiation requests
    socket.on('initiate-connection', ({ targetUserId, roomId }) => {
      console.log(`[Server] *** CONNECTION INITIATION REQUEST *** from ${socket.id} to ${targetUserId} in room ${roomId}`);
      
      try {
        // Validate input
        if (!roomId || !targetUserId) {
          console.error(`[Server] Invalid input - roomId: ${roomId}, targetUserId: ${targetUserId}`);
          throw new Error('Invalid connection initiation data');
        }
        
        // Check if user is in specified room
        const room = rooms[roomId];
        if (!room) {
          console.error(`[Server] Room ${roomId} not found`);
          throw new Error(`Room ${roomId} not found`);
        }
        
        // Get sender username
        const senderUser = room.users.find(u => u.id === socket.id);
        if (!senderUser) {
          console.error(`[Server] Sender ${socket.id} not found in room ${roomId}`);
          throw new Error(`Sender ${socket.id} not found in room ${roomId}`);
        }
        
        // Check if target user is in the room
        const targetUser = room.users.find(u => u.id === targetUserId);
        if (!targetUser) {
          console.error(`[Server] Target user ${targetUserId} not found in room ${roomId}`);
          throw new Error(`Target user ${targetUserId} not found in room ${roomId}`);
        }
        
        console.log(`[Server] Forwarding connection request from ${senderUser.name} (${socket.id}) to ${targetUser.name} (${targetUserId})`);
        
        // Forward the connection request to the target user
        io.to(targetUserId).emit('initiate-connection', {
          senderId: socket.id,
          senderName: senderUser.name
        });
        
        console.log(`[Server] *** CONNECTION REQUEST FORWARDED *** from ${senderUser.name} to ${targetUser.name}`);
      } catch (error) {
        console.error('[Server] Error in initiate-connection:', error);
        socket.emit('server-error', { 
          message: error instanceof Error ? error.message : 'Failed to initiate connection'
        });
      }
    });
    
    // Handle WebRTC offer
    socket.on('webrtc-offer', ({ offer, receiverId, senderName, roomId }) => {
      console.log(`[Server] WebRTC offer from ${senderName} to ${receiverId} in room ${roomId}`);
      
      try {
        // Validate input with more detailed error reporting
        if (!roomId) {
          throw new Error('Missing roomId in WebRTC offer');
        }
        
        if (!receiverId) {
          throw new Error('Missing receiverId in WebRTC offer');
        }
        
        if (!offer) {
          throw new Error('Missing offer data in WebRTC offer');
        }
        
        // Check if receiver is in the specified room
        const room = rooms[roomId];
        if (!room) {
          throw new Error(`Room ${roomId} not found`);
        }
        
        const receiverInRoom = room.users.some(user => user.id === receiverId);
        if (!receiverInRoom) {
          throw new Error(`Receiver ${receiverId} is not in room ${roomId}`);
        }
        
        // Forward the offer to the intended recipient
        io.to(receiverId).emit('webrtc-offer', {
          offer,
          senderId: socket.id,
          senderName,
        });
      } catch (error) {
        console.error('[Server] Error in webrtc-offer:', error);
        socket.emit('server-error', { 
          message: error instanceof Error ? error.message : 'Failed to send WebRTC offer'
        });
      }
    });
    
    // Handle WebRTC answer
    socket.on('webrtc-answer', ({ answer, receiverId, senderName, roomId }) => {
      console.log(`[Server] WebRTC answer from ${senderName} to ${receiverId} in room ${roomId}`);
      
      try {
        // Validate input
        if (!roomId || !receiverId || !answer) {
          throw new Error('Invalid WebRTC answer data');
        }
        
        // Forward the answer to the intended recipient
        io.to(receiverId).emit('webrtc-answer', {
          answer,
          senderId: socket.id,
          senderName,
        });
      } catch (error) {
        console.error('[Server] Error in webrtc-answer:', error);
        socket.emit('server-error', { 
          message: error instanceof Error ? error.message : 'Failed to send WebRTC answer'
        });
      }
    });
    
    // Handle ICE candidate exchange
    socket.on('webrtc-ice-candidate', ({ candidate, receiverId, roomId }) => {
      try {
        // Validate input
        if (!roomId || !receiverId || !candidate) {
          throw new Error('Invalid ICE candidate data');
        }
        
        // Forward the ICE candidate to the intended recipient
        io.to(receiverId).emit('webrtc-ice-candidate', {
          candidate,
          senderId: socket.id,
          senderName: getUserName(socket.id, roomId)
        });
      } catch (error) {
        console.error('[Server] Error in webrtc-ice-candidate:', error);
        socket.emit('server-error', { 
          message: error instanceof Error ? error.message : 'Failed to send ICE candidate'
        });
      }
    });
    
    // Handle WebRTC renegotiation request
    socket.on('webrtc-renegotiate', ({ receiverId, roomId }) => {
      console.log(`[Server] WebRTC renegotiation request from ${socket.id} to ${receiverId} in room ${roomId}`);
      
      try {
        // Validate input
        if (!roomId || !receiverId) {
          throw new Error('Invalid renegotiation data');
        }
        
        const senderName = getUserName(socket.id, roomId);
        
        // Forward the renegotiation request to the intended recipient
        io.to(receiverId).emit('webrtc-renegotiate', {
          senderId: socket.id,
          senderName
        });
      } catch (error) {
        console.error('[Server] Error in webrtc-renegotiate:', error);
        socket.emit('server-error', { 
          message: error instanceof Error ? error.message : 'Failed to send renegotiation request'
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
          
          // Clean up media ready tracker
          const trackerKey = `${roomId}-${socket.id}`;
          userMediaReadyTracker.delete(trackerKey);
          
          // Notify everyone in the room about the user leaving
          io.to(roomId).emit('user-left', {
            userId: socket.id,
            users: room.users,
            userName: user.name
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

// Helper function to get a user's name from a room
function getUserName(userId, roomId) {
  if (rooms[roomId]) {
    const user = rooms[roomId].users.find(u => u.id === userId);
    return user ? user.name : 'Unknown User';
  }
  return 'Unknown User';
}
