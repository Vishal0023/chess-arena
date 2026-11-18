"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { Chess, Square } from "chess.js";
import { io, Socket } from "socket.io-client";
import {
  Crown,
  Users,
  KeyRound,
  Sparkles,
  EyeOff,
  Copy,
  Check,
  Flag,
  Handshake,
  Send,
  LogOut,
  Clock,
  Swords,
  Mail,
  UserCheck,
} from "lucide-react";
import ChessPiece from "@/components/ChessPiece";

interface PlayerInfo {
  id: string;
  username: string;
  email?: string;
  isGuest: boolean;
  rating: number;
}

interface GameState {
  id: string;
  roomCode?: string;
  mode: "random" | "private";
  timeControl: string;
  fen: string;
  pgn: string;
  turn: "w" | "b";
  history: { san: string; from: string; to: string }[];
  white: PlayerInfo | null;
  black: PlayerInfo | null;
  whiteTimeMs: number;
  blackTimeMs: number;
  status: "waiting" | "active" | "completed";
  result?: string;
  endReason?: string;
  inCheck: boolean;
  drawOfferBy?: "w" | "b" | null;
}

interface ChatMessage {
  id: string;
  sender: string;
  text: string;
  timestamp: string;
}

const FILES = ["a", "b", "c", "d", "e", "f", "g", "h"];
const RANKS = ["8", "7", "6", "5", "4", "3", "2", "1"];
const TIME_CONTROLS = [
  { label: "1+0 Bullet", value: "1+0" },
  { label: "3+2 Blitz", value: "3+2" },
  { label: "5+0 Blitz", value: "5+0" },
  { label: "10+0 Rapid", value: "10+0" },
];

