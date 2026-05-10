# Board Game Platform API Documentation

## Base URL
`http://localhost:5000`

---

## REST API Endpoints

### 1. Health Check
**GET** `/api/health`

Check if server is running.

**Response:**
```json
{
  "status": "Server is running!",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "activeRooms": 3
}
```

---

### 2. Create Room
**POST** `/api/rooms/create`

Create a new game room.

**Response:**
```json
{
  "roomId": "abc123",
  "room": {
    "id": "abc123",
    "players": [],
    "gameState": { ... },
    "createdAt": "2024-01-15T10:30:00.000Z",
    "status": "waiting"
  }
}
```

---

### 3. Get All Rooms
**GET** `/api/rooms`

Get list of all active rooms.

**Response:**
```json
{
  "rooms": [
    {
      "id": "abc123",
      "playerCount": 1,
      "status": "waiting",
      "createdAt": "2024-01-15T10:30:00.000Z"
    }
  ],
  "total": 1
}
```

---

### 4. Get Room Details
**GET** `/api/rooms/:roomId`

Get details of a specific room.

**Response:**
```json
{
  "id": "abc123",
  "players": [
    {
      "id": "socket123",
      "name": "Player1",
      "color": "red"
    }
  ],
  "gameState": { ... },
  "createdAt": "2024-01-15T10:30:00.000Z",
  "status": "waiting"
}
```

---

### 5. Delete Room
**DELETE** `/api/rooms/:roomId`

Delete a room.

**Response:**
```json
{
  "message": "Room deleted",
  "roomId": "abc123"
}
```

---

## Socket.io Events

### Client → Server

#### 1. Join Room
```javascript
socket.emit('joinRoom', {
  roomId: 'abc123',
  playerName: 'Alice'
});
```

#### 2. Make Move
```javascript
socket.emit('makeMove', {
  roomId: 'abc123',
  move: {
    from: { row: 2, col: 1 },
    to: { row: 3, col: 2 }
  }
});
```

#### 3. Leave Room
```javascript
socket.emit('leaveRoom', {
  roomId: 'abc123'
});
```

---

### Server → Client

#### 1. Player Joined
```javascript
socket.on('playerJoined', (data) => {
  // data = {
  //   players: [...],
  //   message: "Alice joined the game as red",
  //   newPlayer: { id, name, color }
  // }
});
```

#### 2. Game Started
```javascript
socket.on('gameStarted', (data) => {
  // data = {
  //   message: "Game started! Red goes first.",
  //   gameState: { ... }
  // }
});
```

#### 3. Game State
```javascript
socket.on('gameState', (gameState) => {
  // gameState = {
  //   board: 8x8 array,
  //   currentTurn: 'red' or 'black',
  //   status: 'waiting' or 'playing',
  //   moveHistory: [...]
  // }
});
```

#### 4. Move Made
```javascript
socket.on('moveMade', (data) => {
  // data = {
  //   gameState: { ... },
  //   move: { from, to },
  //   player: "Alice"
  // }
});
```

#### 5. Invalid Move
```javascript
socket.on('invalidMove', (data) => {
  // data = { message: "Invalid move" }
});
```

#### 6. Player Left
```javascript
socket.on('playerLeft', (data) => {
  // data = {
  //   players: [...],
  //   message: "Alice left the game"
  // }
});
```

#### 7. Game Over
```javascript
socket.on('gameOver', (data) => {
  // data = {
  //   winner: 'red' or 'black',
  //   message: "red wins!"
  // }
});
```

#### 8. Error
```javascript
socket.on('error', (data) => {
  // data = { message: "Room not found" }
});
```

---

## Game State Structure

```javascript
{
  board: [
    ['r', null, 'r', null, 'r', null, 'r', null],
    [null, 'r', null, 'r', null, 'r', null, 'r'],
    ['r', null, 'r', null, 'r', null, 'r', null],
    [null, null, null, null, null, null, null, null],
    [null, null, null, null, null, null, null, null],
    [null, 'b', null, 'b', null, 'b', null, 'b'],
    ['b', null, 'b', null, 'b', null, 'b', null],
    [null, 'b', null, 'b', null, 'b', null, 'b']
  ],
  currentTurn: 'red',
  status: 'playing',
  moveHistory: []
}
```

**Piece Values:**
- `'r'` = red piece
- `'b'` = black piece
- `'R'` = red king
- `'B'` = black king
- `null` = empty square

---

## Example Frontend Usage

### Connect to Socket
```javascript
import io from 'socket.io-client';

const socket = io('http://localhost:5000');

socket.on('connect', () => {
  console.log('Connected to server');
});
```

### Create and Join Room
```javascript
// 1. Create room
const response = await fetch('http://localhost:5000/api/rooms/create', {
  method: 'POST'
});
const { roomId } = await response.json();

// 2. Join room
socket.emit('joinRoom', {
  roomId: roomId,
  playerName: 'Alice'
});

// 3. Listen for updates
socket.on('playerJoined', (data) => {
  console.log(data.message);
  updatePlayerList(data.players);
});

socket.on('gameStarted', (data) => {
  console.log('Game has started!');
  renderBoard(data.gameState.board);
});
```

### Make a Move
```javascript
socket.emit('makeMove', {
  roomId: currentRoomId,
  move: {
    from: { row: 2, col: 1 },
    to: { row: 3, col: 2 }
  }
});

socket.on('moveMade', (data) => {
  renderBoard(data.gameState.board);
  updateTurnIndicator(data.gameState.currentTurn);
});

socket.on('invalidMove', (data) => {
  alert(data.message);
});
```

---

## Error Handling

Always handle these error cases:
- Room not found
- Room is full (max 2 players)
- Invalid move
- Not your turn
- Connection errors

```javascript
socket.on('error', (data) => {
  console.error('Server error:', data.message);
  alert(data.message);
});
```

---

## Testing

Use the included `test-client.html` file to test the backend without needing the full frontend.

```bash
# Open in browser
open test-client.html
```
