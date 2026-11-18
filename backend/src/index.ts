import express from "express";
import http from "http";
import cors from "cors";
import dotenv from "dotenv";
import jwt from "jsonwebtoken";
import { Server, Socket } from "socket.io";
import { Chess } from "chess.js";

dotenv.config();

const PORT = Number(process.env.PORT) || 4000;
const JWT_SECRET = process.env.JWT_SECRET || "chess-arena-dev-secret";

const app = express();
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

// In-memory store (backed by PostgreSQL via Prisma in production)
interface PlayerInfo {
  id: string;
  username: string;
  email?: string;
  isGuest: boolean;
  rating: number;
  socketId?: string;
}

interface ActiveGame {
  id: string;
  roomCode?: string;
  mode: "random" | "private";
  timeControl: string; // e.g. "5+0"
  baseMs: number;
  incrementMs: number;
  chess: Chess;
  white: PlayerInfo | null;
  black: PlayerInfo | null;
  whiteTimeMs: number;
  blackTimeMs: number;
  lastMoveAt: number | null;
  status: "waiting" | "active" | "completed";
  result?: string;
  endReason?: string;
  drawOfferBy?: "w" | "b" | null;
}

const users = new Map<string, PlayerInfo>();
const games = new Map<string, ActiveGame>();
const roomCodeToGameId = new Map<string, string>();
const matchmakingQueue: { socket: Socket; player: PlayerInfo; timeControl: string }[] = [];

function parseTimeControl(tc: string): { baseMs: number; incrementMs: number } {
  const [mins, inc] = tc.split("+").map((n) => parseInt(n, 10) || 0);
  return {
    baseMs: Math.max(1, mins) * 60 * 1000,
    incrementMs: Math.max(0, inc) * 1000,
  };
}

function generateRoomCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return roomCodeToGameId.has(code) ? generateRoomCode() : code;
}

function serializeGame(game: ActiveGame) {
  return {
    id: game.id,
    roomCode: game.roomCode,
    mode: game.mode,
    timeControl: game.timeControl,
    fen: game.chess.fen(),
    pgn: game.chess.pgn(),
    turn: game.chess.turn(),
    history: game.chess.history({ verbose: true }),
    white: game.white,
    black: game.black,
    whiteTimeMs: game.whiteTimeMs,
    blackTimeMs: game.blackTimeMs,
    status: game.status,
    result: game.result,
    endReason: game.endReason,
    inCheck: game.chess.inCheck(),
    drawOfferBy: game.drawOfferBy,
  };
}

// Health check
app.get("/health", (_req, res) => {
  res.json({ status: "ok", activeGames: games.size, queueLength: matchmakingQueue.length });
});

// Guest Login
app.post("/api/auth/guest", (req, res) => {
  const customName = typeof req.body?.username === "string" ? req.body.username.trim() : "";
  const id = `guest_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const username = customName || `Guest_${Math.floor(1000 + Math.random() * 9000)}`;
  const player: PlayerInfo = { id, username, isGuest: true, rating: 1200 };
  users.set(id, player);
  const token = jwt.sign({ id, username, isGuest: true }, JWT_SECRET, { expiresIn: "7d" });
  res.json({ user: player, token });
});

// Gmail Login (validates Gmail address & issues JWT; ready for Google OAuth2)
app.post("/api/auth/gmail", (req, res) => {
  const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
  const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
  if (!email || !email.endsWith("@gmail.com")) {
    return res.status(400).json({ error: "Please enter a valid @gmail.com address." });
  }
  const existing = Array.from(users.values()).find((u) => u.email === email);
  if (existing) {
    const token = jwt.sign({ id: existing.id, username: existing.username, isGuest: false }, JWT_SECRET, {
      expiresIn: "7d",
    });
    return res.json({ user: existing, token });
  }
  const id = `gmail_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const username = name || email.split("@")[0];
  const player: PlayerInfo = { id, username, email, isGuest: false, rating: 1200 };
  users.set(id, player);
  const token = jwt.sign({ id, username, isGuest: false }, JWT_SECRET, { expiresIn: "7d" });
  res.json({ user: player, token });
});

