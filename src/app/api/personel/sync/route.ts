import { NextResponse } from "next/server";
import { getCurrentUser, isAdmin } from "@/lib/auth";
import { syncAllMatchedPersonnel } from "@/lib/personnel-sync";

export async function POST() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
    }

    if (!isAdmin(user.roles)) {
      return NextResponse.json({ error: "Bu işlem için admin yetkisi gerekli" }, { status: 403 });
    }

    const result = await syncAllMatchedPersonnel();
    return NextResponse.json({ success: true, result });
  } catch (error) {
    console.error("Personnel sync error:", error);
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}
