import { io, Socket } from 'socket.io-client';

// Singleton pattern for socket connection
let socket: Socket | null = null;

export const initializeSocket = async (): Promise<Socket> => {
  if (!socket) {
    try {
      console.log('Initializing socket connection...');
      
      // First, initialize the socket server
      const response = await fetch('/api/socket');
      if (!response.ok) {
        throw new Error(`Failed to initialize socket server: ${response.status}`);
      }
      
      const protocol = window.location.protocol;
      const host = window.location.host;
      
      // Create the socket connection
      socket = io(`${protocol}//${host}`, {
        path: '/api/socket',
        addTrailingSlash: false,
        reconnectionAttempts: 5,
        reconnectionDelay: 1000,
        timeout: 20000,
        transports: ['websocket', 'polling'],
        autoConnect: true,
      });
      
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
        const timeout = setTimeout(() => {
          reject(new Error('Socket connection timeout'));
        }, 5000);
        
        socket?.once('connect', () => {
          clearTimeout(timeout);
          resolve();
        });
        
        socket?.once('connect_error', (error) => {
          clearTimeout(timeout);
          reject(error);
        });
      });
      
      console.log('Socket connection initialized successfully');
    } catch (error) {
      console.error('Error initializing socket:', error);
      if (socket) {
        socket.disconnect();
        socket = null;
      }
      throw error;
    }
  } else if (!socket.connected) {
    console.log('Reconnecting existing socket...');
    socket.connect();
    
    // Wait for reconnection
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Socket reconnection timeout'));
      }, 5000);
      
      socket?.once('connect', () => {
        clearTimeout(timeout);
        resolve();
      });
      
      socket?.once('connect_error', (error) => {
        clearTimeout(timeout);
        reject(error);
      });
    });
  }
  
  return socket;
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
