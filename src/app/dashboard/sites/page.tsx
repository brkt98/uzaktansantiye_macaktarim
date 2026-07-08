"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Building2, Plus, Search, ArrowRight, Calendar, ArrowLeft } from "lucide-react";
import { format } from "date-fns";
import { tr } from "date-fns/locale";
import { useDevice } from "@/hooks/useDevice";

interface Site {
  id: string;
  name: string;
  description: string;
  address: string;
  status: string;
  startDate: string;
  endDate: string;
  _count: { blocks: number; categories: number; costRecords: number };
}

export default function SitesPage() {
  const [sites, setSites] = useState<Site[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const { isMobile } = useDevice();

  useEffect(() => {
    fetchSites();
  }, []);

  const fetchSites = async () => {
    try {
      const res = await fetch("/api/sites");
      const data = await res.json();
      setSites(data.sites || []);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const filteredSites = sites.filter((site) => {
    const matchesSearch = site.name.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === "ALL" || site.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case "ACTIVE": return "bg-green-500";
      case "COMPLETED": return "bg-blue-500";
      case "ARCHIVED": return "bg-gray-500";
      case "PLANNED": return "bg-yellow-500";
      default: return "bg-gray-500";
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case "ACTIVE": return "Aktif";
      case "COMPLETED": return "Tamamlandı";
      case "ARCHIVED": return "Arşivlendi";
      case "PLANNED": return "Planlandı";
      default: return status;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Şantiyeler</h1>
          <p className="text-gray-500 mt-1">Tüm şantiyeleri görüntüleyin ve yönetin</p>
        </div>
        <div className="flex items-center gap-2">
          {isMobile && (
            <Link
              href="/dashboard"
              className="mr-auto inline-flex items-center gap-2 px-4 py-2.5 bg-[#1e3a5f] hover:bg-[#2a4a6f] text-white rounded-lg text-sm font-medium transition-all active:scale-95"
            >
              <ArrowLeft size={16} /> Ana Sayfa
            </Link>
          )}
          <Link
            href="/dashboard/sites/new"
            className="inline-flex items-center gap-2 bg-[#c0392b] hover:bg-[#922b21] text-white px-4 py-2.5 rounded-lg transition-all text-sm font-medium"
          >
            <Plus size={18} />
            Yeni Şantiye
          </Link>
        </div>
      </div>

      {/* Filtreler */}
      <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 flex flex-col sm:flex-row gap-3">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
          <input
            type="text"
            placeholder="Şantiye ara..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-[#c0392b] focus:border-transparent outline-none text-sm"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-4 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-[#c0392b]"
        >
          <option value="ALL">Tüm Durumlar</option>
          <option value="ACTIVE">Aktif</option>
          <option value="COMPLETED">Tamamlandı</option>
          <option value="PLANNED">Planlandı</option>
          <option value="ARCHIVED">Arşivlendi</option>
        </select>
      </div>

      {/* Şantiye Listesi */}
      {loading ? (
        <div className="flex items-center justify-center h-40">
          <div className="animate-spin rounded-full h-8 w-8 border-4 border-[#c0392b] border-t-transparent"></div>
        </div>
      ) : filteredSites.length === 0 ? (
        <div className="bg-white rounded-xl p-12 text-center shadow-sm border border-gray-100">
          <Building2 className="mx-auto text-gray-300 mb-4" size={48} />
          <p className="text-gray-500">
            {search || statusFilter !== "ALL" ? "Filtreye uygun şantiye bulunamadı" : "Henüz şantiye bulunmuyor"}
          </p>
        </div>
      ) : (
        isMobile ? (
          /* Mobil: kompakt tam-genişlik satırlar */
          <div className="flex flex-col gap-2.5">
            {filteredSites.map((site) => (
              <Link
                key={site.id}
                href={`/dashboard/sites/${site.id}`}
                className="pressable pressable-dark mob-fade-up bg-white rounded-2xl shadow-sm border border-gray-100 active:scale-[0.99] transition-all p-3.5 flex items-center gap-3.5"
                style={{ animationDelay: `${Math.min(filteredSites.indexOf(site), 8) * 40}ms` }}
              >
                <div className="w-12 h-12 shrink-0 bg-blue-50 rounded-xl flex items-center justify-center">
                  <Building2 size={24} className="text-[#1e3a5f]" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-base text-gray-800 truncate">{site.name}</h3>
                    <span className={`shrink-0 px-2 py-0.5 rounded-full text-[10px] font-medium text-white ${getStatusColor(site.status)}`}>
                      {getStatusLabel(site.status)}
                    </span>
                  </div>
                  <div className="text-xs text-gray-500 mt-0.5 flex items-center gap-3">
                    <span>{site._count?.blocks ?? 0} blok</span>
                    {site.startDate && (
                      <span className="flex items-center gap-1">
                        <Calendar size={12} />
                        {format(new Date(site.startDate), "MMM yyyy", { locale: tr })}
                      </span>
                    )}
                  </div>
                </div>
                <ArrowRight size={18} className="shrink-0 text-gray-300" />
              </Link>
            ))}
          </div>
        ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {filteredSites.map((site) => (
            <Link
              key={site.id}
              href={`/dashboard/sites/${site.id}`}
              className="bg-white rounded-2xl shadow-sm border-2 border-gray-100 hover:border-[#1e3a5f] hover:shadow-lg transition-all p-8 flex flex-col items-center justify-center gap-4 text-center group aspect-square"
            >
              <div className="w-20 h-20 bg-blue-50 group-hover:bg-[#1e3a5f] rounded-2xl flex items-center justify-center transition-colors">
                <Building2 size={40} className="text-[#1e3a5f] group-hover:text-white transition-colors" />
              </div>
              <div className="flex flex-col items-center gap-1">
                <h3 className="font-bold text-xl text-gray-800 group-hover:text-[#1e3a5f] line-clamp-2">{site.name}</h3>
                <span className={`px-3 py-0.5 rounded-full text-xs text-white ${getStatusColor(site.status)}`}>
                  {getStatusLabel(site.status)}
                </span>
              </div>
              <div className="text-sm text-gray-500 flex items-center gap-3">
                <span>{site._count?.blocks ?? 0} blok</span>
                {site.startDate && (
                  <span className="flex items-center gap-1">
                    <Calendar size={12} />
                    {format(new Date(site.startDate), "MMM yyyy", { locale: tr })}
                  </span>
                )}
              </div>
            </Link>
          ))}
        </div>
        )
      )}
    </div>
  );
}
