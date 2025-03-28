import { Socket } from 'socket.io-client';

interface PeerConnection {
  connection: RTCPeerConnection;
  stream?: MediaStream;
  userName: string;
}

interface VideoContext {
  socket: Socket | null;
  localStream: MediaStream | null;
  peerConnections: Map<string, PeerConnection>;
  localStreamElement: HTMLVideoElement | null;
  roomId: string | null;
  userName: string | null;
}

// Configuration for WebRTC connections
const rtcConfig: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
  ],
};

// Global WebRTC context
const videoContext: VideoContext = {
  socket: null,
  localStream: null,
  peerConnections: new Map(),
  localStreamElement: null,
  roomId: null,
  userName: null,
};

// Initialize local media stream
export const initLocalStream = async (videoElement: HTMLVideoElement): Promise<MediaStream> => {
  try {
    console.log('Attempting to access media devices...');
    
    // Validate video element
    if (!videoElement) {
      console.error('Video element is null or undefined');
      throw new Error('Video element not available. Please refresh the page and try again.');
    }
    
    console.log('Video element properties:', {
      nodeName: videoElement.nodeName,
      id: videoElement.id,
      muted: videoElement.muted,
      autoplay: videoElement.autoplay,
      playsInline: videoElement.playsInline
    });
    
    // Check if mediaDevices API is available
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      console.error('MediaDevices API not supported in this browser');
      throw new Error('Your browser does not support video calls. Please try a different browser.');
    }

    // Try with more specific constraints
    const constraints = {
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      },
      video: {
        width: { ideal: 1280 },
        height: { ideal: 720 },
        facingMode: 'user'
      }
    };
    
    console.log('Requesting media with constraints:', constraints);
    
    // Request permissions separately first
    try {
      console.log('Checking browser permissions...');
      
      // First request just audio
      const audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      console.log('Audio permission granted');
      
      // Stop audio tracks immediately
      audioStream.getTracks().forEach(track => track.stop());
      
      // Then request just video
      const videoStream = await navigator.mediaDevices.getUserMedia({ video: true });
      console.log('Video permission granted');
      
      // Stop video tracks immediately
      videoStream.getTracks().forEach(track => track.stop());
    } catch (permErr) {
      console.error('Permission error:', permErr);
      if (permErr instanceof DOMException) {
        if (permErr.name === 'NotAllowedError' || permErr.name === 'PermissionDeniedError') {
          throw new Error('Camera and microphone access denied. Please allow access in your browser settings.');
        }
      }
      
      // Rethrow other permission errors
      throw permErr;
    }
    
    // Now request the full stream with our constraints
    console.log('Requesting full stream...');
    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    console.log('Media access granted:', stream.getTracks().map(t => `${t.kind}:${t.label}`));
    
    // Ensure stream has tracks
    if (stream.getTracks().length === 0) {
      throw new Error('No media tracks available. Please check your camera and microphone.');
    }
    
    // Store in context
    videoContext.localStream = stream;
    videoContext.localStreamElement = videoElement;
    
    // Display local stream
    try {
      console.log('Attaching stream to video element');
      videoElement.srcObject = stream;
      
      // Set up video loaded event
      videoElement.onloadedmetadata = () => {
        console.log('Video element metadata loaded, attempting to play');
        videoElement.play()
          .then(() => console.log('Local video started playing'))
          .catch(e => {
            console.error('Error playing video:', e);
            // Try playing again with user interaction or muted
            videoElement.muted = true;
            
            // We could handle autoplay policy restrictions here
            console.log('Video playing failed, video has been muted to try again');
          });
      };
      
      // Set up error handler
      videoElement.onerror = (event) => {
        console.error('Video element error:', event);
      };
    } catch (streamErr) {
      console.error('Error attaching stream to video element:', streamErr);
      throw new Error('Failed to display local video. Please refresh and try again.');
    }
    
    return stream;
  } catch (error) {
    console.error('Error accessing media devices:', error);
    
    // Provide a more specific error message if possible
    if (error instanceof DOMException) {
      if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
        throw new Error('Camera and microphone access denied. Please allow access in your browser settings.');
      } else if (error.name === 'NotFoundError' || error.name === 'DevicesNotFoundError') {
        throw new Error('No camera or microphone found. Please connect a device and try again.');
      } else if (error.name === 'NotReadableError' || error.name === 'TrackStartError') {
        throw new Error('Your camera or microphone is already in use by another application.');
      } else if (error.name === 'OverconstrainedError') {
        throw new Error('Could not find a suitable camera. Try using a different device.');
      } else if (error.name === 'TypeError' && error.message.includes('videoElement is null')) {
        throw new Error('Video initialization failed. Please refresh the page and try again.');
      }
    }
    
    if (error instanceof Error) {
      throw error; // Just rethrow specific errors we've already created
    }
    
    throw new Error('Could not access camera or microphone. Please check your permissions and try again.');
  }
};

// Initialize WebRTC for a specific room
export const initializeWebRTC = (socket: Socket, roomId: string, userName: string) => {
  videoContext.socket = socket;
  videoContext.roomId = roomId;
  videoContext.userName = userName;
  
  // Clear any existing connections
  cleanupConnections();

  // Set up socket event listeners for WebRTC signaling
  setupSignalingEvents();
};

