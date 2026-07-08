import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

// GET /api/chat/users?search=<text> — sohbet başlatmak için aktif kullanıcılar (kendisi hariç)
export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });

    const search = (new URL(request.url).searchParams.get("search") || "").trim();

    const users = await prisma.user.findMany({
      where: {
        isActive: true,
        id: { not: user.id },
        ...(search
          ? {
              OR: [
                { firstName: { contains: search, mode: "insensitive" } },
                { lastName: { contains: search, mode: "insensitive" } },
                { username: { contains: search, mode: "insensitive" } },
              ],
            }
          : {}),
      },
      select: { id: true, firstName: true, lastName: true, username: true, role: true, avatarUrl: true },
      orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
      take: 100,
    });

    return NextResponse.json({ users });
  } catch (error) {
    console.error("chat/users GET error:", error);
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}
