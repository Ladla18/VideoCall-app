const socket = io("/");
const videoGrid = document.getElementById("video-grid");
const muteBtn = document.getElementById("muteBtn");
const videoBtn = document.getElementById("videoBtn");
const screenShareBtn = document.getElementById("screenShareBtn");
const leaveBtn = document.getElementById("leaveBtn");
const copyBtn = document.getElementById("copyBtn");
const chatBtn = document.getElementById("chatBtn");
const chatTabBtn = document.getElementById("chatTabBtn");
const chatPanel = document.getElementById("chatPanel");
const chatMessages = document.getElementById("chat-messages");
const chatInput = document.getElementById("chat-input");
const sendMessageBtn = document.getElementById("sendMessageBtn");
const fileUploadInput = document.getElementById("file-upload");

// Username change elements
const changeNameBtn = document.getElementById("changeNameBtn");
const displayUserName = document.getElementById("displayUserName");
const usernameModal = document.getElementById("usernameModal");
const newUsernameInput = document.getElementById("newUsername");
const saveNameBtn = document.getElementById("saveNameBtn");
const cancelNameBtn = document.getElementById("cancelNameBtn");

// Get participant elements if room creator
let participantsTabBtn, participantsPanel, participantsList;
if (IS_ROOM_CREATOR) {
  participantsTabBtn = document.getElementById("participantsTabBtn");
  participantsPanel = document.getElementById("participantsPanel");
  participantsList = document.getElementById("participants-list");
}

// Initialize variables for audio and video state
let myVideoStream;
let myVideo;
let isAudioMuted = false;
let isVideoOff = false;
let sidebarVisible = false;
let unreadMessages = 0;
let isScreenSharing = false;
let screenStream = null;
let originalStream = null;

// Store username
let myUserName = "You";

// Ask for username
function promptForUsername() {
  let name = localStorage.getItem("videoCallUserName");

  if (!name) {
    name = prompt("Enter your name for the video call:", "");
    if (name && name.trim() !== "") {
      localStorage.setItem("videoCallUserName", name);
    } else {
      name = `User-${Math.floor(1000 + Math.random() * 9000)}`;
    }
  }

  return name;
}

// Get the host from the current URL
const currentHost = window.location.hostname;
const currentProtocol = window.location.protocol;
const PORT =
  window.location.port || (currentProtocol === "https:" ? 443 : 3000);

