const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
require('dotenv').config();

const app = express();
const server = http.createServer(app);

// CORS - Allow frontend to connect
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
    status: 'Chess server running!',
    timestamp: new Date(),
    activeRooms: rooms.size,
    game: 'chess'
  });
});

app.post('/api/rooms/create', (req, res) => {
  const roomId = Math.random().toString(36).substring(7);
  const room = {
    id: roomId,
    players: [],
    gameState: initializeChessGame(),
    createdAt: new Date(),
    status: 'waiting',
    timeControl: req.body.timeControl || '10+0'
  };
  
  rooms.set(roomId, room);
  console.log(`Chess room created: ${roomId}`);
  res.json({ roomId, room });
});

app.get('/api/rooms', (req, res) => {
  const roomList = Array.from(rooms.values()).map(room => ({
    id: room.id,
    playerCount: room.players.length,
    status: room.status,
    timeControl: room.timeControl,
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
    const playerColor = room.players.length === 0 ? 'white' : 'black';

    const player = {
      id: socket.id,
      name: playerName,
      color: playerColor,
      timeRemaining: getTimeFromControl(room.timeControl)
    };
    room.players.push(player);
    socket.join(roomId);

    console.log(`${playerName} joined room ${roomId} as ${playerColor}`);

    io.to(roomId).emit('playerJoined', {
      players: room.players,
      message: `${playerName} joined as ${playerColor}`,
      newPlayer: player
    });

    // Start game if 2 players
    if (room.players.length === 2) {
      room.status = 'playing';
      room.startTime = Date.now();
      io.to(roomId).emit('gameStarted', {
        message: 'Game started! White moves first.',
        gameState: room.gameState,
        players: room.players
      });
    }

    socket.emit('gameState', room.gameState);
  });

  socket.on('makeMove', ({ roomId, move }) => {
    const room = rooms.get(roomId);
    if (!room) {
      socket.emit('error', { message: 'Room not found' });
      return;
    }

    const player = room.players.find(p => p.id === socket.id);
    if (!player) {
      socket.emit('error', { message: 'You are not in this room' });
      return;
    }

    if (room.gameState.currentTurn !== player.color) {
      socket.emit('invalidMove', { message: 'Not your turn!' });
      return;
    }

    // Validate and process move
    const moveResult = processMove(room.gameState, move, player.color);
    
    if (moveResult.valid) {
      room.gameState = moveResult.newState;
      
      console.log(`Move made in room ${roomId}:`, move);

      io.to(roomId).emit('moveMade', {
        gameState: room.gameState,
        move,
        player: player.name,
        moveNotation: moveResult.notation
      });

      // Check game end conditions
      if (room.gameState.gameOver) {
        room.status = 'finished';
        io.to(roomId).emit('gameOver', {
          result: room.gameState.result,
          reason: room.gameState.gameOverReason,
          message: getGameOverMessage(room.gameState)
        });
      }
    } else {
      socket.emit('invalidMove', { 
        message: moveResult.reason || 'Invalid move',
        move 
      });
    }
  });

  socket.on('offerDraw', ({ roomId }) => {
    const room = rooms.get(roomId);
    if (!room) return;
    
    const player = room.players.find(p => p.id === socket.id);
    if (!player) return;

    socket.to(roomId).emit('drawOffered', { 
      player: player.name 
    });
  });

  socket.on('acceptDraw', ({ roomId }) => {
    const room = rooms.get(roomId);
    if (!room) return;

    room.gameState.gameOver = true;
    room.gameState.result = 'draw';
    room.gameState.gameOverReason = 'Draw by agreement';
    room.status = 'finished';

    io.to(roomId).emit('gameOver', {
      result: 'draw',
      reason: 'Draw by agreement',
      message: 'Game drawn by mutual agreement'
    });
  });

  socket.on('resign', ({ roomId }) => {
    const room = rooms.get(roomId);
    if (!room) return;

    const player = room.players.find(p => p.id === socket.id);
    if (!player) return;

    const winner = player.color === 'white' ? 'black' : 'white';
    room.gameState.gameOver = true;
    room.gameState.result = winner;
    room.gameState.gameOverReason = `${player.color} resigned`;
    room.status = 'finished';

    io.to(roomId).emit('gameOver', {
      result: winner,
      reason: `${player.color} resigned`,
      message: `${player.name} resigned. ${winner} wins!`
    });
  });

  socket.on('leaveRoom', ({ roomId }) => {
    handlePlayerLeave(socket, roomId);
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
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

  io.to(roomId).emit('playerLeft', {
    players: room.players,
    message: `${player.name} left the game`
  });

  // Delete room if empty
  if (room.players.length === 0) {
    rooms.delete(roomId);
    console.log(`Room ${roomId} deleted (empty)`);
  } else if (room.status === 'playing') {
    // If game was in progress, opponent wins by abandonment
    const winner = player.color === 'white' ? 'black' : 'white';
    room.gameState.gameOver = true;
    room.gameState.result = winner;
    room.status = 'finished';
    io.to(roomId).emit('gameOver', {
      result: winner,
      reason: 'Opponent left',
      message: `${player.name} left. You win by abandonment!`
    });
  }
}

function getTimeFromControl(control) {
  const [minutes] = control.split('+').map(Number);
  return minutes * 60 * 1000; // milliseconds
}

function initializeChessGame() {
  return {
    board: createInitialChessBoard(),
    currentTurn: 'white',
    moveHistory: [],
    capturedPieces: { white: [], black: [] },
    castlingRights: {
      whiteKingside: true,
      whiteQueenside: true,
      blackKingside: true,
      blackQueenside: true
    },
    enPassantTarget: null,
    halfMoveClock: 0,
    fullMoveNumber: 1,
    gameOver: false,
    result: null,
    gameOverReason: null,
    check: false,
    checkmate: false,
    stalemate: false
  };
}

function createInitialChessBoard() {
  return [
    ['bR', 'bN', 'bB', 'bQ', 'bK', 'bB', 'bN', 'bR'],
    ['bP', 'bP', 'bP', 'bP', 'bP', 'bP', 'bP', 'bP'],
    [null, null, null, null, null, null, null, null],
    [null, null, null, null, null, null, null, null],
    [null, null, null, null, null, null, null, null],
    [null, null, null, null, null, null, null, null],
    ['wP', 'wP', 'wP', 'wP', 'wP', 'wP', 'wP', 'wP'],
    ['wR', 'wN', 'wB', 'wQ', 'wK', 'wB', 'wN', 'wR']
  ];
}

function processMove(gameState, move, playerColor) {
  const { from, to } = move;
  
  // Basic validation
  if (!isValidPosition(from) || !isValidPosition(to)) {
    return { valid: false, reason: 'Invalid position' };
  }

  const piece = gameState.board[from.row][from.col];
  if (!piece) {
    return { valid: false, reason: 'No piece at source' };
  }

  const pieceColor = piece[0] === 'w' ? 'white' : 'black';
  if (pieceColor !== playerColor) {
    return { valid: false, reason: 'Not your piece' };
  }

  // Get legal moves for this piece
  const legalMoves = getLegalMoves(gameState, from);
  const isLegal = legalMoves.some(m => m.row === to.row && m.col === to.col);

  if (!isLegal) {
    return { valid: false, reason: 'Illegal move for this piece' };
  }

  // Create new board state
  const newBoard = gameState.board.map(row => [...row]);
  const targetPiece = newBoard[to.row][to.col];
  
  newBoard[to.row][to.col] = piece;
  newBoard[from.row][from.col] = null;

  // Handle captures
  if (targetPiece) {
    const capturedColor = targetPiece[0] === 'w' ? 'white' : 'black';
    gameState.capturedPieces[capturedColor].push(targetPiece);
  }

  // Handle castling
  if (piece[1] === 'K' && Math.abs(to.col - from.col) === 2) {
    const rookFromCol = to.col > from.col ? 7 : 0;
    const rookToCol = to.col > from.col ? to.col - 1 : to.col + 1;
    newBoard[from.row][rookToCol] = newBoard[from.row][rookFromCol];
    newBoard[from.row][rookFromCol] = null;
  }

  // Handle pawn promotion
  if (piece[1] === 'P') {
    if ((pieceColor === 'white' && to.row === 0) || (pieceColor === 'black' && to.row === 7)) {
      newBoard[to.row][to.col] = pieceColor[0] + 'Q'; // Auto-promote to queen
    }
  }

  // Update castling rights
  const newCastlingRights = { ...gameState.castlingRights };
  if (piece[1] === 'K') {
    if (pieceColor === 'white') {
      newCastlingRights.whiteKingside = false;
      newCastlingRights.whiteQueenside = false;
    } else {
      newCastlingRights.blackKingside = false;
      newCastlingRights.blackQueenside = false;
    }
  }
  if (piece[1] === 'R') {
    if (from.row === 7 && from.col === 0) newCastlingRights.whiteQueenside = false;
    if (from.row === 7 && from.col === 7) newCastlingRights.whiteKingside = false;
    if (from.row === 0 && from.col === 0) newCastlingRights.blackQueenside = false;
    if (from.row === 0 && from.col === 7) newCastlingRights.blackKingside = false;
  }

  const newState = {
    ...gameState,
    board: newBoard,
    currentTurn: playerColor === 'white' ? 'black' : 'white',
    moveHistory: [...gameState.moveHistory, move],
    castlingRights: newCastlingRights,
    halfMoveClock: targetPiece || piece[1] === 'P' ? 0 : gameState.halfMoveClock + 1,
    fullMoveNumber: playerColor === 'black' ? gameState.fullMoveNumber + 1 : gameState.fullMoveNumber
  };

  // Check for check/checkmate/stalemate
  const opponentColor = playerColor === 'white' ? 'black' : 'white';
  const inCheck = isKingInCheck(newState, opponentColor);
  newState.check = inCheck;

  if (inCheck) {
    const hasLegalMoves = hasAnyLegalMoves(newState, opponentColor);
    if (!hasLegalMoves) {
      newState.checkmate = true;
      newState.gameOver = true;
      newState.result = playerColor;
      newState.gameOverReason = 'Checkmate';
    }
  } else {
    const hasLegalMoves = hasAnyLegalMoves(newState, opponentColor);
    if (!hasLegalMoves) {
      newState.stalemate = true;
      newState.gameOver = true;
      newState.result = 'draw';
      newState.gameOverReason = 'Stalemate';
    }
  }

  // Check for draw by insufficient material
  if (isInsufficientMaterial(newState)) {
    newState.gameOver = true;
    newState.result = 'draw';
    newState.gameOverReason = 'Insufficient material';
  }

  const notation = getMoveNotation(piece, from, to, targetPiece, newState);

  return { valid: true, newState, notation };
}

function isValidPosition(pos) {
  return pos && pos.row >= 0 && pos.row < 8 && pos.col >= 0 && pos.col < 8;
}

function getLegalMoves(gameState, from) {
  const piece = gameState.board[from.row][from.col];
  if (!piece) return [];

  const pieceType = piece[1];
  const pieceColor = piece[0] === 'w' ? 'white' : 'black';
  const moves = [];

  switch (pieceType) {
    case 'P':
      moves.push(...getPawnMoves(gameState, from, pieceColor));
      break;
    case 'N':
      moves.push(...getKnightMoves(gameState, from, pieceColor));
      break;
    case 'B':
      moves.push(...getBishopMoves(gameState, from, pieceColor));
      break;
    case 'R':
      moves.push(...getRookMoves(gameState, from, pieceColor));
      break;
    case 'Q':
      moves.push(...getQueenMoves(gameState, from, pieceColor));
      break;
    case 'K':
      moves.push(...getKingMoves(gameState, from, pieceColor));
      break;
  }

  // Filter out moves that would leave king in check
  return moves.filter(to => !wouldBeInCheck(gameState, from, to, pieceColor));
}

function getPawnMoves(gameState, from, color) {
  const moves = [];
  const direction = color === 'white' ? -1 : 1;
  const startRow = color === 'white' ? 6 : 1;

  // Forward move
  const oneForward = { row: from.row + direction, col: from.col };
  if (isValidPosition(oneForward) && !gameState.board[oneForward.row][oneForward.col]) {
    moves.push(oneForward);

    // Double move from start
    if (from.row === startRow) {
      const twoForward = { row: from.row + 2 * direction, col: from.col };
      if (!gameState.board[twoForward.row][twoForward.col]) {
        moves.push(twoForward);
      }
    }
  }

  // Captures
  const captureOffsets = [-1, 1];
  for (const offset of captureOffsets) {
    const capturePos = { row: from.row + direction, col: from.col + offset };
    if (isValidPosition(capturePos)) {
      const targetPiece = gameState.board[capturePos.row][capturePos.col];
      if (targetPiece && targetPiece[0] !== color[0]) {
        moves.push(capturePos);
      }
    }
  }

  return moves;
}

function getKnightMoves(gameState, from, color) {
  const moves = [];
  const offsets = [
    [-2, -1], [-2, 1], [-1, -2], [-1, 2],
    [1, -2], [1, 2], [2, -1], [2, 1]
  ];

  for (const [dr, dc] of offsets) {
    const to = { row: from.row + dr, col: from.col + dc };
    if (isValidPosition(to)) {
      const targetPiece = gameState.board[to.row][to.col];
      if (!targetPiece || targetPiece[0] !== color[0]) {
        moves.push(to);
      }
    }
  }

  return moves;
}

function getBishopMoves(gameState, from, color) {
  return getSlidingMoves(gameState, from, color, [[-1,-1], [-1,1], [1,-1], [1,1]]);
}

function getRookMoves(gameState, from, color) {
  return getSlidingMoves(gameState, from, color, [[-1,0], [1,0], [0,-1], [0,1]]);
}

function getQueenMoves(gameState, from, color) {
  return getSlidingMoves(gameState, from, color, [
    [-1,-1], [-1,0], [-1,1], [0,-1], [0,1], [1,-1], [1,0], [1,1]
  ]);
}

function getSlidingMoves(gameState, from, color, directions) {
  const moves = [];

  for (const [dr, dc] of directions) {
    let row = from.row + dr;
    let col = from.col + dc;

    while (row >= 0 && row < 8 && col >= 0 && col < 8) {
      const targetPiece = gameState.board[row][col];
      
      if (!targetPiece) {
        moves.push({ row, col });
      } else {
        if (targetPiece[0] !== color[0]) {
          moves.push({ row, col });
        }
        break;
      }

      row += dr;
      col += dc;
    }
  }

  return moves;
}

function getKingMoves(gameState, from, color) {
  const moves = [];
  const offsets = [
    [-1,-1], [-1,0], [-1,1], [0,-1], [0,1], [1,-1], [1,0], [1,1]
  ];

  for (const [dr, dc] of offsets) {
    const to = { row: from.row + dr, col: from.col + dc };
    if (isValidPosition(to)) {
      const targetPiece = gameState.board[to.row][to.col];
      if (!targetPiece || targetPiece[0] !== color[0]) {
        moves.push(to);
      }
    }
  }

  // Castling
  const row = color === 'white' ? 7 : 0;
  if (from.row === row && from.col === 4) {
    // Kingside
    const canCastleKingside = color === 'white' 
      ? gameState.castlingRights.whiteKingside 
      : gameState.castlingRights.blackKingside;
    
    if (canCastleKingside && 
        !gameState.board[row][5] && 
        !gameState.board[row][6] &&
        gameState.board[row][7] === (color[0] + 'R')) {
      moves.push({ row, col: 6 });
    }

    // Queenside
    const canCastleQueenside = color === 'white'
      ? gameState.castlingRights.whiteQueenside
      : gameState.castlingRights.blackQueenside;
    
    if (canCastleQueenside && 
        !gameState.board[row][3] && 
        !gameState.board[row][2] &&
        !gameState.board[row][1] &&
        gameState.board[row][0] === (color[0] + 'R')) {
      moves.push({ row, col: 2 });
    }
  }

  return moves;
}

function wouldBeInCheck(gameState, from, to, color) {
  const newBoard = gameState.board.map(row => [...row]);
  newBoard[to.row][to.col] = newBoard[from.row][from.col];
  newBoard[from.row][from.col] = null;

  const testState = { ...gameState, board: newBoard };
  return isKingInCheck(testState, color);
}

function isKingInCheck(gameState, color) {
  // Find king position
  let kingPos = null;
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const piece = gameState.board[r][c];
      if (piece === color[0] + 'K') {
        kingPos = { row: r, col: c };
        break;
      }
    }
    if (kingPos) break;
  }

  if (!kingPos) return false;

  // Check if any opponent piece can attack the king
  const opponentColor = color === 'white' ? 'black' : 'white';
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const piece = gameState.board[r][c];
      if (piece && piece[0] === opponentColor[0]) {
        const moves = getLegalMovesWithoutCheckTest(gameState, { row: r, col: c }, opponentColor);
        if (moves.some(m => m.row === kingPos.row && m.col === kingPos.col)) {
          return true;
        }
      }
    }
  }

  return false;
}

