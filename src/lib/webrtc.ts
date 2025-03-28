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
  videoDisabled: boolean;
  audioDisabled: boolean;
  localVideoElement: HTMLVideoElement | null;
  remoteStreamElements: Record<string, HTMLVideoElement | null>;
  peers: Record<string, PeerConnection>;
  currentRoom: string | null;
  activeStreams: Set<MediaStream>;
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
  videoDisabled: false,
  audioDisabled: false,
  localVideoElement: null,
  remoteStreamElements: {},
  peers: {},
  currentRoom: null,
  activeStreams: new Set<MediaStream>(),
};

// A flag to track if permissions have been requested and approved
let permissionsGranted = false;

// Keep a global reference to avoid garbage collection
const activeStreams = new Set<MediaStream>();

// Add these functions for debugging and improved stream handling

// Log stream information
const logStreamInfo = (stream: MediaStream, context: string) => {
  console.log(`[${context}] Stream info:`, {
    id: stream.id,
    active: stream.active,
    audioTracks: stream.getAudioTracks().length, 
    videoTracks: stream.getVideoTracks().length
  });
  
  // Log audio tracks
  stream.getAudioTracks().forEach((track, index) => {
    console.log(`[${context}] Audio track ${index}:`, {
      id: track.id,
      enabled: track.enabled,
      muted: track.muted,
      readyState: track.readyState,
      label: track.label
    });
  });
  
  // Log video tracks
  stream.getVideoTracks().forEach((track, index) => {
    console.log(`[${context}] Video track ${index}:`, {
      id: track.id,
      enabled: track.enabled,
      muted: track.muted,
      readyState: track.readyState,
      label: track.label
    });
  });
};

// Function to ensure tracks are enabled
const ensureTracksEnabled = (stream: MediaStream) => {
  let modified = false;
  
  stream.getVideoTracks().forEach(track => {
    if (!track.enabled) {
      console.log('Enabling disabled video track:', track.id);
      track.enabled = true;
      modified = true;
    }
  });
  
  stream.getAudioTracks().forEach(track => {
    if (!track.enabled) {
      console.log('Enabling disabled audio track:', track.id);
      track.enabled = true;
      modified = true;
    }
  });
  
  return modified;
};

