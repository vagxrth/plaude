import { io, Socket } from 'socket.io-client';

// Singleton pattern for socket connection
let socket: Socket | null = null;
let connectPromise: Promise<Socket> | null = null;

export const initializeSocket = async (): Promise<Socket> => {
  // If we already have a connection promise in progress, return it
  if (connectPromise) {
    return connectPromise;
  }
  
  // If we already have a connected socket, return it
  if (socket?.connected) {
    console.log('[Client] Reusing existing connected socket:', socket.id);
    return socket;
  }
  
  // Create a new connection promise
  connectPromise = (async () => {
    try {
      // If we have a socket but it's disconnected, clean it up
      if (socket) {
        console.log('[Client] Cleaning up disconnected socket');
        socket.disconnect();
        socket.removeAllListeners();
        socket = null;
      }
      
      console.log('[Client] Initializing socket connection...');
      
      // First, initialize the socket server - this will start it if not already running
      let serverPort = null;
      let serverInitialized = false;
      let retryCount = 0;
      const maxRetries = 3;
      
      while (!serverInitialized && retryCount < maxRetries) {
        try {
          // Add a cache-busting parameter to avoid cached responses
          const response = await fetch(`/api/socket?t=${Date.now()}`);
          console.log('[Client] Socket server API response:', response.status);
          
          if (!response.ok) {
            console.warn('[Client] Socket server API returned non-200 status:', response.status);
            throw new Error(`Socket server API returned status: ${response.status}`);
          }
          
          // Get the server port and initialization status from the response
          const data = await response.json();
          serverPort = data.port;
          serverInitialized = data.initialized === true;
          
          console.log(`[Client] Socket server running on port: ${serverPort}, initialized: ${serverInitialized}`);
          
          if (!serverInitialized) {
            console.log('[Client] Waiting for server to initialize...');
            await new Promise(resolve => setTimeout(resolve, 1000));
            retryCount++;
          }
        } catch (err) {
          console.warn('[Client] Socket server API fetch warning:', err);
          retryCount++;
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }
      
      // Always use port 3000 since that's what the server is using when Next.js is running
      if (!serverInitialized || !serverPort) {
        console.warn('[Client] Server initialization timeout or no port returned, using port 3000');
        serverPort = 3000;
      }
      
      // Use the current hostname instead of hardcoded localhost
      const hostname = window.location.hostname;
      const isSecure = window.location.protocol === 'https:';
      // In development, use the port from the API
      const port = hostname === 'localhost' ? `:${serverPort || 3000}` : '';
      const socketUrl = hostname === 'localhost' 
        ? `http://${hostname}${port}`  // For development
        : window.location.origin;      // For production
      
      console.log(`[Client] Connecting to socket server at: ${socketUrl}`);
      
      socket = io(socketUrl, {
        reconnectionAttempts: 5,
        reconnectionDelay: 1000,
        timeout: 60000,
        transports: ['websocket', 'polling'],
        path: '/socket.io',
        autoConnect: true,
        forceNew: true,
        secure: isSecure
      });
      
      if (!socket) {
        throw new Error('Failed to create socket connection');
      }
      
      console.log('[Client] Socket created, waiting for connection...');
      
      // Add event listeners for connection status
      socket.on('connect', () => {
        console.log('[Client] Socket connected successfully:', socket?.id);
      });
      
      socket.on('disconnect', (reason) => {
        console.log('[Client] Socket disconnected:', reason);
      });
      
      socket.on('connect_error', (error) => {
        console.error('[Client] Socket connection error:', error);
      });
      
      socket.on('error', (error) => {
        console.error('[Client] Socket error:', error);
      });
      
      socket.on('server-error', (error) => {
        console.error('[Client] Server error:', error);
      });
      
      // Wait for the connection to be established
      await new Promise<void>((resolve, reject) => {
        if (!socket) {
          reject(new Error('Socket is null'));
          return;
        }
        
        const timeoutId = setTimeout(() => {
          cleanup();
          reject(new Error('Socket connection timeout - please check if the server is running'));
        }, 10000);
        
        const cleanup = () => {
          clearTimeout(timeoutId);
          socket?.off('connect', handleConnect);
          socket?.off('connect_error', handleError);
        };
        
        const handleConnect = () => {
          cleanup();
          resolve();
        };
        
        const handleError = (error: Error) => {
          cleanup();
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
      
      console.log('[Client] Socket connection initialized successfully');
      return socket;
      
    } catch (error) {
      console.error('[Client] Error initializing socket:', error);
      if (socket) {
        socket.disconnect();
        socket = null;
      }
      throw error;
    } finally {
      // Clear the promise so future calls can create a new connection if needed
      connectPromise = null;
    }
  })();
  
  return connectPromise;
};

// Cleanup function
export const disconnectSocket = () => {
  if (socket) {
    console.log('[Client] Disconnecting socket...');
    socket.disconnect();
    socket = null;
  }
};

export const getSocket = (): Socket | null => socket;