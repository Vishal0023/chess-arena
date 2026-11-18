import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
  try {
    const { userId, roomCode } = await req.json();
    if (!userId || !roomCode) {
      return NextResponse.json({ error: "Missing userId or roomCode" }, { status: 400 });
    }

    const normalized = String(roomCode).trim().toUpperCase();
    const game = await prisma.game.findUnique({
      where: { roomCode: normalized },
      include: { white: true, black: true },
    });

    if (!game) {
      return NextResponse.json({ error: "Room not found. Check the code and try again." }, { status: 404 });
    }
    if (game.status !== "waiting" || game.blackId) {
      return NextResponse.json({ error: "Room is already full." }, { status: 400 });
    }

    const updated = await prisma.game.update({
      where: { id: game.id },
      data: {
        blackId: userId,
        status: "active",
      },
      include: { white: true, black: true },
    });

    return NextResponse.json({ game: updated });
  } catch (err) {
    console.error("Join room error:", err);
    return NextResponse.json({ error: "Failed to join room" }, { status: 500 });
  }
}
