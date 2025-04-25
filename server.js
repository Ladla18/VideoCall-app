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
  path: "/peerjs",
});

// Function to generate a 6-digit numeric room ID
function generateRoomId() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// Set EJS as the view engine
app.set("view engine", "ejs");
app.use(express.static("public"));
app.use(express.urlencoded({ extended: true }));

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
  res.redirect(`/room/${generateRoomId()}`);
});

// Room route - changed from /:room to /room/:roomId for clarity
app.get("/room/:roomId", (req, res) => {
  res.render("room", { roomId: req.params.roomId });
});

// Socket.io connection setup
io.on("connection", (socket) => {
  socket.on("join-room", (roomId, userId) => {
    socket.join(roomId);
    socket.to(roomId).emit("user-connected", userId);

    socket.on("disconnect", () => {
      socket.to(roomId).emit("user-disconnected", userId);
    });
  });
});

// Use environment variable for port or default to 3000
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`PeerJS server running on /peerjs`);
});
