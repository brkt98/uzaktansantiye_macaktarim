import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser, isAdmin, hashPassword, invalidateUserCache, hasRole } from "@/lib/auth";

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getCurrentUser();
    if (!user || !isAdmin(user.roles)) {
      return NextResponse.json({ error: "Yetkisiz erişim" }, { status: 403 });
    }

    const { id } = await params;
    const body = await request.json();
    const { firstName, lastName, email, phone, role, roles, password } = body;

    if (!firstName || !lastName || !email) {
      return NextResponse.json({ error: "Ad, soyad ve e-posta zorunludur" }, { status: 400 });
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

    // Sadece SUPER_ADMIN, SUPER_ADMIN rolü atayabilir veya bir SUPER_ADMIN'in rolünü değiştirebilir
    if (!hasRole(user.roles, "SUPER_ADMIN")) {
      if (roleList.includes("SUPER_ADMIN")) {
        return NextResponse.json({ error: "SUPER_ADMIN rolü atamaya yetkiniz yok" }, { status: 403 });
      }
      const target = await prisma.user.findUnique({ where: { id }, select: { role: true, roles: true } });
      if (target && hasRole(target.roles.length > 0 ? target.roles : [target.role], "SUPER_ADMIN")) {
        return NextResponse.json({ error: "SUPER_ADMIN kullanıcıyı düzenlemeye yetkiniz yok" }, { status: 403 });
      }
    }

    // Email benzersizlik kontrolü (kendi hariç)
    const emailExists = await prisma.user.findFirst({
      where: { email, NOT: { id } },
    });
    if (emailExists) {
      return NextResponse.json({ error: "Bu e-posta adresi başka bir kullanıcı tarafından kullanılıyor" }, { status: 409 });
    }

    const updateData: Record<string, unknown> = {
      firstName,
      lastName,
      email,
      phone: phone || null,
      role: primaryRole,
      roles: roleList,
    };

    if (password && password.trim().length > 0) {
      updateData.passwordHash = await hashPassword(password);
    }

    const updated = await prisma.user.update({
      where: { id },
      data: updateData,
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
        createdAt: true,
      },
    });

    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: "UPDATE",
        entityType: "User",
        entityId: id,
        details: { firstName, lastName, email, role: primaryRole, roles: roleList },
      },
    });

    invalidateUserCache(id);

    return NextResponse.json({ user: updated });
  } catch (error) {
    console.error("User PUT error:", error);
    return NextResponse.json({ error: "Kullanıcı güncellenirken hata oluştu" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getCurrentUser();
    if (!user || !isAdmin(user.roles)) {
      return NextResponse.json({ error: "Yetkisiz erişim" }, { status: 403 });
    }

    const { id } = await params;

    // Kendini silmeyi engelle
    if (id === user.id) {
      return NextResponse.json({ error: "Kendi hesabınızı silemezsiniz" }, { status: 400 });
    }

    // Sadece SUPER_ADMIN, SUPER_ADMIN kullanıcıyı silebilir
    if (!hasRole(user.roles, "SUPER_ADMIN")) {
      const target = await prisma.user.findUnique({ where: { id }, select: { role: true, roles: true } });
      if (target && hasRole(target.roles.length > 0 ? target.roles : [target.role], "SUPER_ADMIN")) {
        return NextResponse.json({ error: "SUPER_ADMIN kullanıcıyı silmeye yetkiniz yok" }, { status: 403 });
      }
    }

    // İlişkili kayıtları temizle, sonra kullanıcıyı sil
    await prisma.$transaction([
      prisma.auditLog.deleteMany({ where: { userId: id } }),
      prisma.user.delete({ where: { id } }),
    ]);

    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: "DELETE",
        entityType: "User",
        entityId: id,
        details: {},
      },
    });

    invalidateUserCache(id);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("User DELETE error:", error);
    return NextResponse.json({ error: "Kullanıcı silinirken hata oluştu" }, { status: 500 });
  }
}
