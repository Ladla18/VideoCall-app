# Video Calling Application

A simple video calling application built with Node.js, Express, EJS, Socket.io, and PeerJS.

## Features

- Real-time video calling with WebRTC
- Multiple participants in a room
- Mute/unmute audio
- Turn on/off video
- Copy room ID to invite others
- 6-digit numeric room IDs
- Option to join existing rooms by entering room ID
- Option to create new rooms

## Requirements

- Node.js
- npm

## Installation

1. Clone the repository

```
git clone <repository-url>
```

2. Install dependencies

```
npm install
```

3. Set up PeerJS server

```
npm install -g peer
```

## Running the Application

1. Start the PeerJS server

```
peerjs --port 3001
```

2. In a separate terminal, start the application

```
npm run dev
```

3. Open your browser and navigate to `http://localhost:3000`

## Deploying to Render

1. Create a GitHub repository for your application and push the code to it.

2. Sign up for a Render account at [render.com](https://render.com).

3. From the Render dashboard, click "New" and select "Web Service".

4. Connect your GitHub account and select the repository.

5. Configure the following settings:

   - **Name**: Choose a name for your service (e.g., video-calling-app)
   - **Environment**: Node
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Plan**: Free (or your preferred paid plan)

6. Click "Create Web Service".

7. Wait for Render to deploy your application. This may take a few minutes.

8. Once deployed, Render will provide you with a URL like `https://your-app-name.onrender.com`.

9. Your application is now live and ready to use!

## How to Use

1. On the homepage, you can either:
   - Create a new room by clicking "Create Room"
   - Join an existing room by entering a 6-digit room ID
2. Once in a room, you can:
   - Mute/unmute your microphone
   - Turn your camera on/off
   - Copy the room ID to share with others
   - Leave the call to return to the homepage

## Technologies Used

- Node.js
- Express.js
- EJS (Embedded JavaScript templates)
- Socket.io
- PeerJS (WebRTC)
- HTML/CSS/JavaScript
