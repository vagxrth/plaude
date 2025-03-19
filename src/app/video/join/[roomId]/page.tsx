"use client";

import { useState, use } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function VideoRoom({ params }: { params: Promise<{ roomId: string }> }) {
  // Unwrap params using React.use()
  const unwrappedParams = use(params);
  const router = useRouter();
  const [userName, setUserName] = useState("");
  const [isJoined, setIsJoined] = useState(false);
  const [isJoining, setIsJoining] = useState(false);

  const handleJoinRoom = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!userName.trim()) return;
    
    setIsJoining(true);
    
    // Simulate joining
    setTimeout(() => {
      setIsJoined(true);
      setIsJoining(false);
    }, 1000);
  };

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
          <button
            onClick={() => router.push("/")}
            className="px-4 py-2 text-sm bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-md hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
          >
            Leave Room
          </button>
        </div>
      </header>

      {/* Main content */}
      <div className="flex-1 flex items-center justify-center p-4">
        <div className="text-center max-w-md mx-auto">
          <div className="mb-4 p-8 bg-purple-100 dark:bg-purple-900/20 rounded-lg">
            <svg 
              className="w-16 h-16 mx-auto text-purple-600 dark:text-purple-400" 
              fill="none" 
              stroke="currentColor" 
              viewBox="0 0 24 24" 
              xmlns="http://www.w3.org/2000/svg"
            >
              <path 
                strokeLinecap="round" 
                strokeLinejoin="round" 
                strokeWidth="2" 
                d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
              ></path>
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
            Video Chat Functionality
          </h2>
          <p className="text-gray-600 dark:text-gray-300 mb-4">
            This is a placeholder for the video chat functionality. In a real implementation, this would include WebRTC for peer-to-peer video streaming.
          </p>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Room ID: <span className="font-mono font-semibold">{unwrappedParams.roomId}</span> | 
            User: <span className="font-semibold">{userName}</span>
          </p>
        </div>
      </div>
    </div>
  );
}
