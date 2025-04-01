"use client";

import { useState, use, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import io, { Socket } from "socket.io-client";
import VideoRoom from "@/components/VideoRoom";
import { ThemeToggle } from "@/components/ThemeToggle";

export default function VideoRoomPage({ params }: { params: Promise<{ roomId: string }> }) {
  // Unwrap params using React.use()
  const unwrappedParams = use(params);
  const router = useRouter();
  const [userName, setUserName] = useState("");
  const [isJoined, setIsJoined] = useState(false);
  const [isJoining, setIsJoining] = useState(false);
  const [socket, setSocket] = useState<Socket | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(true);
  
  // Initialize socket connection
  useEffect(() => {
    console.log('Initializing socket connection...');
    setIsConnecting(true);
    let socketInstance: Socket | null = null;
    
    try {
      // Socket.IO configuration
      socketInstance = io({
        path: '/socket.io',
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionAttempts: 5,
        reconnectionDelay: 1000,
        timeout: 10000,
      });
      
      // Debug all socket events
      socketInstance.onAny((event, ...args) => {
        console.log('Socket event received:', event, args);
      });
      
      // Event handlers
      socketInstance.on('connect', () => {
        console.log('Socket connected successfully with ID:', socketInstance?.id);
        setSocket(socketInstance);
        setIsConnecting(false);
        setError(null);
      });
      
      socketInstance.on('connect_error', (err) => {
        console.error('Socket connection error:', err);
        setError('Failed to connect to server. Please try again.');
        setIsConnecting(false);
      });
      
      socketInstance.on('connect_timeout', () => {
        console.error('Socket connection timeout');
        setError('Connection timed out. Please try again.');
        setIsConnecting(false);
      });
      
      socketInstance.on('disconnect', (reason) => {
        console.log('Socket disconnected:', reason);
        if (reason === 'io server disconnect') {
          // Server disconnected us, reconnect
          socketInstance?.connect();
        }
        // Don't set error for normal disconnects during page navigation
      });
      
      // General error handler for server errors
      socketInstance.on('server-error', ({ message }) => {
        console.error('Server error:', message);
        setError(`Server error: ${message}`);
      });
      
      // Set a timeout for connection
      const timeoutId = setTimeout(() => {
        if (!socketInstance?.connected) {
          console.error('Socket connection timed out');
          setError('Connection timed out. Please try again.');
          setIsConnecting(false);
        }
      }, 10000);
      
      return () => {
        clearTimeout(timeoutId);
        if (socketInstance) {
          console.log('Disconnecting socket');
          // Remove all listeners to prevent memory leaks
          socketInstance.removeAllListeners();
          socketInstance.disconnect();
        }
      };
    } catch (error) {
      console.error('Error initializing socket:', error);
      setError('Failed to initialize connection. Please try again.');
      setIsConnecting(false);
      return () => {};
    }
  }, []);

  // Check for stored username on mount
  useEffect(() => {
    const storedUserName = sessionStorage.getItem('userName');
    if (storedUserName) {
      setUserName(storedUserName);
      // Automatically join with stored username after socket connection
      if (socket && !isJoined) {
        handleJoinRoom(null, storedUserName);
      }
      // Clear the stored username
      sessionStorage.removeItem('userName');
    }
  }, [socket, isJoined]);

  // Check for microphone/camera permissions first
  const checkMediaPermissions = useCallback(async () => {
    try {
      console.log('Checking media permissions...');
      await navigator.mediaDevices.getUserMedia({ audio: true, video: true })
        .then(stream => {
          // Stop all tracks immediately, we just needed the permission check
          stream.getTracks().forEach(track => track.stop());
          return true;
        });
      console.log('Media permissions granted');
      return true;
    } catch (err) {
      console.error('Media permission error:', err);
      return false;
    }
  }, []);

  // Modified handleJoinRoom to accept external username
  const handleJoinRoom = async (e: React.FormEvent | null, storedName?: string) => {
    if (e) e.preventDefault();
    
    const nameToUse = storedName || userName.trim();
    if (!nameToUse || !socket) return;
    
    setIsJoining(true);
    setError(null);
    
    try {
      // Check for permissions first
      const hasPermissions = await checkMediaPermissions();
      
      if (!hasPermissions) {
        setError('Please allow access to your camera and microphone to join the video call.');
        setIsJoining(false);
        return;
      }
      
      // Remove any existing listeners for these events to prevent duplicates
      socket.off('join-success');
      socket.off('server-error');
      
      // Listen for join success
      socket.once('join-success', () => {
        console.log('Join success received');
        setIsJoined(true);
        setIsJoining(false);
      });
      
      // Listen for errors
      socket.once('server-error', ({ message }) => {
        console.error('Server error during join:', message);
        setError(`Unable to join: ${message}`);
        setIsJoining(false);
      });
      
      // Set a timeout for join response
      const timeoutId = setTimeout(() => {
        console.error('Join room timed out');
        setError('Failed to join room. Please try again.');
        setIsJoining(false);
        socket.off('join-success');
        socket.off('server-error');
      }, 10000);
      
      // Clean up timeout when success or error comes back
      socket.once('join-success', () => clearTimeout(timeoutId));
      socket.once('server-error', () => clearTimeout(timeoutId));
      
      // Join the room
      socket.emit('join-room', {
        roomId: unwrappedParams.roomId,
        userName: nameToUse,
      });
      
    } catch (error) {
      console.error('Error joining room:', error);
      setError('Failed to join room. Please try again.');
      setIsJoining(false);
    }
  };

  const handleLeaveRoom = () => {
    setIsJoined(false);
    router.push("/");
  };
  
  if (isConnecting) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-b from-background to-background/80">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-purple-500 mx-auto"></div>
          <p className="mt-4 text-gray-600 dark:text-gray-300">Connecting to server...</p>
        </div>
        
        <ThemeToggle />
      </div>
    );
  }

  if (!isJoined) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-6 bg-background relative overflow-hidden">
        {/* Background Elements */}
        <div className="absolute inset-0 -z-10">
          <div className="absolute top-1/4 left-1/4 w-96 h-96 rounded-full bg-purple-600/10 filter blur-3xl animate-pulse-soft"></div>
          <div className="absolute bottom-1/3 right-1/4 w-80 h-80 rounded-full bg-blue-500/10 filter blur-3xl animate-pulse-soft" style={{ animationDelay: '1s' }}></div>
        </div>
        
        {/* Radial gradient overlay */}
        <div className="absolute inset-0 bg-gradient-radial from-transparent to-background -z-10"></div>
        
        {isConnecting ? (
          <div className="glass-morphism p-10 rounded-xl text-center animate-fade-in">
            <div className="flex flex-col items-center">
              <div className="h-12 w-12 rounded-full border-t-2 border-b-2 border-purple-500 animate-spin mb-4"></div>
              <p className="text-foreground/70">Connecting to server...</p>
            </div>
          </div>
        ) : (
          <div className="w-full max-w-md p-8 space-y-6 glass-morphism rounded-xl shadow-xl animate-fade-in">
            <div className="text-center">
              <div className="mx-auto bg-purple-600 text-white p-3 rounded-full h-14 w-14 flex items-center justify-center mb-4">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-7 w-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="23 7 16 12 23 17 23 7" />
                  <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
                </svg>
              </div>
              <h1 className="text-2xl font-bold text-foreground">Join Video Room</h1>
              <p className="mt-2 text-foreground/70">
                Room ID: <span className="font-mono font-bold text-foreground">{unwrappedParams.roomId}</span>
              </p>
            </div>

            {error && (
              <div className="p-3 bg-red-500/20 border border-red-500/30 rounded-md text-red-300 text-sm">
                {error}
              </div>
            )}

            <form onSubmit={handleJoinRoom} className="space-y-4">
              <div className="space-y-2">
                <label htmlFor="userName" className="block text-sm font-medium text-foreground/80 mb-1">
                  Your Name
                </label>
                <input
                  type="text"
                  id="userName"
                  value={userName}
                  onChange={(e) => setUserName(e.target.value)}
                  placeholder="Enter your name"
                  className="w-full px-4 py-2 bg-foreground/5 border border-foreground/10 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500 text-foreground placeholder:text-foreground/40"
                  autoComplete="off"
                  required
                />
              </div>

              <div className="text-sm text-foreground/70 p-3 bg-foreground/5 border border-foreground/10 rounded-md">
                <p>You&apos;ll need to allow access to your camera and microphone to join the video call.</p>
              </div>

              <button
                type="submit"
                disabled={isJoining || !userName.trim() || !socket}
                className="w-full flex items-center justify-center py-2 px-4 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors disabled:opacity-70"
              >
                {isJoining ? (
                  <div className="flex items-center">
                    <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Joining...
                  </div>
                ) : "Join Video"}
              </button>
            </form>

            <div className="pt-4 text-center">
              <Link 
                href="/" 
                className="text-blue-400 hover:text-blue-300 inline-flex items-center justify-center gap-1 text-sm"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M19 12H5M12 19l-7-7 7-7"/>
                </svg>
                <span>Back to Home</span>
              </Link>
            </div>
          </div>
        )}
        <ThemeToggle />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-gray-100 dark:bg-gray-900">
      {/* Header */}
      <header className="bg-white dark:bg-gray-800 shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center">
          <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-white">
              Video Room: <span className="font-mono">{unwrappedParams.roomId}</span>
            </h1>
          </div>
          <div className="text-sm text-gray-500 dark:text-gray-400">
            <span className="inline-flex items-center">
              <span className="h-2 w-2 rounded-full bg-green-500 mr-2"></span>
              Connected as <span className="font-semibold ml-1">{userName}</span>
            </span>
          </div>
        </div>
      </header>

      {/* Main content with video room */}
      <div className="flex-1 overflow-hidden">
        {socket && (
          <VideoRoom 
            socket={socket} 
            roomId={unwrappedParams.roomId} 
            userName={userName} 
            onLeaveRoom={handleLeaveRoom} 
          />
        )}
      </div>
      <ThemeToggle />
    </div>
  );
}
