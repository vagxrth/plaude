import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { NextResponse } from 'next/server';

// Store active rooms and their users
interface User {
  id: string;
  name: string;
}

interface Room {
  id: string;
  users: User[];
}

const rooms: Record<string, Room> = {};

// This is needed for Next.js API routes
export const dynamic = 'force-dynamic';
export const preferredRegion = 'auto';

// Create a singleton instance of Socket.IO server
let io: SocketIOServer | null = null;
let httpServer: ReturnType<typeof createServer> | null = null;

function getSocketIO(): SocketIOServer {
  if (io) {
    console.log('Reusing existing Socket.IO server');
    return io;
  }

  console.log('Creating new Socket.IO server instance');
  
  // Create HTTP server if not exists
  if (!httpServer) {
    httpServer = createServer();
    httpServer.listen(3002, () => {
      console.log('HTTP server listening on port 3002');
    });
  }
  
  // Create Socket.IO server attached to HTTP server
  io = new SocketIOServer(httpServer, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST'],
      credentials: true,
    },
    pingTimeout: 20000,
    pingInterval: 10000,
    transports: ['websocket', 'polling'],
    allowEIO3: true,
    connectTimeout: 10000,
  });

  console.log('Socket.IO server initialized');
  return io;
}



export async function GET() {
  try {
    // Initialize Socket.IO if not already initialized
    const io = getSocketIO();
    
    // Set up event handlers if not already set
    if (io.listeners('connection').length === 0) {
      console.log('Setting up Socket.IO event handlers...');
      console.log('Setting up Socket.IO event handlers...');
      
      io.on('connection', (socket) => {
        console.log('Client connected:', socket.id);
        
        // Log all rooms on connection
        console.log('Current rooms:', Object.keys(rooms));
        console.log('Socket rooms:', socket.rooms);
        
        socket.on('join-room', ({ roomId, userName }) => {
          console.log(`Received join-room request for room ${roomId} from user ${userName}`);
          
          try {
            // Validate input
            if (!roomId || typeof roomId !== 'string') {
              throw new Error('Invalid room ID');
            }
            
            if (!userName || typeof userName !== 'string') {
              throw new Error('Invalid username');
            }
            
            // Create room if it doesn't exist
            if (!rooms[roomId]) {
              rooms[roomId] = { id: roomId, users: [] };
              console.log(`Room ${roomId} created`);
            }
            
            // Check if user is already in room
            const existingUser = rooms[roomId].users.find(u => u.id === socket.id);
            if (existingUser) {
              console.log(`User ${userName} already in room ${roomId}, updating name`);
              existingUser.name = userName;
            } else {
              // Add user to room
              const user = { id: socket.id, name: userName };
              rooms[roomId].users.push(user);
              console.log(`Added user ${userName} to room ${roomId}`);
            }
            
            // Join the Socket.IO room
            socket.join(roomId);
            console.log(`Socket ${socket.id} joined room ${roomId}`);
            
            // Log room state
            console.log(`Room ${roomId} users:`, rooms[roomId].users);
            
            // Notify everyone in the room about the user
            io.to(roomId).emit('user-joined', {
              user: { id: socket.id, name: userName },
              users: rooms[roomId].users,
            });
            
            console.log(`User ${userName} joined room ${roomId}`);
            
            // Acknowledge successful join
            socket.emit('join-success', {
              roomId,
              user: { id: socket.id, name: userName },
              users: rooms[roomId].users,
            });
          } catch (error) {
            console.error('Error in join-room:', error);
            socket.emit('server-error', { 
              message: error instanceof Error ? error.message : 'Failed to join room'
            });
          }
        });
        
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
            console.log(`Message sent in room ${roomId} by ${sender.name}`);
          } catch (error) {
            console.error('Error in send-message:', error);
            socket.emit('server-error', { 
              message: error instanceof Error ? error.message : 'Failed to send message'
            });
          }
        });
        
        socket.on('disconnect', (reason) => {
          console.log('Client disconnected:', socket.id, 'Reason:', reason);
          
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
              
              console.log(`User ${user.name} left room ${roomId}`);
              
              // Remove room if empty
              if (room.users.length === 0) {
                delete rooms[roomId];
                console.log(`Room ${roomId} removed (empty)`);
              }
            }
          });
        });
      });
    }
    
    return new NextResponse('Socket.IO server is running', { 
      status: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Cache-Control': 'no-store, max-age=0',
      },
    });
  } catch (error) {
    console.error('Socket initialization error:', error);
    return new NextResponse(
      error instanceof Error ? error.message : 'Socket initialization failed', 
      { 
        status: 500,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST',
          'Access-Control-Allow-Headers': 'Content-Type',
          'Cache-Control': 'no-store, max-age=0',
        },
      }
    );
  }
}