// Setup all necessary socket event listeners
const setupSignalingEvents = () => {
  const { socket } = videoContext;
  if (!socket) return;

  // When another user joins the room
  socket.on('user-joined', ({ user }) => {
    if (user.id !== socket.id) {
      // Create a new peer connection for the user who joined
      createPeerConnection(user.id, user.name);
      
      // Initiate the call if we have a local stream
      if (videoContext.localStream) {
        createOffer(user.id);
      }
    }
  });

  // Handle WebRTC offers
  socket.on('webrtc-offer', async ({ senderId, senderName, offer }) => {
    console.log('Received WebRTC offer from:', senderName);
    
    // Create a peer connection if it doesn't exist
    if (!videoContext.peerConnections.has(senderId)) {
      createPeerConnection(senderId, senderName);
    }
    
    const peerConnection = videoContext.peerConnections.get(senderId);
    if (peerConnection) {
      try {
        await peerConnection.connection.setRemoteDescription(new RTCSessionDescription(offer));
        const answer = await peerConnection.connection.createAnswer();
        await peerConnection.connection.setLocalDescription(answer);
        
        // Send the answer back
        socket.emit('webrtc-answer', {
          answer,
          receiverId: senderId,
          senderName: videoContext.userName,
          roomId: videoContext.roomId,
        });
      } catch (error) {
        console.error('Error handling offer:', error);
      }
    }
  });

  // Handle WebRTC answers
  socket.on('webrtc-answer', async ({ senderId, answer }) => {
    console.log('Received WebRTC answer from:', senderId);
    
    const peerConnection = videoContext.peerConnections.get(senderId);
    if (peerConnection && peerConnection.connection.signalingState !== 'closed') {
      try {
        await peerConnection.connection.setRemoteDescription(new RTCSessionDescription(answer));
      } catch (error) {
        console.error('Error handling answer:', error);
      }
    }
  });

  // Handle ICE candidates
  socket.on('webrtc-ice-candidate', ({ senderId, candidate }) => {
    const peerConnection = videoContext.peerConnections.get(senderId);
    if (peerConnection && peerConnection.connection.signalingState !== 'closed') {
      try {
        peerConnection.connection.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (error) {
        console.error('Error handling ICE candidate:', error);
      }
    }
  });

  // Handle when a user leaves
  socket.on('user-left', ({ userId }) => {
    removePeerConnection(userId);
  });
};

// Create a new RTCPeerConnection for a specific user
const createPeerConnection = (userId: string, userName: string) => {
  try {
    const peerConnection = new RTCPeerConnection(rtcConfig);
    
    // Add local tracks to the connection
    if (videoContext.localStream) {
      videoContext.localStream.getTracks().forEach(track => {
        peerConnection.addTrack(track, videoContext.localStream!);
      });
    }
    
    // Handle ICE candidates
    peerConnection.onicecandidate = (event) => {
      if (event.candidate && videoContext.socket) {
        videoContext.socket.emit('webrtc-ice-candidate', {
          candidate: event.candidate,
          receiverId: userId,
          roomId: videoContext.roomId,
        });
      }
    };
    
    // Handle incoming tracks
    peerConnection.ontrack = (event) => {
      const stream = event.streams[0];
      const connection = videoContext.peerConnections.get(userId);
      
      if (connection) {
        connection.stream = stream;
        // Dispatch an event that a new stream is available
        window.dispatchEvent(
          new CustomEvent('webrtc-stream-added', {
            detail: { userId, userName, stream },
          })
        );
      }
    };
    
    // Store the connection
    videoContext.peerConnections.set(userId, { 
      connection: peerConnection,
      userName
    });
    
    return peerConnection;
  } catch (error) {
    console.error('Error creating peer connection:', error);
    throw new Error('Failed to create peer connection');
  }
};

// Create and send an offer to a peer
const createOffer = async (userId: string) => {
  const peerConnection = videoContext.peerConnections.get(userId);
  const { socket, userName, roomId } = videoContext;
  
  if (peerConnection && socket) {
    try {
      const offer = await peerConnection.connection.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: true
      });
      
      await peerConnection.connection.setLocalDescription(offer);
      
      socket.emit('webrtc-offer', {
        offer,
        receiverId: userId,
        senderName: userName,
        roomId,
      });
    } catch (error) {
      console.error('Error creating offer:', error);
    }
  }
};

// Remove a peer connection when a user leaves
const removePeerConnection = (userId: string) => {
  const peerConnection = videoContext.peerConnections.get(userId);
  
  if (peerConnection) {
    // Close the connection
    peerConnection.connection.close();
    
    // Remove from the map
    videoContext.peerConnections.delete(userId);
    
    // Dispatch an event that the stream was removed
    window.dispatchEvent(
      new CustomEvent('webrtc-stream-removed', {
        detail: { userId },
      })
    );
  }
};

// Clean up all peer connections
export const cleanupConnections = () => {
  // Close all peer connections
  videoContext.peerConnections.forEach((peer) => {
    peer.connection.close();
  });
  
  // Clear the map
  videoContext.peerConnections.clear();
  
  // Stop all local tracks
  if (videoContext.localStream) {
    videoContext.localStream.getTracks().forEach(track => {
      track.stop();
    });
    videoContext.localStream = null;
  }
  
  // Clear local video element
  if (videoContext.localStreamElement) {
    videoContext.localStreamElement.srcObject = null;
    videoContext.localStreamElement = null;
  }
};

// Toggle local audio
export const toggleAudio = () => {
  if (videoContext.localStream) {
    const audioTrack = videoContext.localStream.getAudioTracks()[0];
    if (audioTrack) {
      audioTrack.enabled = !audioTrack.enabled;
      return audioTrack.enabled;
    }
  }
  return false;
};

// Toggle local video
export const toggleVideo = () => {
  if (videoContext.localStream) {
    const videoTrack = videoContext.localStream.getVideoTracks()[0];
    if (videoTrack) {
      videoTrack.enabled = !videoTrack.enabled;
      return videoTrack.enabled;
    }
  }
  return false;
};