// Add this function to perform permission checks
const checkMediaPermissions = async (): Promise<boolean> => {
  try {
    console.log('Checking media permissions...');
    const temporaryStream = await navigator.mediaDevices.getUserMedia({ 
      audio: true, 
      video: true 
    });
    
    // The fact we got here means permissions are granted
    permissionsGranted = true;
    
    // Log that we have permissions
    console.log('Media permissions granted');
    
    // Stop the temporary stream (we'll create a proper one later)
    temporaryStream.getTracks().forEach(track => track.stop());
    
    return true;
  } catch (err) {
    console.error('Media permission error:', err);
    permissionsGranted = false;
    return false;
  }
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
    
    // Check if mediaDevices API is available
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      console.error('MediaDevices API not supported in this browser');
      throw new Error('Your browser does not support video calls. Please try a different browser.');
    }

    // First, check permissions if not already granted
    if (!permissionsGranted) {
      const hasPermissions = await checkMediaPermissions();
      if (!hasPermissions) {
        throw new Error('Camera and microphone access denied. Please allow access in your browser settings.');
      }
    }

    // Define constraints for the camera and microphone
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
    
    console.log('Initializing local media stream with constraints:', constraints);
    
    // Stop any previous streams to avoid conflicts
    if (videoContext.localStream) {
      console.log('Stopping previous stream before creating a new one');
      videoContext.localStream.getTracks().forEach(track => {
        console.log(`Stopping track: ${track.kind}`, track);
        track.stop();
      });
      activeStreams.delete(videoContext.localStream);
    }
    
    // Request the full stream with our constraints
    console.log('Requesting full stream...');
    let stream: MediaStream;
    
    try {
      stream = await navigator.mediaDevices.getUserMedia(constraints);
      
      // Apply these settings right away to avoid auto-disabling
      stream.getTracks().forEach(track => {
        // Set priority to high to signal importance
        if ('priority' in track) {
          // Use type assertion for the specific property that's not in the standard type definition
          track.contentHint = track.kind === 'video' ? 'motion' : 'speech';
        }
        
        // Add extra track listeners
        track.addEventListener('mute', () => {
          console.warn(`Track ${track.kind} was muted, attempting to unmute`);
          setTimeout(() => {
            if (track.muted && track.readyState === 'live') {
              // Try to restart just this track
              console.log(`Attempting to restart ${track.kind} track after mute`);
              navigator.mediaDevices.getUserMedia({
                audio: track.kind === 'audio' ? constraints.audio : false,
                video: track.kind === 'video' ? constraints.video : false,
              }).then(newStream => {
                const newTrack = track.kind === 'audio' ? 
                  newStream.getAudioTracks()[0] : 
                  newStream.getVideoTracks()[0];
                
                if (newTrack) {
                  stream.removeTrack(track);
                  stream.addTrack(newTrack);
                  console.log(`Successfully replaced ${track.kind} track`);
                }
              }).catch(err => {
                console.error(`Failed to restart ${track.kind} track:`, err);
              });
            }
          }, 1000);
        });
      });
    } catch (err) {
      console.error('Error accessing media devices with full constraints:', err);
      
      // Try with minimal constraints if the first attempt fails
      console.log('Retrying with minimal constraints...');
      stream = await navigator.mediaDevices.getUserMedia({ 
        audio: true, 
        video: true 
      });
    }
    
    // Log detailed stream information
    logStreamInfo(stream, 'Initial stream');
    
    // Ensure stream has tracks
    if (stream.getTracks().length === 0) {
      throw new Error('No media tracks available. Please check your camera and microphone.');
    }
    
    // Make sure all tracks are enabled
    ensureTracksEnabled(stream);
    
    // Store in global references to prevent garbage collection
    console.log(`Adding stream to activeStreams - now: ${activeStreams.size + 1} streams`);
    activeStreams.add(stream);
    
    // Store in context
    videoContext.localStream = stream;
    videoContext.localStreamElement = videoElement;
    
    // Add track ended event listeners to detect if tracks are ended unexpectedly
    stream.getTracks().forEach(track => {
      track.onended = () => {
        console.error(`Track ${track.kind} ended unexpectedly`);
        // Try to restart the stream if a track ends unexpectedly
        setTimeout(() => {
          if (videoContext.localStream === stream) {
            console.log('Attempting to restart stream after track ended');
            initLocalStream(videoElement).catch(e => 
              console.error('Failed to restart stream:', e));
          }
        }, 1000);
      };
    });
    
    // Start heartbeat to keep tracks active
    startStreamHeartbeat(stream, 'local-stream');
    
    // Display local stream
    try {
      console.log('Attaching stream to video element');
      
      // Ensure video element is ready for use
      videoElement.muted = true; // Always mute local video to prevent feedback
      videoElement.playsInline = true;
      videoElement.autoplay = true;
      
      // Reset the video element if it had a previous stream
      if (videoElement.srcObject) {
        console.log('Clearing previous stream from video element');
        videoElement.pause();
        videoElement.srcObject = null;
      }
      
      // Attach the stream
      videoElement.srcObject = stream;
      
      // Ensure video playback starts
      try {
        console.log('Attempting to play video element');
        videoElement.play()
          .then(() => {
            console.log('Video playback started successfully');
          })
          .catch(err => {
            console.error('Error starting video playback:', err);
            // Try again with a delay in case of browser quirks
            setTimeout(() => {
              videoElement.play().catch(e => console.error('Retry play failed:', e));
            }, 200);
          });
      } catch (e) {
        console.error('Error calling play on video element:', e);
      }
      
      return stream;
    } catch (e) {
      console.error('Error attaching stream to video element:', e);
      throw e;
    }
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
      }
    }
    
    if (error instanceof Error) {
      throw error; // Just rethrow specific errors we've already created
    }
    
    throw new Error('Could not access camera or microphone. Please check your permissions and try again.');
  }
};

