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

  useEffect(() => {
    setIsMuted(muted);
  }, [muted]);

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
    if (useCanvas) {
      renderCanvas();
    }

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
      }
    };
  }, [useCanvas, renderCanvas]);

  // Main effect: attach stream to video element, manage playback, listen for
  // track events, and run a periodic watchdog that retries play() and
  // refreshes track status.  Deps intentionally exclude isVideoLoaded and
  // useCanvas so the effect only re-runs when the stream itself changes.
  useEffect(() => {
    const videoElement = videoRef.current;
    const canvasElement = canvasRef.current;

    if (!videoElement || !canvasElement) return;

    canvasElement.width = videoElement.clientWidth || 640;
    canvasElement.height = videoElement.clientHeight || 480;

    // ---- no stream ------------------------------------------------
    if (!stream) {
      if (videoElement.srcObject) {
        videoElement.srcObject = null;
      }
      setIsVideoLoaded(false);
      setHasAudio(false);
      setHasVideo(false);
      setUseCanvas(false);
      return;
    }

    // ---- helpers ---------------------------------------------------
    const label = isLocal ? 'local' : userName;

    const updateTrackStatus = () => {
      if (!stream) return;
      try {
        const audioTracks = stream.getAudioTracks();
        const videoTracks = stream.getVideoTracks();
        // Consider both enabled AND muted — a muted track produces black frames
        setHasAudio(audioTracks.length > 0 && audioTracks[0].enabled && !audioTracks[0].muted);
        setHasVideo(videoTracks.length > 0 && videoTracks[0].enabled && !videoTracks[0].muted);
      } catch (err) {
        console.error(`Error checking track status for ${label}:`, err);
      }
    };

    const tryPlay = () => {
      if (!videoElement.srcObject) return;
      if (!videoElement.paused) {
        setIsVideoLoaded(true);
        return;
      }
      videoElement.play()
        .then(() => {
          console.log(`Video playback started for ${label}`);
          setIsVideoLoaded(true);
          setVideoError(null);
        })
        .catch(e => {
          console.error(`Play failed for ${label}:`, e);
          // For remote (non-muted) video, retry muted to satisfy autoplay policy
          if (!isLocal && !videoElement.muted) {
            videoElement.muted = true;
            videoElement.play()
              .then(() => { setIsVideoLoaded(true); setVideoError(null); })
              .catch(() => {
                setVideoError('Video failed to play automatically. Click the video area to enable.');
              });
          } else {
            setVideoError('Video failed to play automatically. Click the video area to enable.');
          }
        });
    };

    // ---- attach stream --------------------------------------------
    const currentSrc = videoElement.srcObject;
    const srcNeedsUpdate = !currentSrc ||
      (currentSrc instanceof MediaStream && currentSrc.id !== stream.id);

    if (srcNeedsUpdate) {
      console.log(`Setting srcObject for ${label}`);
      videoElement.srcObject = stream;
      setVideoError(null);
      setIsVideoLoaded(false);
    }

    // Error handler
    videoElement.onerror = () => {
      console.error(`Video element error for ${label}`);
      setVideoError('Video error');
      setUseCanvas(true);
    };

    updateTrackStatus();

    // ---- metadata / play ------------------------------------------
    videoElement.onloadedmetadata = () => {
      console.log(`Metadata loaded for ${label}`);
      setIsVideoLoaded(true);
      tryPlay();
    };

    // Immediate play attempt (stream may already have metadata)
    tryPlay();

    // ---- stream track events --------------------------------------
    stream.addEventListener('addtrack', updateTrackStatus);
    stream.addEventListener('removetrack', updateTrackStatus);

    // Track-level mute/unmute listeners
    const videoTrack = stream.getVideoTracks()[0] ?? null;
    const audioTrack = stream.getAudioTracks()[0] ?? null;

    const handleTrackMute = () => updateTrackStatus();
    const handleTrackUnmute = () => { updateTrackStatus(); tryPlay(); };

    videoTrack?.addEventListener('mute', handleTrackMute);
    videoTrack?.addEventListener('unmute', handleTrackUnmute);
    audioTrack?.addEventListener('mute', handleTrackMute);
    audioTrack?.addEventListener('unmute', handleTrackUnmute);

    // Global track-change events from webrtc.ts heartbeat
    const handleGlobalTrackChange = () => updateTrackStatus();
    window.addEventListener('webrtc-tracks-changed', handleGlobalTrackChange);

    // ---- watchdog: periodic play-retry & status refresh -----------
    const watchdog = window.setInterval(() => {
      updateTrackStatus();
      if (videoElement.paused && videoElement.srcObject) {
        console.log(`Watchdog: video paused for ${label}, retrying play`);
        tryPlay();
      }
    }, 3000);

    // ---- unified cleanup ------------------------------------------
    return () => {
      window.clearInterval(watchdog);

      stream.removeEventListener('addtrack', updateTrackStatus);
      stream.removeEventListener('removetrack', updateTrackStatus);

      videoTrack?.removeEventListener('mute', handleTrackMute);
      videoTrack?.removeEventListener('unmute', handleTrackUnmute);
      audioTrack?.removeEventListener('mute', handleTrackMute);
      audioTrack?.removeEventListener('unmute', handleTrackUnmute);

      window.removeEventListener('webrtc-tracks-changed', handleGlobalTrackChange);

      videoElement.onloadedmetadata = null;
      videoElement.onerror = null;

      if (!isLocal) {
        videoElement.srcObject = null;
      }

      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
      }
    };
  }, [stream, userName, isLocal]);

  // Handle clicks on the video container to try playing if autoplay failed
  const handleVideoContainerClick = () => {
    const videoElement = videoRef.current;
    if (!videoElement || !stream) return;

    if (videoError || videoElement.paused) {
      console.log(`User clicked video for ${isLocal ? 'local' : userName}, trying to play`);
      videoElement.play()
        .then(() => {
          setIsVideoLoaded(true);
          setVideoError(null);
        })
        .catch(e => {
          console.error(`Play after click failed:`, e);
          setUseCanvas(true);
        });
    }
  };

  return (
    <div
      className="relative overflow-hidden rounded-lg bg-gray-800 aspect-video"
      onClick={handleVideoContainerClick}
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
        muted={isMuted || isLocal}
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
