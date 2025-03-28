import React, { useRef, useEffect, useState, useCallback } from 'react';

interface VideoStreamProps {
  stream: MediaStream | null;
  userName: string;
  muted?: boolean;
  isLocal?: boolean;
}

const VideoStream = ({ stream, userName, muted = false, isLocal = false }: VideoStreamProps) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isMuted, setIsMuted] = useState(muted);
  const [hasAudio, setHasAudio] = useState(true);
  const [hasVideo, setHasVideo] = useState(true);
  const [isVideoLoaded, setIsVideoLoaded] = useState(false);
  const [useCanvas, setUseCanvas] = useState(false);
  const [videoError, setVideoError] = useState<string | null>(null);
  const animationRef = useRef<number | null>(null);
  const [refsReady, setRefsReady] = useState(false);

  useEffect(() => {
    setIsMuted(muted);
  }, [muted]);

  // Ensure refs are available
  useEffect(() => {
    // Short timeout to ensure the DOM has rendered
    const timer = setTimeout(() => {
      if (videoRef.current && canvasRef.current) {
        setRefsReady(true);
      } else {
        console.warn(`Refs not ready for ${isLocal ? 'local' : userName} video, will retry`);
      }
    }, 100);
    
    return () => clearTimeout(timer);
  }, [isLocal, userName]);

  // Canvas rendering function
  const renderCanvas = useCallback(() => {
    if (useCanvas && videoRef.current && canvasRef.current && videoRef.current.readyState >= 2) {
      const ctx = canvasRef.current.getContext('2d');
      if (ctx) {
        try {
          ctx.drawImage(videoRef.current, 0, 0, canvasRef.current.width, canvasRef.current.height);
        } catch (e) {
          console.error('Canvas rendering error:', e);
        }
      }
      animationRef.current = requestAnimationFrame(renderCanvas);
    }
  }, [useCanvas]);

  // Start/stop canvas rendering
  useEffect(() => {
    if (useCanvas && refsReady) {
      renderCanvas();
    }
    
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
      }
    };
  }, [useCanvas, renderCanvas, refsReady]);

  // Listen for track changes
  useEffect(() => {
    const handleTracksChanged = () => {
      console.log(`Track change event received for ${isLocal ? 'local' : userName} video`);
      updateVideoStatus();
    };

    const updateVideoStatus = () => {
      if (!stream) {
        setHasAudio(false);
        setHasVideo(false);
        return;
      }
      
      try {
        // Check if we have audio/video tracks
        const audioTracks = stream.getAudioTracks();
        const videoTracks = stream.getVideoTracks();
        
        setHasAudio(audioTracks.length > 0 && audioTracks[0].enabled);
        setHasVideo(videoTracks.length > 0 && videoTracks[0].enabled);
      } catch (err) {
        console.error(`Error checking track status for ${isLocal ? 'local' : userName}:`, err);
      }
    };

    window.addEventListener('webrtc-tracks-changed', handleTracksChanged);
    
    return () => {
      window.removeEventListener('webrtc-tracks-changed', handleTracksChanged);
    };
  }, [stream, isLocal, userName]);

  // Handle stream changes
  useEffect(() => {
    // Only proceed if refs are ready and we have a stream
    if (!refsReady) {
      return;
    }
    
    const videoElement = videoRef.current;
    const canvasElement = canvasRef.current;
    
    if (!videoElement || !canvasElement) {
      console.error(`Video or canvas element for ${isLocal ? 'local' : userName} not available for stream even after refs check`);
      return;
    }
    
    // Set canvas size to match video container
    canvasElement.width = videoElement.clientWidth || 640;
    canvasElement.height = videoElement.clientHeight || 480;
    
    console.log(`Setting up video for ${isLocal ? 'local' : userName}, stream:`, stream ? 'exists' : 'null');
    
    const updateVideoStatus = () => {
      if (!stream) {
        console.log(`No stream for ${isLocal ? 'local' : userName}, disabling audio/video`);
        setHasAudio(false);
        setHasVideo(false);
        setIsVideoLoaded(false);
        return;
      }
      
      try {
        // Check if we have audio/video tracks
        const audioTracks = stream.getAudioTracks();
        const videoTracks = stream.getVideoTracks();
        
        setHasAudio(audioTracks.length > 0 && audioTracks[0].enabled);
        setHasVideo(videoTracks.length > 0 && videoTracks[0].enabled);
        
        // Log track information for debugging
        console.log(`Stream ${isLocal ? '(local)' : userName} tracks:`, {
          audioTracks: audioTracks.length,
          videoTracks: videoTracks.length,
          audio: audioTracks.map(t => ({ 
            enabled: t.enabled, 
            muted: t.muted, 
            id: t.id,
            label: t.label 
          })),
          video: videoTracks.map(t => ({ 
            enabled: t.enabled, 
            muted: t.muted, 
            id: t.id,
            label: t.label
          }))
        });
      } catch (err) {
        console.error(`Error checking track status for ${isLocal ? 'local' : userName}:`, err);
      }
    };
    
    // Set up video stream
    if (stream) {
      console.log(`Attaching stream to video element for ${isLocal ? 'local' : userName}`);
      
      try {
        // Force cleanup of any previous streams
        if (videoElement.srcObject) {
          console.log(`Clearing previous srcObject for ${isLocal ? 'local' : userName}`);
          videoElement.srcObject = null;
        }
        
        // Set srcObject and add error handling
        videoElement.srcObject = stream;
        setVideoError(null);
        
        // Setup error handler
        videoElement.onerror = (e) => {
          console.error(`Error with video element for ${isLocal ? 'local' : userName}:`, e);
          setVideoError(`Video error: ${e}`);
          
          // Try canvas as fallback
          if (!useCanvas) {
            console.log('Switching to canvas rendering as fallback');
            setUseCanvas(true);
          }
        };
        
        updateVideoStatus();
        
        // Listen for track events
        stream.addEventListener('addtrack', () => {
          console.log(`Track added to ${isLocal ? 'local' : userName} stream`);
          updateVideoStatus();
        });
        
        stream.addEventListener('removetrack', () => {
          console.log(`Track removed from ${isLocal ? 'local' : userName} stream`);
          updateVideoStatus();
        });
        
        // Handle video loaded
        videoElement.onloadedmetadata = () => {
          console.log(`Video metadata loaded for ${isLocal ? 'local' : userName}`);
          setIsVideoLoaded(true);
          
          // Explicitly play the video element
          videoElement.play()
            .then(() => {
              console.log(`Video playback started for ${isLocal ? 'local' : userName}`);
              
              // Additional check to ensure video is actually playing
              setTimeout(() => {
                if (videoElement.paused) {
                  console.warn(`Video is paused for ${isLocal ? 'local' : userName} despite play() success`);
                  videoElement.play().catch(e => 
                    console.error(`Error playing video on 2nd attempt:`, e));
                }
              }, 200);
            })
            .catch(e => {
              console.error(`Error playing video for ${isLocal ? 'local' : userName}:`, e);
              
              // Try again with user interaction
              setVideoError("Video failed to play automatically. Click the video area to enable.");
              
              // Set video to be muted which helps with autoplay
              if (!isLocal) { // Don't mute local video if it's already muted
                videoElement.muted = true;
                console.log(`Video has been muted to try again for ${isLocal ? 'local' : userName}`);
                
                videoElement.play().catch(e2 => {
                  console.error(`Even muted, video failed to play:`, e2);
                  
                  // Try canvas as fallback
                  if (!useCanvas) {
                    console.log('Switching to canvas rendering as fallback');
                    setUseCanvas(true);
                  }
                });
              }
            });
        };
        
        // Sometimes onloadedmetadata doesn't fire, add a safety timeout
        const metadataTimeout = setTimeout(() => {
          if (!isVideoLoaded) {
            console.warn(`Metadata timeout for ${isLocal ? 'local' : userName}, forcing play attempt`);
            
            // Force a play attempt even without metadata loaded
            videoElement.play().catch(e => {
              console.error(`Forced play attempt failed:`, e);
              
              // Try canvas as fallback
              if (!useCanvas) {
                console.log('Switching to canvas rendering as fallback after timeout');
                setUseCanvas(true);
              }
            });
              
            setIsVideoLoaded(true);
          }
        }, 2000);
        
        return () => {
          clearTimeout(metadataTimeout);
        };
        
      } catch (e) {
        console.error(`Error setting video source for ${isLocal ? 'local' : userName}:`, e);
        setVideoError(`Failed to display video: ${e}`);
        
        // Try canvas as fallback
        if (!useCanvas) {
          console.log('Switching to canvas rendering as fallback after error');
          setUseCanvas(true);
        }
      }
    } else {
      console.log(`No stream available for ${isLocal ? 'local' : userName}`);
      try {
        videoElement.srcObject = null;
        setIsVideoLoaded(false);
        setUseCanvas(false);
      } catch (e) {
        console.error('Error clearing video source:', e);
      }
      updateVideoStatus();
    }
    
    return () => {
      if (stream) {
        stream.removeEventListener('addtrack', updateVideoStatus);
        stream.removeEventListener('removetrack', updateVideoStatus);
      }
      
      if (videoElement) {
        videoElement.onloadedmetadata = null;
        videoElement.onerror = null;
        
        try {
          // Clean up video element on unmount
          videoElement.pause();
          videoElement.srcObject = null;
        } catch (e) {
          console.error(`Error cleaning up video for ${isLocal ? 'local' : userName}:`, e);
        }
      }
      
      // Clean up animation frame
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
      }
    };
  }, [stream, userName, isLocal, isVideoLoaded, useCanvas, refsReady]);

  // Handle clicks on the video container to try playing if autoplay failed
  const handleVideoContainerClick = () => {
    if (videoError && videoRef.current) {
      console.log(`User clicked video container for ${isLocal ? 'local' : userName}, trying to play`);
      videoRef.current.play()
        .then(() => {
          console.log(`Video playback started after click for ${isLocal ? 'local' : userName}`);
          setVideoError(null);
        })
        .catch(e => {
          console.error(`Even after click, video failed to play:`, e);
          
          // Try canvas as fallback
          if (!useCanvas) {
            console.log('Switching to canvas rendering as fallback after click attempt');
            setUseCanvas(true);
          }
        });
    }
  };

  return (
    <div 
      className="relative overflow-hidden rounded-lg bg-gray-800 aspect-video"
      onClick={handleVideoContainerClick}
      data-ready={refsReady ? "true" : "false"}
    >
      {/* Placeholder when video is not active */}
      {(!hasVideo || !isVideoLoaded || !stream) && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-900">
          <div className="h-20 w-20 rounded-full bg-purple-600 flex items-center justify-center text-white text-2xl font-bold">
            {userName.charAt(0).toUpperCase()}
          </div>
        </div>
      )}
      
      {/* Video error message */}
      {videoError && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/70 z-10">
          <div className="text-white text-center p-4">
            <p>{videoError}</p>
            <p className="text-sm mt-2">Click to try again</p>
          </div>
        </div>
      )}
      
      {/* Canvas fallback */}
      <canvas
        ref={canvasRef}
        className={`w-full h-full object-cover absolute inset-0 ${!hasVideo || !stream || !useCanvas ? 'invisible' : 'visible'}`}
      />
      
      {/* Actual video element */}
      <video
        ref={videoRef}
        className={`w-full h-full object-cover ${!hasVideo || !stream ? 'invisible' : 'visible'} ${useCanvas ? 'hidden' : ''}`}
        autoPlay
        playsInline
        muted={isMuted || isLocal} // Always mute local video to prevent feedback
      />
      
      {/* Status bar */}
      <div className="absolute bottom-2 left-2 right-2 flex justify-between items-center bg-black/50 px-3 py-1 rounded text-white text-sm">
        <span className="truncate">{isLocal ? 'You' : userName}</span>
        <div className="flex gap-2">
          {!hasAudio && (
            <svg className="w-4 h-4 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3L19 21" />
            </svg>
          )}
        </div>
      </div>
    </div>
  );
};

export default VideoStream; 