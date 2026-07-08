"use client";

import { useEffect, useState } from "react";
import { Building2, AlertTriangle, ArrowLeft, Loader2 } from "lucide-react";
import AriszaTracker from "@/app/dashboard/components/AriszaTracker";

interface SiteOption {
  id: string;
  name: string;
}

export default function SantiyeAriszaPage() {
  const [sites, setSites] = useState<SiteOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSite, setSelectedSite] = useState<SiteOption | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/sites");
        if (!res.ok) return;
        const data = await res.json();
        const list: SiteOption[] = (data.sites || []).map((s: { id: string; name: string }) => ({ id: s.id, name: s.name }));
        if (cancelled) return;
        setSites(list);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Şantiye seçildiyse: tracker göster
  if (selectedSite) {
    return (
      <div className="max-w-7xl mx-auto p-4 sm:p-6">
        <div className="flex items-center justify-between mb-4">
          <button
            onClick={() => setSelectedSite(null)}
            className="flex items-center gap-2 px-3 py-2 bg-white border border-gray-300 hover:bg-gray-50 rounded-lg text-sm font-medium"
          >
            <ArrowLeft size={16} />
            Şantiye değiştir
          </button>
        </div>
        <AriszaTracker
          key={selectedSite.id}
          mode="page"
          scopedSiteId={selectedSite.id}
          scopedSiteName={selectedSite.name}
          kind="SANTIYE"
        />
      </div>
    );
  }

  // Şantiye seçim ekranı
  return (
    <div className="max-w-6xl mx-auto p-4 sm:p-6">
      <div className="flex items-center gap-3 mb-6">
        <AlertTriangle className="text-rose-600" size={28} />
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Şantiye Arıza</h1>
          <p className="text-gray-500 text-sm">Şantiye seçin ve arıza kayıtlarını görüntüleyin</p>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20 bg-white rounded-xl border border-gray-200">
          <Loader2 className="animate-spin text-rose-600" size={32} />
        </div>
      ) : sites.length === 0 ? (
        <div className="text-center py-20 bg-white rounded-xl border border-gray-200">
          <Building2 className="mx-auto text-gray-300 mb-3" size={48} />
          <p className="text-gray-500">Görüntüleyebileceğiniz şantiye bulunmuyor</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
          {sites.map((site) => (
            <button
              key={site.id}
              onClick={() => setSelectedSite(site)}
              className="bg-white border-2 border-gray-200 hover:border-rose-600 hover:shadow-lg rounded-2xl p-8 text-center transition-all aspect-square flex flex-col items-center justify-center group"
            >
              <Building2 size={56} className="text-rose-600 mb-4 group-hover:scale-110 transition-transform" />
              <p className="font-bold text-lg text-gray-800 group-hover:text-rose-600">{site.name}</p>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
