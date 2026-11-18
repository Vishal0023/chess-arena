import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const { action, color } = await req.json();
    const game = await prisma.game.findUnique({ where: { id: params.id } });

    if (!game || game.status !== "active") {
      return NextResponse.json({ error: "Game is not active" }, { status: 400 });
    }

    if (action === "resign") {
      const updated = await prisma.game.update({
        where: { id: game.id },
        data: {
          status: "completed",
          result: color === "w" ? "0-1" : "1-0",
          endReason: "resignation",
        },
        include: { white: true, black: true },
      });
      return NextResponse.json({ game: updated });
    }

    if (action === "draw") {
      const updated = await prisma.game.update({
        where: { id: game.id },
        data: {
          status: "completed",
          result: "1/2-1/2",
          endReason: "draw",
        },
        include: { white: true, black: true },
      });
      return NextResponse.json({ game: updated });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    console.error("Action error:", err);
    return NextResponse.json({ error: "Failed to perform action" }, { status: 500 });
  }
}
