"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Video, Plus, LogIn } from "lucide-react";
import { generateRoomId } from "@/utils/roomUtils";
import { ThemeToggle } from "@/components/ThemeToggle";

export default function VideoPage() {
  const router = useRouter();
  const [roomId, setRoomId] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  const handleCreateNewRoom = () => {
    setIsLoading(true);
    const newRoomId = generateRoomId();
    router.push(`/video/join/${newRoomId}`);
  };

  const handleJoinRoom = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!roomId.trim()) {
      setError("Please enter a room ID");
      return;
    }
    
    if (roomId.trim().length !== 6) {
      setError("Room ID must be 6 characters");
      return;
    }
    
    setIsLoading(true);
    setError("");
    
    // Redirect to the join page for the specified room
    router.push(`/video/join/${roomId.trim()}`);
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 bg-background relative overflow-hidden">
      {/* Background Elements */}
      <div className="absolute inset-0 -z-10">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 rounded-full bg-purple-600/10 filter blur-3xl animate-pulse-soft"></div>
        <div className="absolute bottom-1/3 right-1/4 w-80 h-80 rounded-full bg-blue-500/10 filter blur-3xl animate-pulse-soft" style={{ animationDelay: '1s' }}></div>
      </div>
      
      {/* Radial gradient overlay */}
      <div className="absolute inset-0 bg-gradient-radial from-transparent to-background -z-10"></div>
      
      <div className="w-full max-w-md p-8 space-y-8 glass-morphism rounded-xl shadow-xl animate-fade-in">
        <div className="text-center">
          <div className="mx-auto bg-purple-600 text-white p-3 rounded-full h-14 w-14 flex items-center justify-center mb-4">
            <Video size={28} />
          </div>
          <h1 className="text-2xl font-bold text-foreground">Video Room</h1>
          <p className="mt-2 text-foreground/70">
            Create a new room or join an existing one
          </p>
        </div>
        
        <div className="space-y-4">
          <button
            onClick={handleCreateNewRoom}
            disabled={isLoading}
            className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors disabled:opacity-70"
          >
            <Plus size={18} />
            <span>Create New Room</span>
          </button>
          
          <div className="relative flex py-3 items-center">
            <div className="flex-grow border-t border-foreground/10"></div>
            <span className="flex-shrink mx-3 text-foreground/60 text-sm">or</span>
            <div className="flex-grow border-t border-foreground/10"></div>
          </div>
          
          <form onSubmit={handleJoinRoom} className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="roomId" className="block text-sm font-medium text-foreground/80 mb-1">
                Room ID
              </label>
              <input
                type="text"
                id="roomId"
                value={roomId}
                onChange={(e) => {
                  setRoomId(e.target.value);
                  if (error) setError("");
                }}
                placeholder="Enter 6-character room ID"
                className="w-full px-4 py-2 bg-foreground/5 border border-foreground/10 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500 text-foreground placeholder:text-foreground/40"
                autoComplete="off"
                maxLength={6}
              />
              {error && <p className="text-sm text-red-300">{error}</p>}
            </div>
            
            <button
              type="submit"
              disabled={isLoading}
              className="w-full flex items-center justify-center gap-2 py-2 px-4 bg-foreground/10 hover:bg-foreground/15 text-foreground rounded-lg transition-colors disabled:opacity-70"
            >
              <LogIn size={18} />
              <span>Join Existing Room</span>
            </button>
          </form>
        </div>
        
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
      
      <ThemeToggle />
    </div>
  );
} 