// Initialize WebRTC for a specific room
export const initializeWebRTC = (
  socket: Socket,
  roomId: string,
  userName: string
) => {
  console.log(`Initializing WebRTC for room ${roomId} as ${userName}`);
  
  // Store values in global context
  videoContext.socket = socket;
  videoContext.roomId = roomId;
  videoContext.userName = userName;
  
  // Set up socket event listeners
  
  // Handle when a new user joins
  socket.on('user-joined', ({ userId, userName: remoteUserName }) => {
    console.log(`User joined: ${remoteUserName} (${userId})`);
    
    // Create a peer connection for the new user
    const peerConnection = createPeerConnection(userId, remoteUserName);
    
    // Store the connection
    videoContext.peerConnections.set(userId, { 
      connection: peerConnection,
      userName: remoteUserName,
      stream: undefined
    });
    
    // If we have a local stream, create an offer immediately
    if (videoContext.localStream) {
      createOffer(userId);
    } else {
      console.warn('Local stream not ready yet, delaying offer creation');
    }
  });
  
  // Handle when we receive an offer
  socket.on('webrtc-offer', async ({ offer, senderId, senderName }) => {
    console.log(`Received offer from ${senderName} (${senderId})`);
    
    try {
      // Check if we already have a connection for this user
      let peerConnection = videoContext.peerConnections.get(senderId)?.connection;
      
      // If not, create one
      if (!peerConnection) {
        console.log(`Creating new peer connection for ${senderName} (${senderId}) after receiving offer`);
        peerConnection = createPeerConnection(senderId, senderName);
        
        // Store the connection
        videoContext.peerConnections.set(senderId, { 
          connection: peerConnection,
          userName: senderName,
          stream: undefined
        });
      }
      
      // Check if we're in the correct signaling state to set a remote offer
      if (peerConnection.signalingState !== 'stable') {
        console.warn(`Peer connection for ${senderName} is in ${peerConnection.signalingState} state, not stable`);
        // Try to roll back
        const rollback = { type: 'rollback' } as RTCSessionDescriptionInit;
        await peerConnection.setLocalDescription(rollback);
        await peerConnection.setRemoteDescription(rollback);
      }
      
      // Set the remote description
      await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
      
      // Create an answer
      const answer = await peerConnection.createAnswer();
      await peerConnection.setLocalDescription(answer);
      
      // Send the answer back
      socket.emit('webrtc-answer', {
        answer,
        receiverId: senderId,
        roomId
      });
    } catch (e) {
      console.error(`Error handling offer from ${senderName}:`, e);
    }
  });
  
  // Handle when we receive an answer
  socket.on('webrtc-answer', async ({ answer, senderId, senderName }) => {
    console.log(`Received answer from ${senderName} (${senderId})`);
    
    try {
      const peerConnection = videoContext.peerConnections.get(senderId)?.connection;
      
      if (peerConnection) {
        const currentState = peerConnection.signalingState;
        console.log(`Current signaling state for ${senderName}: ${currentState}`);
        
        if (currentState === 'have-local-offer') {
          await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
        } else {
          console.warn(`Cannot set remote description in ${currentState} state`);
        }
      } else {
        console.warn(`Received answer from ${senderName} but no peer connection found`);
      }
    } catch (e) {
      console.error(`Error handling answer from ${senderName}:`, e);
    }
  });
  
  // Handle when we receive an ICE candidate
  socket.on('webrtc-ice-candidate', async ({ candidate, senderId, senderName }) => {
    try {
      const peerConnection = videoContext.peerConnections.get(senderId)?.connection;
      
      if (peerConnection) {
        // Only add candidates after setting remote description
        if (peerConnection.remoteDescription) {
          console.log(`Adding ICE candidate from ${senderName}`);
          await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
        } else {
          console.log(`Received ICE candidate from ${senderName} but remote description not set yet`);
        }
      } else {
        console.warn(`Received ICE candidate from ${senderName} but no peer connection found`);
      }
    } catch (e) {
      console.error(`Error handling ICE candidate from ${senderName}:`, e);
    }
  });
  
  // Handle when a user leaves
  socket.on('user-left', ({ userId, userName: remoteUserName }) => {
    console.log(`User left: ${remoteUserName} (${userId})`);
    
    // Clean up connection for the user who left
    const connection = videoContext.peerConnections.get(userId);
    
    if (connection) {
      console.log(`Closing peer connection for ${remoteUserName}`);
      
      // Close the RTCPeerConnection
      if (connection.connection) {
        connection.connection.close();
      }
      
      // Remove the connection from our map
      videoContext.peerConnections.delete(userId);
      
      // Dispatch event to remove the stream from UI
      if (connection.stream) {
        activeStreams.delete(connection.stream);
        window.dispatchEvent(
          new CustomEvent('webrtc-stream-removed', {
            detail: { userId },
          })
        );
      }
    }
  });
  
  // Handle connection renegotiation
  socket.on('webrtc-renegotiate', async ({ senderId, senderName }) => {
    console.log(`Received renegotiation request from ${senderName} (${senderId})`);
    
    try {
      const connection = videoContext.peerConnections.get(senderId);
      
      if (connection && connection.connection) {
        const peerConnection = connection.connection;
        
        // Check current state
        if (peerConnection.connectionState === 'connected' || 
            peerConnection.connectionState === 'disconnected') {
          
          console.log(`Renegotiating connection with ${senderName}`);
          
          // Create a new offer to restart the connection
          if (videoContext.localStream) {
            createOffer(senderId);
          } else {
            console.warn('Cannot renegotiate without local stream');
          }
        } else {
          console.warn(`Cannot renegotiate in ${peerConnection.connectionState} state`);
        }
      } else {
        console.warn(`Received renegotiation request from ${senderName} but no connection found`);
      }
    } catch (e) {
      console.error(`Error handling renegotiation request from ${senderName}:`, e);
    }
  });
  
  return {
    // Return the cleanup function
    cleanup: () => {
      console.log('Cleaning up WebRTC connections');
      cleanupConnections();
    }
  };
};