function getLegalMovesWithoutCheckTest(gameState, from, color) {
  const piece = gameState.board[from.row][from.col];
  if (!piece) return [];

  const pieceType = piece[1];

  switch (pieceType) {
    case 'P': return getPawnMoves(gameState, from, color);
    case 'N': return getKnightMoves(gameState, from, color);
    case 'B': return getBishopMoves(gameState, from, color);
    case 'R': return getRookMoves(gameState, from, color);
    case 'Q': return getQueenMoves(gameState, from, color);
    case 'K': return getKingMoves(gameState, from, color).filter(to => {
      const testBoard = gameState.board.map(row => [...row]);
      testBoard[to.row][to.col] = testBoard[from.row][from.col];
      testBoard[from.row][from.col] = null;
      const testState = { ...gameState, board: testBoard };
      return !isSquareAttacked(testState, to, color === 'white' ? 'black' : 'white');
    });
    default: return [];
  }
}

function isSquareAttacked(gameState, square, byColor) {
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const piece = gameState.board[r][c];
      if (piece && piece[0] === byColor[0]) {
        const moves = getLegalMovesWithoutCheckTest(gameState, { row: r, col: c }, byColor);
        if (moves.some(m => m.row === square.row && m.col === square.col)) {
          return true;
        }
      }
    }
  }
  return false;
}

