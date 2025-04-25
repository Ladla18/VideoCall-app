const express = require("express");
const app = express();
const server = require("http").Server(app);
const io = require("socket.io")(server);
const path = require("path");
const cors = require("cors");
const { ExpressPeerServer } = require("peer");

// Create Peer server
const peerServer = ExpressPeerServer(server, {
  debug: true,
  path: "/",
});

// Log PeerJS server events
peerServer.on("connection", (client) => {
  console.log("PeerJS client connected with ID:", client.getId());
});

peerServer.on("disconnect", (client) => {
  console.log("PeerJS client disconnected with ID:", client.getId());
});

// Function to generate a 6-digit numeric room ID
function generateRoomId() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// Store room creators and participants
const rooms = {};

// Set EJS as the view engine
app.set("view engine", "ejs");
app.use(express.static("public"));
app.use(express.urlencoded({ extended: true }));
app.use(express.json()); // For parsing application/json

// Handle favicon.ico requests
app.get("/favicon.ico", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "img", "favicon.svg"));
});

// Use PeerJS server
app.use("/peerjs", peerServer);

// Use CORS - update to use dynamic origin based on environment
const allowedOrigins = [
  "http://localhost:3000",
  "https://videocall-app-uyb6.onrender.com",
];

app.use(
  cors({
    origin: function (origin, callback) {
      // Allow requests with no origin (like mobile apps, curl requests)
      if (!origin) return callback(null, true);
      if (allowedOrigins.indexOf(origin) === -1) {
        const msg =
          "The CORS policy for this site does not allow access from the specified Origin.";
        return callback(new Error(msg), false);
      }
      return callback(null, true);
    },
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
    credentials: true,
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

// For file sharing - create a temporary store for files
const fileStore = {};

// Clean up files older than 24 hours
setInterval(() => {
  const now = Date.now();
  Object.keys(fileStore).forEach((fileId) => {
    // If file is older than 24 hours, delete it
    if (now - fileStore[fileId].timestamp > 24 * 60 * 60 * 1000) {
      delete fileStore[fileId];
    }
  });
}, 60 * 60 * 1000); // Check every hour

// Routes
app.get("/", (req, res) => {
  // Render the home page instead of redirecting
  res.render("home");
});

// Handle form submission to join a room
app.post("/join-room", (req, res) => {
  const roomId = req.body.roomId;
  res.redirect(`/room/${roomId}`);
});

// Create a new room
app.get("/create", (req, res) => {
  const roomId = generateRoomId();
  rooms[roomId] = { creator: null, participants: {} };
  res.redirect(`/room/${roomId}`);
});

// Room route - changed from /:room to /room/:roomId for clarity
app.get("/room/:roomId", (req, res) => {
  const roomId = req.params.roomId;

  // Initialize room if it doesn't exist
  if (!rooms[roomId]) {
    rooms[roomId] = { creator: null, participants: {} };
  }

  // Determine if first user to join the room (creator)
  const isRoomCreator = !rooms[roomId].creator;

  res.render("room", {
    roomId: roomId,
    isRoomCreator: isRoomCreator,
  });
});

// File sharing endpoints
app.post("/upload", (req, res) => {
  // This would be handled by a file upload middleware like multer in a production app
  // For this demo, we'll simulate a response for file upload

  res.json({
    success: true,
    message: "File uploaded successfully",
    fileId: "demo" + Date.now(),
  });
});

// Get file endpoint
app.get("/files/:fileId", (req, res) => {
  const fileId = req.params.fileId;

  // In a real implementation, check if file exists
  if (fileStore[fileId]) {
    // Send the file
    res.send(fileStore[fileId].data);
  } else {
    res.status(404).send("File not found");
  }
});

// Add a debugging route for PeerJS
app.get("/peerjs-status", (req, res) => {
  res.json({
    status: "PeerJS server is running",
    path: "/peerjs",
    debug: true,
    timestamp: new Date().toISOString(),
  });
});

// Socket.io connection setup
io.on("connection", (socket) => {
  socket.on("join-room", (roomId, userId, userName) => {
    // Add user to room
    socket.join(roomId);

    // Set the creator if not already set
    if (!rooms[roomId]) {
      rooms[roomId] = { creator: null, participants: {} };
    }

    if (!rooms[roomId].creator) {
      rooms[roomId].creator = userId;
      console.log(
        `User ${userId} (${userName}) set as room creator for room ${roomId}`
      );
    }

    // Add to participants list
    rooms[roomId].participants[userId] = {
      id: userId,
      name: userName || `User-${userId.substring(0, 5)}`,
      socketId: socket.id,
    };

    // Inform other users about the new participant
    socket
      .to(roomId)
      .emit(
        "user-connected",
        userId,
        userName || `User-${userId.substring(0, 5)}`
      );

    // Send the updated participants list to everyone
    io.to(roomId).emit(
      "update-participants",
      rooms[roomId].participants,
      rooms[roomId].creator
    );

    // Handle username changes
    socket.on("username-changed", (newName) => {
      // Update name in participants list
      if (rooms[roomId] && rooms[roomId].participants[userId]) {
        const oldName = rooms[roomId].participants[userId].name;
        rooms[roomId].participants[userId].name = newName;

        console.log(
          `User ${userId} changed name from ${oldName} to ${newName} in room ${roomId}`
        );

        // Notify all users in room about the name change
        io.to(roomId).emit("user-changed-name", userId, newName);

        // Update the participants list for everyone
        io.to(roomId).emit(
          "update-participants",
          rooms[roomId].participants,
          rooms[roomId].creator
        );
      }
    });

    // Handle file sharing
    socket.on("share-file", (fileInfo) => {
      // Store the file data in memory (would use proper storage in production)
      const fileId = userId + "_" + Date.now();
      fileStore[fileId] = {
        ...fileInfo,
        timestamp: Date.now(),
        sharedBy: userId,
        sharedByName: rooms[roomId].participants[userId].name,
      };

      // Add a unique URL to the file info
      fileInfo.fileId = fileId;
      fileInfo.downloadUrl = `/files/${fileId}`;
      fileInfo.sharedBy = userId;
      fileInfo.sharedByName = rooms[roomId].participants[userId].name;

      // Broadcast the file to all users in the room
      io.to(roomId).emit("file-shared", fileInfo);

      console.log(
        `User ${userId} shared file ${fileInfo.name} in room ${roomId}`
      );
    });

    // Handle chat messages
    socket.on("send-message", (message) => {
      const participant = rooms[roomId].participants[userId];
      io.to(roomId).emit("receive-message", {
        sender: userId,
        senderName: participant
          ? participant.name
          : `User-${userId.substring(0, 5)}`,
        message: message,
        timestamp: new Date().toISOString(),
      });
    });

    // Handle remove participant (only from room creator)
    socket.on("remove-participant", (participantId) => {
      // Check if the request is from the room creator
      if (userId === rooms[roomId].creator) {
        const participantSocketId =
          rooms[roomId].participants[participantId]?.socketId;

        // Notify the removed participant
        if (participantSocketId) {
          io.to(participantSocketId).emit("you-were-removed");
        }

        // Notify others that participant was removed
        socket.to(roomId).emit("user-removed", participantId);

        // Remove from participants list
        delete rooms[roomId].participants[participantId];

        // Update the participants list for everyone
        io.to(roomId).emit(
          "update-participants",
          rooms[roomId].participants,
          rooms[roomId].creator
        );
      }
    });

    // Handle disconnect
    socket.on("disconnect", () => {
      // Check if this was the room creator
      if (rooms[roomId] && userId === rooms[roomId].creator) {
        // If creator leaves, assign a new creator if other participants exist
        const remainingParticipants = Object.keys(rooms[roomId].participants);
        remainingParticipants.splice(remainingParticipants.indexOf(userId), 1);

        if (remainingParticipants.length > 0) {
          // Assign the first remaining participant as the new creator
          rooms[roomId].creator = remainingParticipants[0];

          // Notify everyone about the new creator
          io.to(roomId).emit("new-creator", remainingParticipants[0]);
        } else {
          // If no participants left, delete the room
          delete rooms[roomId];
        }
      }

      // Remove from participants list
      if (rooms[roomId] && rooms[roomId].participants[userId]) {
        delete rooms[roomId].participants[userId];
      }

      // Notify others
      socket.to(roomId).emit("user-disconnected", userId);

      // Update the participants list
      if (rooms[roomId]) {
        io.to(roomId).emit(
          "update-participants",
          rooms[roomId].participants,
          rooms[roomId].creator
        );
      }
    });
  });
});

// Use environment variable for port or default to 3000
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`PeerJS server running on /peerjs`);
});