// Create a peer connection using our self-hosted PeerJS server
const myPeer = new Peer(undefined, {
  host: currentHost,
  port: PORT,
  path: "/peerjs",
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
const userNames = {};

// Get username before joining
myUserName = promptForUsername();

// Get user media (camera and microphone)
navigator.mediaDevices
  .getUserMedia({
    video: true,
    audio: true,
  })
  .then((stream) => {
    // Set the stream and add our video to the grid
    myVideoStream = stream;
    addVideoStream(myVideo, stream, null, true);

    // Answer calls from other users
    myPeer.on("call", (call) => {
      console.log("Received call from:", call.peer);

      // Check if we already have this peer's video displayed
      const existingVideo = document.querySelector(
        `[data-user-id="${call.peer}"]`
      );
      if (existingVideo) {
        console.log("Already have video for this user, not creating duplicate");
        call.answer(stream); // Still answer the call to establish connection
        return;
      }

      call.answer(stream);
      const video = document.createElement("video");

      call.on("stream", (userVideoStream) => {
        console.log("Received stream from call:", call.peer);
        // Make sure we don't add duplicate videos for the same user
        const existingVideo = document.querySelector(
          `[data-user-id="${call.peer}"]`
        );
        if (existingVideo) {
          console.log("Video already exists for this call, not adding another");
          return;
        }

        addVideoStream(
          video,
          userVideoStream,
          userNames[call.peer] || null,
          false,
          call.peer
        );
      });
    });

    // Socket event for when a new user connects
    socket.on("user-connected", (userId, userName) => {
      console.log("User connected event received:", userId, userName);
      // Only handle connection if we're not already connected to this user
      if (!peers[userId]) {
        userNames[userId] = userName;
        connectToNewUser(userId, myVideoStream);
        addChatMessage({
          system: true,
          message: `${userName} joined the room`,
        });
      } else {
        console.log("Ignoring duplicate user-connected event for:", userId);
      }
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
  console.log("User disconnected:", userId);

  // Close the peer connection if it exists
  if (peers[userId]) {
    console.log("Closing peer connection for user:", userId);
    peers[userId].close();
    delete peers[userId];
  }

  // Remove user's video
  const userVideo = document.querySelector(`[data-user-id="${userId}"]`);
  if (userVideo) {
    console.log("Removing video element for user:", userId);
    userVideo.remove();
  } else {
    console.log("No video element found for user:", userId);
  }

  // Add system message that user left
  addChatMessage({
    system: true,
    message: `${userNames[userId] || "A user"} left the room`,
  });
});

// Socket event for chat messages
socket.on("receive-message", (data) => {
  addChatMessage(data);

  // If the sidebar is not visible, increment unread count
  if (!sidebarVisible) {
    unreadMessages++;
    updateChatButtonNotification();
  }
});

// Socket event for updating participants list
socket.on("update-participants", (participants, creatorId) => {
  // Update the UI if current user is the room creator
  if (IS_ROOM_CREATOR && participantsList) {
    updateParticipantsList(participants, creatorId);
  }

  // If creator changed and current user is now the creator
  if (creatorId === myPeer.id && !IS_ROOM_CREATOR) {
    window.location.reload(); // Refresh to gain creator privileges
  }
});

// Socket event when user is removed
socket.on("you-were-removed", () => {
  alert("You have been removed from the room by the host.");
  leaveRoom();
});

// Socket event when a user is removed
socket.on("user-removed", (userId) => {
  if (peers[userId]) {
    peers[userId].close();
    delete peers[userId];
  }

  // Remove user's video
  const userVideo = document.querySelector(`[data-user-id="${userId}"]`);
  if (userVideo) {
    userVideo.remove();
  }

  // Add system message that user was removed
  addChatMessage({
    system: true,
    message: `${userNames[userId] || "A user"} was removed from the room`,
  });
});

// Username change functionality
function initUsernameChange() {
  // Update display name initially
  displayUserName.textContent = myUserName;

  // Open modal when change button is clicked
  changeNameBtn.addEventListener("click", () => {
    newUsernameInput.value = myUserName === "You" ? "" : myUserName;
    usernameModal.classList.add("active");
    newUsernameInput.focus();
  });

  // Close modal when cancel is clicked
  cancelNameBtn.addEventListener("click", () => {
    usernameModal.classList.remove("active");
  });

  // Save new username
  saveNameBtn.addEventListener("click", saveUsername);

  // Allow pressing Enter to save
  newUsernameInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      saveUsername();
    }
  });

  // Close modal when clicking outside
  usernameModal.addEventListener("click", (e) => {
    if (e.target === usernameModal) {
      usernameModal.classList.remove("active");
    }
  });
}

// Function to save username
function saveUsername() {
  const newName = newUsernameInput.value.trim();

  if (newName && newName !== myUserName) {
    const oldName = myUserName;
    myUserName = newName;

    // Save to localStorage
    localStorage.setItem("videoCallUserName", newName);

    // Update display
    displayUserName.textContent = newName;

    // Update name tag on video
    const myVideoContainer = document.querySelector(
      `[data-user-id="${myPeer.id}"]`
    );
    if (myVideoContainer) {
      const nameTag = myVideoContainer.querySelector(".name-tag");
      if (nameTag) {
        nameTag.textContent = `${newName} (You)`;
      }
    }

    // Notify server and other users about name change
    socket.emit("username-changed", newName);

    // Add system message
    addChatMessage({
      system: true,
      message: `${oldName} changed their name to ${newName}`,
    });
  }

  // Close modal
  usernameModal.classList.remove("active");
}

// Socket event for when a user changes their username
socket.on("user-changed-name", (userId, newName) => {
  if (userId !== myPeer.id) {
    const oldName = userNames[userId] || "A user";

    // Update stored username
    userNames[userId] = newName;

    // Update name tag on video
    const userVideoContainer = document.querySelector(
      `[data-user-id="${userId}"]`
    );
    if (userVideoContainer) {
      const nameTag = userVideoContainer.querySelector(".name-tag");
      if (nameTag) {
        nameTag.textContent = newName;
      }
    }

    // Update participants list if visible
    if (IS_ROOM_CREATOR && participantsList) {
      const participantItem = participantsList.querySelector(
        `[data-user-id="${userId}"]`
      );
      if (participantItem) {
        const nameElement = participantItem.querySelector(".participant-name");
        if (nameElement) {
          // Keep any badges/indicators from the original HTML
          const isCreator = nameElement.textContent.includes("(Host)");
          nameElement.innerHTML = `
            <span class="status"></span>
            ${newName}${isCreator ? " (Host)" : ""}
          `;
        }
      }
    }

    // Add system message
    addChatMessage({
      system: true,
      message: `${oldName} changed their name to ${newName}`,
    });
  }
});

// Initialize file sharing
function initFileSharing() {
  fileUploadInput.addEventListener("change", handleFileUpload);
}

// Handle file selection
async function handleFileUpload(event) {
  const file = event.target.files[0];
  if (!file) return;

  try {
    // Check file size (limit to 5MB for demo)
    if (file.size > 5 * 1024 * 1024) {
      alert("File size exceeds 5MB limit. Please choose a smaller file.");
      fileUploadInput.value = ""; // Clear the input
      return;
    }

    // Read the file
    const reader = new FileReader();

    reader.onload = function (e) {
      const fileData = e.target.result;

      // Prepare file info
      const fileInfo = {
        name: file.name,
        type: file.type,
        size: file.size,
        data: fileData,
      };

      // Create a progress message in chat
      const messageDiv = document.createElement("div");
      messageDiv.className = "chat-message sent file-shared";
      messageDiv.innerHTML = `
        <div class="message-sender">You</div>
        <div class="message-content">Uploading file...</div>
        <div class="file-attachment">
          <div class="file-icon">${getFileIcon(file.type)}</div>
          <div class="file-info">
            <div class="file-name">${file.name}</div>
            <div class="file-size">${formatFileSize(file.size)}</div>
            <div class="upload-progress">
              <div class="progress-bar" id="progress-${Date.now()}"></div>
            </div>
          </div>
        </div>
      `;

      chatMessages.appendChild(messageDiv);
      chatMessages.scrollTop = chatMessages.scrollHeight;

      // Share the file with others
      socket.emit("share-file", fileInfo);

      // Reset the file input
      fileUploadInput.value = "";
    };

    reader.readAsDataURL(file); // Read as Data URL for small files
  } catch (error) {
    console.error("Error uploading file:", error);
    alert("Failed to upload file: " + error.message);
    fileUploadInput.value = ""; // Clear the input
  }
}

// Function to get appropriate icon for file type
function getFileIcon(mimeType) {
  if (mimeType.startsWith("image/")) {
    return "🖼️";
  } else if (mimeType.startsWith("video/")) {
    return "🎬";
  } else if (mimeType.startsWith("audio/")) {
    return "🎵";
  } else if (mimeType.includes("pdf")) {
    return "📄";
  } else if (mimeType.includes("word") || mimeType.includes("document")) {
    return "📝";
  } else if (mimeType.includes("excel") || mimeType.includes("spreadsheet")) {
    return "📊";
  } else if (
    mimeType.includes("presentation") ||
    mimeType.includes("powerpoint")
  ) {
    return "📑";
  } else if (mimeType.includes("text")) {
    return "📄";
  } else if (mimeType.includes("zip") || mimeType.includes("compressed")) {
    return "🗜️";
  } else {
    return "📁";
  }
}

// Format file size in human-readable format
function formatFileSize(bytes) {
  if (bytes < 1024) {
    return bytes + " bytes";
  } else if (bytes < 1024 * 1024) {
    return (bytes / 1024).toFixed(1) + " KB";
  } else {
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  }
}

// Handle received files
socket.on("file-shared", (fileInfo) => {
  const isLocalUser = fileInfo.sharedBy === myPeer.id;

  // Create message element
  const messageDiv = document.createElement("div");
  messageDiv.className = isLocalUser
    ? "chat-message sent file-shared"
    : "chat-message received file-shared";

  const senderName = isLocalUser
    ? "You"
    : userNames[fileInfo.sharedBy] || fileInfo.sharedByName || "User";
  const messageTime = new Date().toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });

  messageDiv.innerHTML = `
    <div class="message-sender">${senderName}</div>
    <div class="message-content">Shared a file</div>
    <div class="file-attachment">
      <div class="file-icon">${getFileIcon(fileInfo.type)}</div>
      <div class="file-info">
        <div class="file-name">${fileInfo.name}</div>
        <div class="file-size">${formatFileSize(fileInfo.size)}</div>
      </div>
      <a class="file-download" href="${fileInfo.data}" download="${
    fileInfo.name
  }">Download</a>
    </div>
    <div class="message-time">${messageTime}</div>
  `;

  chatMessages.appendChild(messageDiv);
  chatMessages.scrollTop = chatMessages.scrollHeight;

  // If the sidebar is not visible, increment unread count
  if (!sidebarVisible) {
    unreadMessages++;
    updateChatButtonNotification();
  }

  // Add system message
  addChatMessage({
    system: true,
    message: `${senderName} shared a file: ${fileInfo.name}`,
  });
});

