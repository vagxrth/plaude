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

export function VideoRoom({ socket, roomId, userName, onLeaveRoom }: VideoRoomProps) {
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStreams, setRemoteStreams] = useState<RemoteStream[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isVideoEnabled, setIsVideoEnabled] = useState(true);
  const [isAudioEnabled, setIsAudioEnabled] = useState(true);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const videoContainerRef = useRef<HTMLDivElement>(null);
  const [isLocalMediaReady, setIsLocalMediaReady] = useState(false);
  
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
    
    // Event handler for a new remote stream
    const handleNewStream = (event: CustomEvent) => {
      const { userId, userName, stream } = event.detail;
      
      console.log(`New remote stream received from ${userName} (${userId})`);
      if (mounted) {
        setRemoteStreams(prev => {
          // Only add if not already in the list
          if (!prev.some(s => s.userId === userId)) {
            console.log(`Adding new remote stream from ${userName} to UI`);
            return [...prev, { userId, userName, stream }];
          } else {
            // Update existing stream if userId exists but stream is different
            console.log(`Updating existing stream from ${userName} in UI`);
            return prev.map(s => s.userId === userId ? { ...s, stream } : s);
          }
        });
      }
    };
    
    // Event handler for when a remote stream is removed
    const handleRemovedStream = (event: CustomEvent) => {
      const { userId } = event.detail;
      
      console.log(`Remote stream removed for user ${userId}`);
      if (mounted) {
        setRemoteStreams(prev => prev.filter(stream => stream.userId !== userId));
      }
    };
    
    // Handle track issues (muted/unmuted/ended)
    const handleTrackIssue = (event: CustomEvent) => {
      const { userId, userName, trackKind, issue } = event.detail;
      console.log(`Track ${trackKind} ${issue} for ${userName} (${userId})`);
      
      // Update UI to reflect track issues
      if (issue === 'muted' || issue === 'ended') {
        // You could set some state here to show a visual indication
        // that a user's audio or video is having issues
      }
    };

    // Function to get local media stream with specified constraints
    const getLocalStream = async (videoEnabled: boolean, audioEnabled: boolean) => {
      try {
        const constraints = {
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
          video: {
            width: { ideal: 1280 },
            height: { ideal: 720 },
            frameRate: { ideal: 30 },
          },
        };
        
        console.log('Requesting local media with constraints:', constraints);
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        console.log('Successfully obtained local media stream');
        
        // Ensure tracks are enabled according to user preferences
        stream.getVideoTracks().forEach(track => {
          track.enabled = videoEnabled;
        });
        
        stream.getAudioTracks().forEach(track => {
          track.enabled = audioEnabled;
        });
        
        return stream;
      } catch (error) {
        console.error('Error getting local stream:', error);
        throw error;
      }
    };
    
    // Setup function for media and connections
    const setupMedia = async () => {
      try {
        console.log('Setting up local media stream');
        
        // Create a video element for our local stream
        const videoElement = createVideoElement();
        
        // Get our local media stream
        const stream = await getLocalStream(isVideoEnabled, isAudioEnabled);
        
        if (stream) {
          // Set our local stream
          setLocalStream(stream);
          
          // Attach stream to video element
          if (videoElement) {
            videoElement.srcObject = stream;
            videoElement.muted = true; // Mute local video to prevent feedback
            videoElement.play().catch(e => console.error('Error playing local video:', e));
          }
          
          // Initialize WebRTC with current socket
          console.log('Local stream ready, initializing WebRTC');
          initializeWebRTC(socket, roomId, userName);
          
          setIsLocalMediaReady(true);
          setIsLoading(false);
          
          // Dispatch a global event that we have a media stream ready
          window.dispatchEvent(new CustomEvent('local-media-ready'));
        }
      } catch (error) {
        console.error('Failed to setup media:', error);
        setError('Could not access camera or microphone. Please check permissions and try again.');
        if (mounted) {
          setIsLoading(false);
        }
      }
    };
    
    // Listen for WebRTC-related events
    window.addEventListener('webrtc-stream-added', handleNewStream as EventListener);
    window.addEventListener('webrtc-stream-removed', handleRemovedStream as EventListener);
    window.addEventListener('webrtc-track-issue', handleTrackIssue as EventListener);
    
    // Handle when other users join 
    const handleUserJoined = (data: { user: { id: string, name: string }, users: Array<{ id: string, name: string }> }) => {
      const { user } = data;
      console.log(`User joined: ${user.name} (${user.id})`);
      
      // Emit ready status to ensure the user knows we're here
      socket.emit('user-ready', { userId: user.id, roomId });
      
      // If we already have our localStream, notify for immediate connection
      if (isLocalMediaReady && localStream) {
        console.log(`Sending media-ready to new user ${user.name}`);
        socket.emit('user-media-ready', { userId: user.id, roomId });
        
        // Force a connection attempt with this user
        setTimeout(() => {
          console.log(`Initializing direct WebRTC connection with ${user.name}`);
          socket.emit('initiate-connection', { targetUserId: user.id, roomId });
        }, 1000);
      }
    };
    
    // Handle when users leave
    const handleUserLeft = (data: { userId: string, userName?: string }) => {
      console.log(`User left: ${data.userName || data.userId}`);
      
      // Remove the user's stream from our UI
      setRemoteStreams(prev => prev.filter(stream => stream.userId !== data.userId));
    };
    
    // Set up socket event listeners
    socket.on('user-joined', handleUserJoined);
    socket.on('user-left', handleUserLeft);
    
    // Start setup process
    setupMedia();
    
    // Clean up function
    return () => {
      mounted = false;
      
      // Remove event listeners
      window.removeEventListener('webrtc-stream-added', handleNewStream as EventListener);
      window.removeEventListener('webrtc-stream-removed', handleRemovedStream as EventListener);
      window.removeEventListener('webrtc-track-issue', handleTrackIssue as EventListener);
      
      // Remove socket listeners
      socket.off('user-joined', handleUserJoined);
      socket.off('user-left', handleUserLeft);
      
      // Clean up connections
      cleanupConnections();
    };
    //eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socket, roomId, userName, isVideoEnabled, isAudioEnabled, createVideoElement]);
  
  // Effect to connect with existing users when our media is ready
  useEffect(() => {
    if (isLocalMediaReady) {
      // Broadcast that we're ready to establish WebRTC connections
      console.log('Broadcasting media-ready to room');
      socket.emit('user-media-ready', { roomId });
    }
  }, [isLocalMediaReady, socket, roomId]);
  
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
    
    // Reset state
    setLocalStream(null);
    setRemoteStreams([]);
    
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
  
  const handleRetryConnection = useCallback(() => {
    if (localStream && remoteStreams.length === 0) {
      console.log('Retrying connection to peers in room');
      
      // Clean up old connections
      cleanupConnections();
      
      // Initialize WebRTC again
      initializeWebRTC(socket, roomId, userName);
    }
  }, [localStream, remoteStreams.length, socket, roomId, userName]);
  
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
      
      {/* Connection retry button - only show if we have local stream but no remote streams after 10 sec */}
      {localStream && remoteStreams.length === 0 && (
        <div className="text-center p-2">
          <button
            onClick={handleRetryConnection}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
          >
            Retry Connection
          </button>
          <p className="text-sm text-gray-500 mt-1">
            Waiting for other participants...
          </p>
        </div>
      )}
      
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
}

export default VideoRoom; 