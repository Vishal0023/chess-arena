import { NextResponse } from "next/server";
import jwt from "jsonwebtoken";
import { prisma } from "@/lib/prisma";

const JWT_SECRET = process.env.JWT_SECRET || "chess-arena-dev-secret";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
    const name = typeof body?.name === "string" ? body.name.trim() : "";

    if (!email || !email.endsWith("@gmail.com")) {
      return NextResponse.json({ error: "Please enter a valid @gmail.com address." }, { status: 400 });
    }

    let user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      const baseName = name || email.split("@")[0];
      user = await prisma.user.create({
        data: {
          username: `${baseName}_${Math.random().toString(36).slice(2, 5)}`,
          email,
          isGuest: false,
          rating: 1200,
        },
      });
    }

    const token = jwt.sign({ id: user.id, username: user.username, isGuest: false }, JWT_SECRET, {
      expiresIn: "7d",
    });

    return NextResponse.json({ user, token });
  } catch (err) {
    console.error("Gmail login error:", err);
    return NextResponse.json({ error: "Failed to sign in with Gmail" }, { status: 500 });
  }
}
