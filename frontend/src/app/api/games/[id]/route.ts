import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    const game = await prisma.game.findUnique({
      where: { id: params.id },
      include: { white: true, black: true },
    });

    if (!game) {
      return NextResponse.json({ error: "Game not found" }, { status: 404 });
    }

    return NextResponse.json({ game });
  } catch (err) {
    console.error("Get game error:", err);
    return NextResponse.json({ error: "Failed to fetch game" }, { status: 500 });
  }
}