// When peer connection is established
myPeer.on("open", (id) => {
  console.log("My peer ID is: " + id);
  // Join room with ID, user name, and room creator status
  socket.emit("join-room", ROOM_ID, id, myUserName);

  // Initialize username change functionality
  initUsernameChange();

  // Initialize file sharing
  initFileSharing();
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
      socket.emit("join-room", ROOM_ID, id, myUserName);
    });
  }
});

// Function to connect to a new user
function connectToNewUser(userId, stream) {
  console.log("Connecting to new user:", userId);

  // Check if we're already connected to this user
  if (peers[userId]) {
    console.log(
      "Already connected to this user, ignoring duplicate connection"
    );
    return;
  }

  const call = myPeer.call(userId, stream);
  const video = document.createElement("video");

  call.on("stream", (userVideoStream) => {
    console.log("Received stream from user:", userId);
    // Remove any existing video from this user first to prevent duplicates
    const existingVideo = document.querySelector(`[data-user-id="${userId}"]`);
    if (existingVideo) {
      console.log("Removing existing video element for user:", userId);
      existingVideo.remove();
    }

    addVideoStream(
      video,
      userVideoStream,
      userNames[userId] || null,
      false,
      userId
    );
  });

  call.on("close", () => {
    video.parentElement?.remove();
  });

  peers[userId] = call;
}

