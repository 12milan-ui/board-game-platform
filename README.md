# board-game-platform
# Board Game Platform - Backend

Multiplayer board game server with real-time WebSocket communication for playing checkers online.

## 🚀 Features

- ✅ REST API for room management
- ✅ Real-time multiplayer with Socket.io
- ✅ Complete checkers game logic
- ✅ Turn-based gameplay
- ✅ Move validation
- ✅ King promotion
- ✅ Win condition detection
- ✅ Player disconnect handling

## 📋 Prerequisites

- Node.js (v14 or higher)
- npm or yarn

## 🛠️ Installation

```bash
# Install dependencies
npm install
```

## 🏃 Running the Server

### Development Mode (with auto-restart)
```bash
npm run dev
```

### Production Mode
```bash
npm start
```

Server will start on `http://localhost:5000`

## 📡 Testing the Server

### 1. Health Check
```bash
curl http://localhost:5000/api/health
```

### 2. Create a Room
```bash
curl -X POST http://localhost:5000/api/rooms/create
```

### 3. Use the Test Client
Open `test-client.html` in your browser to test Socket.io connections.

### 4. Use API Testing Tools
- Thunder Client (VS Code extension)
- Postman
- Insomnia

## 📚 API Documentation

See [API.md](./API.md) for complete API documentation including:
- REST endpoints
- Socket.io events
- Request/response examples
- Frontend integration guide

## 🎮 Game Rules (Checkers)

- 8x8 board
- Red pieces start at top (rows 0-2)
- Black pieces start at bottom (rows 5-7)
- Red moves first
- Regular pieces move diagonally forward one square
- Capture by jumping over opponent's piece
- Reach opposite end → promoted to King
- Kings can move diagonally in any direction
- Win by capturing all opponent pieces

## 📁 Project Structure

```
backend/
├── src/
│   └── index.js          # Main server file
├── .env                  # Environment variables
├── .gitignore            # Git ignore rules
├── package.json          # Dependencies
├── API.md                # API documentation
├── README.md             # This file
└── test-client.html      # Test client
```

## 🔧 Environment Variables

Create a `.env` file:

```
PORT=5000
NODE_ENV=development
```

## 🐛 Debugging

Enable debug logs:
```bash
DEBUG=socket.io* npm run dev
```

## 🤝 Collaboration with Frontend

### Your friend's frontend should:

1. **Connect to Socket.io:**
```javascript
import io from 'socket.io-client';
const socket = io('http://localhost:5000');
```

2. **Create/Join rooms using REST API:**
```javascript
const res = await fetch('http://localhost:5000/api/rooms/create', { 
  method: 'POST' 
});
const { roomId } = await res.json();
```

3. **Join via Socket:**
```javascript
socket.emit('joinRoom', { roomId, playerName: 'Alice' });
```

4. **Listen for game events:**
```javascript
socket.on('moveMade', (data) => {
  updateBoard(data.gameState.board);
});
```

See [API.md](./API.md) for complete integration examples.

## 📝 Next Steps

- [ ] Add database (MongoDB/PostgreSQL)
- [ ] Add user authentication
- [ ] Add matchmaking queue
- [ ] Add game history/replay
- [ ] Add chat system
- [ ] Add spectator mode
- [ ] Add multiple game types (chess, etc.)

## 🚀 Deployment

### Deploy to Heroku
```bash
heroku create
git push heroku main
```

### Deploy to Railway
```bash
railway up
```

## 📄 License

ISC

## 👥 Authors

Backend Developer: [Your Name]
Frontend Developer: [Friend's Name]
