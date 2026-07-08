"use client";

import { UserCog } from "lucide-react";
import { useUser } from "../layout";
import DeleteAccountSection from "../_components/DeleteAccountSection";

/**
 * Hesap Yönetimi — TÜM kullanıcılar (admin olmayanlar için Ayarlar erişimi yok;
 * hesap silme buradan yapılır). Menüden erişilir.
 */
export default function HesapYonetimiPage() {
  const user = useUser();
  const fullName = [user?.firstName, user?.lastName].filter(Boolean).join(" ") || "—";

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-[#1e3a5f]/10 rounded-lg flex items-center justify-center">
          <UserCog className="text-[#1e3a5f]" size={22} />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Hesap Yönetimi</h1>
          <p className="text-gray-500 mt-0.5 text-sm">Hesap bilgileriniz ve hesap silme</p>
        </div>
      </div>

      {/* Masaüstünde yan yana, mobilde alt alta (normal ayar ekranı düzeni) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        {/* Hesap bilgileri (salt görüntü) */}
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
          <h3 className="font-semibold text-gray-800 mb-4">Bilgilerim</h3>
          <div className="space-y-3 text-sm">
            <Row label="Ad Soyad" value={fullName} />
            <Row label="Kullanıcı adı" value={user?.username || "—"} />
            <Row label="E-posta" value={user?.email || "—"} />
          </div>
        </div>

        {/* Hesabımı Sil */}
        <div>
          <DeleteAccountSection />
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2 border-b border-gray-50 last:border-0">
      <span className="text-gray-500 shrink-0">{label}</span>
      <span className="font-medium text-gray-800 text-right break-all">{value}</span>
    </div>
  );
}