// Create a new RTCPeerConnection for a specific user
const createPeerConnection = (userId: string, userName: string) => {
  try {
    console.log(`Creating peer connection for ${userName} (${userId})`);
    const peerConnection = new RTCPeerConnection(rtcConfig);
    
    // Add local tracks to the connection
    if (videoContext.localStream) {
      const tracks = videoContext.localStream.getTracks();
      console.log(`Adding ${tracks.length} tracks to peer connection for ${userName}`);
      
      // Ensure local stream tracks are enabled before adding them
      ensureTracksEnabled(videoContext.localStream);
      
      tracks.forEach(track => {
        console.log(`Adding ${track.kind} track to peer connection for ${userName}`);
        try {
          if (videoContext.localStream) {
            peerConnection.addTrack(track, videoContext.localStream);
          }
        } catch (e) {
          console.error(`Error adding track to peer connection: ${e}`);
        }
      });
    } else {
      console.warn('No local stream available when creating peer connection');
    }
    
    // Set iceConnectionState change handler for debugging
    peerConnection.oniceconnectionstatechange = () => {
      const state = peerConnection.iceConnectionState;
      console.log(`ICE connection state for ${userName}: ${state}`);
      
      // Handle reconnection for disconnected states
      if (state === 'disconnected' || state === 'failed') {
        console.warn(`ICE connection ${state} for ${userName}, may need to restart`);
        
        // Attempt to restart ICE if we're in a failed state
        if (state === 'failed' && videoContext.socket) {
          console.log(`Attempting to restart ICE for ${userName}`);
          // We should implement ICE restart logic here
        }
      }
    };
    
    // Handle ICE candidates
    peerConnection.onicecandidate = (event) => {
      if (event.candidate && videoContext.socket) {
        console.log(`ICE candidate generated for ${userName}`, 
          event.candidate.candidate ? event.candidate.candidate.substring(0, 50) + '...' : 'empty candidate');
          
        videoContext.socket.emit('webrtc-ice-candidate', {
          candidate: event.candidate,
          receiverId: userId,
          roomId: videoContext.roomId,
        });
      } else if (!event.candidate) {
        console.log(`ICE candidate gathering complete for ${userName}`);
      }
    };
    
    // Handle connection state changes
    peerConnection.onconnectionstatechange = () => {
      const state = peerConnection.connectionState;
      console.log(`Connection state for ${userName}: ${state}`);
      
      // Handle reconnection for failed connections
      if (state === 'failed') {
        console.error(`Connection failed for ${userName}, attempting to reconnect`);
        
        // Close the existing connection
        peerConnection.close();
        
        // Reconnect after a short delay
        setTimeout(() => {
          if (videoContext.peerConnections.has(userId)) {
            console.log(`Reconnecting to ${userName}`);
            createPeerConnection(userId, userName);
            if (videoContext.localStream) {
              createOffer(userId);
            }
          }
        }, 2000);
      } else if (state === 'connected') {
        // When connection is established, ensure remote tracks are functioning
        const connection = videoContext.peerConnections.get(userId);
        if (connection && connection.stream) {
          console.log(`Connection established, ensuring remote tracks from ${userName} are enabled`);
          ensureTracksEnabled(connection.stream);
          
          // Double-check heartbeat
          if (connection.stream) {
            startStreamHeartbeat(connection.stream, `remote-stream-${userName}`);
          }
        }
      }
    };
    
    // Handle signaling state changes
    peerConnection.onsignalingstatechange = () => {
      console.log(`Signaling state for ${userName}: ${peerConnection.signalingState}`);
    };
    
    // Handle negotiation needed events
    peerConnection.onnegotiationneeded = () => {
      console.log(`Negotiation needed for ${userName}`);
      // We should handle renegotiation here
      if (videoContext.socket && videoContext.localStream) {
        createOffer(userId);
      }
    };
    
    // Handle incoming tracks
    peerConnection.ontrack = (event) => {
      console.log(`Remote track received from ${userName}`, {
        kind: event.track.kind,
        streams: event.streams.length
      });
      
      if (event.streams.length === 0) {
        console.warn(`No streams in track event from ${userName}`);
        return;
      }
      
      const stream = event.streams[0];
      
      // Add to active streams to prevent garbage collection
      console.log(`Adding remote stream from ${userName} to activeStreams`);
      activeStreams.add(stream);
      
      // Log stream information
      logStreamInfo(stream, `Remote stream from ${userName}`);
      
      const connection = videoContext.peerConnections.get(userId);
      
      if (connection) {
        connection.stream = stream;
        
        // Ensure remote tracks are enabled immediately
        ensureTracksEnabled(stream);
        
        // Start heartbeat to keep tracks active
        startStreamHeartbeat(stream, `remote-stream-${userName}`);
        
        // Set up specific track listeners to keep track enabled
        event.track.onmute = () => {
          console.log(`Remote track ${event.track.kind} from ${userName} muted`);
          
          // Try to unmute the track
          setTimeout(() => {
            if (event.track.muted) {
              console.log(`Attempting to unmute ${event.track.kind} track from ${userName}`);
              
              // Dispatch event to update UI about possible connection issues
              window.dispatchEvent(new CustomEvent('webrtc-track-issue', {
                detail: { 
                  userId, 
                  userName, 
                  trackKind: event.track.kind,
                  issue: 'muted' 
                }
              }));
            }
          }, 500);
        };
        
        event.track.onunmute = () => {
          console.log(`Remote track ${event.track.kind} from ${userName} unmuted`);
        };
        
        event.track.onended = () => {
          console.log(`Remote track ${event.track.kind} from ${userName} ended`);
          
          // Try to restart the connection if we receive ended events
          if (peerConnection.connectionState === 'connected') {
            console.log(`Attempting to renegotiate after track ended from ${userName}`);
            // Signal that we need to renegotiate this connection
            if (videoContext.socket) {
              videoContext.socket.emit('webrtc-renegotiate', {
                receiverId: userId,
                roomId: videoContext.roomId
              });
            }
          }
        };
        
        // Fix for some browsers that disable tracks on connection
        // Force re-enable shortly after receiving
        setTimeout(() => {
          console.log(`Running delayed track check for ${userName}`);
          if (connection.stream) {
            const enabled = ensureTracksEnabled(connection.stream);
            if (enabled) {
              console.log(`Re-enabled tracks from ${userName} after delay`);
              window.dispatchEvent(new Event('webrtc-tracks-changed'));
            }
          }
        }, 300);
        
        // Dispatch an event that a new stream is available
        window.dispatchEvent(
          new CustomEvent('webrtc-stream-added', {
            detail: { userId, userName, stream },
          })
        );
      } else {
        console.warn(`Received track from ${userName} but connection not found`);
      }
    };
    
    return peerConnection;
  } catch (e) {
    console.error(`Error creating peer connection for ${userName}:`, e);
    throw e;
  }
};

