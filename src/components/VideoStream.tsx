import React, { useRef, useEffect, useState } from 'react';

interface VideoStreamProps {
  stream: MediaStream | null;
  userName: string;
  muted?: boolean;
  isLocal?: boolean;
}

const VideoStream = ({ stream, userName, muted = false, isLocal = false }: VideoStreamProps) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isMuted, setIsMuted] = useState(muted);
  const [hasAudio, setHasAudio] = useState(true);
  const [hasVideo, setHasVideo] = useState(true);
  const [isVideoLoaded, setIsVideoLoaded] = useState(false);

  useEffect(() => {
    setIsMuted(muted);
  }, [muted]);

  // Ensure we have a video element and handle mounting/unmounting properly
  useEffect(() => {
    let videoElement = videoRef.current;
    
    if (!videoElement) {
      console.log(`Video element for ${isLocal ? 'local' : userName} not found in ref`);
      // This shouldn't be necessary as the video element is in the JSX
      // but just in case React hasn't rendered it yet
      return;
    }
    
    console.log(`Video element for ${isLocal ? 'local' : userName} found, attaching stream`);
    
    return () => {
      // Clean up function
      if (videoElement) {
        videoElement.onloadedmetadata = null;
        videoElement.onerror = null;
        videoElement.srcObject = null;
      }
    };
  }, [isLocal, userName]);

  // Handle stream changes
  useEffect(() => {
    const videoElement = videoRef.current;
    
    if (!videoElement) {
      console.log(`Video element for ${isLocal ? 'local' : userName} not available for stream`);
      return;
    }
    
    const updateVideoStatus = () => {
      if (!stream) {
        setHasAudio(false);
        setHasVideo(false);
        setIsVideoLoaded(false);
        return;
      }
      
      // Check if we have audio/video tracks
      const audioTracks = stream.getAudioTracks();
      const videoTracks = stream.getVideoTracks();
      
      setHasAudio(audioTracks.length > 0 && audioTracks[0].enabled);
      setHasVideo(videoTracks.length > 0 && videoTracks[0].enabled);
      
      // Log track information for debugging
      console.log(`Stream ${isLocal ? '(local)' : userName} tracks:`, {
        audio: audioTracks.map(t => ({ enabled: t.enabled, muted: t.muted, id: t.id })),
        video: videoTracks.map(t => ({ enabled: t.enabled, muted: t.muted, id: t.id }))
      });
    };
    
    // Set up video stream
    if (stream) {
      console.log(`Setting stream for ${isLocal ? 'local' : userName} video element`);
      
      try {
        // Set srcObject and add error handling
        videoElement.srcObject = stream;
        videoElement.onerror = (e) => {
          console.error(`Error with video element for ${isLocal ? 'local' : userName}:`, e);
        };
        
        updateVideoStatus();
        
        // Listen for track events
        stream.addEventListener('addtrack', updateVideoStatus);
        stream.addEventListener('removetrack', updateVideoStatus);
        
        // Handle video loaded
        videoElement.onloadedmetadata = () => {
          console.log(`Video element for ${isLocal ? 'local' : userName} loaded metadata`);
          setIsVideoLoaded(true);
          
          videoElement.play()
            .then(() => console.log(`Video for ${isLocal ? 'local' : userName} started playing`))
            .catch(e => console.error(`Error playing video for ${isLocal ? 'local' : userName}:`, e));
        };
      } catch (e) {
        console.error(`Error setting video source for ${isLocal ? 'local' : userName}:`, e);
      }
    } else {
      console.log(`No stream available for ${isLocal ? 'local' : userName}`);
      try {
        videoElement.srcObject = null;
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
      }
    };
  }, [stream, userName, isLocal]);

  return (
    <div className="relative overflow-hidden rounded-lg bg-gray-800 aspect-video">
      {(!hasVideo || !isVideoLoaded) && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-900">
          <div className="h-20 w-20 rounded-full bg-purple-600 flex items-center justify-center text-white text-2xl font-bold">
            {userName.charAt(0).toUpperCase()}
          </div>
        </div>
      )}
      
      <video
        ref={videoRef}
        className={`w-full h-full object-cover ${!hasVideo ? 'hidden' : ''}`}
        autoPlay
        playsInline
        muted={isMuted}
      />
      
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