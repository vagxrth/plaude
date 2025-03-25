"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { generateRoomId } from "@/utils/roomUtils";
import { MessageCircle, Video } from "lucide-react";
import ActionButton from "@/components/ActionButton";

export default function Home() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [roomId, setRoomId] = useState('');
  const [showRoomInput, setShowRoomInput] = useState(false);

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

  const handleEnterRoom = () => {
    if (showRoomInput && roomId.trim()) {
      router.push(`/chat/join/${roomId}`);
    } else {
      setShowRoomInput(true);
    }
  };

  return (
    <section className="relative min-h-screen flex flex-col items-center justify-center px-6 overflow-hidden">
      {/* Background Elements */}
      <div className="absolute inset-0 -z-10">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 rounded-full bg-primary/10 filter blur-3xl animate-pulse-soft"></div>
        <div className="absolute bottom-1/3 right-1/4 w-80 h-80 rounded-full bg-purple-500/10 filter blur-3xl animate-pulse-soft" style={{ animationDelay: '1s' }}></div>
      </div>
      
      {/* Radial gradient overlay */}
      <div className="absolute inset-0 bg-gradient-radial from-transparent to-background -z-10"></div>
      
      {/* Content */}
      <div className="max-w-4xl mx-auto text-center">
        <h1 className="text-4xl md:text-6xl lg:text-7xl font-bold tracking-tight text-white mb-6 animate-slide-up" style={{ animationDelay: '200ms' }}>
          Converse
        </h1>
        
        <p className="text-lg md:text-xl text-white/70 mb-10 max-w-2xl mx-auto animate-slide-up" style={{ animationDelay: '300ms' }}>
          Connect with others through chat or video
        </p>
        
        {/* Main action buttons */}
        <div className="flex flex-col items-center justify-center gap-4 mb-16">
          <ActionButton 
            text="Chat" 
            icon={MessageCircle} 
            primary
            className="w-full max-w-md bg-blue-600 hover:bg-blue-700"
            onClick={handleChatClick}
            disabled={isLoading}
          />
          
          <ActionButton 
            text="Video" 
            icon={Video}
            className="w-full max-w-md bg-purple-600 hover:bg-purple-700"
            onClick={handleVideoClick}
            disabled={isLoading}
          />
        </div>
        
        {/* Room ID section - below main buttons */}
        <div className="mt-4 animate-fade-in" style={{ animationDelay: '500ms' }}>
          <p className="text-white/70 mb-2">Or join an existing room</p>
          
          {showRoomInput ? (
            <div className="flex items-center gap-2 justify-center">
              <input
                type="text"
                value={roomId}
                onChange={(e) => setRoomId(e.target.value)}
                placeholder="Enter room ID"
                className="bg-white/5 border-white/10 text-white placeholder:text-white/40 focus:ring-primary w-48 sm:w-64 px-3 py-2 rounded-md"
              />
              <button 
                onClick={handleEnterRoom} 
                className="bg-white/5 text-white border border-white/10 hover:bg-white/10 px-4 py-2 rounded-md"
              >
                Join
              </button>
            </div>
          ) : (
            <button
              onClick={handleEnterRoom}
              className="text-blue-400 hover:text-blue-300 transition-colors flex items-center justify-center gap-1 mx-auto"
            >
              <span>Enter Room ID</span>
              <span className="text-lg">→</span>
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
