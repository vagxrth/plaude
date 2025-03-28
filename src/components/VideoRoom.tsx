import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Socket } from 'socket.io-client';
import VideoStream from './VideoStream';
import VideoControls from './VideoControls';
import { initLocalStream, initializeWebRTC, toggleAudio, toggleVideo, cleanupConnections } from '../lib/webrtc';
interface RemoteStream {
  userId: string;
  userName: string;
  stream: MediaStream;
}

interface VideoRoomProps {
  socket: Socket;
  roomId: string;
  userName: string;
  onLeaveRoom: () => void;
}

const VideoRoom = ({ socket, roomId, userName, onLeaveRoom }: VideoRoomProps) => {
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStreams, setRemoteStreams] = useState<RemoteStream[]>([]);
  const [isAudioEnabled, setIsAudioEnabled] = useState(true);
  const [isVideoEnabled, setIsVideoEnabled] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const [videoInitAttempts, setVideoInitAttempts] = useState(0);
  const videoContainerRef = useRef<HTMLDivElement>(null);
  
  // Function to create a video element
  const createVideoElement = useCallback(() => {
    if (localVideoRef.current) {
      console.log('Video element already exists, reusing it');
      return localVideoRef.current;
    }
    
    console.log('Creating new video element');
    const videoElement = document.createElement('video');
    videoElement.id = 'local-video-element';
    videoElement.autoplay = true;
    videoElement.playsInline = true;
    videoElement.muted = true;
    
    // Store the reference
    localVideoRef.current = videoElement;
    
    return videoElement;
  }, []);
  
  // Initialize local stream and WebRTC connections
  useEffect(() => {
    console.log('VideoRoom component mounted, setting up media...');
    let mounted = true;
    let retryTimeoutId: NodeJS.Timeout;
    
    const setupMedia = async () => {
      try {
        if (!mounted) return;
        
        setIsLoading(true);
        
        // Create and prepare video element if needed
        const videoElement = createVideoElement();
        console.log('Video element prepared:', videoElement.id);
        
        try {
          // Ensure browser permissions prompt appears
          await new Promise(resolve => setTimeout(resolve, 500));
          
          // Get access to camera and microphone
          console.log('Calling initLocalStream with video element');
          const stream = await initLocalStream(videoElement);
          console.log('Local stream obtained:', stream.id);
          
          if (!mounted) return;
          
          // Set the local stream state
          setLocalStream(stream);
          
          // Initialize WebRTC with socket
          console.log('Initializing WebRTC with socket...');
          initializeWebRTC(socket, roomId, userName);
          
          setIsLoading(false);
        } catch (mediaError) {
          console.error('Media access error:', mediaError);
          if (!mounted) return;
          
          // Increment attempt counter
          const newAttemptCount = videoInitAttempts + 1;
          setVideoInitAttempts(newAttemptCount);
          
          if (newAttemptCount < 3) {
            console.log(`Retrying media access (attempt ${newAttemptCount + 1})`);
            // Clear video element and retry after a short delay
            if (localVideoRef.current) {
              localVideoRef.current.srcObject = null;
            }
            
            retryTimeoutId = setTimeout(() => {
              if (mounted) {
                setupMedia();
              }
            }, 2000);
          } else {
            setError(mediaError instanceof Error ? mediaError.message : 'Could not access camera or microphone');
            setIsLoading(false);
          }
        }
      } catch (err) {
        if (!mounted) return;
        console.error('Error in setupMedia:', err);
        setError('Could not access camera or microphone. Please check your permissions.');
        setIsLoading(false);
      }
    };
    
    // Give a short delay to ensure DOM is ready
    const timeoutId = setTimeout(() => {
      setupMedia();
    }, 300);
    
    // Listen for new remote streams
    const handleNewStream = (event: Event) => {
      if (!mounted) return;
      const customEvent = event as CustomEvent<{ userId: string; userName: string; stream: MediaStream }>;
      const { userId, userName, stream } = customEvent.detail;
      
      console.log('New remote stream received:', userId, userName);
      
      setRemoteStreams(prev => {
        // Check if we already have this stream
        const exists = prev.some(s => s.userId === userId);
        if (exists) {
          return prev.map(s => s.userId === userId ? { ...s, stream } : s);
        } else {
          return [...prev, { userId, userName, stream }];
        }
      });
    };
    
    // Listen for removed streams
    const handleRemovedStream = (event: Event) => {
      if (!mounted) return;
      const customEvent = event as CustomEvent<{ userId: string }>;
      const { userId } = customEvent.detail;
      
      console.log('Remote stream removed:', userId);
      
      setRemoteStreams(prev => prev.filter(s => s.userId !== userId));
    };
    
    // Add event listeners
    window.addEventListener('webrtc-stream-added', handleNewStream);
    window.addEventListener('webrtc-stream-removed', handleRemovedStream);
    
    // Clean up function
    return () => {
      mounted = false;
      clearTimeout(timeoutId);
      clearTimeout(retryTimeoutId);
      window.removeEventListener('webrtc-stream-added', handleNewStream);
      window.removeEventListener('webrtc-stream-removed', handleRemovedStream);
      cleanupConnections();
    };
  }, [socket, roomId, userName, createVideoElement, videoInitAttempts]);
  
  // Handle toggle audio
  const handleToggleAudio = () => {
    const isEnabled = toggleAudio();
    setIsAudioEnabled(isEnabled);
  };
  
  // Handle toggle video
  const handleToggleVideo = () => {
    const isEnabled = toggleVideo();
    setIsVideoEnabled(isEnabled);
  };
  
  // Handle leave room
  const handleLeaveRoom = () => {
    // Clean up connections before leaving
    cleanupConnections();
    
    // Notify the server that we're leaving
    socket.emit('leave-room', { roomId, userName });
    
    // Call the parent component's handler
    onLeaveRoom();
  };
  
  // Create video grid layout class based on number of participants
  const getGridClass = () => {
    const totalParticipants = 1 + remoteStreams.length;
    
    if (totalParticipants === 1) {
      return 'grid-cols-1';
    } else if (totalParticipants === 2) {
      return 'grid-cols-2';
    } else if (totalParticipants <= 4) {
      return 'grid-cols-2';
    } else if (totalParticipants <= 9) {
      return 'grid-cols-3';
    } else {
      return 'grid-cols-4';
    }
  };
  
  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-full">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-purple-500 mx-auto"></div>
          <p className="mt-4 text-gray-600 dark:text-gray-300">Connecting to camera and microphone...</p>
          <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
            Please allow access when prompted by your browser
          </p>
        </div>
      </div>
    );
  }
  
  if (error) {
    return (
      <div className="flex items-center justify-center min-h-full">
        <div className="text-center max-w-md p-6 bg-red-100 dark:bg-red-900/20 rounded-lg">
          <svg className="w-12 h-12 text-red-600 dark:text-red-400 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <h3 className="text-lg font-medium text-red-800 dark:text-red-200 mt-3">{error}</h3>
          <p className="mt-2 text-red-700 dark:text-red-300">
            Please ensure your camera and microphone are connected and you&apos;ve granted permission in your browser.
          </p>  
          <div className="mt-4 flex flex-col gap-2">
            <button 
              onClick={() => {
                setError(null);
                setIsLoading(true);
                setVideoInitAttempts(0);
                
                // Create fresh video element
                const videoElement = createVideoElement();
                
                setTimeout(() => {
                  if (videoElement) {
                    initLocalStream(videoElement)
                      .then(stream => {
                        setLocalStream(stream);
                        initializeWebRTC(socket, roomId, userName);
                        setIsLoading(false);
                      })
                      .catch(err => {
                        setError(err instanceof Error ? err.message : 'Could not access media devices');
                        setIsLoading(false);
                      });
                  } else {
                    setError('Could not initialize video element. Please refresh the page and try again.');
                    setIsLoading(false);
                  }
                }, 500);
              }}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
            >
              Try Again
            </button>
            <button 
              onClick={onLeaveRoom}
              className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors"
            >
              Go Back
            </button>
          </div>
        </div>
      </div>
    );
  }
  
  return (
    <div className="flex flex-col h-full" ref={videoContainerRef}>
      {/* Video grid */}
      <div className={`flex-1 grid ${getGridClass()} gap-4 p-4 overflow-auto`}>
        {/* Local stream */}
        {localStream && (
          <VideoStream
            stream={localStream}
            userName={userName}
            muted={true}
            isLocal={true}
          />
        )}
        
        {/* Remote streams */}
        {remoteStreams.map((remote) => (
          <VideoStream
            key={remote.userId}
            stream={remote.stream}
            userName={remote.userName}
            muted={false}
            isLocal={false}
          />
        ))}
        
        {/* Show placeholder if no streams */}
        {!localStream && remoteStreams.length === 0 && (
          <div className="flex items-center justify-center bg-gray-900 rounded-lg aspect-video">
            <div className="text-center text-gray-400">
              <div className="animate-pulse text-4xl mb-2">🎥</div>
              <p>Starting video...</p>
            </div>
          </div>
        )}
      </div>
      
      {/* Video controls */}
      <div className="p-4">
        <VideoControls
          isAudioEnabled={isAudioEnabled}
          isVideoEnabled={isVideoEnabled}
          onToggleAudio={handleToggleAudio}
          onToggleVideo={handleToggleVideo}
          onLeaveRoom={handleLeaveRoom}
        />
      </div>
    </div>
  );
};

export default VideoRoom; 