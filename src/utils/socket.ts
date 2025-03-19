import { io, Socket } from 'socket.io-client';

// Singleton pattern for socket connection
let socket: Socket | null = null;

export const initializeSocket = async (): Promise<Socket> => {
  // If we already have a connected socket, return it
  if (socket?.connected) {
    console.log('Reusing existing connected socket:', socket.id);
    return socket;
  }
  
  // If we have a socket but it's disconnected, clean it up
  if (socket) {
    console.log('Cleaning up disconnected socket');
    socket.disconnect();
    socket = null;
  }
  
  try {
    console.log('Initializing socket connection...');
    
    // First, initialize the socket server - this will start it if not already running
    try {
      const response = await fetch('/api/socket');
      console.log('Socket server API response:', response.status);
      if (!response.ok) {
        console.warn('Socket server API returned non-200 status:', response.status);
      }
    } catch (err) {
      console.warn('Socket server API fetch warning:', err);
      // Continue anyway as the standalone server may already be running
    }
    
    // Connect to the standalone Socket.IO server
    socket = io('http://localhost:3002', {
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
      timeout: 20000,
      transports: ['websocket', 'polling'],
      autoConnect: true,
      forceNew: true, // Force a new connection
    });
    
    if (!socket) {
      throw new Error('Failed to create socket connection');
    }
    
    console.log('Socket created, waiting for connection...');
    
    // Add event listeners for connection status
    socket.on('connect', () => {
      console.log('Socket connected successfully:', socket?.id);
    });
    
    socket.on('disconnect', (reason) => {
      console.log('Socket disconnected:', reason);
    });
    
    socket.on('connect_error', (error) => {
      console.error('Socket connection error:', error);
    });
    
    socket.on('error', (error) => {
      console.error('Socket error:', error);
    });
    
    // Wait for the connection to be established
    await new Promise<void>((resolve, reject) => {
      if (!socket) {
        reject(new Error('Socket is null'));
        return;
      }
      
      const timeout = setTimeout(() => {
        reject(new Error('Socket connection timeout'));
      }, 5000);
      
      const handleConnect = () => {
        clearTimeout(timeout);
        resolve();
      };
      
      const handleError = (error: Error) => {
        clearTimeout(timeout);
        reject(error);
      };
      
      if (socket.connected) {
        // If already connected, resolve immediately
        handleConnect();
      } else {
        socket.once('connect', handleConnect);
        socket.once('connect_error', handleError);
      }
    });
    
    if (!socket.connected) {
      throw new Error('Socket failed to connect');
    }
    
    console.log('Socket connection initialized successfully');
    return socket;
    
  } catch (error) {
    console.error('Error initializing socket:', error);
    if (socket) {
      socket.disconnect();
      socket = null;
    }
    throw error;
  }
};

// Cleanup function
export const disconnectSocket = () => {
  if (socket) {
    console.log('Disconnecting socket...');
    socket.disconnect();
    socket = null;
  }
};

export const getSocket = (): Socket | null => socket;
