"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { useDevice } from "@/hooks/useDevice";
import {
  ArrowLeft,
  ChevronLeft,
  Users,
  Plus,
  Search,
  Edit2,
  Trash2,
  Upload,
  FileText,
  Download,
  X,
  Phone,
  Building2,
  CreditCard,
  User,
  Briefcase,
} from "lucide-react";

interface PersonnelDocument {
  id: string;
  url: string;
  fileName: string | null;
  mimeType: string | null;
  createdAt: string;
}

interface Personnel {
  id: string;
  siteId: string;
  firstName: string;
  lastName: string;
  company: string | null;
  tcNo: string | null;
  phone: string | null;
  position: string | null;
  notes: string | null;
  sgkDocUrl: string | null;
  documents: PersonnelDocument[];
  isActive: boolean;
  createdAt: string;
}

interface Site {
  id: string;
  name: string;
  address: string | null;
}

interface Suggestion {
  id: string;
  firstName: string;
  lastName: string;
  company: string | null;
}

export default function PersonelSitePage() {
  const params = useParams();
  const router = useRouter();
  const { isMobile, isTablet } = useDevice();
  const siteId = params.siteId as string;

  const [site, setSite] = useState<Site | null>(null);
  const [personnel, setPersonnel] = useState<Personnel[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  // Add/Edit modal
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formFirstName, setFormFirstName] = useState("");
  const [formLastName, setFormLastName] = useState("");
  const [formCompany, setFormCompany] = useState("");
  const [formTcNo, setFormTcNo] = useState("");
  const [formPhone, setFormPhone] = useState("");
  const [formPosition, setFormPosition] = useState("");
  const [formNotes, setFormNotes] = useState("");
  const [saving, setSaving] = useState(false);

  // Autocomplete
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [activeSuggestionField, setActiveSuggestionField] = useState<"firstName" | "lastName" | null>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);

  // Delete confirm
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  // SGK upload
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  // Per-personnel upload status: 'uploading' | 'done' | undefined
  const [uploadStatus, setUploadStatus] = useState<Record<string, "uploading" | "done" | undefined>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Detail view
  const [selectedPersonnel, setSelectedPersonnel] = useState<Personnel | null>(null);

  useEffect(() => {
    if (siteId) {
      fetchSite();
      fetchPersonnel();
    }
  }, [siteId]);

  // Close suggestions on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (suggestionsRef.current && !suggestionsRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const fetchSite = async () => {
    try {
      const res = await fetch(`/api/sites/${siteId}`);
      if (res.ok) {
        const data = await res.json();
        setSite(data.site || data);
      }
    } catch (err) {
      console.error("Site fetch error:", err);
    }
  };

  const fetchPersonnel = async () => {
    try {
      const res = await fetch(`/api/personel?siteId=${siteId}`);
      if (res.ok) {
        const data = await res.json();
        const list: Personnel[] = data.personnel || [];
        setPersonnel(list);
        // Sync currently open detail popup with fresh data
        setSelectedPersonnel((prev) => (prev ? list.find((p) => p.id === prev.id) || prev : prev));
      }
    } catch (err) {
      console.error("Personnel fetch error:", err);
    } finally {
      setLoading(false);
    }
  };

  const fetchSuggestions = useCallback(async (query: string) => {
    if (query.length < 1) {
      setSuggestions([]);
      return;
    }
    try {
      const res = await fetch(`/api/personel?siteId=${siteId}&search=${encodeURIComponent(query)}`);
      if (res.ok) {
        const data = await res.json();
        setSuggestions(
          (data.personnel || []).map((p: Personnel) => ({
            id: p.id,
            firstName: p.firstName,
            lastName: p.lastName,
            company: p.company,
          }))
        );
        setShowSuggestions(true);
      }
    } catch {
      // ignore
    }
  }, [siteId]);

  const handleFirstNameChange = (val: string) => {
    setFormFirstName(val);
    setActiveSuggestionField("firstName");
    fetchSuggestions(val);
  };

  const handleLastNameChange = (val: string) => {
    setFormLastName(val);
    setActiveSuggestionField("lastName");
    fetchSuggestions(val);
  };

  const applySuggestion = (s: Suggestion) => {
    setFormFirstName(s.firstName);
    setFormLastName(s.lastName);
    setFormCompany(s.company || "");
    setShowSuggestions(false);
  };

  const resetForm = () => {
    setEditingId(null);
    setFormFirstName("");
    setFormLastName("");
    setFormCompany("");
    setFormTcNo("");
    setFormPhone("");
    setFormPosition("");
    setFormNotes("");
    setSuggestions([]);
    setShowSuggestions(false);
  };

  const openAddModal = () => {
    resetForm();
    setShowModal(true);
  };

  const openEditModal = (p: Personnel) => {
    setEditingId(p.id);
    setFormFirstName(p.firstName);
    setFormLastName(p.lastName);
    setFormCompany(p.company || "");
    setFormTcNo(p.tcNo || "");
    setFormPhone(p.phone || "");
    setFormPosition(p.position || "");
    setFormNotes(p.notes || "");
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!formFirstName.trim() || !formLastName.trim()) return;
    setSaving(true);
    try {
      const body = {
        siteId,
        firstName: formFirstName,
        lastName: formLastName,
        company: formCompany || null,
        tcNo: formTcNo || null,
        phone: formPhone || null,
        position: formPosition || null,
        notes: formNotes || null,
      };

      let res;
      if (editingId) {
        res = await fetch(`/api/personel/${editingId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
      } else {
        res = await fetch("/api/personel", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
      }

      if (res.ok) {
        setShowModal(false);
        resetForm();
        fetchPersonnel();
      } else {
        const err = await res.json();
        alert(err.error || "Hata oluştu");
      }
    } catch (err) {
      console.error("Save error:", err);
      alert("Bir hata oluştu");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/personel/${deleteId}`, { method: "DELETE" });
      if (res.ok) {
        setDeleteId(null);
        fetchPersonnel();
        if (selectedPersonnel?.id === deleteId) setSelectedPersonnel(null);
      }
    } catch (err) {
      console.error("Delete error:", err);
    } finally {
      setDeleting(false);
    }
  };

  const handleSgkUpload = async (personnelId: string, file: File) => {
    setUploadingId(personnelId);
    setUploadStatus((prev) => ({ ...prev, [personnelId]: "uploading" }));
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`/api/personel/${personnelId}/upload`, {
        method: "POST",
        body: fd,
      });
      if (res.ok) {
        await fetchPersonnel();
        setUploadStatus((prev) => ({ ...prev, [personnelId]: "done" }));
        // Reset "done" state after 2.5s
        setTimeout(() => {
          setUploadStatus((prev) => {
            const n = { ...prev };
            delete n[personnelId];
            return n;
          });
        }, 2500);
      } else {
        const err = await res.json();
        alert(err.error || "Yükleme hatası");
        setUploadStatus((prev) => {
          const n = { ...prev };
          delete n[personnelId];
          return n;
        });
      }
    } catch (err) {
      console.error("Upload error:", err);
      setUploadStatus((prev) => {
        const n = { ...prev };
        delete n[personnelId];
        return n;
      });
    } finally {
      setUploadingId(null);
    }
  };

  const handleSgkDelete = async (personnelId: string, docId?: string) => {
    try {
      const url = docId
        ? `/api/personel/${personnelId}/upload?docId=${encodeURIComponent(docId)}`
        : `/api/personel/${personnelId}/upload`;
      const res = await fetch(url, { method: "DELETE" });
      if (res.ok) {
        fetchPersonnel();
      }
    } catch (err) {
      console.error("SGK delete error:", err);
    }
  };

  // Filter personnel by search
  const filtered = personnel.filter((p) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      p.firstName.toLowerCase().includes(q) ||
      p.lastName.toLowerCase().includes(q) ||
      (p.company || "").toLowerCase().includes(q) ||
      (p.tcNo || "").includes(q)
    );
  });

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
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push("/dashboard/personel")}
            className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <ArrowLeft size={20} />
          </button>
          <div>
            <h1 className={`${isTablet ? "text-2xl" : "text-xl"} font-bold text-gray-900 flex items-center gap-2`}>
              <Users className="text-[#c0392b]" size={24} />
              {site?.name || "Şantiye"} - Personel
            </h1>
            {site?.address && (
              <p className="text-sm text-gray-500 mt-0.5">{site.address}</p>
            )}
          </div>
        </div>

        <button
          onClick={openAddModal}
          className={`flex items-center gap-2 ${isTablet ? "px-5 py-3 text-base" : "px-4 py-2.5 text-sm"} bg-[#c0392b] text-white rounded-lg hover:bg-[#a93226] transition-colors font-medium shadow-sm`}
        >
          <Plus size={18} />
          Personel Ekle
        </button>
      </div>

      {/* Search */}
      <div className="mb-4">
        <div className="relative max-w-md">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Personel ara (isim, soyisim, şirket, TC)..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className={`w-full pl-10 pr-4 ${isTablet ? "py-3 text-base" : "py-2.5 text-sm"} border rounded-lg focus:ring-2 focus:ring-[#c0392b]/20 focus:border-[#c0392b] outline-none`}
          />
        </div>
      </div>

      {/* Personnel Count */}
      <div className="mb-4 flex items-center justify-between flex-wrap gap-2">
        <div className="text-sm text-gray-500">
          Toplam {filtered.length} personel kaydı
        </div>
        <div className="text-xs text-gray-600 flex items-center gap-3 flex-wrap">
          <span className="flex items-center gap-1">
            <span className="inline-block w-3 h-3 rounded bg-green-100 border border-green-300"></span>
            <span>Yeşil: bilgileri tam</span>
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block w-3 h-3 rounded bg-yellow-100 border border-yellow-300"></span>
            <span>Sarı: bilgileri eksik</span>
          </span>
        </div>
      </div>

      {/* Personnel Table */}
      {filtered.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border p-12 text-center">
          <Users size={48} className="mx-auto text-gray-300 mb-4" />
          <h3 className="text-lg font-medium text-gray-500">
            {searchQuery ? "Arama sonucu bulunamadı" : "Henüz personel eklenmemiş"}
          </h3>
          <p className="text-gray-400 mt-1">
            {searchQuery ? "Farklı bir arama deneyin" : "Personel eklemek için yukarıdaki butonu kullanın"}
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50 border-b">
                  <th className={`text-left ${isTablet ? "px-5 py-4 text-base" : "px-4 py-3 text-sm"} font-semibold text-gray-600`}>Ad Soyad</th>
                  <th className={`text-left ${isTablet ? "px-5 py-4 text-base" : "px-4 py-3 text-sm"} font-semibold text-gray-600`}>Şirket</th>
                  <th className={`text-left ${isTablet ? "px-5 py-4 text-base" : "px-4 py-3 text-sm"} font-semibold text-gray-600 hidden md:table-cell`}>TC Kimlik No</th>
                  <th className={`text-left ${isTablet ? "px-5 py-4 text-base" : "px-4 py-3 text-sm"} font-semibold text-gray-600 hidden lg:table-cell`}>Telefon</th>
                  <th className={`text-left ${isTablet ? "px-5 py-4 text-base" : "px-4 py-3 text-sm"} font-semibold text-gray-600 hidden lg:table-cell`}>Pozisyon</th>
                  <th className={`text-center ${isTablet ? "px-5 py-4 text-base" : "px-4 py-3 text-sm"} font-semibold text-gray-600`}>SGK</th>
                  <th className={`text-center ${isTablet ? "px-5 py-4 text-base" : "px-4 py-3 text-sm"} font-semibold text-gray-600`}>İşlemler</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((p) => {
                  const isComplete = !!(p.tcNo && p.phone && p.position && p.company && ((p.documents?.length || 0) > 0 || p.sgkDocUrl));
                  const isIncomplete = !isComplete;
                  return (
                  <tr
                    key={p.id}
                    className={`border-b last:border-b-0 transition-colors cursor-pointer ${
                      isComplete
                        ? "bg-green-50 hover:bg-green-100"
                        : isIncomplete
                        ? "bg-yellow-50 hover:bg-yellow-100"
                        : "hover:bg-gray-50/50"
                    }`}
                    title={isIncomplete ? "Bilgileri eksik. Tüm alanlar (TC, telefon, pozisyon, şirket, SGK belgesi) dolduruldukça satır yeşile dönüşecek." : "Bilgileri tam."}
                    onClick={() => setSelectedPersonnel(p)}
                  >
                    <td className={`${isTablet ? "px-5 py-4 text-base" : "px-4 py-3 text-sm"}`}>
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-[#c0392b]/10 flex items-center justify-center text-[#c0392b] font-semibold text-xs">
                          {p.firstName[0]}{p.lastName[0]}
                        </div>
                        <span className="font-medium text-gray-900">{p.firstName} {p.lastName}</span>
                      </div>
                    </td>
                    <td className={`${isTablet ? "px-5 py-4 text-base" : "px-4 py-3 text-sm"} text-gray-600`}>
                      {p.company || "-"}
                    </td>
                    <td className={`${isTablet ? "px-5 py-4 text-base" : "px-4 py-3 text-sm"} text-gray-600 hidden md:table-cell`}>
                      {p.tcNo ? `${p.tcNo.slice(0, 3)}*****${p.tcNo.slice(-3)}` : "-"}
                    </td>
                    <td className={`${isTablet ? "px-5 py-4 text-base" : "px-4 py-3 text-sm"} text-gray-600 hidden lg:table-cell`}>
                      {p.phone || "-"}
                    </td>
                    <td className={`${isTablet ? "px-5 py-4 text-base" : "px-4 py-3 text-sm"} text-gray-600 hidden lg:table-cell`}>
                      {p.position || "-"}
                    </td>
                    <td className={`${isTablet ? "px-5 py-4" : "px-4 py-3"} text-center`}>
                      {p.sgkDocUrl ? (
                        <span className="inline-flex items-center gap-1 px-2 py-1 bg-green-100 text-green-700 rounded-full text-xs font-medium">
                          <FileText size={12} />
                          Var
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-1 bg-red-50 text-red-500 rounded-full text-xs font-medium">
                          Yok
                        </span>
                      )}
                    </td>
                    <td className={`${isTablet ? "px-5 py-4" : "px-4 py-3"} text-center`}>
                      <div className="flex items-center justify-center gap-1" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={() => openEditModal(p)}
                          className={`${isTablet ? "p-2.5" : "p-2"} text-blue-600 hover:bg-blue-50 rounded-lg transition-colors`}
                          title="Düzenle"
                        >
                          <Edit2 size={isTablet ? 18 : 16} />
                        </button>
                        {!p.sgkDocUrl ? (
                          <button
                            onClick={() => {
                              setUploadingId(p.id);
                              fileInputRef.current?.click();
                            }}
                            className={`${isTablet ? "p-2.5" : "p-2"} text-orange-600 hover:bg-orange-50 rounded-lg transition-colors disabled:opacity-50`}
                            title={uploadStatus[p.id] === "uploading" ? "Yükleniyor..." : uploadStatus[p.id] === "done" ? "Yüklendi" : "SGK Belgesi Yükle"}
                            disabled={uploadingId === p.id || uploadStatus[p.id] === "uploading"}
                          >
                            <Upload size={isTablet ? 18 : 16} />
                          </button>
                        ) : (
                          <a
                            href={`/api/download?type=personel&id=${p.id}&filename=${encodeURIComponent(p.sgkDocUrl.split("/").pop() || "belge")}`}
                            className={`${isTablet ? "p-2.5" : "p-2"} text-green-600 hover:bg-green-50 rounded-lg transition-colors inline-flex`}
                            title="SGK Belgesi İndir"
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            <Download size={isTablet ? 18 : 16} />
                          </a>
                        )}
                        <button
                          onClick={() => setDeleteId(p.id)}
                          className={`${isTablet ? "p-2.5" : "p-2"} text-red-500 hover:bg-red-50 rounded-lg transition-colors`}
                          title="Sil"
                        >
                          <Trash2 size={isTablet ? 18 : 16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Hidden file input for SGK upload */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file && uploadingId) {
            handleSgkUpload(uploadingId, file);
          }
          e.target.value = "";
        }}
      />

      {/* Add/Edit Modal */}
      {showModal && (
        <div className={`fixed inset-0 bg-black/50 z-50 ${isMobile ? "" : "flex items-center justify-center p-4"}`} onClick={() => { setShowModal(false); resetForm(); }}>
          <div
            className={`bg-white shadow-2xl overflow-y-auto ${isMobile ? "w-full h-full" : `rounded-2xl ${isTablet ? "w-full max-w-2xl" : "w-full max-w-lg"} max-h-[90vh]`}`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className={`sticky top-0 bg-white border-b flex items-center gap-2 ${isMobile ? "modal-safe-top px-3 pb-3" : "px-6 py-4 rounded-t-2xl justify-between"}`}>
              {isMobile && (
                <button
                  onClick={() => { setShowModal(false); resetForm(); }}
                  className="inline-flex items-center justify-center w-10 h-10 rounded-xl hover:bg-gray-100 active:scale-90 text-gray-700 shrink-0 transition"
                  aria-label="Geri"
                >
                  <ChevronLeft size={26} />
                </button>
              )}
              <h2 className={`${isTablet ? "text-xl" : "text-lg"} font-bold text-gray-900 ${isMobile ? "flex-1 min-w-0 truncate" : ""}`}>
                {editingId ? "Personel Düzenle" : "Yeni Personel Ekle"}
              </h2>
              {!isMobile && (
                <button
                  onClick={() => { setShowModal(false); resetForm(); }}
                  className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <X size={20} />
                </button>
              )}
            </div>

            <div className="p-6 space-y-4">
              {/* First Name with autocomplete */}
              <div className="relative" ref={suggestionsRef}>
                <label className={`block ${isTablet ? "text-base" : "text-sm"} font-medium text-gray-700 mb-1`}>
                  <User size={14} className="inline mr-1" />
                  Ad *
                </label>
                <input
                  type="text"
                  value={formFirstName}
                  onChange={(e) => handleFirstNameChange(e.target.value)}
                  onFocus={() => { if (formFirstName.length >= 1) { fetchSuggestions(formFirstName); setActiveSuggestionField("firstName"); } }}
                  placeholder="Personel adı"
                  className={`w-full border rounded-lg ${isTablet ? "px-4 py-3 text-base" : "px-3 py-2.5 text-sm"} focus:ring-2 focus:ring-[#c0392b]/20 focus:border-[#c0392b] outline-none`}
                  autoComplete="off"
                />
                {/* Autocomplete dropdown */}
                {showSuggestions && suggestions.length > 0 && activeSuggestionField === "firstName" && !editingId && (
                  <div className="absolute z-10 w-full mt-1 bg-white border rounded-lg shadow-lg max-h-48 overflow-y-auto">
                    {suggestions.map((s) => (
                      <button
                        key={s.id}
                        onClick={() => applySuggestion(s)}
                        className={`w-full text-left px-4 ${isTablet ? "py-3 text-base" : "py-2.5 text-sm"} hover:bg-gray-50 border-b last:border-b-0 transition-colors`}
                      >
                        <span className="font-medium">{s.firstName} {s.lastName}</span>
                        {s.company && <span className="text-gray-400 ml-2">({s.company})</span>}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Last Name */}
              <div className="relative">
                <label className={`block ${isTablet ? "text-base" : "text-sm"} font-medium text-gray-700 mb-1`}>
                  <User size={14} className="inline mr-1" />
                  Soyad *
                </label>
                <input
                  type="text"
                  value={formLastName}
                  onChange={(e) => handleLastNameChange(e.target.value)}
                  onFocus={() => { if (formLastName.length >= 1) { fetchSuggestions(formLastName); setActiveSuggestionField("lastName"); } }}
                  placeholder="Personel soyadı"
                  className={`w-full border rounded-lg ${isTablet ? "px-4 py-3 text-base" : "px-3 py-2.5 text-sm"} focus:ring-2 focus:ring-[#c0392b]/20 focus:border-[#c0392b] outline-none`}
                  autoComplete="off"
                />
                {showSuggestions && suggestions.length > 0 && activeSuggestionField === "lastName" && !editingId && (
                  <div className="absolute z-10 w-full mt-1 bg-white border rounded-lg shadow-lg max-h-48 overflow-y-auto">
                    {suggestions.map((s) => (
                      <button
                        key={s.id}
                        onClick={() => applySuggestion(s)}
                        className={`w-full text-left px-4 ${isTablet ? "py-3 text-base" : "py-2.5 text-sm"} hover:bg-gray-50 border-b last:border-b-0 transition-colors`}
                      >
                        <span className="font-medium">{s.firstName} {s.lastName}</span>
                        {s.company && <span className="text-gray-400 ml-2">({s.company})</span>}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Company */}
              <div>
                <label className={`block ${isTablet ? "text-base" : "text-sm"} font-medium text-gray-700 mb-1`}>
                  <Building2 size={14} className="inline mr-1" />
                  Şirket / Firma
                </label>
                <input
                  type="text"
                  value={formCompany}
                  onChange={(e) => setFormCompany(e.target.value)}
                  placeholder="Firma adı"
                  className={`w-full border rounded-lg ${isTablet ? "px-4 py-3 text-base" : "px-3 py-2.5 text-sm"} focus:ring-2 focus:ring-[#c0392b]/20 focus:border-[#c0392b] outline-none`}
                />
              </div>

              {/* TC No */}
              <div>
                <label className={`block ${isTablet ? "text-base" : "text-sm"} font-medium text-gray-700 mb-1`}>
                  <CreditCard size={14} className="inline mr-1" />
                  TC Kimlik No
                </label>
                <input
                  type="text"
                  value={formTcNo}
                  onChange={(e) => {
                    const val = e.target.value.replace(/\D/g, "").slice(0, 11);
                    setFormTcNo(val);
                  }}
                  placeholder="11 haneli TC Kimlik No"
                  maxLength={11}
                  className={`w-full border rounded-lg ${isTablet ? "px-4 py-3 text-base" : "px-3 py-2.5 text-sm"} focus:ring-2 focus:ring-[#c0392b]/20 focus:border-[#c0392b] outline-none`}
                />
                {formTcNo && formTcNo.length > 0 && formTcNo.length < 11 && (
                  <p className="text-xs text-amber-600 mt-1">{formTcNo.length}/11 hane girildi</p>
                )}
              </div>

              {/* Phone */}
              <div>
                <label className={`block ${isTablet ? "text-base" : "text-sm"} font-medium text-gray-700 mb-1`}>
                  <Phone size={14} className="inline mr-1" />
                  Telefon
                </label>
                <input
                  type="tel"
                  value={formPhone}
                  onChange={(e) => setFormPhone(e.target.value)}
                  placeholder="05XX XXX XX XX"
                  className={`w-full border rounded-lg ${isTablet ? "px-4 py-3 text-base" : "px-3 py-2.5 text-sm"} focus:ring-2 focus:ring-[#c0392b]/20 focus:border-[#c0392b] outline-none`}
                />
              </div>

              {/* Position */}
              <div>
                <label className={`block ${isTablet ? "text-base" : "text-sm"} font-medium text-gray-700 mb-1`}>
                  <Briefcase size={14} className="inline mr-1" />
                  Pozisyon / Ünvan
                </label>
                <input
                  type="text"
                  value={formPosition}
                  onChange={(e) => setFormPosition(e.target.value)}
                  placeholder="Örneğin: Kalıpçı, Demirci, Elektrikçi..."
                  className={`w-full border rounded-lg ${isTablet ? "px-4 py-3 text-base" : "px-3 py-2.5 text-sm"} focus:ring-2 focus:ring-[#c0392b]/20 focus:border-[#c0392b] outline-none`}
                />
              </div>

              {/* Notes */}
              <div>
                <label className={`block ${isTablet ? "text-base" : "text-sm"} font-medium text-gray-700 mb-1`}>
                  Notlar
                </label>
                <textarea
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                  placeholder="Ek notlar (opsiyonel)"
                  rows={2}
                  className={`w-full border rounded-lg ${isTablet ? "px-4 py-3 text-base" : "px-3 py-2.5 text-sm"} focus:ring-2 focus:ring-[#c0392b]/20 focus:border-[#c0392b] outline-none resize-none`}
                />
              </div>
            </div>

            <div
              className={`sticky bottom-0 bg-white border-t px-6 py-4 flex justify-end gap-3 ${isMobile ? "" : "rounded-b-2xl"}`}
              style={isMobile ? { paddingBottom: "calc(1rem + env(safe-area-inset-bottom))" } : undefined}
            >
              <button
                onClick={() => { setShowModal(false); resetForm(); }}
                className={`${isTablet ? "px-5 py-3 text-base" : "px-4 py-2.5 text-sm"} border rounded-lg text-gray-600 hover:bg-gray-50 transition-colors font-medium`}
              >
                Iptal
              </button>
              <button
                onClick={handleSave}
                disabled={saving || !formFirstName.trim() || !formLastName.trim()}
                className={`${isTablet ? "px-5 py-3 text-base" : "px-4 py-2.5 text-sm"} bg-[#c0392b] text-white rounded-lg hover:bg-[#a93226] transition-colors font-medium disabled:opacity-50`}
              >
                {saving ? "Kaydediliyor..." : editingId ? "Güncelle" : "Kaydet"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Detail Modal */}
      {selectedPersonnel && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setSelectedPersonnel(null)}>
          <div
            className={`bg-white rounded-2xl shadow-2xl ${isTablet ? "w-full max-w-2xl" : "w-full max-w-md"} max-h-[90vh] overflow-y-auto`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sticky top-0 bg-white border-b px-6 py-4 rounded-t-2xl flex items-center justify-between">
              <h2 className={`${isTablet ? "text-xl" : "text-lg"} font-bold text-gray-900`}>Personel Detay</h2>
              <button onClick={() => setSelectedPersonnel(null)} className="p-2 hover:bg-gray-100 rounded-lg">
                <X size={20} />
              </button>
            </div>
            <div className="p-6">
              <div className="flex items-center gap-4 mb-6">
                <div className="w-16 h-16 rounded-full bg-[#c0392b]/10 flex items-center justify-center text-[#c0392b] font-bold text-xl">
                  {selectedPersonnel.firstName[0]}{selectedPersonnel.lastName[0]}
                </div>
                <div>
                  <h3 className={`${isTablet ? "text-xl" : "text-lg"} font-bold text-gray-900`}>
                    {selectedPersonnel.firstName} {selectedPersonnel.lastName}
                  </h3>
                  {selectedPersonnel.position && (
                    <p className="text-sm text-gray-500">{selectedPersonnel.position}</p>
                  )}
                </div>
              </div>

              <div className="space-y-3">
                {selectedPersonnel.company && (
                  <div className="flex items-center gap-3 text-sm">
                    <Building2 size={16} className="text-gray-400 flex-shrink-0" />
                    <span className="text-gray-600">Şirket:</span>
                    <span className="font-medium">{selectedPersonnel.company}</span>
                  </div>
                )}
                {selectedPersonnel.tcNo && (
                  <div className="flex items-center gap-3 text-sm">
                    <CreditCard size={16} className="text-gray-400 flex-shrink-0" />
                    <span className="text-gray-600">TC Kimlik:</span>
                    <span className="font-medium font-mono">{selectedPersonnel.tcNo}</span>
                  </div>
                )}
                {selectedPersonnel.phone && (
                  <div className="flex items-center gap-3 text-sm">
                    <Phone size={16} className="text-gray-400 flex-shrink-0" />
                    <span className="text-gray-600">Telefon:</span>
                    <span className="font-medium">{selectedPersonnel.phone}</span>
                  </div>
                )}
                {selectedPersonnel.notes && (
                  <div className="mt-4 p-3 bg-gray-50 rounded-lg">
                    <p className="text-sm text-gray-600">{selectedPersonnel.notes}</p>
                  </div>
                )}

                {/* Belgeler */}
                <div className="mt-4 p-4 rounded-lg border">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-sm font-semibold text-gray-700">Belgeler</h4>
                    <button
                      onClick={() => {
                        setUploadingId(selectedPersonnel.id);
                        fileInputRef.current?.click();
                      }}
                      className={`px-3 py-1.5 text-xs rounded-lg transition-colors inline-flex items-center gap-1 text-white ${
                        uploadStatus[selectedPersonnel.id] === "done"
                          ? "bg-green-600 hover:bg-green-700"
                          : uploadStatus[selectedPersonnel.id] === "uploading"
                          ? "bg-orange-400"
                          : "bg-orange-500 hover:bg-orange-600"
                      } disabled:opacity-70`}
                      disabled={uploadingId === selectedPersonnel.id || uploadStatus[selectedPersonnel.id] === "uploading"}
                    >
                      <Upload size={14} />
                      {uploadStatus[selectedPersonnel.id] === "uploading"
                        ? "Yükleniyor..."
                        : uploadStatus[selectedPersonnel.id] === "done"
                        ? "Yüklendi"
                        : "Yükle"}
                    </button>
                  </div>
                  {(selectedPersonnel.documents?.length || 0) === 0 ? (
                    <span className="text-sm text-red-500">Belge yüklenmemiş</span>
                  ) : (
                    <div className="max-h-60 overflow-y-auto pr-1 space-y-2">
                      {selectedPersonnel.documents.map((doc) => {
                        const display = doc.fileName || doc.url.split("/").pop() || "belge";
                        return (
                          <div
                            key={doc.id}
                            className="flex items-center justify-between gap-2 p-2 bg-gray-50 rounded-lg border border-gray-200"
                          >
                            <span className="flex items-center gap-2 text-sm text-gray-700 min-w-0">
                              <FileText size={16} className="text-green-600 flex-shrink-0" />
                              <span className="truncate" title={display}>{display}</span>
                            </span>
                            <div className="flex gap-1.5 flex-shrink-0">
                              <a
                                href={`/api/download?type=personel&id=${selectedPersonnel.id}&docId=${doc.id}&filename=${encodeURIComponent(display)}`}
                                className="px-2.5 py-1 text-xs bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors inline-flex items-center gap-1"
                                target="_blank"
                                rel="noopener noreferrer"
                                title="İndir"
                              >
                                <Download size={13} />
                                İndir
                              </a>
                              <button
                                onClick={() => handleSgkDelete(selectedPersonnel.id, doc.id)}
                                className="px-2.5 py-1 text-xs bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors"
                                title="Sil"
                              >
                                Sil
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>

              <div className="flex gap-3 mt-6">
                <button
                  onClick={() => { setSelectedPersonnel(null); openEditModal(selectedPersonnel); }}
                  className={`flex-1 flex items-center justify-center gap-2 ${isTablet ? "py-3 text-base" : "py-2.5 text-sm"} bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium`}
                >
                  <Edit2 size={16} />
                  Duzenle
                </button>
                <button
                  onClick={() => { setSelectedPersonnel(null); setDeleteId(selectedPersonnel.id); }}
                  className={`flex items-center justify-center gap-2 ${isTablet ? "px-5 py-3 text-base" : "px-4 py-2.5 text-sm"} bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors font-medium`}
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation */}
      {deleteId && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setDeleteId(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6" onClick={(e) => e.stopPropagation()}>
            <div className="text-center mb-4">
              <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-3">
                <Trash2 size={24} className="text-red-500" />
              </div>
              <h3 className="text-lg font-bold text-gray-900">Personeli Sil</h3>
              <p className="text-sm text-gray-500 mt-1">Bu personel kaydını silmek istediğinize emin misiniz? SGK belgesi de silinecektir.</p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setDeleteId(null)}
                className="flex-1 py-2.5 border rounded-lg text-gray-600 hover:bg-gray-50 text-sm font-medium"
              >
                Vazgeç
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="flex-1 py-2.5 bg-red-500 text-white rounded-lg hover:bg-red-600 text-sm font-medium disabled:opacity-50"
              >
                {deleting ? "Siliniyor..." : "Evet, Sil"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
