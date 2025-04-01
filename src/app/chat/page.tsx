"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { MessageCircle, LogIn, ArrowLeft, PlusCircle } from "lucide-react";
import { generateRoomId } from "@/utils/roomUtils";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export default function ChatPage() {
  const router = useRouter();
  const [userName, setUserName] = useState("");
  const [roomId, setRoomId] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [generatedRoomId] = useState(() => generateRoomId());

  const handleJoinChat = () => {
    if (!userName.trim() || !roomId.trim()) return;
    
    // Store the username in sessionStorage before redirecting
    sessionStorage.setItem('userName', userName.trim());
    router.push(`/chat/join/${roomId.trim()}`);
  };

  const handleCreateRoom = () => {
    if (!userName.trim()) return;
    
    // Store the username in sessionStorage before redirecting
    sessionStorage.setItem('userName', userName.trim());
    router.push(`/chat/join/${generatedRoomId}`);
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 relative overflow-hidden">
      {/* Enhanced Background Elements */}
      <div className="absolute inset-0 -z-10">
        {/* Deep space gradient */}
        <div className="absolute inset-0 bg-gradient-to-b from-[#080819] via-[#0a0a20] to-[#02020a] opacity-90"></div>
        
        {/* Subtle nebula effects */}
        <div className="absolute top-0 left-0 right-0 h-1/2 bg-gradient-radial from-blue-900/5 to-transparent opacity-30"></div>
        <div className="absolute bottom-0 right-0 w-full h-1/2 bg-gradient-radial from-indigo-900/5 to-transparent opacity-20"></div>
        
        {/* Animated stars/particles with varying sizes and opacities */}
        <div className="absolute inset-0 overflow-hidden">
          <div className="stars-container">
            {[...Array(40)].map((_, i) => (
              <div 
                key={i}
                className="absolute rounded-full bg-white"
                style={{
                  width: `${Math.random() * 2 + 1}px`,
                  height: `${Math.random() * 2 + 1}px`,
                  top: `${Math.random() * 100}%`,
                  left: `${Math.random() * 100}%`,
                  opacity: Math.random() * 0.5 + 0.1,
                  animation: `pulse-soft ${Math.random() * 5 + 2}s infinite ease-in-out`,
                  animationDelay: `${Math.random() * 5}s`
                }}
              />
            ))}
          </div>
        </div>
      </div>
      
      <Card className="w-full max-w-md neo-card animate-appear" style={{animationDelay: '100ms'}}>
        <CardHeader className="pb-4 text-center">
          <div className="mx-auto bg-gradient-to-br from-blue-500 to-blue-600 text-white p-3 rounded-full h-14 w-14 flex items-center justify-center mb-3 shadow-lg shadow-blue-500/10 animate-float">
            <MessageCircle size={28} />
          </div>
          <CardTitle className="text-2xl text-center font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-white/80">
            Chat Room
          </CardTitle>
          <CardDescription className="text-center text-white/70">
            Create a new room or join an existing one
          </CardDescription>
        </CardHeader>
        
        <CardContent className="space-y-4">
          <div className="space-y-2 animate-appear" style={{animationDelay: '200ms'}}>
            <label htmlFor="name" className="text-sm font-medium text-white/80">
              Your Name
            </label>
            <Input
              id="name"
              placeholder="Enter your name"
              value={userName}
              onChange={(e) => setUserName(e.target.value)}
              className="bg-white/5 border-white/10 text-white placeholder:text-white/40 focus-visible:ring-blue-500"
            />
          </div>
          
          {!isCreating ? (
            <>
              <div className="space-y-2 animate-appear" style={{animationDelay: '300ms'}}>
                <label htmlFor="roomId" className="text-sm font-medium text-white/80">
                  Room ID
                </label>
                <Input
                  id="roomId"
                  placeholder="Enter 6-character room ID"
                  value={roomId}
                  onChange={(e) => setRoomId(e.target.value)}
                  className="bg-white/5 border-white/10 text-white placeholder:text-white/40 focus-visible:ring-blue-500"
                />
              </div>
              
              <Button 
                onClick={handleJoinChat} 
                className="w-full bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white shadow-md shadow-blue-600/10 btn-glow animate-appear flex items-center justify-center transition-all duration-300 hover:scale-[1.02]"
                disabled={!userName.trim() || !roomId.trim()}
                style={{animationDelay: '400ms'}}
              >
                <LogIn size={18} className="mr-2" />
                Join Existing Room
              </Button>
              
              <div className="flex items-center gap-2 pt-2 animate-appear" style={{animationDelay: '500ms'}}>
                <div className="card-divider"></div>
                <span className="text-xs text-white/60">OR</span>
                <div className="card-divider"></div>
              </div>
              
              <Button 
                onClick={() => setIsCreating(true)} 
                variant="outline"
                className="w-full bg-white/5 border-white/10 hover:bg-white/10 text-white animate-appear flex items-center justify-center transition-all duration-300 hover:scale-[1.02]"
                style={{animationDelay: '600ms'}}
              >
                <PlusCircle size={18} className="mr-2" />
                Create New Room
              </Button>
            </>
          ) : (
            <>
              <div className="space-y-2 animate-appear" style={{animationDelay: '300ms'}}>
                <div className="flex justify-between items-center">
                  <label className="text-sm font-medium text-white/80">
                    Room ID (Auto-generated)
                  </label>
                </div>
                <div className="bg-white/5 border border-white/10 rounded-md px-4 py-2 font-mono text-white text-sm flex items-center justify-between">
                  <span>{generatedRoomId}</span>
                  <span className="text-xs text-white/50">Keep this ID to invite others</span>
                </div>
              </div>
              
              <Button 
                onClick={handleCreateRoom} 
                className="w-full bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white shadow-md shadow-blue-600/10 btn-glow animate-appear flex items-center justify-center transition-all duration-300 hover:scale-[1.02]"
                disabled={!userName.trim()}
                style={{animationDelay: '400ms'}}
              >
                <PlusCircle size={18} className="mr-2" />
                Create New Room
              </Button>
              
              <div className="flex items-center gap-2 pt-2 animate-appear" style={{animationDelay: '500ms'}}>
                <div className="card-divider"></div>
                <span className="text-xs text-white/60">OR</span>
                <div className="card-divider"></div>
              </div>
              
              <Button 
                onClick={() => setIsCreating(false)} 
                variant="outline"
                className="w-full bg-white/5 border-white/10 hover:bg-white/10 text-white animate-appear flex items-center justify-center transition-all duration-300 hover:scale-[1.02]"
                style={{animationDelay: '600ms'}}
              >
                <LogIn size={18} className="mr-2" />
                Join Existing Room
              </Button>
            </>
          )}
        </CardContent>
        
        <CardFooter className="flex items-center justify-center pt-2">
          <Link 
            href="/" 
            className="text-blue-400 hover:text-blue-300 inline-flex items-center justify-center gap-1 mt-2 text-sm transition-colors hover-scale"
          >
            <ArrowLeft size={16} />
            <span>Back to Home</span>
          </Link>
        </CardFooter>
      </Card>
    </div>
  );
} 