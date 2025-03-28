import React, { useState, useEffect, useRef } from 'react';
import { Socket } from 'socket.io-client';
import VideoStream from './VideoStream';
import VideoControls from './VideoControls';
import { initLocalStream, initializeWebRTC, toggleAudio, toggleVideo, cleanupConnections } from '../lib/webrtc';

interface User {
  id: string;
  name: string;
}

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
  
  // Initialize local stream and WebRTC connections
  useEffect(() => {
    const setupMedia = async () => {
      try {
        setIsLoading(true);
        
        if (localVideoRef.current) {
          // Get access to camera and microphone
          const stream = await initLocalStream(localVideoRef.current);
          setLocalStream(stream);
          
          // Initialize WebRTC with socket
          initializeWebRTC(socket, roomId, userName);
          
          setIsLoading(false);
        }
      } catch (err) {
        console.error('Error setting up media:', err);
        setError('Could not access camera or microphone. Please check your permissions.');
        setIsLoading(false);
      }
    };
    
    setupMedia();
    
    // Listen for new remote streams
    const handleNewStream = (event: Event) => {
      const customEvent = event as CustomEvent<{ userId: string; userName: string; stream: MediaStream }>;
      const { userId, userName, stream } = customEvent.detail;
      
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
      const customEvent = event as CustomEvent<{ userId: string }>;
      const { userId } = customEvent.detail;
      
      setRemoteStreams(prev => prev.filter(s => s.userId !== userId));
    };
    
    // Add event listeners
    window.addEventListener('webrtc-stream-added', handleNewStream);
    window.addEventListener('webrtc-stream-removed', handleRemovedStream);
    
    // Clean up function
    return () => {
      window.removeEventListener('webrtc-stream-added', handleNewStream);
      window.removeEventListener('webrtc-stream-removed', handleRemovedStream);
      cleanupConnections();
    };
  }, [socket, roomId, userName]);
  
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
          <p className="mt-2 text-red-700 dark:text-red-300">Please allow access to your camera and microphone to join the video call.</p>
          <button 
            onClick={onLeaveRoom}
            className="mt-4 px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors"
          >
            Go Back
          </button>
        </div>
      </div>
    );
  }
  
  return (
    <div className="flex flex-col h-full">
      {/* Video grid */}
      <div className={`flex-1 grid ${getGridClass()} gap-4 p-4 overflow-auto`}>
        {/* Local stream */}
        <VideoStream
          stream={localStream}
          userName={userName}
          muted={true}
          isLocal={true}
        />
        
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