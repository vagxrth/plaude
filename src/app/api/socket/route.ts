import { Server as NetServer } from 'http';
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



interface SocketServer extends NetServer {
  io?: SocketIOServer;
}

function getSocketIO(server: SocketServer): SocketIOServer {
  if (server.io) {
    console.log('Reusing existing Socket.IO server');
    return server.io;
  }

  console.log('Creating new Socket.IO server instance');
  
  const io = new SocketIOServer(server, {
    path: '/api/socket',
    addTrailingSlash: false,
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

  server.io = io;
  return io;
}



export async function GET() {
  try {
    // Get the server instance from the request
    const response = new NextResponse('Socket.IO server is running');
    const server = (response as { socket?: { server: unknown } }).socket?.server as SocketServer;
    
    if (!server) {
      throw new Error('HTTP server not available');
    }
    
    // Initialize Socket.IO if not already initialized
    const io = getSocketIO(server);
    
    // Set up event handlers if not already set
    if (io.listeners('connection').length === 0) {
      console.log('Setting up Socket.IO event handlers...');
      
      io.on('connection', (socket) => {
        console.log('Client connected:', socket.id);
        
        socket.on('join-room', ({ roomId, userName }) => {
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
              existingUser.name = userName;
            } else {
              // Add user to room
              const user = { id: socket.id, name: userName };
              rooms[roomId].users.push(user);
            }
            
            // Join the Socket.IO room
            socket.join(roomId);
            
            // Notify everyone in the room about the user
            io.to(roomId).emit('user-joined', {
              user: { id: socket.id, name: userName },
              users: rooms[roomId].users,
            });
            
            console.log(`User ${userName} joined room ${roomId}`);
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
        
        socket.on('disconnect', () => {
          console.log('Client disconnected:', socket.id);
          
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
