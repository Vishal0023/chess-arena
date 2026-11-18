"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Chess, Square } from "chess.js";
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
  email?: string | null;
  isGuest: boolean;
  rating: number;
}

interface GameRecord {
  id: string;
  roomCode?: string | null;
  mode: string;
  timeControl: string;
  fen: string;
  pgn: string;
  status: string;
  result?: string | null;
  endReason?: string | null;
  whiteTimeMs: number;
  blackTimeMs: number;
  lastMoveAt?: string | null;
  white: PlayerInfo | null;
  black: PlayerInfo | null;
}

function formatTime(ms: number): string {
  const totalSec = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

const FILES = ["a", "b", "c", "d", "e", "f", "g", "h"];
const RANKS = ["8", "7", "6", "5", "4", "3", "2", "1"];
const TIME_CONTROLS = [
  { label: "1+0 Bullet", value: "1+0" },
  { label: "3+2 Blitz", value: "3+2" },
  { label: "5+0 Blitz", value: "5+0" },
  { label: "10+0 Rapid", value: "10+0" },
];

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

  const [game, setGame] = useState<GameRecord | null>(null);
  const [selectedSquare, setSelectedSquare] = useState<Square | null>(null);
  const [promotionPending, setPromotionPending] = useState<{ from: Square; to: Square } | null>(null);
  const [displayWhiteMs, setDisplayWhiteMs] = useState(300000);
  const [displayBlackMs, setDisplayBlackMs] = useState(300000);

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

  // Poll game state every 800ms when waiting or active
  useEffect(() => {
    if (!game || game.status === "completed") return;
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/games/${game.id}`);
        if (res.ok) {
          const data = await res.json();
          if (data.game) {
            setGame(data.game);
            setDisplayWhiteMs(data.game.whiteTimeMs);
            setDisplayBlackMs(data.game.blackTimeMs);
            if (data.game.status === "active") {
              setIsSearching(false);
            }
          }
        }
      } catch {
        // ignore transient network errors
      }
    }, 800);
    return () => clearInterval(interval);
  }, [game?.id, game?.status]);

  // Tick active player's clock & trigger timeout when it hits 0
  useEffect(() => {
    if (!game || game.status !== "active") return;
    const interval = setInterval(() => {
      if (turn === "w") {
        setDisplayWhiteMs((prev) => {
          const next = Math.max(0, prev - 100);
          if (next === 0 && prev > 0) {
            fetch(`/api/games/${game.id}/action`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ action: "timeout", color: "w" }),
            });
          }
          return next;
        });
      } else {
        setDisplayBlackMs((prev) => {
          const next = Math.max(0, prev - 100);
          if (next === 0 && prev > 0) {
            fetch(`/api/games/${game.id}/action`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ action: "timeout", color: "b" }),
            });
          }
          return next;
        });
      }
    }, 100);
    return () => clearInterval(interval);
  }, [game?.id, game?.status, turn]);

  const chess = useMemo(() => {
    const c = new Chess();
    if (game?.pgn) {
      try {
        c.loadPgn(game.pgn);
      } catch {
        if (game.fen) c.load(game.fen);
      }
    } else if (game?.fen) {
      c.load(game.fen);
    }
    return c;
  }, [game?.fen, game?.pgn]);

  const history = useMemo(() => chess.history({ verbose: true }), [chess]);
  const turn = chess.turn();
  const inCheck = chess.inCheck();

  const myColor: "w" | "b" | null = useMemo(() => {
    if (!game || !user) return null;
    if (game.white?.id === user.id) return "w";
    if (game.black?.id === user.id) return "b";
    return null;
  }, [game, user]);

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

  async function handleFindRandom() {
    if (!user) return;
    setLobbyError("");
    setIsSearching(true);
    try {
      const res = await fetch("/api/matchmaking", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.id, timeControl }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Matchmaking failed");
      setGame(data.game);
      if (data.game.status === "active") {
        setIsSearching(false);
      }
    } catch (err: unknown) {
      setIsSearching(false);
      setLobbyError(err instanceof Error ? err.message : "Matchmaking failed");
    }
  }

  async function handleCreateRoom() {
    if (!user) return;
    setLobbyError("");
    try {
      const res = await fetch("/api/rooms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.id, timeControl }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create room");
      setGame(data.game);
    } catch (err: unknown) {
      setLobbyError(err instanceof Error ? err.message : "Failed to create room");
    }
  }

  async function handleJoinRoom(e: React.FormEvent) {
    e.preventDefault();
    if (!user || !roomCodeInput.trim()) return;
    setLobbyError("");
    try {
      const res = await fetch("/api/rooms/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.id, roomCode: roomCodeInput.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to join room");
      setGame(data.game);
    } catch (err: unknown) {
      setLobbyError(err instanceof Error ? err.message : "Failed to join room");
    }
  }

  async function submitMove(from: Square, to: Square, promotion = "q") {
    if (!game) return;
    setSelectedSquare(null);
    const res = await fetch(`/api/games/${game.id}/move`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ from, to, promotion }),
    });
    if (res.ok) {
      const data = await res.json();
      setGame(data.game);
    }
  }

  function handleSquareClick(sq: Square) {
    if (!game || game.status !== "active" || !myColor) return;
    if (turn !== myColor) return;

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

        submitMove(selectedSquare, sq);
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
    if (!promotionPending) return;
    submitMove(promotionPending.from, promotionPending.to, piece);
    setPromotionPending(null);
  }

  async function handleGameAction(action: "resign" | "draw") {
    if (!game || !myColor) return;
    const res = await fetch(`/api/games/${game.id}/action`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, color: myColor }),
    });
    if (res.ok) {
      const data = await res.json();
      setGame(data.game);
    }
  }

  function copyRoomCode() {
    if (!game?.roomCode) return;
    navigator.clipboard.writeText(game.roomCode);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  }

  const displayRanks = myColor === "b" ? [...RANKS].reverse() : RANKS;
  const displayFiles = myColor === "b" ? [...FILES].reverse() : FILES;
  const lastMove = history[history.length - 1];

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
            <p className="text-xs text-neutral-400">Next.js + Prisma + PostgreSQL</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setAssistedMode((v) => !v)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold border transition ${
              assistedMode
                ? "bg-arena-green/20 border-arena-green text-arena-green"
                : "bg-arena-bg border-arena-border text-neutral-300 hover:bg-arena-panelHover"
            }`}
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
              <button onClick={handleLogout} className="text-neutral-400 hover:text-red-400 ml-1" title="Sign out">
                <LogOut className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex items-center justify-center p-4 sm:p-6">
        {!user ? (
          <div className="w-full max-w-md bg-arena-panel border border-arena-border rounded-2xl p-6 shadow-2xl">
            <div className="text-center mb-6">
              <div className="w-12 h-12 rounded-xl bg-arena-green/20 border border-arena-green/40 flex items-center justify-center mx-auto mb-3">
                <Crown className="w-6 h-6 text-arena-green" />
              </div>
              <h2 className="text-2xl font-bold">Welcome to Chess Arena</h2>
              <p className="text-sm text-neutral-400 mt-1">Sign in as a Guest or with your Gmail</p>
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
                  <label className="block text-xs font-medium text-neutral-300 mb-1.5">Display Name (optional)</label>
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
                  <label className="block text-xs font-medium text-neutral-300 mb-1.5">Gmail Address</label>
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
                  <label className="block text-xs font-medium text-neutral-300 mb-1.5">Username (optional)</label>
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
          <div className="w-full max-w-4xl grid md:grid-cols-2 gap-6">
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

                <label className="block text-xs font-semibold text-neutral-300 mb-2">Time Control</label>
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

              <button
                onClick={handleFindRandom}
                disabled={isSearching}
                className="w-full bg-arena-green hover:bg-arena-greenHover text-white font-bold py-3.5 rounded-xl transition shadow-lg text-base disabled:opacity-60"
              >
                {isSearching ? "Finding Match..." : "Find Match"}
              </button>
            </div>

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
          <div className="w-full max-w-6xl grid lg:grid-cols-[1fr_320px] gap-6 items-start">
            <div className="flex flex-col items-center">
              {game.status === "waiting" && (
                <div className="w-full max-w-[560px] mb-4 bg-arena-panel border border-amber-500/40 rounded-xl p-4 flex items-center justify-between">
                  <div>
                    <p className="text-xs text-amber-300 font-semibold">
                      {game.roomCode ? "Waiting for friend to join..." : "Waiting for random opponent..."}
                    </p>
                    {game.roomCode && (
                      <p className="text-lg font-mono font-bold tracking-widest mt-0.5">{game.roomCode}</p>
                    )}
                  </div>
                  {game.roomCode && (
                    <button
                      onClick={copyRoomCode}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-arena-bg hover:bg-arena-panelHover border border-arena-border text-xs font-semibold"
                    >
                      {copiedCode ? <Check className="w-4 h-4 text-arena-green" /> : <Copy className="w-4 h-4" />}
                      {copiedCode ? "Copied!" : "Copy Code"}
                    </button>
                  )}
                </div>
              )}

              <div className="w-full max-w-[560px] flex items-center justify-between bg-arena-panel border border-arena-border rounded-xl px-4 py-2.5 mb-2">
                <span className="font-semibold text-sm">
                  {myColor === "b" ? game.white?.username || "Waiting..." : game.black?.username || "Waiting..."}
                </span>
                <span
                  className={`font-mono text-base font-bold px-3 py-1 rounded-lg ${
                    turn === (myColor === "b" ? "w" : "b") && game.status === "active"
                      ? "bg-arena-green text-white"
                      : "bg-arena-bg text-neutral-300"
                  }`}
                >
                  {formatTime(myColor === "b" ? displayWhiteMs : displayBlackMs)}
                </span>
              </div>

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
                      const isKingInCheck = inCheck && piece?.type === "k" && piece?.color === turn;

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

                          {piece && <ChessPiece type={piece.type} color={piece.color} />}

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

              <div className="w-full max-w-[560px] flex items-center justify-between bg-arena-panel border border-arena-border rounded-xl px-4 py-2.5 mt-2">
                <span className="font-semibold text-sm">
                  {myColor === "b" ? game.black?.username : game.white?.username} (You)
                </span>
                <span
                  className={`font-mono text-base font-bold px-3 py-1 rounded-lg ${
                    turn === (myColor || "w") && game.status === "active"
                      ? "bg-arena-green text-white"
                      : "bg-arena-bg text-neutral-300"
                  }`}
                >
                  {formatTime(myColor === "b" ? displayBlackMs : displayWhiteMs)}
                </span>
              </div>
            </div>

            <div className="bg-arena-panel border border-arena-border rounded-2xl p-4 flex flex-col h-[560px]">
              <div className="flex items-center gap-2 pb-3 border-b border-arena-border">
                <button
                  onClick={() => handleGameAction("resign")}
                  disabled={game.status !== "active"}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-arena-bg hover:bg-red-500/20 hover:text-red-400 border border-arena-border text-xs font-semibold disabled:opacity-40 transition"
                >
                  <Flag className="w-3.5 h-3.5" />
                  Resign
                </button>
                <button
                  onClick={() => handleGameAction("draw")}
                  disabled={game.status !== "active"}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-arena-bg hover:bg-arena-panelHover border border-arena-border text-xs font-semibold disabled:opacity-40 transition"
                >
                  <Handshake className="w-3.5 h-3.5" />
                  Draw
                </button>
              </div>

              <div className="py-3 flex-1 overflow-y-auto">
                <h3 className="text-xs font-bold uppercase text-neutral-400 mb-2">Moves</h3>
                {history.length === 0 ? (
                  <p className="text-xs text-neutral-500">No moves yet.</p>
                ) : (
                  <div className="grid grid-cols-2 gap-1 text-xs font-mono">
                    {history.map((m, idx) => (
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
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
