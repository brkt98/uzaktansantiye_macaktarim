import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser, isAdmin, hashPassword, hasRole } from "@/lib/auth";

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user || !isAdmin(user.roles)) {
      return NextResponse.json({ error: "Yetkisiz erişim" }, { status: 403 });
    }

    const users = await prisma.user.findMany({
      select: {
        id: true,
        username: true,
        email: true,
        firstName: true,
        lastName: true,
        phone: true,
        role: true,
        roles: true,
        isActive: true,
        studyankaAccess: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ users });
  } catch (error) {
    console.error("Users GET error:", error);
    return NextResponse.json({ error: "Kullanıcılar getirilirken hata oluştu" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user || !isAdmin(user.roles)) {
      return NextResponse.json({ error: "Yetkisiz erişim" }, { status: 403 });
    }

    const body = await request.json();
    const { username, email, password, firstName, lastName, phone, role, roles, assignedSiteIds } = body;

    if (!username || !email || !password || !firstName || !lastName) {
      return NextResponse.json({ error: "Tüm zorunlu alanlar doldurulmalıdır" }, { status: 400 });
    }

    // Rolleri normalize et: roles dizisi gönderildiyse onu kullan, yoksa tek role'a düş.
    const roleList: string[] = Array.isArray(roles) && roles.length > 0
      ? Array.from(new Set(roles.filter((r: unknown): r is string => typeof r === "string" && r.length > 0)))
      : [role || "USER"];

    if (roleList.length === 0) {
      return NextResponse.json({ error: "En az bir rol seçilmelidir" }, { status: 400 });
    }

    // Ana Rol (primary) seçili rollerden biri olmalı; değilse ilk role'a düş.
    const primaryRole = roleList.includes(role) ? role : roleList[0];

    // Sadece SUPER_ADMIN, SUPER_ADMIN rolü atayabilir
    if (roleList.includes("SUPER_ADMIN") && !hasRole(user.roles, "SUPER_ADMIN")) {
      return NextResponse.json({ error: "SUPER_ADMIN rolü atamaya yetkiniz yok" }, { status: 403 });
    }

    // Kullanıcı adı veya email kontrolü
    const exists = await prisma.user.findFirst({
      where: {
        OR: [{ username }, { email }],
      },
    });

    if (exists) {
      return NextResponse.json({ error: "Bu kullanıcı adı veya e-posta zaten kullanılıyor" }, { status: 409 });
    }

    const passwordHash = await hashPassword(password);

    const newUser = await prisma.user.create({
      data: {
        username,
        email,
        passwordHash,
        firstName,
        lastName,
        phone,
        role: primaryRole,
        roles: roleList as never,
      },
      select: {
        id: true,
        username: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        roles: true,
        isActive: true,
      },
    });

    // Şantiye atamaları (yalnızca rollerden biri SITE_CHIEF ise anlamlı)
    if (roleList.includes("SITE_CHIEF") && Array.isArray(assignedSiteIds) && assignedSiteIds.length > 0) {
      try {
        await prisma.siteMember.createMany({
          data: assignedSiteIds.map((siteId: string) => ({
            userId: newUser.id,
            siteId,
            role: "SITE_CHIEF",
          })),
          skipDuplicates: true,
        });
      } catch (err) {
        console.error("User create site assignment error:", err);
      }
    }

    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: "CREATE",
        entityType: "User",
        entityId: newUser.id,
        details: { username, email, role: primaryRole, roles: roleList },
      },
    });

    return NextResponse.json({ user: newUser }, { status: 201 });
  } catch (error) {
    console.error("Users POST error:", error);
    return NextResponse.json({ error: "Kullanıcı oluşturulurken hata oluştu" }, { status: 500 });
  }
}