function formatTime(ms: number): string {
  const totalSec = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function ChessArenaPage() {
  const [user, setUser] = useState<PlayerInfo | null>(null);
  const [authTab, setAuthTab] = useState<"guest" | "gmail">("guest");
  const [guestName, setGuestName] = useState("");
  const [gmailEmail, setGmailEmail] = useState("");
  const [gmailName, setGmailName] = useState("");
  const [authError, setAuthError] = useState("");
  const [authLoading, setAuthLoading] = useState(false);

  const [assistedMode, setAssistedMode] = useState(true);
  const [timeControl, setTimeControl] = useState("5+0");
  const [roomCodeInput, setRoomCodeInput] = useState("");
  const [lobbyError, setLobbyError] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);

  const [game, setGame] = useState<GameState | null>(null);
  const [selectedSquare, setSelectedSquare] = useState<Square | null>(null);
  const [promotionPending, setPromotionPending] = useState<{ from: Square; to: Square } | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");

  // Local ticking clocks
  const [displayWhiteMs, setDisplayWhiteMs] = useState(300000);
  const [displayBlackMs, setDisplayBlackMs] = useState(300000);

  const socketRef = useRef<Socket | null>(null);

  // Restore session from localStorage
  useEffect(() => {
    const saved = localStorage.getItem("chess_arena_user");
    if (saved) {
      try {
        setUser(JSON.parse(saved));
      } catch {
        localStorage.removeItem("chess_arena_user");
      }
    }
  }, []);

  // Connect Socket.io when user is logged in
  useEffect(() => {
    if (!user) return;
    const socket = io({ path: "/socket.io" });
    socketRef.current = socket;

    socket.on("matchmaking:waiting", () => {
      setIsSearching(true);
      setLobbyError("");
    });

    socket.on("room:created", (g: GameState) => {
      setGame(g);
      setDisplayWhiteMs(g.whiteTimeMs);
      setDisplayBlackMs(g.blackTimeMs);
      setLobbyError("");
    });

    socket.on("room:error", ({ message }: { message: string }) => {
      setLobbyError(message);
    });

    socket.on("game:started", (g: GameState) => {
      setIsSearching(false);
      setGame(g);
      setDisplayWhiteMs(g.whiteTimeMs);
      setDisplayBlackMs(g.blackTimeMs);
      setSelectedSquare(null);
      setChatMessages([]);
      setLobbyError("");
    });

    socket.on("game:updated", (g: GameState) => {
      setGame(g);
      setDisplayWhiteMs(g.whiteTimeMs);
      setDisplayBlackMs(g.blackTimeMs);
      setSelectedSquare(null);
    });

    socket.on("game:chat_message", (msg: ChatMessage) => {
      setChatMessages((prev) => [...prev, msg]);
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [user]);

  // Tick active player's clock
  useEffect(() => {
    if (!game || game.status !== "active") return;
    const interval = setInterval(() => {
      if (game.turn === "w") {
        setDisplayWhiteMs((prev) => Math.max(0, prev - 100));
      } else {
        setDisplayBlackMs((prev) => Math.max(0, prev - 100));
      }
    }, 100);
    return () => clearInterval(interval);
  }, [game?.status, game?.turn, game?.fen]);

  const chess = useMemo(() => {
    const c = new Chess();
    if (game?.fen) {
      c.load(game.fen);
    }
    return c;
  }, [game?.fen]);

  const myColor: "w" | "b" | null = useMemo(() => {
    if (!game || !user) return null;
    if (game.white?.id === user.id) return "w";
    if (game.black?.id === user.id) return "b";
    return null;
  }, [game, user]);

  // Legal moves for selected square (used in Assisted Mode & move validation)
  const legalMovesForSelected = useMemo(() => {
    if (!selectedSquare) return [];
    return chess.moves({ square: selectedSquare, verbose: true });
  }, [chess, selectedSquare]);

  const legalTargetsSet = useMemo(() => {
    return new Set(legalMovesForSelected.map((m) => m.to));
  }, [legalMovesForSelected]);

  async function handleGuestLogin(e: React.FormEvent) {
    e.preventDefault();
    setAuthError("");
    setAuthLoading(true);
    try {
      const res = await fetch("/api/auth/guest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: guestName }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Guest login failed");
      localStorage.setItem("chess_arena_user", JSON.stringify(data.user));
      setUser(data.user);
    } catch (err: unknown) {
      setAuthError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setAuthLoading(false);
    }
  }

  async function handleGmailLogin(e: React.FormEvent) {
    e.preventDefault();
    setAuthError("");
    setAuthLoading(true);
    try {
      const res = await fetch("/api/auth/gmail", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: gmailEmail, name: gmailName }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gmail login failed");
      localStorage.setItem("chess_arena_user", JSON.stringify(data.user));
      setUser(data.user);
    } catch (err: unknown) {
      setAuthError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setAuthLoading(false);
    }
  }

  function handleLogout() {
    localStorage.removeItem("chess_arena_user");
    setUser(null);
    setGame(null);
    setIsSearching(false);
  }

  function handleFindRandom() {
    if (!socketRef.current || !user) return;
    setLobbyError("");
    socketRef.current.emit("matchmaking:join", { player: user, timeControl });
  }

  function handleCancelSearch() {
    socketRef.current?.emit("matchmaking:leave");
    setIsSearching(false);
  }

  function handleCreateRoom() {
    if (!socketRef.current || !user) return;
    setLobbyError("");
    socketRef.current.emit("room:create", { player: user, timeControl });
  }

  function handleJoinRoom(e: React.FormEvent) {
    e.preventDefault();
    if (!socketRef.current || !user || !roomCodeInput.trim()) return;
    setLobbyError("");
    socketRef.current.emit("room:join", { roomCode: roomCodeInput.trim(), player: user });
  }

  function handleSquareClick(sq: Square) {
    if (!game || game.status !== "active" || !myColor) return;
    if (game.turn !== myColor) return;

    const piece = chess.get(sq);

    if (selectedSquare) {
      if (selectedSquare === sq) {
        setSelectedSquare(null);
        return;
      }

      if (legalTargetsSet.has(sq)) {
        const movingPiece = chess.get(selectedSquare);
        const isPromotion =
          movingPiece?.type === "p" &&
          ((myColor === "w" && sq.endsWith("8")) || (myColor === "b" && sq.endsWith("1")));

        if (isPromotion) {
          setPromotionPending({ from: selectedSquare, to: sq });
          return;
        }

        socketRef.current?.emit("game:move", { gameId: game.id, from: selectedSquare, to: sq });
        setSelectedSquare(null);
        return;
      }
    }

    if (piece && piece.color === myColor) {
      setSelectedSquare(sq);
    } else {
      setSelectedSquare(null);
    }
  }

  function handlePromotion(piece: "q" | "r" | "b" | "n") {
    if (!promotionPending || !game) return;
    socketRef.current?.emit("game:move", {
      gameId: game.id,
      from: promotionPending.from,
      to: promotionPending.to,
      promotion: piece,
    });
    setPromotionPending(null);
    setSelectedSquare(null);
  }

  function handleSendChat(e: React.FormEvent) {
    e.preventDefault();
    if (!chatInput.trim() || !game || !user) return;
    socketRef.current?.emit("game:chat", {
      gameId: game.id,
      sender: user.username,
      text: chatInput,
    });
    setChatInput("");
  }

  function copyRoomCode() {
    if (!game?.roomCode) return;
    navigator.clipboard.writeText(game.roomCode);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  }

  const displayRanks = myColor === "b" ? [...RANKS].reverse() : RANKS;
  const displayFiles = myColor === "b" ? [...FILES].reverse() : FILES;
  const lastMove = game?.history?.[game.history.length - 1];

  return (
    <div className="min-h-screen bg-arena-bg text-white flex flex-col">
      {/* Top Navbar */}
      <header className="border-b border-arena-border bg-arena-panel px-4 sm:px-8 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-arena-green flex items-center justify-center shadow">
            <Crown className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight leading-none">Chess Arena</h1>
            <p className="text-xs text-neutral-400">Play Online • Private Rooms • Assisted & Normal</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Assisted vs Normal Mode Toggle */}
          <button
            onClick={() => setAssistedMode((v) => !v)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold border transition ${
              assistedMode
                ? "bg-arena-green/20 border-arena-green text-arena-green"
                : "bg-arena-bg border-arena-border text-neutral-300 hover:bg-arena-panelHover"
            }`}
            title="Toggle legal move dots on the board"
          >
            {assistedMode ? <Sparkles className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
            <span>{assistedMode ? "Assisted Mode (Dots ON)" : "Normal Mode (Dots OFF)"}</span>
          </button>

          {user && (
            <div className="flex items-center gap-2 bg-arena-bg border border-arena-border rounded-lg px-3 py-1.5">
              <span className="text-xs font-semibold text-white">{user.username}</span>
              <span className="text-[11px] px-1.5 py-0.5 rounded bg-arena-panel text-neutral-300">
                {user.isGuest ? "Guest" : "Gmail"}
              </span>
              <button
                onClick={handleLogout}
                className="text-neutral-400 hover:text-red-400 ml-1"
                title="Sign out"
              >
                <LogOut className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex items-center justify-center p-4 sm:p-6">
        {!user ? (
          /* Auth Screen */
          <div className="w-full max-w-md bg-arena-panel border border-arena-border rounded-2xl p-6 shadow-2xl">
            <div className="text-center mb-6">
              <div className="w-12 h-12 rounded-xl bg-arena-green/20 border border-arena-green/40 flex items-center justify-center mx-auto mb-3">
                <Crown className="w-6 h-6 text-arena-green" />
              </div>
              <h2 className="text-2xl font-bold">Welcome to Chess Arena</h2>
              <p className="text-sm text-neutral-400 mt-1">
                Sign in as a Guest or with your Gmail to start playing
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2 bg-arena-bg p-1 rounded-xl mb-5">
              <button
                onClick={() => {
                  setAuthTab("guest");
                  setAuthError("");
                }}
                className={`py-2 rounded-lg text-sm font-semibold flex items-center justify-center gap-2 transition ${
                  authTab === "guest" ? "bg-arena-panel text-white shadow" : "text-neutral-400 hover:text-white"
                }`}
              >
                <UserCheck className="w-4 h-4" />
                Guest Login
              </button>
              <button
                onClick={() => {
                  setAuthTab("gmail");
                  setAuthError("");
                }}
                className={`py-2 rounded-lg text-sm font-semibold flex items-center justify-center gap-2 transition ${
                  authTab === "gmail" ? "bg-arena-panel text-white shadow" : "text-neutral-400 hover:text-white"
                }`}
              >
                <Mail className="w-4 h-4" />
                Gmail Login
              </button>
            </div>

            {authTab === "guest" ? (
              <form onSubmit={handleGuestLogin} className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-neutral-300 mb-1.5">
                    Display Name (optional)
                  </label>
                  <input
                    type="text"
                    value={guestName}
                    onChange={(e) => setGuestName(e.target.value)}
                    placeholder="e.g. Grandmaster_99"
                    className="w-full bg-arena-bg border border-arena-border rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:border-arena-green"
                  />
                </div>
                {authError && <p className="text-xs text-red-400">{authError}</p>}
                <button
                  type="submit"
                  disabled={authLoading}
                  className="w-full bg-arena-green hover:bg-arena-greenHover text-white font-bold py-3 rounded-xl transition shadow-lg"
                >
                  {authLoading ? "Entering..." : "Play as Guest"}
                </button>
              </form>
            ) : (
              <form onSubmit={handleGmailLogin} className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-neutral-300 mb-1.5">
                    Gmail Address
                  </label>
                  <input
                    type="email"
                    required
                    value={gmailEmail}
                    onChange={(e) => setGmailEmail(e.target.value)}
                    placeholder="you@gmail.com"
                    className="w-full bg-arena-bg border border-arena-border rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:border-arena-green"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-neutral-300 mb-1.5">
                    Username (optional)
                  </label>
                  <input
                    type="text"
                    value={gmailName}
                    onChange={(e) => setGmailName(e.target.value)}
                    placeholder="Your chess handle"
                    className="w-full bg-arena-bg border border-arena-border rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:border-arena-green"
                  />
                </div>
                {authError && <p className="text-xs text-red-400">{authError}</p>}
                <button
                  type="submit"
                  disabled={authLoading}
                  className="w-full bg-arena-green hover:bg-arena-greenHover text-white font-bold py-3 rounded-xl transition shadow-lg"
                >
                  {authLoading ? "Signing in..." : "Continue with Gmail"}
                </button>
              </form>
            )}
          </div>
        ) : !game ? (
          /* Lobby Screen */
          <div className="w-full max-w-4xl grid md:grid-cols-2 gap-6">
            {/* Play Random Opponent */}
            <div className="bg-arena-panel border border-arena-border rounded-2xl p-6 flex flex-col justify-between shadow-xl">
              <div>
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-xl bg-arena-green/20 flex items-center justify-center">
                    <Swords className="w-5 h-5 text-arena-green" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold">Play Random Opponent</h2>
                    <p className="text-xs text-neutral-400">Instant matchmaking with online players</p>
                  </div>
                </div>

                <label className="block text-xs font-semibold text-neutral-300 mb-2">
                  Time Control
                </label>
                <div className="grid grid-cols-2 gap-2 mb-6">
                  {TIME_CONTROLS.map((tc) => (
                    <button
                      key={tc.value}
                      onClick={() => setTimeControl(tc.value)}
                      className={`py-2.5 px-3 rounded-xl text-sm font-semibold border transition flex items-center justify-center gap-1.5 ${
                        timeControl === tc.value
                          ? "bg-arena-green/20 border-arena-green text-arena-green"
                          : "bg-arena-bg border-arena-border text-neutral-300 hover:bg-arena-panelHover"
                      }`}
                    >
                      <Clock className="w-3.5 h-3.5" />
                      {tc.label}
                    </button>
                  ))}
                </div>
              </div>

              {isSearching ? (
                <div className="space-y-3">
                  <div className="bg-arena-bg border border-arena-green/40 rounded-xl p-4 text-center">
                    <p className="text-sm font-semibold text-arena-green animate-pulse">
                      Searching for an opponent ({timeControl})...
                    </p>
                  </div>
                  <button
                    onClick={handleCancelSearch}
                    className="w-full py-2.5 rounded-xl bg-neutral-700 hover:bg-neutral-600 text-sm font-semibold transition"
                  >
                    Cancel Search
                  </button>
                </div>
              ) : (
                <button
                  onClick={handleFindRandom}
                  className="w-full bg-arena-green hover:bg-arena-greenHover text-white font-bold py-3.5 rounded-xl transition shadow-lg text-base"
                >
                  Find Match
                </button>
              )}
            </div>

            {/* Personal Room */}
            <div className="bg-arena-panel border border-arena-border rounded-2xl p-6 flex flex-col justify-between shadow-xl">
              <div>
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-xl bg-amber-500/20 flex items-center justify-center">
                    <Users className="w-5 h-5 text-amber-400" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold">Personal Room</h2>
                    <p className="text-xs text-neutral-400">Play with a friend using a private room code</p>
                  </div>
                </div>

                <button
                  onClick={handleCreateRoom}
                  className="w-full bg-amber-500 hover:bg-amber-400 text-neutral-950 font-bold py-3 rounded-xl transition shadow mb-6"
                >
                  Create Private Room ({timeControl})
                </button>

                <div className="relative flex py-2 items-center mb-4">
                  <div className="flex-grow border-t border-arena-border"></div>
                  <span className="flex-shrink mx-3 text-xs text-neutral-400 uppercase">Or Join Room</span>
                  <div className="flex-grow border-t border-arena-border"></div>
                </div>

                <form onSubmit={handleJoinRoom} className="flex gap-2">
                  <div className="relative flex-1">
                    <KeyRound className="w-4 h-4 text-neutral-400 absolute left-3 top-3" />
                    <input
                      type="text"
                      value={roomCodeInput}
                      onChange={(e) => setRoomCodeInput(e.target.value.toUpperCase())}
                      placeholder="Enter 6-char code"
                      maxLength={6}
                      className="w-full bg-arena-bg border border-arena-border rounded-xl pl-9 pr-3 py-2.5 text-sm uppercase tracking-widest focus:outline-none focus:border-arena-green"
                    />
                  </div>
                  <button
                    type="submit"
                    className="px-5 py-2.5 bg-arena-bg hover:bg-arena-panelHover border border-arena-border rounded-xl text-sm font-semibold transition"
                  >
                    Join
                  </button>
                </form>
                {lobbyError && <p className="text-xs text-red-400 mt-3">{lobbyError}</p>}
              </div>
            </div>
          </div>
        ) : (
          /* Active / Waiting Game View */
          <div className="w-full max-w-6xl grid lg:grid-cols-[1fr_340px] gap-6 items-start">
            {/* Left: Board & Player Bars */}
            <div className="flex flex-col items-center">
              {/* Waiting for friend banner */}
              {game.status === "waiting" && game.roomCode && (
                <div className="w-full max-w-[560px] mb-4 bg-arena-panel border border-amber-500/40 rounded-xl p-4 flex items-center justify-between">
                  <div>
                    <p className="text-xs text-amber-300 font-semibold">Waiting for friend to join...</p>
                    <p className="text-lg font-mono font-bold tracking-widest mt-0.5">{game.roomCode}</p>
                  </div>
                  <button
                    onClick={copyRoomCode}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-arena-bg hover:bg-arena-panelHover border border-arena-border text-xs font-semibold"
                  >
                    {copiedCode ? <Check className="w-4 h-4 text-arena-green" /> : <Copy className="w-4 h-4" />}
                    {copiedCode ? "Copied!" : "Copy Code"}
                  </button>
                </div>
              )}

              {/* Top Player Bar */}
              <div className="w-full max-w-[560px] flex items-center justify-between bg-arena-panel border border-arena-border rounded-xl px-4 py-2.5 mb-2">
                <div className="flex items-center gap-2.5">
                  <div className={`w-3 h-3 rounded-full ${myColor === "b" ? "bg-white" : "bg-neutral-800 border border-neutral-500"}`} />
                  <span className="font-semibold text-sm">
                    {myColor === "b" ? game.white?.username || "Waiting..." : game.black?.username || "Waiting..."}
                  </span>
                </div>
                <div
                  className={`font-mono text-base font-bold px-3 py-1 rounded-lg ${
                    game.turn === (myColor === "b" ? "w" : "b") && game.status === "active"
                      ? "bg-arena-green text-white"
                      : "bg-arena-bg text-neutral-300"
                  }`}
                >
                  {formatTime(myColor === "b" ? displayWhiteMs : displayBlackMs)}
                </div>
              </div>

              {/* 8x8 Chessboard */}
              <div className="relative w-full max-w-[560px] aspect-square rounded-lg overflow-hidden shadow-2xl border-4 border-arena-panel select-none">
                <div className="grid grid-cols-8 grid-rows-8 w-full h-full">
                  {displayRanks.map((rank, rIdx) =>
                    displayFiles.map((file, fIdx) => {
                      const sq = `${file}${rank}` as Square;
                      const isLight = (FILES.indexOf(file) + RANKS.indexOf(rank)) % 2 === 0;
                      const piece = chess.get(sq);
                      const isSelected = selectedSquare === sq;
                      const isLastMove = lastMove && (lastMove.from === sq || lastMove.to === sq);
                      const isLegalTarget = assistedMode && legalTargetsSet.has(sq);
                      const isKingInCheck =
                        game.inCheck && piece?.type === "k" && piece?.color === game.turn;

                      return (
                        <button
                          key={sq}
                          onClick={() => handleSquareClick(sq)}
                          className={`relative flex items-center justify-center w-full h-full transition-colors ${
                            isLight ? "bg-arena-boardLight" : "bg-arena-boardDark"
                          } ${isSelected ? "!bg-yellow-400/70" : ""} ${
                            isLastMove && !isSelected ? "ring-inset ring-4 ring-yellow-300/50" : ""
                          } ${isKingInCheck ? "!bg-red-500/80" : ""}`}
                        >
                          {/* Coordinates */}
                          {fIdx === 0 && (
                            <span
                              className={`absolute top-0.5 left-1 text-[10px] font-bold ${
                                isLight ? "text-arena-boardDark" : "text-arena-boardLight"
                              }`}
                            >
                              {rank}
                            </span>
                          )}
                          {rIdx === 7 && (
                            <span
                              className={`absolute bottom-0.5 right-1 text-[10px] font-bold ${
                                isLight ? "text-arena-boardDark" : "text-arena-boardLight"
                              }`}
                            >
                              {file}
                            </span>
                          )}

                          {/* Piece */}
                          {piece && <ChessPiece type={piece.type} color={piece.color} />}

                          {/* Assisted Mode Legal Move Dots */}
                          {isLegalTarget && !piece && (
                            <span className="absolute w-3.5 h-3.5 rounded-full bg-black/25 pointer-events-none" />
                          )}
                          {isLegalTarget && piece && (
                            <span className="absolute inset-1 rounded-full border-4 border-black/25 pointer-events-none" />
                          )}
                        </button>
                      );
                    })
                  )}
                </div>

                {/* Promotion Modal */}
                {promotionPending && (
                  <div className="absolute inset-0 bg-black/70 flex items-center justify-center z-20">
                    <div className="bg-arena-panel border border-arena-border rounded-2xl p-4 text-center">
                      <p className="text-sm font-bold mb-3">Choose Promotion Piece</p>
                      <div className="flex gap-3">
                        {(["q", "r", "b", "n"] as const).map((p) => (
                          <button
                            key={p}
                            onClick={() => handlePromotion(p)}
                            className="w-14 h-14 bg-arena-bg hover:bg-arena-panelHover rounded-xl flex items-center justify-center border border-arena-border"
                          >
                            <ChessPiece type={p} color={myColor || "w"} />
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* Game Over Overlay */}
                {game.status === "completed" && (
                  <div className="absolute inset-0 bg-black/65 flex items-center justify-center z-20">
                    <div className="bg-arena-panel border border-arena-border rounded-2xl p-6 text-center max-w-xs shadow-2xl">
                      <Crown className="w-10 h-10 text-arena-green mx-auto mb-2" />
                      <h3 className="text-xl font-bold">Game Over</h3>
                      <p className="text-sm text-neutral-300 mt-1 capitalize">
                        {game.result} • {game.endReason}
                      </p>
                      <button
                        onClick={() => setGame(null)}
                        className="mt-4 w-full bg-arena-green hover:bg-arena-greenHover text-white font-bold py-2.5 rounded-xl transition"
                      >
                        Back to Lobby
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Bottom Player Bar (Me) */}
              <div className="w-full max-w-[560px] flex items-center justify-between bg-arena-panel border border-arena-border rounded-xl px-4 py-2.5 mt-2">
                <div className="flex items-center gap-2.5">
                  <div className={`w-3 h-3 rounded-full ${myColor === "b" ? "bg-neutral-800 border border-neutral-500" : "bg-white"}`} />
                  <span className="font-semibold text-sm">
                    {myColor === "b" ? game.black?.username : game.white?.username} (You)
                  </span>
                </div>
                <div
                  className={`font-mono text-base font-bold px-3 py-1 rounded-lg ${
                    game.turn === (myColor || "w") && game.status === "active"
                      ? "bg-arena-green text-white"
                      : "bg-arena-bg text-neutral-300"
                  }`}
                >
                  {formatTime(myColor === "b" ? displayBlackMs : displayWhiteMs)}
                </div>
              </div>
            </div>

            {/* Right Sidebar: Controls, Move History & Chat */}
            <div className="bg-arena-panel border border-arena-border rounded-2xl p-4 flex flex-col h-[560px]">
              {/* Controls */}
              <div className="flex items-center gap-2 pb-3 border-b border-arena-border">
                <button
                  onClick={() => myColor && socketRef.current?.emit("game:resign", { gameId: game.id, color: myColor })}
                  disabled={game.status !== "active"}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-arena-bg hover:bg-red-500/20 hover:text-red-400 border border-arena-border text-xs font-semibold disabled:opacity-40 transition"
                >
                  <Flag className="w-3.5 h-3.5" />
                  Resign
                </button>
                {game.drawOfferBy && game.drawOfferBy !== myColor ? (
                  <button
                    onClick={() => socketRef.current?.emit("game:draw_accept", { gameId: game.id })}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-arena-green text-white text-xs font-semibold"
                  >
                    <Handshake className="w-3.5 h-3.5" />
                    Accept Draw
                  </button>
                ) : (
                  <button
                    onClick={() => myColor && socketRef.current?.emit("game:draw_offer", { gameId: game.id, color: myColor })}
                    disabled={game.status !== "active"}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-arena-bg hover:bg-arena-panelHover border border-arena-border text-xs font-semibold disabled:opacity-40 transition"
                  >
                    <Handshake className="w-3.5 h-3.5" />
                    Offer Draw
                  </button>
                )}
              </div>

              {/* Move History */}
              <div className="py-3 border-b border-arena-border flex-1 overflow-y-auto">
                <h3 className="text-xs font-bold uppercase text-neutral-400 mb-2">Moves</h3>
                {game.history.length === 0 ? (
                  <p className="text-xs text-neutral-500">No moves yet.</p>
                ) : (
                  <div className="grid grid-cols-2 gap-1 text-xs font-mono">
                    {game.history.map((m, idx) => (
                      <div key={idx} className="px-2 py-1 rounded bg-arena-bg/60">
                        <span className="text-neutral-500 mr-1.5">
                          {idx % 2 === 0 ? `${Math.floor(idx / 2) + 1}.` : ""}
                        </span>
                        <span>{m.san}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Chat */}
              <div className="pt-3 flex flex-col h-48">
                <h3 className="text-xs font-bold uppercase text-neutral-400 mb-2">Chat</h3>
                <div className="flex-1 overflow-y-auto space-y-1.5 mb-2 pr-1">
                  {chatMessages.map((msg) => (
                    <div key={msg.id} className="text-xs">
                      <span className="font-bold text-arena-green">{msg.sender}: </span>
                      <span className="text-neutral-200">{msg.text}</span>
                    </div>
                  ))}
                </div>
                <form onSubmit={handleSendChat} className="flex gap-1.5">
                  <input
                    type="text"
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    placeholder="Say hello..."
                    className="flex-1 bg-arena-bg border border-arena-border rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:border-arena-green"
                  />
                  <button
                    type="submit"
                    className="p-2 bg-arena-green hover:bg-arena-greenHover rounded-lg text-white"
                  >
                    <Send className="w-3.5 h-3.5" />
                  </button>
                </form>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
