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

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
      
      // Check if we have audio/video tracks
      setHasAudio(stream.getAudioTracks().length > 0);
      setHasVideo(stream.getVideoTracks().length > 0);
      
      // Check if any tracks are disabled
      const audioTrack = stream.getAudioTracks()[0];
      const videoTrack = stream.getVideoTracks()[0];
      
      if (audioTrack) {
        setHasAudio(audioTrack.enabled);
      }
      
      if (videoTrack) {
        setHasVideo(videoTrack.enabled);
      }
    }
  }, [stream]);

  return (
    <div className="relative overflow-hidden rounded-lg bg-gray-800 aspect-video">
      {!hasVideo && (
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