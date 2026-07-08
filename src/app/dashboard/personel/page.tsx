"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useDevice } from "@/hooks/useDevice";
import {
  Building2,
  Users,
  ChevronRight,
  MapPin,
  Download,
} from "lucide-react";

interface Site {
  id: string;
  name: string;
  description: string | null;
  address: string | null;
  status: string;
  _count: { blocks: number; sitePersonnel: number };
}

export default function PersonelPage() {
  const router = useRouter();
  const { isTablet } = useDevice();
  const [sites, setSites] = useState<Site[]>([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    fetchSites();
  }, []);

  const fetchSites = async () => {
    try {
      const res = await fetch("/api/sites?status=ACTIVE");
      if (res.ok) {
        const data = await res.json();
        setSites(data.sites || []);
      }
    } catch (err) {
      console.error("Sites fetch error:", err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-10 w-10 border-4 border-[#c0392b] border-t-transparent"></div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className={`${isTablet ? "text-2xl" : "text-2xl"} font-bold text-gray-900 flex items-center gap-3`}>
            <Users className="text-[#c0392b]" size={28} />
            Personel Kayıt
          </h1>
          <p className="text-gray-500 mt-1">Şantiye bazlı personel kayıt ve belge yönetimi</p>
        </div>
        <button
          onClick={async () => {
            setExporting(true);
            try {
              const res = await fetch("/api/personnel/export");
              if (res.ok) {
                const blob = await res.blob();
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                const cd = res.headers.get("Content-Disposition") || "";
                const m = cd.match(/filename="?([^";]+)"?/);
                a.download = m ? decodeURIComponent(m[1]) : `personel_takip_tum_santiyeler_${new Date().toISOString().split("T")[0]}.xlsx`;
                a.click();
                URL.revokeObjectURL(url);
              }
            } catch (err) { console.error(err); }
            finally { setExporting(false); }
          }}
          disabled={exporting}
          className="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2.5 rounded-lg transition-all text-sm font-medium disabled:opacity-50"
        >
          <Download size={18} />
          {exporting ? "İndiriliyor..." : "Personel Raporu"}
        </button>
      </div>

      {/* Site Cards */}
      {sites.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border p-12 text-center">
          <Building2 size={48} className="mx-auto text-gray-300 mb-4" />
          <h3 className="text-lg font-medium text-gray-500">Aktif şantiye bulunamadı</h3>
          <p className="text-gray-400 mt-1">Personel kaydı eklemek için önce bir şantiye oluşturun</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {sites.map((site) => (
            <button
              key={site.id}
              onClick={() => router.push(`/dashboard/personel/${site.id}`)}
              className="bg-white rounded-xl shadow-sm border hover:shadow-md hover:border-[#c0392b]/30 transition-all p-6 text-left group"
            >
              <div className="flex items-start justify-between mb-3">
                <div className="w-12 h-12 bg-[#c0392b]/10 rounded-lg flex items-center justify-center">
                  <Building2 size={24} className="text-[#c0392b]" />
                </div>
                <ChevronRight
                  size={24}
                  className="text-gray-300 group-hover:text-[#c0392b] transition-colors"
                />
              </div>
              <h3 className={`${isTablet ? "text-2xl" : "text-xl"} font-semibold text-gray-900 mb-1`}>
                {site.name}
              </h3>
              {site.address && (
                <p className="text-base text-gray-500 flex items-center gap-1">
                  <MapPin size={16} />
                  {site.address}
                </p>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
