import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

function generateRoomCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

export async function POST(req: Request) {
  try {
    const { userId, timeControl = "5+0" } = await req.json();
    if (!userId) {
      return NextResponse.json({ error: "Missing userId" }, { status: 400 });
    }

    const roomCode = generateRoomCode();
    const game = await prisma.game.create({
      data: {
        mode: "private",
        roomCode,
        timeControl,
        status: "waiting",
        whiteId: userId,
      },
      include: { white: true, black: true },
    });

    return NextResponse.json({ game });
  } catch (err) {
    console.error("Create room error:", err);
    return NextResponse.json({ error: "Failed to create room" }, { status: 500 });
  }
}