// Create an offer and send it to a peer
const createOffer = async (userId: string) => {
  try {
    console.log(`Creating offer for ${userId}`);
    
    const peerConnection = videoContext.peerConnections.get(userId);
    if (!peerConnection || !peerConnection.connection) {
      console.error(`Cannot create offer: No peer connection found for ${userId}`);
      return;
    }
    
    // Make sure our local stream tracks are enabled before creating the offer
    if (videoContext.localStream) {
      ensureTracksEnabled(videoContext.localStream);
    }
    
    // Create the offer with ice restart to overcome potential networking issues
    const offer = await peerConnection.connection.createOffer({
      offerToReceiveAudio: true, 
      offerToReceiveVideo: true,
      iceRestart: true  // Enable ICE restart to overcome potential networking issues
    });
    
    // Set local description
    await peerConnection.connection.setLocalDescription(offer);
    
    // Send the offer to the peer
    if (videoContext.socket && videoContext.roomId) {
      const { userName, roomId } = videoContext;
      
      // Send a few times to improve reliability with potentially flaky connections
      console.log(`Sending offer to ${peerConnection.userName} (${userId})`);
      videoContext.socket.emit('webrtc-offer', {
        offer, 
        receiverId: userId, 
        senderName: userName,
        roomId
      });
      
      // Add a slight delay and send again for reliability
      setTimeout(() => {
        if (videoContext.socket && peerConnection.connection.signalingState === 'have-local-offer') {
          console.log(`Resending offer to ${peerConnection.userName} (redundancy)`);
          videoContext.socket.emit('webrtc-offer', {
            offer,
            receiverId: userId,
            senderName: userName,
            roomId
          });
        }
      }, 1000);
    } else {
      console.error('Cannot send offer: Socket or room ID not available');
    }
  } catch (error) {
    console.error(`Error creating offer for ${userId}:`, error);
  }
};

