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
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Scroll to bottom of messages
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Initialize socket connection
  useEffect(() => {
    let mounted = true;
    let cleanup: (() => void) | undefined;
    
    const initSocketConnection = async () => {
      try {
        // Initialize a new socket
        const newSocket = await initializeSocket();
        
        if (!mounted) {
          newSocket.disconnect();
          return;
        }
        
        console.log('Socket connected successfully:', newSocket.id);
        setSocket(newSocket);
        
        const handleDisconnect = (reason: string) => {
          console.log('Socket disconnected:', reason);
          if (mounted) {
            setSocket(null);
            setIsJoined(false);
            setIsJoining(false);
            
            if (isJoining) {
              alert('Connection lost. Please try again.');
            }
          }
        };
        
        const handleError = (error: Error | { message?: string }) => {
          console.error('Socket error:', error);
          if (mounted) {
            setIsJoining(false);
            const errorMessage = error instanceof Error ? error.message : 
                                (typeof error === 'object' && error?.message) ? error.message : 'Unknown error';
            alert(`Connection error: ${errorMessage}. Please try again.`);
          }
        };
        
        // Set up event listeners
        newSocket.on('disconnect', handleDisconnect);
        newSocket.on('connect_error', handleError);
        newSocket.on('error', handleError);
        
        // Store cleanup function
        cleanup = () => {
          newSocket.off('disconnect', handleDisconnect);
          newSocket.off('connect_error', handleError);
          newSocket.off('error', handleError);
          newSocket.disconnect();
        };
      } catch (error) {
        console.error('Error setting up socket:', error);
        if (mounted) {
          alert('Failed to establish connection. Please refresh the page.');
        }
      }
    };
    
    initSocketConnection();
    
    return () => {
      mounted = false;
      if (cleanup) {
        cleanup();
      }
    };
  }, [isJoining]); // Add isJoining as a dependency
    
  // Handle socket events for messages and users
  useEffect(() => {
    if (!socket) return;
    
    // Handle user joining
    const handleUserJoined = ({ user, users }: { user: User; users: User[] }) => {
      console.log('User joined:', user.name);
      setUsers(users);
      setIsJoined(true);
      setIsJoining(false);
      
      setMessages((prev: Message[]) => [
        ...prev,
        {
          id: Date.now().toString(),
          text: `${user.name} has joined the room`,
          sender: { id: 'system', name: 'System' },
          timestamp: new Date().toISOString()
        }
      ]);
    };
    
    // Handle new messages
    const handleNewMessage = (message: Message) => {
      setMessages((prev: Message[]) => [...prev, message]);
    };
    
    // Handle user leaving
    const handleUserLeft = ({ userId, users }: { userId: string; users: User[] }) => {
      setUsers(users);
      const leftUser = users.find(u => u.id === userId);
      if (leftUser) {
        setMessages((prev: Message[]) => [
          ...prev,
          {
            id: Date.now().toString(),
            text: `${leftUser.name} has left the room`,
            sender: { id: 'system', name: 'System' },
            timestamp: new Date().toISOString()
          }
        ]);
      }
    };
    
    // Handle server errors
    const handleServerError = (error: { message: string }) => {
      console.error('Server error:', error);
      setIsJoining(false);
      alert(`Server error: ${error.message}. Please try again.`);
    };
    
    socket.on('user-joined', handleUserJoined);
    socket.on('new-message', handleNewMessage);
    socket.on('user-left', handleUserLeft);
    socket.on('server-error', handleServerError);
    
    return () => {
      socket.off('user-joined', handleUserJoined);
      socket.off('new-message', handleNewMessage);
      socket.off('user-left', handleUserLeft);
      socket.off('server-error', handleServerError);
    };
  }, [socket]);



  const handleJoinRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!userName.trim()) {
      alert('Please enter your name');
      return;
    }
    
    // Check if socket exists and is connected
    if (!socket || !socket.connected) {
      console.log('Socket not connected, attempting to reconnect...');
      try {
        const newSocket = await initializeSocket();
        setSocket(newSocket);
      } catch (error) {
        console.error('Error reconnecting:', error);
        alert('Connection error. Please refresh the page.');
        setIsJoining(false);
        return;
      }
    }
    
    setIsJoining(true);
    
    try {
      // Add a timeout to detect if the server doesn't respond
      const joinTimeout = setTimeout(() => {
        if (isJoining) {
          setIsJoining(false);
          alert('Server did not respond. Please try again.');
        }
      }, 10000); // 10 second timeout
      
      // At this point we've already checked socket is not null above
      // But we need to check again for TypeScript
      if (socket) {
        // Emit the join-room event
        socket.emit('join-room', {
          roomId: unwrappedParams.roomId,
          userName: userName.trim()
        });
      } else {
        // This should never happen due to our checks above, but TypeScript requires it
        setIsJoining(false);
        clearTimeout(joinTimeout);
        alert('Connection error. Please try again.');
        return () => {};
      }
      
      // Note: setIsJoined is handled in the user-joined event handler
      
      // Clear the timeout when component unmounts
      return () => clearTimeout(joinTimeout);
    } catch (error) {
      console.error('Error joining room:', error);
      setIsJoining(false);
      alert('Failed to join room. Please try again.');
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
      const messageObj: Message = {
        id: Date.now().toString(),
        text: message.trim(),
        sender: { id: socket.id || 'unknown', name: userName },
        timestamp: new Date().toISOString()
      };
      
      setMessages((prev: Message[]) => [...prev, messageObj]);
      
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
            onClick={() => router.push("/")}
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
            {messages.length === 0 ? (
              <div className="flex items-center justify-center h-full">
                <p className="text-gray-500 dark:text-gray-400 text-center">
                  No messages yet. Be the first to send a message!
                </p>
              </div>
            ) : (
              messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex ${
                    msg.sender.id === "system"
                      ? "justify-center"
                      : msg.sender.id === socket?.id
                      ? "justify-end"
                      : "justify-start"
                  }`}
                >
                  {msg.sender.id === "system" ? (
                    <div className="bg-gray-200 dark:bg-gray-700 px-3 py-1 rounded-md text-sm text-gray-600 dark:text-gray-300">
                      {msg.text}
                    </div>
                  ) : (
                    <div
                      className={`max-w-xs sm:max-w-md space-y-1 ${
                        msg.sender.id === socket?.id ? "items-end" : "items-start"
                      }`}
                    >
                      <div className="flex items-center space-x-2">
                        <span className="text-xs text-gray-500 dark:text-gray-400">
                          {msg.sender.id === socket?.id ? "You" : msg.sender.name}
                        </span>
                        <span className="text-xs text-gray-400 dark:text-gray-500">
                          {formatTime(msg.timestamp)}
                        </span>
                      </div>
                      <div
                        className={`px-4 py-2 rounded-lg ${
                          msg.sender.id === socket?.id
                            ? "bg-blue-600 text-white"
                            : "bg-white dark:bg-gray-800 text-gray-900 dark:text-white border border-gray-200 dark:border-gray-700"
                        }`}
                      >
                        {msg.text}
                      </div>
                    </div>
                  )}
                </div>
              ))
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Message input */}
          <div className="bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 p-4">
            <form onSubmit={handleSendMessage} className="flex space-x-2">
              <input
                type="text"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Type a message..."
                className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
              />
              <button
                type="submit"
                disabled={!message.trim()}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Send
              </button>
            </form>
          </div>
        </div>

        {/* User list sidebar */}
        <div className="hidden md:block w-64 bg-white dark:bg-gray-800 border-l border-gray-200 dark:border-gray-700">
          <div className="p-4 border-b border-gray-200 dark:border-gray-700">
            <h2 className="font-semibold text-gray-900 dark:text-white">People</h2>
          </div>
          <ul className="p-2">
            {users.map((user) => (
              <li
                key={user.id}
                className="px-2 py-2 rounded-md flex items-center space-x-2"
              >
                <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                <span className="text-gray-900 dark:text-white">
                  {user.id === socket?.id ? `${user.name} (You)` : user.name}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
