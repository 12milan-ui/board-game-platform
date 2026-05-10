const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
require('dotenv').config();

const app = express();
const server = http.createServer(app);

// CORS - Allow frontend to connect later
const io = new Server(server, {
  cors: {
    origin: "*", // Change to specific URL in production
    methods: ["GET", "POST"]
  }
});

// Middleware
app.use(cors());
app.use(express.json());

// In-memory storage (replace with database later)
const rooms = new Map();

// REST API Routes
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'Server is running!',
    timestamp: new Date(),
    activeRooms: rooms.size
  });
});

app.post('/api/rooms/create', (req, res) => {
  const roomId = Math.random().toString(36).substring(7);
  const room = {
    id: roomId,
    players: [],
    gameState: initializeGame(),
    createdAt: new Date(),
    status: 'waiting'
  };
  
  rooms.set(roomId, room);
  console.log(`Room created: ${roomId}`);
  res.json({ roomId, room });
});

app.get('/api/rooms', (req, res) => {
  const roomList = Array.from(rooms.values()).map(room => ({
    id: room.id,
    playerCount: room.players.length,
    status: room.status,
    createdAt: room.createdAt
  }));
  res.json({ rooms: roomList, total: roomList.length });
});

app.get('/api/rooms/:roomId', (req, res) => {
  const room = rooms.get(req.params.roomId);
  if (!room) {
    return res.status(404).json({ error: 'Room not found' });
  }
  res.json(room);
});

app.delete('/api/rooms/:roomId', (req, res) => {
  const roomId = req.params.roomId;
  if (rooms.has(roomId)) {
    rooms.delete(roomId);
    res.json({ message: 'Room deleted', roomId });
  } else {
    res.status(404).json({ error: 'Room not found' });
  }
});

// Socket.io Events
io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  socket.on('joinRoom', ({ roomId, playerName }) => {
    const room = rooms.get(roomId);
    if (!room) {
      socket.emit('error', { message: 'Room not found' });
      return;
    }

    if (room.players.length >= 2) {
      socket.emit('error', { message: 'Room is full' });
      return;
    }

    // Assign player color
    const playerColor = room.players.length === 0 ? 'red' : 'black';

    // Add player to room
    const player = {
      id: socket.id,
      name: playerName,
      color: playerColor
    };
    room.players.push(player);
    socket.join(roomId);

    console.log(`${playerName} joined room ${roomId} as ${playerColor}`);

    // Notify all players in room
    io.to(roomId).emit('playerJoined', {
      players: room.players,
      message: `${playerName} joined the game as ${playerColor}`,
      newPlayer: player
    });

    // Start game if 2 players
    if (room.players.length === 2) {
      room.status = 'playing';
      io.to(roomId).emit('gameStarted', {
        message: 'Game started! Red goes first.',
        gameState: room.gameState
      });
    }

    // Send current game state
    socket.emit('gameState', room.gameState);
  });

  socket.on('makeMove', ({ roomId, move }) => {
    const room = rooms.get(roomId);
    if (!room) {
      socket.emit('error', { message: 'Room not found' });
      return;
    }

    // Find player making the move
    const player = room.players.find(p => p.id === socket.id);
    if (!player) {
      socket.emit('error', { message: 'You are not in this room' });
      return;
    }

    // Check if it's player's turn
    if (room.gameState.currentTurn !== player.color) {
      socket.emit('invalidMove', { message: 'Not your turn!' });
      return;
    }

    // Validate and process move
    const isValidMove = validateMove(room.gameState, move, player.color);
    if (isValidMove) {
      room.gameState = applyMove(room.gameState, move);
      
      // Switch turn
      room.gameState.currentTurn = player.color === 'red' ? 'black' : 'red';
      
      console.log(`Move made in room ${roomId}:`, move);

      // Broadcast to all players
      io.to(roomId).emit('moveMade', {
        gameState: room.gameState,
        move,
        player: player.name
      });

      // Check for win condition
      const winner = checkWinCondition(room.gameState);
      if (winner) {
        room.status = 'finished';
        io.to(roomId).emit('gameOver', {
          winner: winner,
          message: `${winner} wins!`
        });
      }
    } else {
      socket.emit('invalidMove', { message: 'Invalid move' });
    }
  });

  socket.on('leaveRoom', ({ roomId }) => {
    handlePlayerLeave(socket, roomId);
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
    // Find and handle all rooms this player was in
    rooms.forEach((room, roomId) => {
      const playerIndex = room.players.findIndex(p => p.id === socket.id);
      if (playerIndex !== -1) {
        handlePlayerLeave(socket, roomId);
      }
    });
  });
});

// Helper Functions
function handlePlayerLeave(socket, roomId) {
  const room = rooms.get(roomId);
  if (!room) return;

  const playerIndex = room.players.findIndex(p => p.id === socket.id);
  if (playerIndex === -1) return;

  const player = room.players[playerIndex];
  room.players.splice(playerIndex, 1);
  socket.leave(roomId);

  console.log(`${player.name} left room ${roomId}`);

  // Notify other players
  io.to(roomId).emit('playerLeft', {
    players: room.players,
    message: `${player.name} left the game`
  });

  // Delete room if empty
  if (room.players.length === 0) {
    rooms.delete(roomId);
    console.log(`Room ${roomId} deleted (empty)`);
  }
}