function hasAnyLegalMoves(gameState, color) {
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const piece = gameState.board[r][c];
      if (piece && piece[0] === color[0]) {
        const moves = getLegalMoves(gameState, { row: r, col: c });
        if (moves.length > 0) return true;
      }
    }
  }
  return false;
}

function isInsufficientMaterial(gameState) {
  const pieces = [];
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      if (gameState.board[r][c]) {
        pieces.push(gameState.board[r][c]);
      }
    }
  }

  // King vs King
  if (pieces.length === 2) return true;

  // King + minor piece vs King
  if (pieces.length === 3) {
    const hasOnlyMinor = pieces.some(p => p[1] === 'B' || p[1] === 'N');
    return hasOnlyMinor;
  }

  return false;
}

function getMoveNotation(piece, from, to, captured, gameState) {
  const files = 'abcdefgh';
  const pieceSymbol = piece[1] === 'P' ? '' : piece[1];
  const captureSymbol = captured ? 'x' : '';
  const toSquare = files[to.col] + (8 - to.row);
  
  let notation = pieceSymbol + captureSymbol + toSquare;
  
  if (gameState.checkmate) {
    notation += '#';
  } else if (gameState.check) {
    notation += '+';
  }
  
  return notation;
}

function getGameOverMessage(gameState) {
  if (gameState.result === 'draw') {
    return `Game drawn: ${gameState.gameOverReason}`;
  } else {
    return `${gameState.result} wins by ${gameState.gameOverReason}!`;
  }
}

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`♟️  Chess server running on http://localhost:${PORT}`);
  console.log(`📡 Socket.io ready for chess games`);
});
