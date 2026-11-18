import { NextResponse } from "next/server";
import { Chess } from "chess.js";
import { prisma } from "@/lib/prisma";

function parseTimeControl(tc: string): { baseMs: number; incrementMs: number } {
  const [mins, inc] = tc.split("+").map((n) => parseInt(n, 10) || 0);
  return {
    baseMs: Math.max(1, mins) * 60 * 1000,
    incrementMs: Math.max(0, inc) * 1000,
  };
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const { from, to, promotion = "q" } = await req.json();
    const game = await prisma.game.findUnique({
      where: { id: params.id },
      include: { white: true, black: true },
    });

    if (!game || game.status !== "active") {
      return NextResponse.json({ error: "Game is not active" }, { status: 400 });
    }

    const chess = new Chess();
    if (game.pgn) {
      chess.loadPgn(game.pgn);
    } else if (game.fen) {
      chess.load(game.fen);
    }

    const turn = chess.turn();
    const now = new Date();
    const { incrementMs } = parseTimeControl(game.timeControl);

    let whiteTimeMs = game.whiteTimeMs;
    let blackTimeMs = game.blackTimeMs;

    if (game.lastMoveAt) {
      const elapsed = now.getTime() - new Date(game.lastMoveAt).getTime();
      if (turn === "w") {
        whiteTimeMs = Math.max(0, whiteTimeMs - elapsed);
        if (whiteTimeMs === 0) {
          const timedOut = await prisma.game.update({
            where: { id: game.id },
            data: { whiteTimeMs: 0, status: "completed", result: "0-1", endReason: "timeout" },
            include: { white: true, black: true },
          });
          return NextResponse.json({ game: timedOut });
        }
      } else {
        blackTimeMs = Math.max(0, blackTimeMs - elapsed);
        if (blackTimeMs === 0) {
          const timedOut = await prisma.game.update({
            where: { id: game.id },
            data: { blackTimeMs: 0, status: "completed", result: "1-0", endReason: "timeout" },
            include: { white: true, black: true },
          });
          return NextResponse.json({ game: timedOut });
        }
      }
    }

    const move = chess.move({ from, to, promotion });
    if (!move) {
      return NextResponse.json({ error: "Invalid move" }, { status: 400 });
    }

    if (turn === "w") {
      whiteTimeMs += incrementMs;
    } else {
      blackTimeMs += incrementMs;
    }

    let status = "active";
    let result: string | null = null;
    let endReason: string | null = null;

    if (chess.isGameOver()) {
      status = "completed";
      if (chess.isCheckmate()) {
        result = turn === "w" ? "1-0" : "0-1";
        endReason = "checkmate";
      } else if (chess.isStalemate()) {
        result = "1/2-1/2";
        endReason = "stalemate";
      } else {
        result = "1/2-1/2";
        endReason = "draw";
      }
    }

    const updated = await prisma.game.update({
      where: { id: game.id },
      data: {
        fen: chess.fen(),
        pgn: chess.pgn(),
        whiteTimeMs,
        blackTimeMs,
        lastMoveAt: now,
        status,
        result,
        endReason,
      },
      include: { white: true, black: true },
    });

    return NextResponse.json({ game: updated });
  } catch (err) {
    console.error("Move error:", err);
    return NextResponse.json({ error: "Failed to make move" }, { status: 500 });
  }
}
