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
let serverPort = 3000;
let serverInitialized = false;
let serverInitializing = false;

async function getSocketIO(): Promise<SocketIOServer> {
  // If server is already initialized, return it
  if (io && serverInitialized) {
    console.log('[Server] Reusing existing Socket.IO server');
    return io;
  }

  // If initialization is in progress, wait for it
  if (serverInitializing) {
    console.log('[Server] Server is initializing, waiting...');
    return new Promise<SocketIOServer>((resolve, reject) => {
      let retryCount = 0;
      const maxRetries = 10;
      
      const checkServer = () => {
        if (io && serverInitialized) {
          resolve(io);
        } else if (retryCount >= maxRetries) {
          reject(new Error('Socket server initialization timeout'));
        } else {
          retryCount++;
          setTimeout(checkServer, 500);
        }
      };
      
      checkServer();
    });
  }

  // Otherwise, create a new server
  try {
    console.log('[Server] Creating new Socket.IO server instance');
    serverInitializing = true;
    
    // Create HTTP server if not exists
    if (!httpServer) {
      console.log('[Server] Creating HTTP server...');
      httpServer = createServer((req, res) => {
        res.writeHead(200);
        res.end('Socket.IO server is running');
      });
      
      // Try to listen on port 3000, if fails, try alternative ports
      const startServer = (port: number, maxRetries = 5): Promise<void> => {
        return new Promise((resolve, reject) => {
          try {
            httpServer?.listen(port, () => {
              console.log(`[Server] HTTP server listening on port ${port}`);
              serverPort = port;  // Set the port that was actually used
              serverInitialized = true;
              serverInitializing = false;
              resolve();
            }).on('error', (err: NodeJS.ErrnoException) => {
              if (err.code === 'EADDRINUSE' && maxRetries > 0) {
                console.log(`[Server] Port ${port} is in use, trying port ${port + 1}`);
                // Don't set serverPort here - wait until we actually bind to a port
                startServer(port + 1, maxRetries - 1)
                  .then(resolve)
                  .catch(reject);
              } else {
                console.error('[Server] Error starting HTTP server:', err);
                serverInitializing = false;
                reject(err);
              }
            });
          } catch (error) {
            console.error('[Server] Error in startServer:', error);
            serverInitializing = false;
            reject(error);
          }
        });
      };
      
      await startServer(serverPort);
    }
    
    // Create Socket.IO server attached to HTTP server
    if (!httpServer) {
      throw new Error("HTTP server initialization failed");
    }
    
    io = new SocketIOServer(httpServer, {
      cors: {
        origin: '*',
        methods: ['GET', 'POST'],
        credentials: true,
      },
      path: '/socket.io',
      pingTimeout: 60000,
      pingInterval: 25000,
      transports: ['websocket', 'polling'],
      allowEIO3: true,
      connectTimeout: 20000,
    });

    console.log(`[Server] Socket.IO server initialized on port ${serverPort}`);
    
    // Set up event handlers
    console.log('[Server] Setting up Socket.IO event handlers...');
    
    io.on('connection', (socket) => {
      console.log('[Server] Client connected:', socket.id);
      
      // Log all rooms on connection
      console.log('[Server] Current rooms:', Object.keys(rooms));
      console.log('[Server] Socket rooms:', Array.from(socket.rooms || []));
      
      socket.on('join-room', ({ roomId, userName }: { roomId: string; userName: string }) => {
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
                    io?.to(room).emit('user-left', {
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
          io?.to(roomId).emit('user-joined', {
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
          console.log(`[Server] Sent join-success event to socket ${socket.id}`);
        } catch (error) {
          console.error('[Server] Error in join-room:', error);
          socket.emit('server-error', { 
            message: error instanceof Error ? error.message : 'Failed to join room'
          });
        }
      });
      
      socket.on('send-message', ({ roomId, message, sender }: { roomId: string; message: string; sender: { id: string; name: string } }) => {
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
          io?.to(roomId).emit('new-message', messageObj);
          console.log(`Message sent in room ${roomId} by ${sender.name}`);
        } catch (error) {
          console.error('Error in send-message:', error);
          socket.emit('server-error', { 
            message: error instanceof Error ? error.message : 'Failed to send message'
          });
        }
      });
      
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
            io?.to(roomId).emit('user-left', {
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
    
    return io;
  } catch (error) {
    console.error('[Server] Error initializing Socket.IO server:', error);
    serverInitializing = false;
    throw error;
  }
}

// Export the server port to be used by the client
export function getServerPort(): number {
  return serverPort;
}

export async function GET() {
  try {
    // Initialize Socket.IO if not already initialized
    const socketIo = await getSocketIO();
    
    return new NextResponse(JSON.stringify({ port: serverPort, initialized: serverInitialized }), { 
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Cache-Control': 'no-store, max-age=0',
      },
    });
  } catch (error) {
    console.error('Socket initialization error:', error);
    return new NextResponse(
      JSON.stringify({
        error: error instanceof Error ? error.message : 'Socket initialization failed',
        port: serverPort,
        initialized: serverInitialized
      }), 
      { 
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST',
          'Access-Control-Allow-Headers': 'Content-Type',
          'Cache-Control': 'no-store, max-age=0',
        },
      }
    );
  }
}