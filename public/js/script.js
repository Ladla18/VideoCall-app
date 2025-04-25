const socket = io("/");
const videoGrid = document.getElementById("video-grid");
const muteBtn = document.getElementById("muteBtn");
const videoBtn = document.getElementById("videoBtn");
const leaveBtn = document.getElementById("leaveBtn");
const copyBtn = document.getElementById("copyBtn");

// Initialize variables for audio and video state
let myVideoStream;
let myVideo;
let isAudioMuted = false;
let isVideoOff = false;

// Get the host from the current URL
const currentHost = window.location.hostname;
const currentProtocol = window.location.protocol;
const PORT =
  window.location.port || (currentProtocol === "https:" ? 443 : 3000);

// Create a peer connection using our self-hosted PeerJS server
const myPeer = new Peer(undefined, {
  host: currentHost,
  port: PORT,
  path: "/peerjs", // Path stays the same as our mount point
  secure: currentProtocol === "https:",
  debug: 3,
  config: {
    iceServers: [
      { urls: "stun:stun.l.google.com:19302" },
      { urls: "stun:global.stun.twilio.com:3478" },
    ],
  },
});

// Create a video element for the current user
myVideo = document.createElement("video");
myVideo.muted = true; // Mute our own video for ourselves

// Store connected peers to manage disconnections
const peers = {};

// Get user media (camera and microphone)
navigator.mediaDevices
  .getUserMedia({
    video: true,
    audio: true,
  })
  .then((stream) => {
    // Set the stream and add our video to the grid
    myVideoStream = stream;
    addVideoStream(myVideo, stream);

    // Answer calls from other users
    myPeer.on("call", (call) => {
      call.answer(stream);
      const video = document.createElement("video");

      call.on("stream", (userVideoStream) => {
        addVideoStream(video, userVideoStream);
      });
    });

    // Socket event for when a new user connects
    socket.on("user-connected", (userId) => {
      connectToNewUser(userId, stream);
    });
  })
  .catch((error) => {
    console.error("Failed to get media devices:", error);
    alert(
      "Failed to access camera or microphone. Please check your permissions."
    );
  });

// Socket event for when a user disconnects
socket.on("user-disconnected", (userId) => {
  if (peers[userId]) {
    peers[userId].close();
    delete peers[userId];
  }
});

// When peer connection is established
myPeer.on("open", (id) => {
  console.log("My peer ID is: " + id);
  socket.emit("join-room", ROOM_ID, id);
});

// Log any peer connection errors
myPeer.on("error", (err) => {
  console.error("PeerJS error:", err);

  // If the error is about connecting to the server, try to fallback to public PeerJS servers
  if (
    err.type === "peer-unavailable" ||
    err.type === "server-error" ||
    err.type === "network"
  ) {
    console.log("Trying to connect to public PeerJS server as fallback...");
    // Create a new peer with the public server
    const fallbackPeer = new Peer(undefined, {
      secure: true,
      host: "peerjs-server.herokuapp.com",
      port: 443,
    });

    // If the fallback connects successfully
    fallbackPeer.on("open", (id) => {
      console.log("Connected to fallback PeerJS server with ID:", id);
      // Replace the original peer with the fallback
      myPeer = fallbackPeer;
      socket.emit("join-room", ROOM_ID, id);
    });
  }
});

// Function to connect to a new user
function connectToNewUser(userId, stream) {
  const call = myPeer.call(userId, stream);
  const video = document.createElement("video");

  call.on("stream", (userVideoStream) => {
    addVideoStream(video, userVideoStream);
  });

  call.on("close", () => {
    video.remove();
  });

  peers[userId] = call;
}

// Function to add a video stream to the grid
function addVideoStream(video, stream) {
  video.srcObject = stream;
  video.addEventListener("loadedmetadata", () => {
    video.play();
  });
  videoGrid.append(video);
}

// Handle mute button click
muteBtn.addEventListener("click", () => {
  const audioTrack = myVideoStream.getAudioTracks()[0];
  isAudioMuted = !isAudioMuted;
  audioTrack.enabled = !isAudioMuted;

  if (isAudioMuted) {
    muteBtn.classList.add("muted");
    muteBtn.querySelector(".icon").textContent = "🔇";
  } else {
    muteBtn.classList.remove("muted");
    muteBtn.querySelector(".icon").textContent = "🎤";
  }
});

// Handle video button click
videoBtn.addEventListener("click", () => {
  const videoTrack = myVideoStream.getVideoTracks()[0];
  isVideoOff = !isVideoOff;
  videoTrack.enabled = !isVideoOff;

  if (isVideoOff) {
    videoBtn.classList.add("video-off");
    videoBtn.querySelector(".icon").textContent = "🚫";
  } else {
    videoBtn.classList.remove("video-off");
    videoBtn.querySelector(".icon").textContent = "📹";
  }
});

// Handle leave button click
leaveBtn.addEventListener("click", () => {
  // Stop all tracks
  myVideoStream.getTracks().forEach((track) => {
    track.stop();
  });

  // Close all peer connections
  for (let userId in peers) {
    peers[userId].close();
  }

  // Redirect to home page
  window.location.href = "/";
});

// Handle copy room ID button
copyBtn.addEventListener("click", () => {
  const roomId = document.getElementById("roomId").textContent;
  navigator.clipboard
    .writeText(roomId)
    .then(() => {
      copyBtn.textContent = "Copied!";
      setTimeout(() => {
        copyBtn.textContent = "Copy Room ID";
      }, 2000);
    })
    .catch((err) => {
      console.error("Failed to copy text: ", err);
    });
});
