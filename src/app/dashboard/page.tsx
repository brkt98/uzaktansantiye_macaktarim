"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useBodyScrollLock } from "@/hooks/useBodyScrollLock";
import {
  Building2,
  Plus,
  ArrowRight,
  HardHat,
  X,
  Users,
} from "lucide-react";
import { useUser } from "./layout";
import SiteChiefDashboard from "./components/SiteChiefDashboard";
import AdminDashboard from "./components/AdminDashboard";
import MuhasebeDashboard from "./components/MuhasebeDashboard";

interface Site {
  id: string;
  name: string;
  description: string;
  status: string;
  startDate: string;
  endDate: string;
  _count: {
    blocks: number;
    categories: number;
    costRecords: number;
  };
}

interface PersonnelSummary {
  siteId: string;
  siteName: string;
  workName: string;
  companies: string[];
  personCount: number;
}

interface PersonnelDetail {
  id: string;
  siteId: string;
  siteName: string;
  workName: string;
  floorName: string | null;
  constructionType: string;
  personnelName: string;
  company: string | null;
  workDuration: string;
}

const constructionTypeLabels: Record<string, string> = {
  KABA_INSAAT: "Kaba İnşaat",
  INCE_INSAAT: "İnce İnşaat",
  BINA_GENEL: "Bina Genel",
  PEYZAJ: "Peyzaj",
};

