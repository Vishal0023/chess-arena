import { NextResponse } from "next/server";
import { Chess } from "chess.js";
import { prisma } from "@/lib/prisma";

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
    const move = chess.move({ from, to, promotion });
    if (!move) {
      return NextResponse.json({ error: "Invalid move" }, { status: 400 });
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