// Clean up all WebRTC connections
export const cleanupConnections = () => {
  console.log('Cleaning up all WebRTC connections');
  
  // Close all peer connections
  videoContext.peerConnections.forEach((connection, userId) => {
    console.log(`Closing connection to ${connection.userName} (${userId})`);
    
    if (connection.connection) {
      connection.connection.close();
    }
    
    if (connection.stream) {
      activeStreams.delete(connection.stream);
    }
  });
  
  // Clear the map
  videoContext.peerConnections.clear();
  
  // Stop and clean up the local stream
  if (videoContext.localStream) {
    console.log('Stopping local stream');
    
    videoContext.localStream.getTracks().forEach(track => {
      track.stop();
    });
    
    activeStreams.delete(videoContext.localStream);
    videoContext.localStream = null;
  }
  
  // Clear the video elements
  if (videoContext.localStreamElement) {
    videoContext.localStreamElement.srcObject = null;
  }
};

// Toggle local audio
export const toggleAudio = () => {
  if (videoContext.localStream) {
    const audioTracks = videoContext.localStream.getAudioTracks();
    console.log('Toggle audio, current tracks:', audioTracks.map(t => ({ 
      id: t.id, 
      enabled: t.enabled,
      label: t.label
    })));
    
    const audioTrack = audioTracks[0];
    if (audioTrack) {
      audioTrack.enabled = !audioTrack.enabled;
      // Update track status in context
      videoContext.audioDisabled = !audioTrack.enabled;
      console.log(`Audio ${audioTrack.enabled ? 'enabled' : 'disabled'}`);
      return audioTrack.enabled;
    }
  }
  return false;
};