export default function DashboardPage() {
  const user = useUser();
  const [sites, setSites] = useState<Site[]>([]);
  const [loading, setLoading] = useState(true);

  const [personnelSummary, setPersonnelSummary] = useState<PersonnelSummary[]>([]);
  const [personnelDetails, setPersonnelDetails] = useState<PersonnelDetail[]>([]);
  const [personnelDate, setPersonnelDate] = useState("");
  const [personnelUniqueTotal, setPersonnelUniqueTotal] = useState(0);
  const [personnelLoading, setPersonnelLoading] = useState(true);
  const [showDetailPopup, setShowDetailPopup] = useState(false);
  useBodyScrollLock(showDetailPopup);

  useEffect(() => {
    fetchSites();
    fetchPersonnelToday();
  }, []);

  // Sayfa odaklanınca (personel ekleyip geri dönülünce) widget'ı yenile
  useEffect(() => {
    const handleFocus = () => {
      fetchPersonnelToday();
    };
    window.addEventListener("focus", handleFocus);
    return () => window.removeEventListener("focus", handleFocus);
  }, []);

  const fetchSites = async () => {
    try {
      const res = await fetch("/api/sites");
      const data = await res.json();
      setSites(data.sites || []);
    } catch (error) {
      console.error("Sites fetch error:", error);
    } finally {
      setLoading(false);
    }
  };

  const fetchPersonnelToday = async () => {
    try {
      const res = await fetch("/api/personnel/today");
      const data = await res.json();
      setPersonnelSummary(data.summary || []);
      setPersonnelDetails(data.details || []);
      setPersonnelDate(data.date || "");
      setPersonnelUniqueTotal(data.uniqueTotal || 0);
    } catch (error) {
      console.error("Personnel today fetch error:", error);
    } finally {
      setPersonnelLoading(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "ACTIVE":
        return "bg-green-500";
      case "COMPLETED":
        return "bg-blue-500";
      case "ARCHIVED":
        return "bg-gray-500";
      case "PLANNED":
        return "bg-yellow-500";
      default:
        return "bg-gray-500";
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case "ACTIVE":
        return "Aktif";
      case "COMPLETED":
        return "Tamamlandı";
      case "ARCHIVED":
        return "Arşivlendi";
      case "PLANNED":
        return "Planlandı";
      default:
        return status;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-10 w-10 border-4 border-[#c0392b] border-t-transparent"></div>
      </div>
    );
  }

  // Açılış panosu Ana Rol'e (primary) göre belirlenir.
  // Müdür'e özel ana sayfa yok → Şef panosunu görür (kullanıcı talebi: Ayşegül şef ama Müdür rolüyle).
  if (user?.role === "SITE_CHIEF" || user?.role === "MANAGER") {
    return <SiteChiefDashboard userId={user.id} userFirstName={user.firstName} userLastName={user.lastName} />;
  }

  if (user?.role === "ADMIN" || user?.role === "SUPER_ADMIN") {
    return <AdminDashboard firstName={user.firstName} />;
  }

  if (user?.role === "MUHASEBE") {
    return <MuhasebeDashboard firstName={user.firstName} />;
  }

  return (
    <div className="space-y-8">
      {/* Başlık */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Ana Sayfa</h1>
          <p className="text-gray-500 mt-1">Şantiye takip sistemi genel görünüm</p>
        </div>
        <Link
          href="/dashboard/sites/new"
          className="inline-flex items-center gap-2 bg-[#c0392b] hover:bg-[#922b21] text-white px-4 py-2.5 rounded-lg transition-all text-sm font-medium"
        >
          <Plus size={18} />
          Yeni Şantiye
        </Link>
      </div>

      {/* Günlük Personel Widget */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 bg-[#1e3a5f]">
          <div className="flex items-center gap-2 text-white">
            <HardHat size={18} />
            <h2 className="font-semibold text-sm">Günlük Personel Özeti</h2>
            {personnelDate && (
              <span className="ml-2 text-xs opacity-75">({personnelDate})</span>
            )}
          </div>
          {personnelSummary.length > 0 && (
            <button
              onClick={() => setShowDetailPopup(true)}
              className="text-xs bg-white/20 hover:bg-white/30 text-white px-3 py-1 rounded transition-colors"
            >
              Detay
            </button>
          )}
        </div>
        <div className="p-4">
          {personnelLoading ? (
            <div className="flex items-center justify-center py-6">
              <div className="animate-spin rounded-full h-6 w-6 border-2 border-[#1e3a5f] border-t-transparent"></div>
            </div>
          ) : personnelSummary.length === 0 ? (
            <div className="text-center py-6 text-gray-400 text-sm">
              <Users className="mx-auto mb-2 text-gray-300" size={32} />
              Bugün henüz personel kaydı girilmemiş
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left py-2 px-3 text-gray-600 font-semibold">Şantiye</th>
                    <th className="text-left py-2 px-3 text-gray-600 font-semibold">Yapılan İş</th>
                    <th className="text-left py-2 px-3 text-gray-600 font-semibold">Firma</th>
                    <th className="text-center py-2 px-3 text-gray-600 font-semibold">Kişi Sayısı</th>
                  </tr>
                </thead>
                <tbody>
                  {personnelSummary.map((row, idx) => (
                    <tr key={idx} className={idx % 2 === 0 ? "bg-gray-50" : ""}>
                      <td className="py-2 px-3 font-medium text-gray-800">{row.siteName}</td>
                      <td className="py-2 px-3 text-gray-700">{row.workName}</td>
                      <td className="py-2 px-3 text-gray-600">
                        {row.companies.length > 0 ? row.companies.join(", ") : "-"}
                      </td>
                      <td className="py-2 px-3 text-center">
                        <span className="inline-flex items-center justify-center bg-[#1e3a5f] text-white text-xs font-bold rounded-full w-7 h-7">
                          {row.personCount}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-gray-300">
                    <td colSpan={3} className="py-2 px-3 font-bold text-gray-800 text-right">Toplam:</td>
                    <td className="py-2 px-3 text-center">
                      <span className="inline-flex items-center justify-center bg-[#c0392b] text-white text-xs font-bold rounded-full w-7 h-7">
                        {personnelUniqueTotal}
                      </span>
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Detay Popup */}
      {showDetailPopup && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowDetailPopup(false)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-3 bg-[#1e3a5f] rounded-t-xl">
              <div className="flex items-center gap-2 text-white">
                <HardHat size={18} />
                <h3 className="font-semibold">Günlük Personel Detayı</h3>
                {personnelDate && (
                  <span className="ml-2 text-xs opacity-75">({personnelDate})</span>
                )}
              </div>
              <button onClick={() => setShowDetailPopup(false)} className="text-white/70 hover:text-white">
                <X size={20} />
              </button>
            </div>
            <div className="overflow-auto flex-1 p-4">
              {personnelDetails.length === 0 ? (
                <p className="text-center text-gray-400 py-8">Kayıt bulunamadı</p>
              ) : (
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-white">
                    <tr className="border-b-2 border-gray-200">
                      <th className="text-left py-2 px-2 text-gray-600 font-semibold">#</th>
                      <th className="text-left py-2 px-2 text-gray-600 font-semibold">Şantiye</th>
                      <th className="text-left py-2 px-2 text-gray-600 font-semibold">İnşaat Türü</th>
                      <th className="text-left py-2 px-2 text-gray-600 font-semibold">Yapılan İş</th>
                      <th className="text-left py-2 px-2 text-gray-600 font-semibold">Kat/Daire</th>
                      <th className="text-left py-2 px-2 text-gray-600 font-semibold">Personel Adı</th>
                      <th className="text-left py-2 px-2 text-gray-600 font-semibold">Firma</th>
                      <th className="text-center py-2 px-2 text-gray-600 font-semibold">Çalışma</th>
                    </tr>
                  </thead>
                  <tbody>
                    {personnelDetails.map((d, idx) => (
                      <tr key={d.id} className={idx % 2 === 0 ? "bg-gray-50" : ""}>
                        <td className="py-1.5 px-2 text-gray-400 text-xs">{idx + 1}</td>
                        <td className="py-1.5 px-2 font-medium text-gray-800">{d.siteName}</td>
                        <td className="py-1.5 px-2 text-gray-600">{constructionTypeLabels[d.constructionType] || d.constructionType}</td>
                        <td className="py-1.5 px-2 text-gray-700">{d.workName}</td>
                        <td className="py-1.5 px-2 text-gray-600">{d.floorName || "-"}</td>
                        <td className="py-1.5 px-2 text-gray-800">{d.personnelName}</td>
                        <td className="py-1.5 px-2 text-gray-600">{d.company || "-"}</td>
                        <td className="py-1.5 px-2 text-center whitespace-nowrap">
                          <span className={`text-xs px-2 py-0.5 rounded-full ${d.workDuration === "FULL_DAY" ? "bg-green-100 text-green-700" : "bg-yellow-100 text-yellow-700"}`}>
                            {d.workDuration === "FULL_DAY" ? "Tam Gün" : "Yarım Gün"}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            <div className="border-t px-5 py-3 flex items-center justify-between text-sm text-gray-500">
              <span>Toplam: <strong className="text-gray-800">{personnelDetails.length}</strong> personel kaydı</span>
              <button
                onClick={() => setShowDetailPopup(false)}
                className="px-4 py-1.5 bg-gray-200 hover:bg-gray-300 rounded-lg text-gray-700 transition-colors"
              >
                Kapat
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Şantiyeler */}
      <div>
        {sites.length === 0 ? (
          <div className="bg-white rounded-xl p-12 text-center shadow-sm border border-gray-100">
            <Building2 className="mx-auto text-gray-300 mb-4" size={48} />
            <p className="text-gray-500 mb-4">Henüz şantiye bulunmuyor</p>
            <Link
              href="/dashboard/sites/new"
              className="inline-flex items-center gap-2 text-[#c0392b] hover:text-[#922b21] font-medium text-sm"
            >
              <Plus size={16} />
              İlk şantiyeyi oluştur
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {sites.map((site) => (
              <Link
                key={site.id}
                href={`/dashboard/sites/${site.id}`}
                className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden card-hover group"
              >
                <div className="h-2 bg-gradient-to-r from-[#c0392b] to-[#e74c3c]" />
                <div className="p-5">
                  <div className="flex items-start justify-between mb-3">
                    <h3 className="font-semibold text-gray-800 group-hover:text-[#c0392b] transition-colors text-2xl">
                      {site.name}
                    </h3>
                    <span className={`px-2 py-0.5 rounded-full text-xs text-white ${getStatusColor(site.status)}`}>
                      {getStatusLabel(site.status)}
                    </span>
                  </div>
                  {site.description && (
                    <p className="text-sm text-gray-500 mb-3 line-clamp-2">{site.description}</p>
                  )}
                  <div className="flex items-center justify-end text-xs text-gray-400">
                    <ArrowRight size={14} className="text-gray-300 group-hover:text-[#c0392b] transition-colors" />
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
