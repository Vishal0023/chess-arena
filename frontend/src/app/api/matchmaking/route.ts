import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
  try {
    const { userId, timeControl = "5+0" } = await req.json();
    if (!userId) {
      return NextResponse.json({ error: "Missing userId" }, { status: 400 });
    }

    // Look for an existing waiting random game with the same timeControl
    const waitingGame = await prisma.game.findFirst({
      where: {
        mode: "random",
        status: "waiting",
        timeControl,
        whiteId: { not: userId },
      },
      orderBy: { createdAt: "asc" },
    });

    if (waitingGame) {
      const updated = await prisma.game.update({
        where: { id: waitingGame.id },
        data: {
          blackId: userId,
          status: "active",
        },
        include: { white: true, black: true },
      });
      return NextResponse.json({ game: updated });
    }

    // Otherwise create a new waiting random game
    const created = await prisma.game.create({
      data: {
        mode: "random",
        timeControl,
        status: "waiting",
        whiteId: userId,
      },
      include: { white: true, black: true },
    });

    return NextResponse.json({ game: created });
  } catch (err) {
    console.error("Matchmaking error:", err);
    return NextResponse.json({ error: "Matchmaking failed" }, { status: 500 });
  }
}
