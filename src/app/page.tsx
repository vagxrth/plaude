"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { generateRoomId } from "@/utils/roomUtils";

export default function Home() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);

  const handleChatClick = () => {
    setIsLoading(true);
    const roomId = generateRoomId();
    router.push(`/chat/join/${roomId}`);
  };

  const handleVideoClick = () => {
    setIsLoading(true);
    const roomId = generateRoomId();
    router.push(`/video/join/${roomId}`);
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-b from-background to-background/80">
      <div className="w-full max-w-md p-8 space-y-8 bg-white dark:bg-gray-800 rounded-xl shadow-lg">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Converse</h1>
          <p className="mt-2 text-gray-600 dark:text-gray-300">
            Connect with others through chat or video
          </p>
        </div>

        <div className="space-y-4">
          <button
            onClick={handleChatClick}
            disabled={isLoading}
            className="w-full flex items-center justify-center py-3 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors disabled:opacity-70"
          >
            <svg 
              className="w-5 h-5 mr-2" 
              fill="none" 
              stroke="currentColor" 
              viewBox="0 0 24 24" 
              xmlns="http://www.w3.org/2000/svg"
            >
              <path 
                strokeLinecap="round" 
                strokeLinejoin="round" 
                strokeWidth="2" 
                d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
              ></path>
            </svg>
            Chat
          </button>

          <button
            onClick={handleVideoClick}
            disabled={isLoading}
            className="w-full flex items-center justify-center py-3 px-4 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors disabled:opacity-70"
          >
            <svg 
              className="w-5 h-5 mr-2" 
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
            Video
          </button>
        </div>

        <div className="pt-4 text-center text-sm text-gray-500 dark:text-gray-400">
          <p>Or join an existing room</p>
          <Link 
            href="/join" 
            className="mt-2 inline-block text-blue-600 dark:text-blue-400 hover:underline"
          >
            Enter Room ID →
          </Link>
        </div>
      </div>
    </div>
  );
}