// Toggle local video
export const toggleVideo = () => {
  if (videoContext.localStream) {
    const videoTracks = videoContext.localStream.getVideoTracks();
    console.log('Toggle video, current tracks:', videoTracks.map(t => ({ 
      id: t.id, 
      enabled: t.enabled,
      label: t.label
    })));
    
    const videoTrack = videoTracks[0];
    if (videoTrack) {
      videoTrack.enabled = !videoTrack.enabled;
      // Update track status in context
      videoContext.videoDisabled = !videoTrack.enabled;
      console.log(`Video ${videoTrack.enabled ? 'enabled' : 'disabled'}`);
      return videoTrack.enabled;
    }
  }
  return false;
};

// Add a heartbeat mechanism to keep the stream active
const startStreamHeartbeat = (stream: MediaStream, label: string) => {
  // Reference to the interval so we can clear it later
  let heartbeatInterval: number | null = null;
  
  // Counter for consecutive failures
  let failureCount = 0;
  
  // Last known state tracking to detect changes
  const lastState = {
    videoEnabled: stream.getVideoTracks().length > 0 ? stream.getVideoTracks()[0].enabled : false,
    audioEnabled: stream.getAudioTracks().length > 0 ? stream.getAudioTracks()[0].enabled : false
  };
  
  // Function to check and ensure tracks are enabled
  const checkTracks = () => {
    // Exit if the stream is no longer active
    if (!stream.active) {
      console.warn(`Stream ${label} is no longer active, stopping heartbeat`);
      if (heartbeatInterval) {
        window.clearInterval(heartbeatInterval);
        heartbeatInterval = null;
      }
      return;
    }
    
    // Check all tracks
    const videoTracks = stream.getVideoTracks();
    const audioTracks = stream.getAudioTracks();
    
    // Log current state occasionally (every 10 seconds)
    if (Math.random() < 0.1) {
      console.log(`Heartbeat for ${label}:`, {
        active: stream.active,
        videoTracks: videoTracks.length > 0 ? videoTracks.map(t => ({ 
          enabled: t.enabled, 
          muted: t.muted,
          readyState: t.readyState 
        })) : 'none',
        audioTracks: audioTracks.length > 0 ? audioTracks.map(t => ({ 
          enabled: t.enabled, 
          muted: t.muted,
          readyState: t.readyState
        })) : 'none'
      });
    }
    
    // Re-enable any disabled tracks (unless they were explicitly disabled)
    let hasChanges = false;
    let hasIssues = false;
    
    // Function to check if tracks are in a good state
    const checkTrackHealth = (track: MediaStreamTrack) => {
      if (track.readyState !== 'live') {
        console.warn(`Track ${track.kind} in ${label} is in ${track.readyState} state`);
        hasIssues = true;
        return false;
      }
      
      // Additional check for Firefox and other browsers that might auto-disable tracks
      if (!track.enabled && track.readyState === 'live') {
        hasIssues = true;
        return false;
      }
      
      return true;
    };
    
    videoTracks.forEach(track => {
      const isHealthy = checkTrackHealth(track);
      const shouldBeEnabled = !videoContext.videoDisabled;
      
      // Check if track state changed unexpectedly
      if (label.includes('local-stream') && track.enabled !== lastState.videoEnabled && 
          track.enabled !== shouldBeEnabled) {
        console.warn(`Video track state changed unexpectedly in ${label}: ${lastState.videoEnabled} -> ${track.enabled}`);
        hasIssues = true;
      }
      
      // Force tracks to be enabled unless intentionally disabled
      if (track.readyState === 'live' && shouldBeEnabled) {
        if (!track.enabled) {
          console.warn(`Re-enabling video track in ${label} that was automatically disabled`);
          track.enabled = true;
          hasChanges = true;
        }
        // Update last known state
        lastState.videoEnabled = true;
      } else if (track.readyState === 'live' && !shouldBeEnabled) {
        lastState.videoEnabled = false;
      }
      
      if (!isHealthy && failureCount > 2) {
        // After multiple failures, try to restart the track
        console.error(`Video track in ${label} is in bad state, may need to restart stream`);
      }
    });
    
    audioTracks.forEach(track => {
      const isHealthy = checkTrackHealth(track);
      const shouldBeEnabled = !videoContext.audioDisabled;
      
      // Check if track state changed unexpectedly
      if (label.includes('local-stream') && track.enabled !== lastState.audioEnabled && 
          track.enabled !== shouldBeEnabled) {
        console.warn(`Audio track state changed unexpectedly in ${label}: ${lastState.audioEnabled} -> ${track.enabled}`);
        hasIssues = true;
      }
      
      // Force tracks to be enabled unless intentionally disabled
      if (track.readyState === 'live' && shouldBeEnabled) {
        if (!track.enabled) {
          console.warn(`Re-enabling audio track in ${label} that was automatically disabled`);
          track.enabled = true;
          hasChanges = true;
        }
        // Update last known state
        lastState.audioEnabled = true;
      } else if (track.readyState === 'live' && !shouldBeEnabled) {
        lastState.audioEnabled = false;
      }
      
      if (!isHealthy && failureCount > 2) {
        // After multiple failures, try to restart the track
        console.error(`Audio track in ${label} is in bad state, may need to restart stream`);
      }
    });
    
    // Update failure count
    if (hasIssues) {
      failureCount++;
      
      // If we've had several consecutive failures and this is the local stream, try to restart
      if (failureCount > 3 && label === 'local-stream' && videoContext.localStreamElement) {
        console.error(`Multiple track failures detected in ${label}, attempting to restart stream`);
        
        // Attempt to restart the stream
        if (videoContext.localStreamElement) {
          initLocalStream(videoContext.localStreamElement)
            .then(newStream => {
              console.log('Successfully restarted local stream with ID:', newStream.id);
              // Reset the failure counter
              failureCount = 0;
            })
            .catch(e => {
              console.error('Failed to restart stream:', e);
            });
        }
      }
    } else {
      // Reset failure count when everything is fine
      failureCount = 0;
    }
    
    // If we had to re-enable tracks, dispatch an event to update UI
    if (hasChanges) {
      window.dispatchEvent(new Event('webrtc-tracks-changed'));
    }
  };
  
  // Run an immediate check
  checkTracks();
  
  // Start the heartbeat interval (check more frequently - 500ms)
  heartbeatInterval = window.setInterval(checkTracks, 500);
  
  // Return a function that can be used to stop the heartbeat
  return () => {
    if (heartbeatInterval) {
      window.clearInterval(heartbeatInterval);
      heartbeatInterval = null;
    }
  };
};
