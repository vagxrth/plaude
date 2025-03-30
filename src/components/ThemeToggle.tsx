"use client";

import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { Sun, Moon, Laptop } from "lucide-react";

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  // When mounted on client, now we can show the UI
  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return null;
  }

  return (
    <div className="fixed bottom-4 right-4 z-50">
      <div className="flex items-center justify-center space-x-1 bg-card/80 backdrop-blur-sm p-2 rounded-full shadow-lg border border-border">
        <button
          onClick={() => setTheme("light")}
          className={`p-2 rounded-full ${
            theme === "light" 
              ? "bg-primary text-primary-foreground" 
              : "text-foreground/70 hover:text-foreground hover:bg-foreground/10"
          }`}
          aria-label="Light mode"
        >
          <Sun size={18} />
        </button>
        
        <button
          onClick={() => setTheme("dark")}
          className={`p-2 rounded-full ${
            theme === "dark" 
              ? "bg-primary text-primary-foreground" 
              : "text-foreground/70 hover:text-foreground hover:bg-foreground/10"
          }`}
          aria-label="Dark mode"
        >
          <Moon size={18} />
        </button>
        
        <button
          onClick={() => setTheme("system")}
          className={`p-2 rounded-full ${
            theme === "system" 
              ? "bg-primary text-primary-foreground" 
              : "text-foreground/70 hover:text-foreground hover:bg-foreground/10"
          }`}
          aria-label="System preference"
        >
          <Laptop size={18} />
        </button>
      </div>
    </div>
  );
} 