// Function to add a video stream to the grid
function addVideoStream(
  video,
  stream,
  userName,
  isLocalUser = false,
  userId = null
) {
  // Check if this user's video already exists (to prevent duplicates)
  if (userId && !isLocalUser) {
    const existingVideo = document.querySelector(`[data-user-id="${userId}"]`);
    if (existingVideo) {
      console.log("Video already exists for user:", userId);
      return;
    }
  }

  const videoContainer = document.createElement("div");
  videoContainer.className = "video-container";
  if (userId) {
    videoContainer.setAttribute("data-user-id", userId);
  }

  video.srcObject = stream;
  video.addEventListener("loadedmetadata", () => {
    video.play().catch((e) => console.error("Error playing video:", e));
  });

  const nameTag = document.createElement("div");
  nameTag.className = "name-tag";
  nameTag.textContent = isLocalUser
    ? myUserName + " (You)"
    : userName || "User";

  videoContainer.appendChild(video);
  videoContainer.appendChild(nameTag);
  videoGrid.append(videoContainer);
}

// Function to add a chat message
function addChatMessage(data) {
  const messageDiv = document.createElement("div");

  if (data.system) {
    // System message
    messageDiv.className = "chat-message system";
    messageDiv.innerHTML = `<div class="message-content">${data.message}</div>`;
  } else {
    // Regular user message
    const isLocalUser = data.sender === myPeer.id;
    messageDiv.className = isLocalUser
      ? "chat-message sent"
      : "chat-message received";

    let senderName = isLocalUser ? "You" : data.senderName || "User";
    const messageTime = data.timestamp
      ? new Date(data.timestamp).toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        })
      : "";

    messageDiv.innerHTML = `
      <div class="message-sender">${senderName}</div>
      <div class="message-content">${data.message}</div>
      <div class="message-time">${messageTime}</div>
    `;
  }

  chatMessages.appendChild(messageDiv);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