function initializeGame() {
  return {
    board: createInitialBoard(),
    currentTurn: 'red',
    status: 'waiting',
    moveHistory: []
  };
}

function createInitialBoard() {
  // 8x8 checkers board
  // null = empty, 'r' = red, 'b' = black, 'R' = red king, 'B' = black king
  const board = Array(8).fill(null).map(() => Array(8).fill(null));
  
  // Place red pieces (top 3 rows)
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 8; col++) {
      if ((row + col) % 2 === 1) {
        board[row][col] = 'r';
      }
    }
  }
  
  // Place black pieces (bottom 3 rows)
  for (let row = 5; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      if ((row + col) % 2 === 1) {
        board[row][col] = 'b';
      }
    }
  }
  
  return board;
}

function validateMove(gameState, move, playerColor) {
  const { from, to } = move;
  const { board } = gameState;
  
  // Basic validation
  if (!from || !to) return false;
  if (from.row < 0 || from.row >= 8 || from.col < 0 || from.col >= 8) return false;
  if (to.row < 0 || to.row >= 8 || to.col < 0 || to.col >= 8) return false;
  
  const piece = board[from.row][from.col];
  if (!piece) return false;
  
  // Check if piece belongs to current player
  const pieceColor = piece.toLowerCase();
  if (pieceColor !== playerColor.charAt(0)) return false;
  
  // Check if destination is empty
  if (board[to.row][to.col] !== null) return false;
  
  // Check if moving to dark square
  if ((to.row + to.col) % 2 === 0) return false;
  
  const rowDiff = to.row - from.row;
  const colDiff = Math.abs(to.col - from.col);
  
  // Regular piece movement
  if (piece === 'r') {
    // Red moves down (increasing row)
    if (rowDiff === 1 && colDiff === 1) return true;
    // Capture move
    if (rowDiff === 2 && colDiff === 2) {
      const midRow = from.row + 1;
      const midCol = from.col + (to.col > from.col ? 1 : -1);
      const capturedPiece = board[midRow][midCol];
      return capturedPiece && capturedPiece.toLowerCase() === 'b';
    }
  } else if (piece === 'b') {
    // Black moves up (decreasing row)
    if (rowDiff === -1 && colDiff === 1) return true;
    // Capture move
    if (rowDiff === -2 && colDiff === 2) {
      const midRow = from.row - 1;
      const midCol = from.col + (to.col > from.col ? 1 : -1);
      const capturedPiece = board[midRow][midCol];
      return capturedPiece && capturedPiece.toLowerCase() === 'r';
    }
  } else if (piece === 'R' || piece === 'B') {
    // Kings can move in any direction
    if (Math.abs(rowDiff) === 1 && colDiff === 1) return true;
    // King capture
    if (Math.abs(rowDiff) === 2 && colDiff === 2) {
      const midRow = from.row + (rowDiff > 0 ? 1 : -1);
      const midCol = from.col + (to.col > from.col ? 1 : -1);
      const capturedPiece = board[midRow][midCol];
      if (!capturedPiece) return false;
      // Can capture opposite color
      const kingColor = piece === 'R' ? 'r' : 'b';
      const opponentColor = kingColor === 'r' ? 'b' : 'r';
      return capturedPiece.toLowerCase() === opponentColor;
    }
  }
  
  return false;
}

function applyMove(gameState, move) {
  const { from, to } = move;
  const newBoard = gameState.board.map(row => [...row]);
  
  const piece = newBoard[from.row][from.col];
  newBoard[to.row][to.col] = piece;
  newBoard[from.row][from.col] = null;
  
  // Handle capture
  const rowDiff = to.row - from.row;
  if (Math.abs(rowDiff) === 2) {
    const midRow = from.row + (rowDiff > 0 ? 1 : -1);
    const midCol = from.col + (to.col > from.col ? 1 : -1);
    newBoard[midRow][midCol] = null; // Remove captured piece
  }
  
  // Promote to king if reached opposite end
  if (piece === 'r' && to.row === 7) {
    newBoard[to.row][to.col] = 'R';
  } else if (piece === 'b' && to.row === 0) {
    newBoard[to.row][to.col] = 'B';
  }
  
  return {
    ...gameState,
    board: newBoard,
    moveHistory: [...gameState.moveHistory, move]
  };
}

function checkWinCondition(gameState) {
  const { board } = gameState;
  let redPieces = 0;
  let blackPieces = 0;
  
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const piece = board[row][col];
      if (piece && piece.toLowerCase() === 'r') redPieces++;
      if (piece && piece.toLowerCase() === 'b') blackPieces++;
    }
  }
  
  if (redPieces === 0) return 'black';
  if (blackPieces === 0) return 'red';
  
  return null; // No winner yet
}

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`📡 Socket.io ready for connections`);
});
