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

  // Refs to avoid stale closures in socket handlers
  const isLocalMediaReadyRef = useRef(false);
  const localStreamRef = useRef<MediaStream | null>(null);
  
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
  
  // Keep refs in sync with state so socket handlers always see current values
  useEffect(() => {
    isLocalMediaReadyRef.current = isLocalMediaReady;
  }, [isLocalMediaReady]);

  useEffect(() => {
    localStreamRef.current = localStream;
  }, [localStream]);

  // Initialize local stream and WebRTC connections
  useEffect(() => {
    console.log('VideoRoom component mounted, setting up media...');
    let mounted = true;
    const pendingEventListeners = new Set<() => void>(); // Track event listeners for cleanup
    
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
          
          // Initialize WebRTC with current socket and local stream
          console.log('[CLIENT] Local stream ready, initializing WebRTC');
          console.log('[CLIENT] Local stream details:', { 
            id: stream.id, 
            audioTracks: stream.getAudioTracks().length,
            videoTracks: stream.getVideoTracks().length
          });
          initializeWebRTC(socket, roomId, userName, stream);
          console.log('[CLIENT] WebRTC initialized successfully');
          
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

      // Only proceed if we have our media ready (use refs for current values)
      if (isLocalMediaReadyRef.current && localStreamRef.current) {
        console.log(`Local media ready, establishing connection with ${user.name}`);

        // Emit ready status to the new user
        socket.emit('user-ready', { userId: user.id, roomId });

        // Notify that we have media ready
        socket.emit('user-media-ready', { userId: user.id, roomId });

        // Wait to ensure both sides are ready, then initiate connection
        setTimeout(() => {
          console.log(`Initiating WebRTC connection with ${user.name}`);
          socket.emit('initiate-connection', { targetUserId: user.id, roomId });
        }, 500); // Reduced delay for better responsiveness
      } else {
        console.log(`Local media not ready yet, will connect with ${user.name} once ready`);

        // Store this user to connect later when media is ready
        const connectWhenReady = () => {
          if (isLocalMediaReadyRef.current && localStreamRef.current) {
            console.log(`Local media became ready, connecting to ${user.name}`);
            socket.emit('user-ready', { userId: user.id, roomId });
            socket.emit('user-media-ready', { userId: user.id, roomId });
            setTimeout(() => {
              socket.emit('initiate-connection', { targetUserId: user.id, roomId });
            }, 500); // Reduced delay for better responsiveness
            window.removeEventListener('local-media-ready', connectWhenReady);
            pendingEventListeners.delete(connectWhenReady); // Remove from tracking
          }
        };

        window.addEventListener('local-media-ready', connectWhenReady);
        pendingEventListeners.add(connectWhenReady); // Track for cleanup
      }
    };

    // Handle when another user's media becomes ready
    const handleUserMediaReady = (data: { userId: string, userName: string, roomId: string }) => {
      console.log(`[CLIENT] User media ready event received:`, data);
      console.log(`[CLIENT] My socket ID: ${socket.id}, Their ID: ${data.userId}`);
      console.log(`[CLIENT] Local media ready: ${isLocalMediaReadyRef.current}, Local stream: ${!!localStreamRef.current}`);

      // If we also have our media ready and haven't established a connection yet, try to connect
      if (isLocalMediaReadyRef.current && localStreamRef.current) {
        console.log(`[CLIENT] Both users have media ready, attempting connection with ${data.userName}`);

        // Use a small delay and check if we should be the one to initiate
        setTimeout(() => {
          // Use socket IDs to determine who should initiate (lower ID initiates)
          const shouldInitiate = socket.id && socket.id < data.userId;

          console.log(`[CLIENT] Should I initiate? ${shouldInitiate} (My ID: ${socket.id}, Their ID: ${data.userId})`);

          if (shouldInitiate) {
            console.log(`[CLIENT] Initiating connection with ${data.userName} (I have lower socket ID)`);
            socket.emit('initiate-connection', { targetUserId: data.userId, roomId });
          } else {
            console.log(`[CLIENT] Waiting for ${data.userName} to initiate connection (they have lower socket ID)`);
          }
        }, 500);
      } else {
        console.log(`[CLIENT] Cannot connect yet - Local media ready: ${isLocalMediaReadyRef.current}, Local stream: ${!!localStreamRef.current}`);
      }
    };

    // Handle response with existing room users
    const handleRoomUsersResponse = (data: { roomId: string, users: Array<{ id: string, name: string }> }) => {
      console.log(`[CLIENT] Room users response:`, data);
      console.log(`[CLIENT] My socket ID: ${socket.id}`);
      console.log(`[CLIENT] Local media ready: ${isLocalMediaReadyRef.current}, Local stream: ${!!localStreamRef.current}`);

      if (isLocalMediaReadyRef.current && localStreamRef.current && data.users.length > 0) {
        // Attempt to connect with each existing user
        data.users.forEach((user, index) => {
          setTimeout(() => {
            console.log(`[CLIENT] Processing existing user: ${user.name} (${user.id})`);

            // Notify that we have media ready
            socket.emit('user-media-ready', { userId: user.id, roomId });

            // Use socket IDs to determine who should initiate (lower ID initiates)
            const shouldInitiate = socket.id && socket.id < user.id;

            console.log(`[CLIENT] Should I initiate with existing user? ${shouldInitiate} (My ID: ${socket.id}, Their ID: ${user.id})`);

            if (shouldInitiate) {
              console.log(`[CLIENT] Initiating connection with existing user ${user.name} (I have lower socket ID)`);
              socket.emit('initiate-connection', { targetUserId: user.id, roomId });
            } else {
              console.log(`[CLIENT] Waiting for existing user ${user.name} to initiate connection (they have lower socket ID)`);
            }
          }, index * 1000); // Stagger connections to avoid overwhelming
        });
      } else {
        console.log(`[CLIENT] Cannot connect to existing users - Media ready: ${isLocalMediaReadyRef.current}, Stream: ${!!localStreamRef.current}, Users: ${data.users.length}`);
      }
    };
    
    // Handle when users leave
    const handleUserLeft = (data: { userId: string, userName?: string }) => {
      console.log(`User left: ${data.userName || data.userId}`);
      
      // Remove the user's stream from our UI
      setRemoteStreams(prev => prev.filter(stream => stream.userId !== data.userId));
    };
    
    // Clean up any existing listeners first to prevent duplicates
    socket.off('user-joined');
    socket.off('user-left'); 
    socket.off('user-media-ready');
    socket.off('room-users-response');
    
    // Set up socket event listeners
    socket.on('user-joined', handleUserJoined);
    socket.on('user-left', handleUserLeft);
    socket.on('user-media-ready', handleUserMediaReady);
    socket.on('room-users-response', handleRoomUsersResponse);
    
    // Start setup process
    setupMedia();
    
    // Clean up function
    return () => {
      mounted = false;
      
      // Remove event listeners
      window.removeEventListener('webrtc-stream-added', handleNewStream as EventListener);
      window.removeEventListener('webrtc-stream-removed', handleRemovedStream as EventListener);
      window.removeEventListener('webrtc-track-issue', handleTrackIssue as EventListener);
      
      // Clean up any pending 'local-media-ready' event listeners to prevent memory leaks
      pendingEventListeners.forEach(listener => {
        window.removeEventListener('local-media-ready', listener);
      });
      pendingEventListeners.clear();
      
      // Remove socket listeners
      socket.off('user-joined', handleUserJoined);
      socket.off('user-left', handleUserLeft);
      socket.off('user-media-ready', handleUserMediaReady);
      socket.off('room-users-response', handleRoomUsersResponse);
      
      // Clean up connections
      cleanupConnections();
    };
  }, [socket, roomId, userName, isVideoEnabled, isAudioEnabled, createVideoElement]);
  
  // Track if we've already announced our media readiness to prevent loops
  const [hasAnnouncedReady, setHasAnnouncedReady] = useState(false);

  // Effect to connect with existing users when our media is ready
  useEffect(() => {
    if (isLocalMediaReady && localStream && !hasAnnouncedReady) {
      console.log('Local media ready, broadcasting to room and requesting existing users (ONCE)');
      
      // Mark that we've announced
      setHasAnnouncedReady(true);
      
      // Small delay to ensure everything is set up
      const timeout = setTimeout(() => {
        socket.emit('user-media-ready', { roomId });
        socket.emit('get-room-users', { roomId });
      }, 500);
      
      return () => clearTimeout(timeout);
    }
  }, [isLocalMediaReady, localStream, hasAnnouncedReady, socket, roomId]);
  
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
      return 'grid-cols-2'; // Always show 2 columns to leave space for others
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
    console.log('Retrying connections in room');
    
    // Clean up old connections
    cleanupConnections();
    
    // Wait a moment then re-initialize
    setTimeout(() => {
      if (localStream) {
        console.log('Re-initializing WebRTC after cleanup');
        initializeWebRTC(socket, roomId, userName, localStream);
        
        // Request room users again to establish connections
        socket.emit('get-room-users', { roomId });
        
        // Also broadcast that our media is ready
        socket.emit('user-media-ready', { roomId });
      }
    }, 1000);
  }, [localStream, socket, roomId, userName]);
  
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
                        initializeWebRTC(socket, roomId, userName, stream);
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
      <div className={`flex-1 grid ${getGridClass()} gap-4 p-4 overflow-auto auto-rows-min`}>
        {/* Local stream */}
        {localStream && (
          <div className="max-w-md max-h-96 mx-auto">
            <VideoStream
              stream={localStream}
              userName={userName}
              muted={true}
              isLocal={true}
            />
          </div>
        )}
        
        {/* Remote streams */}
        {remoteStreams.map((remote) => (
          <div key={remote.userId} className="max-w-md max-h-96 mx-auto">
            <VideoStream
              stream={remote.stream}
              userName={remote.userName}
              muted={false}
              isLocal={false}
            />
          </div>
        ))}
        
        {/* Show placeholder if no streams */}
        {!localStream && remoteStreams.length === 0 && (
          <div className="flex items-center justify-center bg-gray-900 rounded-lg aspect-video max-w-md max-h-96 mx-auto">
            <div className="text-center text-gray-400">
              <div className="animate-pulse text-4xl mb-2">🎥</div>
              <p>Starting video...</p>
            </div>
          </div>
        )}
        
        {/* Placeholder boxes for future participants when there's only one participant */}
        {localStream && remoteStreams.length === 0 && (
          <div className="max-w-md max-h-96 mx-auto">
            <div className="flex items-center justify-center bg-gray-800 border-2 border-dashed border-gray-600 rounded-lg aspect-video">
              <div className="text-center text-gray-500">
                <div className="text-3xl mb-2">👥</div>
                <p className="text-sm">Waiting for participants...</p>
              </div>
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