// Socket.io Real-time Chess Engine
io.on("connection", (socket) => {
  socket.on("matchmaking:join", ({ player, timeControl = "5+0" }: { player: PlayerInfo; timeControl: string }) => {
    // Remove if already in queue
    const existingIdx = matchmakingQueue.findIndex((q) => q.socket.id === socket.id);
    if (existingIdx !== -1) matchmakingQueue.splice(existingIdx, 1);

    // Find opponent with same timeControl
    const matchIdx = matchmakingQueue.findIndex((q) => q.timeControl === timeControl && q.player.id !== player.id);
    if (matchIdx !== -1) {
      const opponent = matchmakingQueue.splice(matchIdx, 1)[0];
      const { baseMs, incrementMs } = parseTimeControl(timeControl);
      const gameId = `game_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      const isWhiteFirst = Math.random() < 0.5;
      const white = isWhiteFirst ? { ...player, socketId: socket.id } : { ...opponent.player, socketId: opponent.socket.id };
      const black = isWhiteFirst ? { ...opponent.player, socketId: opponent.socket.id } : { ...player, socketId: socket.id };

      const game: ActiveGame = {
        id: gameId,
        mode: "random",
        timeControl,
        baseMs,
        incrementMs,
        chess: new Chess(),
        white,
        black,
        whiteTimeMs: baseMs,
        blackTimeMs: baseMs,
        lastMoveAt: Date.now(),
        status: "active",
      };

      games.set(gameId, game);
      socket.join(gameId);
      opponent.socket.join(gameId);
      io.to(gameId).emit("game:started", serializeGame(game));
    } else {
      matchmakingQueue.push({ socket, player: { ...player, socketId: socket.id }, timeControl });
      socket.emit("matchmaking:waiting", { timeControl });
    }
  });

  socket.on("matchmaking:leave", () => {
    const idx = matchmakingQueue.findIndex((q) => q.socket.id === socket.id);
    if (idx !== -1) matchmakingQueue.splice(idx, 1);
  });

  socket.on("room:create", ({ player, timeControl = "5+0" }: { player: PlayerInfo; timeControl: string }) => {
    const roomCode = generateRoomCode();
    const gameId = `game_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const { baseMs, incrementMs } = parseTimeControl(timeControl);

    const game: ActiveGame = {
      id: gameId,
      roomCode,
      mode: "private",
      timeControl,
      baseMs,
      incrementMs,
      chess: new Chess(),
      white: { ...player, socketId: socket.id },
      black: null,
      whiteTimeMs: baseMs,
      blackTimeMs: baseMs,
      lastMoveAt: null,
      status: "waiting",
    };

    games.set(gameId, game);
    roomCodeToGameId.set(roomCode, gameId);
    socket.join(gameId);
    socket.emit("room:created", serializeGame(game));
  });

  socket.on("room:join", ({ roomCode, player }: { roomCode: string; player: PlayerInfo }) => {
    const normalized = roomCode.trim().toUpperCase();
    const gameId = roomCodeToGameId.get(normalized);
    if (!gameId) {
      return socket.emit("room:error", { message: "Room not found. Check the code and try again." });
    }
    const game = games.get(gameId);
    if (!game) {
      return socket.emit("room:error", { message: "Game no longer exists." });
    }
    if (game.status !== "waiting" || game.black) {
      return socket.emit("room:error", { message: "Room is already full." });
    }

    game.black = { ...player, socketId: socket.id };
    game.status = "active";
    game.lastMoveAt = Date.now();
    socket.join(gameId);
    io.to(gameId).emit("game:started", serializeGame(game));
  });

  socket.on("game:move", ({ gameId, from, to, promotion = "q" }: { gameId: string; from: string; to: string; promotion?: string }) => {
    const game = games.get(gameId);
    if (!game || game.status !== "active") return;

    const turn = game.chess.turn();
    const now = Date.now();
    if (game.lastMoveAt) {
      const elapsed = now - game.lastMoveAt;
      if (turn === "w") {
        game.whiteTimeMs = Math.max(0, game.whiteTimeMs - elapsed);
        if (game.whiteTimeMs === 0) {
          game.status = "completed";
          game.result = "0-1";
          game.endReason = "timeout";
          io.to(gameId).emit("game:updated", serializeGame(game));
          return;
        }
      } else {
        game.blackTimeMs = Math.max(0, game.blackTimeMs - elapsed);
        if (game.blackTimeMs === 0) {
          game.status = "completed";
          game.result = "1-0";
          game.endReason = "timeout";
          io.to(gameId).emit("game:updated", serializeGame(game));
          return;
        }
      }
    }

    try {
      const move = game.chess.move({ from, to, promotion });
      if (!move) return;

      if (turn === "w") {
        game.whiteTimeMs += game.incrementMs;
      } else {
        game.blackTimeMs += game.incrementMs;
      }
      game.lastMoveAt = now;
      game.drawOfferBy = null;

      if (game.chess.isGameOver()) {
        game.status = "completed";
        if (game.chess.isCheckmate()) {
          game.result = turn === "w" ? "1-0" : "0-1";
          game.endReason = "checkmate";
        } else if (game.chess.isStalemate()) {
          game.result = "1/2-1/2";
          game.endReason = "stalemate";
        } else {
          game.result = "1/2-1/2";
          game.endReason = "draw";
        }
      }

      io.to(gameId).emit("game:updated", serializeGame(game));
    } catch {
      // Invalid move ignored
    }
  });

  socket.on("game:resign", ({ gameId, color }: { gameId: string; color: "w" | "b" }) => {
    const game = games.get(gameId);
    if (!game || game.status !== "active") return;
    game.status = "completed";
    game.result = color === "w" ? "0-1" : "1-0";
    game.endReason = "resignation";
    io.to(gameId).emit("game:updated", serializeGame(game));
  });

  socket.on("game:draw_offer", ({ gameId, color }: { gameId: string; color: "w" | "b" }) => {
    const game = games.get(gameId);
    if (!game || game.status !== "active") return;
    game.drawOfferBy = color;
    io.to(gameId).emit("game:updated", serializeGame(game));
  });

  socket.on("game:draw_accept", ({ gameId }: { gameId: string }) => {
    const game = games.get(gameId);
    if (!game || game.status !== "active") return;
    game.status = "completed";
    game.result = "1/2-1/2";
    game.endReason = "draw";
    io.to(gameId).emit("game:updated", serializeGame(game));
  });

  socket.on("game:chat", ({ gameId, sender, text }: { gameId: string; sender: string; text: string }) => {
    if (!text?.trim()) return;
    io.to(gameId).emit("game:chat_message", {
      id: Date.now().toString(),
      sender,
      text: text.trim().slice(0, 300),
      timestamp: new Date().toISOString(),
    });
  });

  socket.on("disconnect", () => {
    const idx = matchmakingQueue.findIndex((q) => q.socket.id === socket.id);
    if (idx !== -1) matchmakingQueue.splice(idx, 1);
  });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Chess Arena backend listening on http://0.0.0.0:${PORT}`);
});