// Function to update the participant list
function updateParticipantsList(participants, creatorId) {
  if (!participantsList) return;

  // Clear the current list
  participantsList.innerHTML = "";

  // Add each participant
  Object.values(participants).forEach((participant) => {
    const isCreator = participant.id === creatorId;
    const isCurrentUser = participant.id === myPeer.id;

    const listItem = document.createElement("li");
    listItem.className = "participant-item";
    listItem.setAttribute("data-user-id", participant.id);

    let nameDisplay = participant.name;
    if (isCreator) nameDisplay += " (Host)";
    if (isCurrentUser) nameDisplay += " (You)";

    listItem.innerHTML = `
      <div class="participant-name">
        <span class="status"></span>
        ${nameDisplay}
      </div>
      ${
        !isCurrentUser && IS_ROOM_CREATOR
          ? `<div class="participant-actions">
          <button class="remove-btn" data-user-id="${participant.id}">Remove</button>
        </div>`
          : ""
      }
    `;

    participantsList.appendChild(listItem);
  });

  // Add event listeners to remove buttons
  const removeButtons = participantsList.querySelectorAll(".remove-btn");
  removeButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const userId = button.getAttribute("data-user-id");
      removeParticipant(userId);
    });
  });
}

// Function to remove a participant
function removeParticipant(userId) {
  if (confirm("Are you sure you want to remove this participant?")) {
    socket.emit("remove-participant", userId);
  }
}

// Function to toggle the side panel
function toggleSidePanel(panel) {
  const sidePanel = document.querySelector(".side-panel");

  if (panel === "chat") {
    chatPanel.classList.add("active");
    if (participantsPanel) participantsPanel.classList.remove("active");
    chatTabBtn.classList.add("active");
    if (participantsTabBtn) participantsTabBtn.classList.remove("active");

    // Reset unread count when opening the chat
    unreadMessages = 0;
    updateChatButtonNotification();
  } else if (panel === "participants" && participantsPanel) {
    chatPanel.classList.remove("active");
    participantsPanel.classList.add("active");
    chatTabBtn.classList.remove("active");
    participantsTabBtn.classList.add("active");
  }

  sidebarVisible = true;
}

// Function to leave room
function leaveRoom() {
  // Stop all tracks
  if (myVideoStream) {
    myVideoStream.getTracks().forEach((track) => {
      track.stop();
    });
  }

  // Close all peer connections
  for (let userId in peers) {
    peers[userId].close();
  }

  // Redirect to home page
  window.location.href = "/";
}

// Function to update chat button notification
function updateChatButtonNotification() {
  const notification = chatBtn.querySelector(".notification");

  if (unreadMessages > 0) {
    if (!notification) {
      const notificationSpan = document.createElement("span");
      notificationSpan.className = "notification";
      notificationSpan.textContent = unreadMessages;
      chatBtn.appendChild(notificationSpan);
    } else {
      notification.textContent = unreadMessages;
    }
  } else if (notification) {
    notification.remove();
  }
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

// Handle chat button click
chatBtn.addEventListener("click", () => {
  toggleSidePanel("chat");
});

// Handle chat tab click
chatTabBtn.addEventListener("click", () => {
  toggleSidePanel("chat");
});

// Handle participants tab click (if exists)
if (participantsTabBtn) {
  participantsTabBtn.addEventListener("click", () => {
    toggleSidePanel("participants");
  });
}

// Handle send message button click
sendMessageBtn.addEventListener("click", () => {
  sendMessage();
});

// Handle chat input keydown (send on Enter)
chatInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    sendMessage();
  }
});

