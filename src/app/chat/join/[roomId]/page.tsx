"use client";

import { useState, useEffect, useRef, use } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { initializeSocket } from "@/utils/socket";
import { Socket } from "socket.io-client";

interface User {
  id: string;
  name: string;
}

interface Message {
  id: string;
  text: string;
  sender: User;
  timestamp: string;
}

export default function ChatRoom({ params }: { params: Promise<{ roomId: string }> }) {
  const unwrappedParams = use(params);
  const router = useRouter();
  const [userName, setUserName] = useState("");
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [isJoined, setIsJoined] = useState(false);
  const [isJoining, setIsJoining] = useState(false);
  const [socket, setSocket] = useState<Socket | null>(null);
  const [joinError, setJoinError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const socketRef = useRef<Socket | null>(null);

  // Scroll to bottom of messages
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Initialize socket connection only once on component mount
  useEffect(() => {
    let isMounted = true;
    
    const setupSocket = async () => {
      try {
        const newSocket = await initializeSocket();
        
        if (!isMounted) return;
        
        socketRef.current = newSocket;
        setSocket(newSocket);
        console.log('[Client] Socket connected and stored:', newSocket.id);
        
        // Listen for socket connection errors
        const handleError = (error: any) => {
          console.error('[Client] Socket error:', error);
          if (isMounted) {
            setJoinError(error.message || 'Connection error');
            setIsJoining(false);
          }
        };
        
        newSocket.on('connect_error', handleError);
        newSocket.on('error', handleError);
        newSocket.on('server-error', handleError);
        
        // Handle disconnection
        newSocket.on('disconnect', (reason) => {
          console.log('[Client] Socket disconnected:', reason);
          if (isMounted && isJoined) {
            setJoinError('Connection lost. Please refresh the page.');
            setIsJoining(false);
          }
        });
        
      } catch (error) {
        console.error('[Client] Error setting up socket:', error);
        if (isMounted) {
          setJoinError('Failed to establish connection. Please refresh the page.');
          setIsJoining(false);
        }
      }
    };
    
    setupSocket();
    
    return () => {
      isMounted = false;
      // Don't disconnect the socket here, as it might be a shared instance
    };
  }, []);
  
  // Set up socket event listeners for chat functions
  useEffect(() => {
    if (!socket) return;
    
    console.log('[Client] Setting up socket event listeners');
    
    // Handle join success (for the user who joined)
    const handleJoinSuccess = ({ user, users, roomId }: { user: User; users: User[]; roomId: string }) => {
      console.log('[Client] Join success:', { user, roomId });
      setUsers(users);
      setIsJoined(true);
      setIsJoining(false);
      setJoinError(null);
      
      setMessages((prev: Message[]) => [
        ...prev,
        {
          id: Date.now().toString(),
          text: `You have joined the room`,
          sender: { id: 'system', name: 'System' },
          timestamp: new Date().toISOString()
        }
      ]);
    };
    
    // Handle user joining (for other users in the room)
    const handleUserJoined = ({ user, users }: { user: User; users: User[] }) => {
      console.log('[Client] User joined:', user.name);
      setUsers(users);
      
      // Don't add message for the current user (avoid duplicates)
      if (user.id !== socket.id) {
        setMessages((prev: Message[]) => [
          ...prev,
          {
            id: Date.now().toString(),
            text: `${user.name} has joined the room`,
            sender: { id: 'system', name: 'System' },
            timestamp: new Date().toISOString()
          }
        ]);
      }
    };
    
    // Handle new messages
    const handleNewMessage = (message: Message) => {
      setMessages((prev: Message[]) => [...prev, message]);
    };
    
    // Handle user leaving
    const handleUserLeft = ({ userId, users }: { userId: string; users: User[] }) => {
      console.log('[Client] User left:', userId);
      setUsers(users);
      
      const leftUser = users.find(u => u.id === userId);
      const userName = leftUser ? leftUser.name : 'Someone';
      
      setMessages((prev: Message[]) => [
        ...prev,
        {
          id: Date.now().toString(),
          text: `${userName} has left the room`,
          sender: { id: 'system', name: 'System' },
          timestamp: new Date().toISOString()
        }
      ]);
    };
    
    // Handle server errors
    const handleServerError = (error: { message: string }) => {
      console.error('[Client] Server error:', error);
      setIsJoining(false);
      setJoinError(error.message || 'Server error');
    };
    
    // Add event listeners
    socket.on('join-success', handleJoinSuccess);
    socket.on('user-joined', handleUserJoined);
    socket.on('new-message', handleNewMessage);
    socket.on('user-left', handleUserLeft);
    socket.on('server-error', handleServerError);
    
    return () => {
      // Remove event listeners when component unmounts or socket changes
      socket.off('join-success', handleJoinSuccess);
      socket.off('user-joined', handleUserJoined);
      socket.off('new-message', handleNewMessage);
      socket.off('user-left', handleUserLeft);
      socket.off('server-error', handleServerError);
    };
  }, [socket]);

  const handleJoinRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!userName.trim()) {
      setJoinError('Please enter your name');
      return;
    }
    
    setIsJoining(true);
    setJoinError(null);
    
    try {
      // Get the current socket or initialize a new one
      const currentSocket = socketRef.current || await initializeSocket();
      
      if (!currentSocket) {
        throw new Error('Could not initialize socket connection');
      }
      
      if (!currentSocket.connected) {
        throw new Error('Socket is not connected');
      }
      
      socketRef.current = currentSocket;
      setSocket(currentSocket);
      
      console.log('[Client] Emitting join-room event:', {
        roomId: unwrappedParams.roomId,
        userName: userName.trim(),
        socketId: currentSocket.id
      });
      
      // Set a timeout to detect if the server doesn't respond
      const timeoutId = setTimeout(() => {
        setIsJoining(false);
        setJoinError('Server did not respond. Please try again.');
      }, 10000);
      
      // Clear previous listeners to avoid duplicates
      currentSocket.off('join-success');
      currentSocket.off('server-error');
      
      // Listen for join success or error
      currentSocket.once('join-success', () => {
        clearTimeout(timeoutId);
        // Main handler in the useEffect will handle the actual state updates
      });
      
      currentSocket.once('server-error', () => {
        clearTimeout(timeoutId);
        // Main handler in the useEffect will handle the actual state updates
      });
      
      // Emit the join-room event
      currentSocket.emit('join-room', {
        roomId: unwrappedParams.roomId,
        userName: userName.trim()
      });
      
    } catch (error) {
      console.error('[Client] Error joining room:', error);
      setIsJoining(false);
      setJoinError(error instanceof Error ? error.message : 'Failed to join room');
    }
  };

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!message.trim()) return;
    
    if (!socket || !isJoined) {
      alert('Not connected to chat. Please try rejoining.');
      return;
    }
    
    try {
      socket.emit('send-message', {
        roomId: unwrappedParams.roomId,
        message: message.trim(),
        sender: { id: socket.id || 'unknown', name: userName }
      });
      
      setMessage('');
    } catch (error) {
      console.error('Error sending message:', error);
      alert('Failed to send message. Please try again.');
    }
  };
  
  const handleLeaveRoom = () => {
    if (socket) {
      // No need to explicitly leave the room, the server will handle it on disconnect
      // Just navigate away
      router.push("/");
    }
  };
  
  const formatTime = (timestamp: string): string => {
    return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  if (!isJoined) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-b from-background to-background/80">
        <div className="w-full max-w-md p-8 space-y-6 bg-white dark:bg-gray-800 rounded-xl shadow-lg">
          <div className="text-center">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Join Chat Room</h1>
            <p className="mt-2 text-gray-600 dark:text-gray-300">
              Room ID: <span className="font-mono font-bold">{unwrappedParams.roomId}</span>
            </p>
          </div>

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

            {joinError && (
              <div className="p-3 bg-red-100 dark:bg-red-900/30 border border-red-300 dark:border-red-800 rounded-md text-red-800 dark:text-red-300 text-sm">
                {joinError}
              </div>
            )}

            <button
              type="submit"
              disabled={isJoining || !userName.trim()}
              className="w-full flex items-center justify-center py-2 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors disabled:opacity-70"
            >
              {isJoining ? "Joining..." : "Join Chat"}
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
              Chat Room: <span className="font-mono">{unwrappedParams.roomId}</span>
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {users.length} {users.length === 1 ? "person" : "people"} in room
            </p>
          </div>
          <button
            onClick={handleLeaveRoom}
            className="px-4 py-2 text-sm bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-md hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
          >
            Leave Room
          </button>
        </div>
      </header>

      {/* Main content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Chat messages */}
        <div className="flex-1 flex flex-col">
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {messages.map((msg) => (
              <div 
                key={msg.id}
                className={`flex ${msg.sender.id === 'system' ? 'justify-center' : 
                  msg.sender.id === (socket?.id || 'unknown') ? 'justify-end' : 'justify-start'}`}
              >
                <div 
                  className={`max-w-xs md:max-w-md lg:max-w-lg px-4 py-2 rounded-lg ${
                    msg.sender.id === 'system' 
                      ? 'bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300 text-sm' 
                      : msg.sender.id === (socket?.id || 'unknown')
                        ? 'bg-blue-600 text-white' 
                        : 'bg-white dark:bg-gray-800 text-gray-900 dark:text-white'
                  }`}
                >
                  {msg.sender.id !== 'system' && msg.sender.id !== (socket?.id || 'unknown') && (
                    <div className="font-semibold text-sm text-gray-700 dark:text-gray-300 mb-1">
                      {msg.sender.name}
                    </div>
                  )}
                  <div>{msg.text}</div>
                  <div className="text-xs text-right mt-1 opacity-70">
                    {formatTime(msg.timestamp)}
                  </div>
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>

          {/* Message input */}
          <div className="p-4 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700">
            <form onSubmit={handleSendMessage} className="flex space-x-2">
              <input
                type="text"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Type a message..."
                className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                autoComplete="off"
              />
              <button
                type="submit"
                disabled={!message.trim()}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md transition-colors disabled:opacity-50"
              >
                Send
              </button>
            </form>
          </div>
        </div>

        {/* Users sidebar */}
        <div className="hidden md:block w-64 bg-white dark:bg-gray-800 border-l border-gray-200 dark:border-gray-700 p-4">
          <h2 className="text-lg font-semibold text-gray-800 dark:text-white mb-4">
            Users in Room
          </h2>
          <ul className="space-y-2">
            {users.map((user) => (
              <li 
                key={user.id}
                className="flex items-center space-x-2"
              >
                <div className="h-2 w-2 rounded-full bg-green-500"></div>
                <span className={`${user.id === (socket?.id || 'unknown') ? 'font-semibold' : ''} text-gray-700 dark:text-gray-300`}>
                  {user.name} {user.id === (socket?.id || 'unknown') ? '(You)' : ''}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}