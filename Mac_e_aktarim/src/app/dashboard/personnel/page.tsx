"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Building2,
  HardHat,
  Download,
  ChevronRight,
  MapPin,
  Layers,
} from "lucide-react";

interface Site {
  id: string;
  name: string;
  description: string | null;
  address: string | null;
  status: string;
  _count: { blocks: number };
}

export default function PersonnelPage() {
  const router = useRouter();
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

  const handleExportAll = async () => {
    setExporting(true);
    try {
      const res = await fetch("/api/personnel/export");
      if (res.ok) {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        // Sunucu Content-Disposition başlığında tarihli dosya adı verir; oradan al, yoksa fallback
        const cd = res.headers.get("Content-Disposition") || "";
        const m = cd.match(/filename="?([^";]+)"?/);
        a.download = m ? decodeURIComponent(m[1]) : `personel_takip_tum_santiyeler_${new Date().toISOString().split("T")[0]}.xlsx`;
        a.click();
        URL.revokeObjectURL(url);
      }
    } catch (err) {
      console.error("Export error:", err);
    } finally {
      setExporting(false);
    }
  };

  const statusColors: Record<string, string> = {
    ACTIVE: "bg-green-100 text-green-700",
    COMPLETED: "bg-blue-100 text-blue-700",
    ARCHIVED: "bg-gray-100 text-gray-600",
    PLANNED: "bg-yellow-100 text-yellow-700",
  };

  const statusLabels: Record<string, string> = {
    ACTIVE: "Aktif",
    COMPLETED: "Tamamlandı",
    ARCHIVED: "Arşivlendi",
    PLANNED: "Planlandı",
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
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-3">
            <HardHat className="text-[#c0392b]" size={28} />
            Personel Takip
          </h1>
          <p className="text-gray-500 mt-1">Şantiye bazlı günlük personel takibi</p>
        </div>
        <button
          onClick={handleExportAll}
          disabled={exporting}
          className="flex items-center gap-2 px-4 py-2.5 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50"
        >
          <Download size={18} />
          {exporting ? "İndiriliyor..." : "Detaylı Rapor İndir"}
        </button>
      </div>

      {/* Sites Grid */}
      {sites.length === 0 ? (
        <div className="text-center py-16">
          <Building2 className="mx-auto text-gray-300 mb-4" size={48} />
          <p className="text-gray-500">Aktif şantiye bulunamadı</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {sites.map((site) => (
            <div
              key={site.id}
              onClick={() => router.push(`/dashboard/personnel/${site.id}`)}
              className="bg-white rounded-xl border border-gray-200 p-6 hover:shadow-lg hover:border-[#c0392b]/30 transition-all cursor-pointer group"
            >
              <div className="flex items-start justify-between mb-4">
                <div className="w-12 h-12 bg-[#c0392b]/10 rounded-xl flex items-center justify-center">
                  <Building2 className="text-[#c0392b]" size={24} />
                </div>
                <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${statusColors[site.status] || "bg-gray-100 text-gray-600"}`}>
                  {statusLabels[site.status] || site.status}
                </span>
              </div>

              <h3 className="font-semibold text-gray-900 text-lg mb-2 group-hover:text-[#c0392b] transition-colors">
                {site.name}
              </h3>

              {site.address && (
                <div className="flex items-center gap-1.5 text-sm text-gray-500 mb-3">
                  <MapPin size={14} />
                  <span className="truncate">{site.address}</span>
                </div>
              )}

              <div className="flex items-center justify-between pt-3 border-t border-gray-100">
                <div className="flex items-center gap-1.5 text-sm text-gray-500">
                  <Layers size={14} />
                  <span>{site._count?.blocks || 0} Blok</span>
                </div>
                <ChevronRight size={18} className="text-gray-400 group-hover:text-[#c0392b] transition-colors" />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