// Function to send a message
function sendMessage() {
  const message = chatInput.value.trim();
  if (message) {
    socket.emit("send-message", message);
    chatInput.value = "";
  }
}

// Handle leave button click
leaveBtn.addEventListener("click", () => {
  leaveRoom();
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

// Function to start screen sharing
async function startScreenSharing() {
  try {
    // Save original stream to restore later
    originalStream = myVideoStream;

    // Get screen sharing stream
    const stream = await navigator.mediaDevices.getDisplayMedia({
      video: {
        cursor: "always",
      },
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
      },
    });

    // Add a handler to detect when user stops sharing via the browser UI
    stream.getVideoTracks()[0].onended = () => {
      stopScreenSharing();
    };

    // Replace current video track with screen share track
    screenStream = stream;

    // Replace tracks for all peers
    replaceVideoTrackForAllPeers(stream.getVideoTracks()[0]);

    // Replace my own video
    const myVideoContainer = document.querySelector(
      `[data-user-id="${myPeer.id}"]`
    );
    if (myVideoContainer) {
      const myVideoElement = myVideoContainer.querySelector("video");
      if (myVideoElement) {
        myVideoElement.srcObject = stream;
      }

      // Add screen sharing indicator class
      myVideoContainer.classList.add("screen-sharing");
    }

    // Update state and button
    isScreenSharing = true;
    screenShareBtn.classList.add("active");
    screenShareBtn.querySelector(".icon").textContent = "🔴";

    // Notify users that you're screen sharing
    addChatMessage({
      system: true,
      message: `${myUserName} started screen sharing`,
    });

    console.log("Screen sharing started");
  } catch (err) {
    console.error("Error starting screen share:", err);
    if (err.name === "NotAllowedError") {
      addChatMessage({
        system: true,
        message: `Screen sharing was cancelled`,
      });
    } else {
      alert(
        "Failed to start screen sharing: " + (err.message || "Unknown error")
      );
    }
  }
}

// Function to stop screen sharing
function stopScreenSharing() {
  if (!isScreenSharing || !originalStream) return;

  try {
    // Replace screen share track with original video track
    replaceVideoTrackForAllPeers(originalStream.getVideoTracks()[0]);

    // Replace my own video
    const myVideoContainer = document.querySelector(
      `[data-user-id="${myPeer.id}"]`
    );
    if (myVideoContainer) {
      const myVideoElement = myVideoContainer.querySelector("video");
      if (myVideoElement) {
        myVideoElement.srcObject = originalStream;
      }

      // Remove screen sharing indicator class
      myVideoContainer.classList.remove("screen-sharing");
    }

    // Stop all screen share tracks
    if (screenStream) {
      screenStream.getTracks().forEach((track) => track.stop());
      screenStream = null;
    }

    // Update state and button
    isScreenSharing = false;
    screenShareBtn.classList.remove("active");
    screenShareBtn.querySelector(".icon").textContent = "📺";

    // Notify users that you've stopped screen sharing
    addChatMessage({
      system: true,
      message: `${myUserName} stopped screen sharing`,
    });

    // Restore original stream as myVideoStream
    myVideoStream = originalStream;

    console.log("Screen sharing stopped");
  } catch (err) {
    console.error("Error stopping screen share:", err);
  }
}

// Function to replace video track for all peer connections
function replaceVideoTrackForAllPeers(newTrack) {
  for (let userId in peers) {
    try {
      const sender = peers[userId].peerConnection
        .getSenders()
        .find((s) => s.track && s.track.kind === "video");

      if (sender) {
        sender.replaceTrack(newTrack);
      }
    } catch (err) {
      console.error("Error replacing track for peer " + userId, err);
    }
  }
}

// Handle screen share button click
screenShareBtn.addEventListener("click", () => {
  if (isScreenSharing) {
    stopScreenSharing();
  } else {
    startScreenSharing();
  }
});
