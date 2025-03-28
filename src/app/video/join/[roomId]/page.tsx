"use client";

import { useState, use, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import io, { Socket } from "socket.io-client";
import VideoRoom from "@/components/VideoRoom";

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
      
      socketInstance.on('server-error', ({ message }) => {
        console.error('Server error:', message);
        setError(message);
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

  const handleJoinRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!userName.trim() || !socket) return;
    
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
      
      // Join the room
      socket.emit('join-room', {
        roomId: unwrappedParams.roomId,
        userName: userName.trim(),
      });
      
      // Listen for join success
      socket.once('join-success', () => {
        console.log('Join success received');
        setIsJoined(true);
        setIsJoining(false);
      });
      
      // Listen for errors (will be removed when component unmounts)
      socket.once('server-error', ({ message }) => {
        console.error('Server error during join:', message);
        setError(message);
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
      </div>
    );
  }

  if (!isJoined) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-b from-background to-background/80">
        <div className="w-full max-w-md p-8 space-y-6 bg-white dark:bg-gray-800 rounded-xl shadow-lg">
          <div className="text-center">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Join Video Room</h1>
            <p className="mt-2 text-gray-600 dark:text-gray-300">
              Room ID: <span className="font-mono font-bold">{unwrappedParams.roomId}</span>
            </p>
          </div>

          {error && (
            <div className="p-3 bg-red-100 border border-red-200 text-red-700 dark:bg-red-900/30 dark:border-red-700 dark:text-red-400 rounded-md">
              {error}
            </div>
          )}

          <form onSubmit={handleJoinRoom} className="space-y-4">
            <div>
              <label htmlFor="userName" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Your Name
              </label>
              <input
                type="text"
                id="userName"
                value={userName}
                onChange={(e) => setUserName(e.target.value)}
                placeholder="Enter your name"
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                autoComplete="off"
                required
              />
            </div>

            <div className="text-sm text-gray-600 dark:text-gray-400">
              <p>You&apos;ll need to allow access to your camera and microphone to join the video call.</p>
            </div>

            <button
              type="submit"
              disabled={isJoining || !userName.trim() || !socket}
              className="w-full flex items-center justify-center py-2 px-4 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors disabled:opacity-70"
            >
              {isJoining ? "Joining..." : "Join Video"}
            </button>
          </form>

          <div className="pt-4 text-center">
            <Link 
              href="/" 
              className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
            >
              ← Back to Home
            </Link>
          </div>
        </div>
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
    </div>
  );
}
