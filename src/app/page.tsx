"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { MessageCircle, Video } from "lucide-react";
import ActionButton from "@/components/ActionButton";
import { InteractiveGridPattern } from "@/components/magicui/interactive-grid-pattern";
import { ThemeToggle } from "@/components/ThemeToggle";

export default function Home() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);

  const handleChatClick = () => {
    setIsLoading(true);
    router.push('/chat');
  };

  // const handleVideoClick = () => {
  //   setIsLoading(true);
  //   router.push('/video');
  // };

  return (
    <section className="relative min-h-screen flex flex-col items-center justify-center px-6 overflow-hidden bg-background">
      <div className="fixed inset-0 z-0 overflow-hidden">
        <InteractiveGridPattern
          squares={[80, 80]} 
          width={30}
          height={30}
          className="fixed inset-0 w-[100vw] h-[100vh] opacity-20"
          squaresClassName="stroke-foreground/[0.07] hover:fill-foreground/[0.5]"
        />
      </div>

      {/* Background Elements */}
      <div className="absolute inset-0 -z-10">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 rounded-full bg-primary/10 filter blur-3xl animate-pulse-soft"></div>
        <div className="absolute bottom-1/3 right-1/4 w-80 h-80 rounded-full bg-purple-500/10 filter blur-3xl animate-pulse-soft" style={{ animationDelay: '1s' }}></div>
      </div>
      
      {/* Radial gradient overlay */}
      <div className="absolute inset-0 bg-gradient-radial from-transparent to-background -z-10"></div>
      
      {/* Content */}
      <div className="max-w-4xl mx-auto text-center relative z-10">
        <h1 className="text-4xl md:text-6xl lg:text-7xl font-bold tracking-tight text-foreground mb-6 animate-slide-up" style={{ animationDelay: '200ms' }}>
          PLAUDE
        </h1>
        
        <p className="text-lg md:text-xl text-foreground/70 mb-10 max-w-2xl mx-auto animate-slide-up" style={{ animationDelay: '300ms' }}>
          Connect with others through chat or video
        </p>
        
        {/* Main action buttons */}
        <div className="flex flex-col items-center justify-center gap-4">
          <ActionButton 
            text="Chat" 
            icon={MessageCircle} 
            primary
            className="w-full max-w-md bg-blue-600 hover:bg-blue-700"
            onClick={handleChatClick}
            disabled={isLoading}
          />
          
          <ActionButton 
            text="Video - Coming Soon..." 
            icon={Video}
            className="w-full max-w-md bg-purple-600 hover:bg-purple-700"
            onClick={() => {}}
            disabled={true}
          />
        </div>
      </div>
      
      {/* Theme Toggle */}
      <ThemeToggle />
    </section>
  );
}
