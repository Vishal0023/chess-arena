import { NextResponse } from "next/server";
import jwt from "jsonwebtoken";
import { prisma } from "@/lib/prisma";

const JWT_SECRET = process.env.JWT_SECRET || "chess-arena-dev-secret";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const customName = typeof body?.username === "string" ? body.username.trim() : "";
    const username = customName || `Guest_${Math.floor(1000 + Math.random() * 9000)}`;

    let user = customName
      ? await prisma.user.findUnique({ where: { username: customName } })
      : null;

    if (!user) {
      user = await prisma.user.create({
        data: {
          username,
          isGuest: true,
          rating: 1200,
        },
      });
    }

    const token = jwt.sign({ id: user.id, username: user.username, isGuest: true }, JWT_SECRET, {
      expiresIn: "7d",
    });

    return NextResponse.json({ user, token });
  } catch (err) {
    console.error("Guest login error:", err);
    return NextResponse.json({ error: "Failed to create guest user" }, { status: 500 });
  }
}
