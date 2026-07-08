"use client";

import { useState, useEffect, useCallback, use } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Building2,
  HardHat,
  Download,
  Layers,
  Hammer,
  X,
  Plus,
  Trash2,
  History,
  ChevronLeft,
  ChevronRight,
  Loader2,
} from "lucide-react";

interface Block {
  id: string;
  name: string;
  order: number;
  floors: { id: string; name: string }[];
}

interface Site {
  id: string;
  name: string;
  blocks: Block[];
}

interface ConstructionFloor {
  id: string;
  name: string;
  order: number;
  works: { id: string; name: string; order: number; entries?: { id: string; media: unknown[] }[] }[];
}

interface PersonnelRecord {
  id: string;
  siteId: string;
  blockId: string | null;
  constructionType: string;
  workName: string;
  floorName: string | null;
  entryKey: string;
  date: string;
  personnelName: string;
  company: string | null;
  workDuration: "HALF_DAY" | "FULL_DAY";
}

const CONSTRUCTION_TYPES = [
  { key: "KABA_INSAAT", label: "Kaba İnşaat", btnClass: "text-amber-700 hover:bg-amber-50 active:bg-amber-100" },
  { key: "INCE_INSAAT", label: "İnce İnşaat", btnClass: "text-teal-700 hover:bg-teal-50 active:bg-teal-100" },
  { key: "BINA_GENEL", label: "Bina Genel", btnClass: "text-gray-700 hover:bg-gray-50 active:bg-gray-200" },
];

function todayStr() {
  const d = new Date();
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}

export default function PersonnelSitePage({ params }: { params: Promise<{ siteId: string }> }) {
  const { siteId } = use(params);
  const router = useRouter();

  const [site, setSite] = useState<Site | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  // Selected block/type
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  const [selectedType, setSelectedType] = useState<string | null>(null);

  // Table data
  const [floors, setFloors] = useState<ConstructionFloor[]>([]);
  const [tableLoading, setTableLoading] = useState(false);

  // Personnel popup
  const [popupOpen, setPopupOpen] = useState(false);
  const [popupEntryKey, setPopupEntryKey] = useState("");
  const [popupWorkName, setPopupWorkName] = useState("");
  const [popupFloorName, setPopupFloorName] = useState("");
  const [popupRecords, setPopupRecords] = useState<PersonnelRecord[]>([]);
  const [popupLoading, setPopupLoading] = useState(false);

  // Form
  const [formName, setFormName] = useState("");
  const [formCompany, setFormCompany] = useState("");
  const [formDuration, setFormDuration] = useState<"FULL_DAY" | "HALF_DAY">("FULL_DAY");

  // Name suggestions (last 3 days)
  const [nameSuggestions, setNameSuggestions] = useState<{ name: string; company: string | null }[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [filteredSuggestions, setFilteredSuggestions] = useState<{ name: string; company: string | null }[]>([]);
  // History
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyDate, setHistoryDate] = useState(todayStr());
  const [historyRecords, setHistoryRecords] = useState<PersonnelRecord[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // Personnel counts cache for table badges
  const [personnelCounts, setPersonnelCounts] = useState<Map<string, number>>(new Map());

  // İnce İnşaat states
  const [inceViewMode, setInceViewMode] = useState<"select" | "daire_bazinda" | "is_bazinda" | null>(null);
  const [inceDaires, setInceDaires] = useState<{ id: string; name: string }[]>([]);
  const [inceUnitOverrides, setInceUnitOverrides] = useState<Record<string, { added: string[]; removed: string[] }>>({});
  const [selectedInceDaire, setSelectedInceDaire] = useState<{ id: string; name: string } | null>(null);
  const [selectedInceWork, setSelectedInceWork] = useState<{ id: string; name: string; order: number } | null>(null);

  useEffect(() => {
    fetchSite();
  }, [siteId]);

  const fetchSite = async () => {
    try {
      const res = await fetch(`/api/sites/${siteId}`);
      if (res.ok) {
        const data = await res.json();
        setSite(data.site);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const fetchTable = useCallback(async (blockId: string | null, type: string) => {
    setTableLoading(true);
    try {
      const params = new URLSearchParams({ siteId, type });
      if (blockId) params.set("blockId", blockId);
      const res = await fetch(`/api/construction?${params}`);
      if (res.ok) {
        const data = await res.json();
        setFloors(data.floors || []);
        if (type === "INCE_INSAAT") {
          setInceDaires(data.daires || []);
          setInceUnitOverrides(data.unitOverrides || {});
          setInceViewMode("select");
        } else {
          setInceViewMode(null);
          setInceDaires([]);
          setInceUnitOverrides({});
          setSelectedInceDaire(null);
          setSelectedInceWork(null);
        }
      }
    } catch (err) {
      console.error(err);
    } finally {
      setTableLoading(false);
    }
  }, [siteId]);

  // Fetch today's personnel counts when table loads
  const fetchPersonnelCounts = useCallback(async (blockId: string | null, type: string) => {
    try {
      const params = new URLSearchParams({ siteId, constructionType: type, date: todayStr() });
      if (blockId) params.set("blockId", blockId);
      const res = await fetch(`/api/personnel?${params}`);
      if (res.ok) {
        const data = await res.json();
        const counts = new Map<string, number>();
        for (const entry of data.entries || []) {
          const key = entry.entryKey;
          counts.set(key, (counts.get(key) || 0) + 1);
        }
        setPersonnelCounts(counts);
      }
    } catch (err) {
      console.error(err);
    }
  }, [siteId]);

  const handleSelectType = (blockId: string | null, type: string) => {
    setSelectedBlockId(blockId);
    setSelectedType(type);
    fetchTable(blockId, type);
    fetchPersonnelCounts(blockId, type);
  };

  const handleBack = () => {
    if (selectedInceDaire) {
      setSelectedInceDaire(null);
      return;
    }
    if (selectedInceWork) {
      setSelectedInceWork(null);
      return;
    }
    if (inceViewMode && inceViewMode !== "select") {
      setInceViewMode("select");
      return;
    }
    if (selectedType) {
      setSelectedType(null);
      setInceViewMode(null);
      setFloors([]);
      setPersonnelCounts(new Map());
      setInceDaires([]);
      setInceUnitOverrides({});
      setSelectedInceDaire(null);
      setSelectedInceWork(null);
    } else {
      router.push("/dashboard/personnel");
    }
  };

  // Open personnel popup for a specific cell
  const openPopup = async (entryKey: string, workName: string, floorName: string) => {
    setPopupEntryKey(entryKey);
    setPopupWorkName(workName);
    setPopupFloorName(floorName);
    setPopupOpen(true);
    setFormName("");
    setFormCompany("");
    setFormDuration("FULL_DAY");
    setHistoryOpen(false);
    setShowSuggestions(false);

    // Fetch today's records
    setPopupLoading(true);
    try {
      const params = new URLSearchParams({
        siteId,
        constructionType: selectedType!,
        entryKey,
        date: todayStr(),
      });
      if (selectedBlockId) params.set("blockId", selectedBlockId);
      const res = await fetch(`/api/personnel?${params}`);
      if (res.ok) {
        const data = await res.json();
        setPopupRecords(data.entries || []);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setPopupLoading(false);
    }

    // Fetch recent name suggestions
    try {
      const res = await fetch(`/api/personnel?siteId=${siteId}&recentNames=1`);
      if (res.ok) {
        const data = await res.json();
        // API yeni 'suggestions' alanini doner ({name, company}[]). Eski 'nameSuggestions' string[] formati ile fallback.
        if (Array.isArray(data.suggestions)) {
          setNameSuggestions(data.suggestions);
        } else if (Array.isArray(data.nameSuggestions)) {
          setNameSuggestions(
            data.nameSuggestions.map((n: string) => ({ name: n, company: null }))
          );
        } else {
          setNameSuggestions([]);
        }
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleNameChange = (val: string) => {
    setFormName(val);
    if (val.trim().length === 0) {
      setFilteredSuggestions(nameSuggestions);
      setShowSuggestions(true);
    } else {
      const lower = val.toLowerCase();
      const filtered = nameSuggestions.filter((s) => s.name.toLowerCase().includes(lower));
      setFilteredSuggestions(filtered);
      setShowSuggestions(filtered.length > 0);
    }
  };

  const selectSuggestion = (s: { name: string; company: string | null }) => {
    setFormName(s.name);
    if (s.company) setFormCompany(s.company);
    setShowSuggestions(false);
  };

  const handleAddPersonnel = async () => {
    if (!formName.trim()) return;
    setShowSuggestions(false);
    try {
      const res = await fetch("/api/personnel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          siteId,
          blockId: selectedBlockId,
          constructionType: selectedType,
          workName: popupWorkName,
          floorName: popupFloorName,
          entryKey: popupEntryKey,
          date: todayStr(),
          personnelName: formName.trim(),
          company: formCompany.trim() || null,
          workDuration: formDuration,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setPopupRecords((prev) => [...prev, data.entry]);
        setFormName("");
        setFormCompany("");
        setFormDuration("FULL_DAY");
        // Update count
        setPersonnelCounts((prev) => {
          const m = new Map(prev);
          m.set(popupEntryKey, (m.get(popupEntryKey) || 0) + 1);
          return m;
        });
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteRecord = async (id: string) => {
    try {
      const res = await fetch(`/api/personnel/${id}`, { method: "DELETE" });
      if (res.ok) {
        setPopupRecords((prev) => prev.filter((r) => r.id !== id));
        setPersonnelCounts((prev) => {
          const m = new Map(prev);
          const cur = m.get(popupEntryKey) || 0;
          if (cur > 1) m.set(popupEntryKey, cur - 1);
          else m.delete(popupEntryKey);
          return m;
        });
      }
    } catch (err) {
      console.error(err);
    }
  };

  // History
  const fetchHistory = async (date: string) => {
    setHistoryLoading(true);
    try {
      const params = new URLSearchParams({
        siteId,
        constructionType: selectedType!,
        entryKey: popupEntryKey,
        date,
      });
      if (selectedBlockId) params.set("blockId", selectedBlockId);
      const res = await fetch(`/api/personnel?${params}`);
      if (res.ok) {
        const data = await res.json();
        setHistoryRecords(data.entries || []);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setHistoryLoading(false);
    }
  };

  const openHistory = () => {
    setHistoryOpen(true);
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yStr = yesterday.getFullYear() + "-" + String(yesterday.getMonth() + 1).padStart(2, "0") + "-" + String(yesterday.getDate()).padStart(2, "0");
    setHistoryDate(yStr);
    fetchHistory(yStr);
  };

  const changeHistoryDate = (delta: number) => {
    const d = new Date(historyDate);
    d.setDate(d.getDate() + delta);
    const str = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
    setHistoryDate(str);
    fetchHistory(str);
  };

  // Export site-specific
  const handleExportSite = async () => {
    setExporting(true);
    try {
      const res = await fetch(`/api/personnel/export?siteId=${siteId}`);
      if (res.ok) {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        const cd = res.headers.get("Content-Disposition") || "";
        const m = cd.match(/filename="?([^";]+)"?/);
        a.download = m ? decodeURIComponent(m[1]) : `personel_takip_${site?.name?.replace(/\s+/g, "_") || "santiye"}_${new Date().toISOString().split("T")[0]}.xlsx`;
        a.click();
        URL.revokeObjectURL(url);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setExporting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-10 w-10 border-4 border-[#c0392b] border-t-transparent"></div>
      </div>
    );
  }

  if (!site) {
    return (
      <div className="text-center py-16">
        <p className="text-gray-500">Şantiye bulunamadı</p>
      </div>
    );
  }

  // ── Block / Peyzaj card selection ──
  if (!selectedType) {
    return (
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8">
          <div className="flex items-center gap-3">
            <button onClick={() => router.push("/dashboard/personnel")} className="p-2 hover:bg-gray-100 rounded-lg">
              <ArrowLeft size={20} />
            </button>
            <div>
              <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                <HardHat className="text-[#c0392b]" size={24} />
                {site.name}
              </h1>
              <p className="text-gray-500 mt-0.5">Blok veya alan seçin</p>
            </div>
          </div>
          <button
            onClick={handleExportSite}
            disabled={exporting}
            className="flex items-center gap-2 px-4 py-2.5 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50"
          >
            <Download size={18} />
            {exporting ? "İndiriliyor..." : "Detaylı Rapor İndir"}
          </button>
        </div>

        {/* Block & Peyzaj Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {site.blocks.map((block) => (
            <div
              key={block.id}
              className="bg-white rounded-xl shadow-sm border border-gray-100 text-center flex flex-col"
            >
              <div className="p-5 text-center w-full">
                <div className="w-12 h-12 mx-auto mb-3 bg-[#1a1a2e] rounded-lg flex items-center justify-center text-white">
                  <Building2 size={24} />
                </div>
                <p className="text-sm font-semibold text-gray-800">{block.name}</p>
                <p className="text-xs text-gray-400 mt-1">{block.floors?.length || 0} kat</p>
              </div>
              <div className="grid grid-cols-3 gap-px bg-gray-100 border-t border-gray-100">
                {CONSTRUCTION_TYPES.map((ct) => (
                  <button
                    key={ct.key}
                    onClick={() => handleSelectType(block.id, ct.key)}
                    className={`py-5 text-base font-bold ${ct.btnClass} transition-colors bg-white`}
                  >
                    {ct.label}
                  </button>
                ))}
              </div>
            </div>
          ))}

          {/* Peyzaj Card */}
          <button
            onClick={() => handleSelectType(null, "PEYZAJ")}
            className="bg-white rounded-xl p-5 shadow-sm border border-gray-100 card-hover text-center group"
          >
            <div className="w-12 h-12 mx-auto mb-3 bg-green-600 rounded-lg flex items-center justify-center text-white group-hover:bg-[#c0392b] transition-all">
              <Layers size={24} />
            </div>
            <p className="text-sm font-semibold text-gray-800 group-hover:text-[#c0392b] transition-all">
              Peyzaj
            </p>
          </button>
        </div>
      </div>
    );
  }

  // ── Table view ──
  const typeLabel = [...CONSTRUCTION_TYPES, { key: "PEYZAJ", label: "Peyzaj", btnClass: "" }]
    .find((t) => t.key === selectedType)?.label || selectedType;
  const blockLabel = selectedBlockId
    ? site.blocks.find((b) => b.id === selectedBlockId)?.name || ""
    : "Peyzaj";

  return (
    <div className="max-w-full mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <button onClick={handleBack} className="p-2 hover:bg-gray-100 rounded-lg">
            <ArrowLeft size={20} />
          </button>
          <div>
            <h1 className="text-xl font-bold text-gray-900">
              {site.name} — {blockLabel} — {typeLabel}
            </h1>
            <p className="text-gray-500 text-sm mt-0.5">Hücreye tıklayarak personel girişi yapın</p>
          </div>
        </div>
      </div>

      {tableLoading ? (
        <div className="flex items-center justify-center h-48">
          <Loader2 className="animate-spin text-gray-400" size={32} />
        </div>
      ) : selectedType === "INCE_INSAAT" ? (
        /* ── İnce İnşaat Views ── */
        <>
          {inceViewMode === "select" && (
            <div className="grid grid-cols-2 gap-4 max-w-lg mx-auto">
              <button
                onClick={() => setInceViewMode("daire_bazinda")}
                className="bg-white rounded-xl p-6 shadow-sm border border-gray-100 card-hover text-center group"
              >
                <div className="w-14 h-14 mx-auto mb-3 bg-teal-600 rounded-lg flex items-center justify-center text-white group-hover:bg-[#c0392b] transition-all">
                  <Building2 size={28} />
                </div>
                <p className="text-sm font-semibold text-gray-800 group-hover:text-[#c0392b] transition-all">
                  Daire Bazında
                </p>
                <p className="text-xs text-gray-400 mt-1">Önce daire seç, sonra iş</p>
              </button>
              <button
                onClick={() => setInceViewMode("is_bazinda")}
                className="bg-white rounded-xl p-6 shadow-sm border border-gray-100 card-hover text-center group"
              >
                <div className="w-14 h-14 mx-auto mb-3 bg-indigo-600 rounded-lg flex items-center justify-center text-white group-hover:bg-[#c0392b] transition-all">
                  <Hammer size={28} />
                </div>
                <p className="text-sm font-semibold text-gray-800 group-hover:text-[#c0392b] transition-all">
                  İş Bazında
                </p>
                <p className="text-xs text-gray-400 mt-1">Önce iş seç, sonra daire</p>
              </button>
            </div>
          )}

          {/* Daire Bazında - Daire Grid */}
          {inceViewMode === "daire_bazinda" && !selectedInceDaire && (() => {
            const allFloorWorks = floors.flatMap((f) => f.works || []).sort((a, b) => a.order - b.order);
            const perDaireNames = new Set<string>();
            for (const d of inceDaires) for (const a of (inceUnitOverrides[d.id]?.added || [])) perDaireNames.add(a);
            const baseWorks = allFloorWorks.filter((w) => !perDaireNames.has(w.name));
            const getWorksForDaire = (daireId: string) => {
              const ov = inceUnitOverrides[daireId] || { added: [], removed: [] };
              const filtered = baseWorks.filter((w) => !(ov.removed || []).includes(w.name));
              const added = allFloorWorks.filter((w) => (ov.added || []).includes(w.name));
              return [...filtered, ...added];
            };
            const cols = 4;
            const rows = Math.ceil(inceDaires.length / cols);
            return (
              <div className="overflow-x-auto">
                <div className="bg-[#1e3a5f] text-white px-4 py-3 font-bold text-center text-base border-2 border-[#1e3a5f]">
                  Daireler
                </div>
                <div
                  className="border-2 border-[#1e3a5f] border-t-0 gap-2 p-2"
                  style={{ display: "grid", gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gridTemplateRows: `repeat(${rows}, auto)`, gridAutoFlow: "column" }}
                >
                  {inceDaires.map((daire) => {
                    const daireWorks = getWorksForDaire(daire.id);
                    const totalPersonnel = daireWorks.reduce((sum, w) => sum + (personnelCounts.get(`${w.id}:${daire.id}`) || 0), 0);
                    return (
                      <button
                        key={daire.id}
                        onClick={() => setSelectedInceDaire(daire)}
                        className={`p-3 text-center transition-all rounded-lg shadow-sm ${
                          totalPersonnel > 0
                            ? "bg-green-500 text-white hover:bg-green-600"
                            : "bg-gray-100 text-gray-600 hover:bg-gray-200 border border-gray-200"
                        }`}
                      >
                        <span className="block font-bold text-sm">{daire.name}</span>
                        {totalPersonnel > 0 && (
                          <span className="block text-xs mt-1 opacity-80">{totalPersonnel} kişi</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })()}

          {/* Daire Bazında - Works for Selected Daire */}
          {inceViewMode === "daire_bazinda" && selectedInceDaire && (() => {
            const allFloorWorks = floors.flatMap((f) => f.works || []).sort((a, b) => a.order - b.order);
            const perDaireNames = new Set<string>();
            for (const d of inceDaires) for (const a of (inceUnitOverrides[d.id]?.added || [])) perDaireNames.add(a);
            const baseWorks = allFloorWorks.filter((w) => !perDaireNames.has(w.name));
            const ov = inceUnitOverrides[selectedInceDaire.id] || { added: [], removed: [] };
            const filtered = baseWorks.filter((w) => !(ov.removed || []).includes(w.name));
            const added = allFloorWorks.filter((w) => (ov.added || []).includes(w.name));
            const daireWorks = [...filtered, ...added];
            const cols = 4;
            const rows = Math.ceil(daireWorks.length / cols);
            return (
              <div className="overflow-x-auto">
                <div className="bg-[#1e3a5f] text-white px-4 py-3 font-bold text-center text-base border-2 border-[#1e3a5f]">
                  {selectedInceDaire.name} — İşler
                </div>
                <div
                  className="border-2 border-[#1e3a5f] border-t-0 gap-2 p-2"
                  style={{ display: "grid", gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gridTemplateRows: `repeat(${rows}, auto)`, gridAutoFlow: "column" }}
                >
                  {daireWorks.map((work) => {
                    const key = `${work.id}:${selectedInceDaire.id}`;
                    const count = personnelCounts.get(key) || 0;
                    return (
                      <button
                        key={work.id}
                        onClick={() => openPopup(key, work.name, selectedInceDaire.name)}
                        className={`p-3 text-center transition-all rounded-lg shadow-sm ${
                          count > 0
                            ? "bg-green-500 text-white hover:bg-green-600"
                            : "bg-gray-100 text-gray-600 hover:bg-gray-200 border border-gray-200"
                        }`}
                      >
                        <span className="block font-bold text-xs">{work.name}</span>
                        <span className={`block text-[10px] mt-1 italic ${count > 0 ? "text-white/70" : "text-gray-400"}`}>{selectedInceDaire.name}</span>
                        {count > 0 && (
                          <span className="block text-[10px] mt-0.5 opacity-80">({count} kişi)</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })()}

          {/* İş Bazında - Works Grid */}
          {inceViewMode === "is_bazinda" && !selectedInceWork && (() => {
            const allFloorWorks = floors.flatMap((f) => f.works || []).sort((a, b) => a.order - b.order);
            const perDaireNames = new Set<string>();
            for (const d of inceDaires) for (const a of (inceUnitOverrides[d.id]?.added || [])) perDaireNames.add(a);
            const baseWorks = allFloorWorks.filter((w) => !perDaireNames.has(w.name));
            const allWorkNames = new Map<string, { id: string; name: string; order: number }>();
            for (const bw of baseWorks) allWorkNames.set(bw.name, { id: bw.id, name: bw.name, order: bw.order });
            for (const daire of inceDaires) {
              for (const addedName of (inceUnitOverrides[daire.id]?.added || [])) {
                if (!allWorkNames.has(addedName)) {
                  const found = allFloorWorks.find((w) => w.name === addedName);
                  if (found) allWorkNames.set(addedName, { id: found.id, name: found.name, order: found.order });
                }
              }
            }
            const allWorks = Array.from(allWorkNames.values()).sort((a, b) => a.order - b.order);
            const getDairesForWork = (workName: string) => {
              return inceDaires.filter((d) => {
                const ov2 = inceUnitOverrides[d.id] || { added: [], removed: [] };
                if (perDaireNames.has(workName)) return (ov2.added || []).includes(workName);
                return !(ov2.removed || []).includes(workName);
              });
            };
            const cols = 4;
            const rows = Math.ceil(allWorks.length / cols);
            return (
              <div className="overflow-x-auto">
                <div className="bg-[#1e3a5f] text-white px-4 py-3 font-bold text-center text-base border-2 border-[#1e3a5f]">
                  İnce İşler
                </div>
                <div
                  className="border-2 border-[#1e3a5f] border-t-0 gap-2 p-2"
                  style={{ display: "grid", gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gridTemplateRows: `repeat(${rows}, auto)`, gridAutoFlow: "column" }}
                >
                  {allWorks.map((work) => {
                    const workDaires = getDairesForWork(work.name);
                    const totalPersonnel = workDaires.reduce((sum, d) => sum + (personnelCounts.get(`${work.id}:${d.id}`) || 0), 0);
                    return (
                      <button
                        key={work.id}
                        onClick={() => setSelectedInceWork(work)}
                        className={`p-3 text-center transition-all rounded-lg shadow-sm ${
                          totalPersonnel > 0
                            ? "bg-green-500 text-white hover:bg-green-600"
                            : "bg-gray-100 text-gray-600 hover:bg-gray-200 border border-gray-200"
                        }`}
                      >
                        <span className="block font-bold text-xs">{work.name}</span>
                        {totalPersonnel > 0 && (
                          <span className="block text-xs mt-1 opacity-80">{totalPersonnel} kişi</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })()}

          {/* İş Bazında - Daires for Selected Work */}
          {inceViewMode === "is_bazinda" && selectedInceWork && (() => {
            const allFloorWorks = floors.flatMap((f) => f.works || []).sort((a, b) => a.order - b.order);
            const perDaireNames = new Set<string>();
            for (const d of inceDaires) for (const a of (inceUnitOverrides[d.id]?.added || [])) perDaireNames.add(a);
            const workDaires = inceDaires.filter((d) => {
              const ov2 = inceUnitOverrides[d.id] || { added: [], removed: [] };
              if (perDaireNames.has(selectedInceWork.name)) return (ov2.added || []).includes(selectedInceWork.name);
              return !(ov2.removed || []).includes(selectedInceWork.name);
            });
            const cols = 4;
            const rows = Math.ceil(workDaires.length / cols);
            return (
              <div className="overflow-x-auto">
                <div className="bg-[#1e3a5f] text-white px-4 py-3 font-bold text-center text-base border-2 border-[#1e3a5f]">
                  {selectedInceWork.name} — Daireler
                </div>
                <div
                  className="border-2 border-[#1e3a5f] border-t-0 gap-2 p-2"
                  style={{ display: "grid", gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gridTemplateRows: `repeat(${rows}, auto)`, gridAutoFlow: "column" }}
                >
                  {workDaires.map((daire) => {
                    const key = `${selectedInceWork.id}:${daire.id}`;
                    const count = personnelCounts.get(key) || 0;
                    return (
                      <button
                        key={daire.id}
                        onClick={() => openPopup(key, selectedInceWork.name, daire.name)}
                        className={`p-3 text-center transition-all rounded-lg shadow-sm ${
                          count > 0
                            ? "bg-green-500 text-white hover:bg-green-600"
                            : "bg-gray-100 text-gray-600 hover:bg-gray-200 border border-gray-200"
                        }`}
                      >
                        <span className="block font-bold text-sm">{daire.name}</span>
                        <span className={`block text-[10px] mt-1 italic ${count > 0 ? "text-white/70" : "text-gray-400"}`}>{selectedInceWork.name}</span>
                        {count > 0 && (
                          <span className="block text-[10px] mt-0.5 opacity-80">({count} kişi)</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })()}

          {inceDaires.length === 0 && inceViewMode === "select" && !tableLoading && (
            <div className="text-center py-16 text-gray-500">İnce inşaat verisi bulunamadı</div>
          )}
        </>
      ) : floors.length === 0 ? (
        <div className="text-center py-16 text-gray-500">Tablo verisi bulunamadı</div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <tbody>
                {floors.map((floor, floorIdx) => (
                  <tr key={floor.id} className={floorIdx < floors.length - 1 ? "border-b-[3px] border-[#1e3a5f]/30" : ""}>
                    {/* Dark navy left header */}
                    <td className="bg-[#1e3a5f] text-white px-4 py-3 font-semibold text-sm whitespace-nowrap align-middle min-w-[130px] border-r border-[#152d4a]">
                      {floor.name}
                    </td>
                    {/* Work item cells */}
                    {floor.works.map((work) => {
                      const entryKey = `${floor.id}_${work.id}`;
                      const count = personnelCounts.get(entryKey) || 0;
                      const floorPrefix = floor.name + " - ";
                      const displayName = work.name.startsWith(floorPrefix) ? work.name.slice(floorPrefix.length) : work.name;
                      return (
                        <td key={work.id} className="p-1">
                          <button
                            onClick={() => openPopup(entryKey, work.name, floor.name)}
                            className={`w-full px-2 py-2 rounded-lg text-xs font-medium transition-all text-center leading-tight relative ${
                              count > 0
                                ? "bg-green-500 text-white hover:bg-green-600 shadow-sm"
                                : "bg-gray-100 text-gray-600 hover:bg-gray-200 border border-gray-200"
                            }`}
                          >
                            <span className="block text-[10px] opacity-70">{floor.name}</span>
                            <span className="block">{displayName}</span>
                            {count > 0 && (
                              <span className="block text-[10px] opacity-80 mt-0.5">({count} kişi)</span>
                            )}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Personnel Popup ── */}
      {popupOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setPopupOpen(false)}>
          <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            {/* Popup Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
              <div>
                <h2 className="font-bold text-lg text-gray-900 flex items-center gap-2">
                  <HardHat size={20} className="text-[#c0392b]" />
                  Personel Takip
                </h2>
                <p className="text-sm text-gray-500 mt-0.5">
                  {selectedType === "INCE_INSAAT"
                    ? `Daire: ${popupFloorName} — İş: ${popupWorkName}`
                    : `${popupFloorName} — ${popupWorkName}`}
                </p>
                <p className="text-xs text-gray-400 mt-0.5">
                  {new Date().toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric" })}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={openHistory}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                >
                  <History size={16} />
                  Geçmiş
                </button>
                <button onClick={() => setPopupOpen(false)} className="p-1.5 hover:bg-gray-100 rounded-lg">
                  <X size={20} />
                </button>
              </div>
            </div>

            {/* History panel */}
            {historyOpen && (
              <div className="px-6 py-3 bg-blue-50 border-b border-blue-100">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-blue-800">Geçmiş Kayıtlar</span>
                  <button onClick={() => setHistoryOpen(false)} className="text-blue-600 hover:text-blue-800 text-xs">
                    Kapat
                  </button>
                </div>
                <div className="flex items-center gap-2 mb-3">
                  <button onClick={() => changeHistoryDate(-1)} className="p-1 hover:bg-blue-100 rounded">
                    <ChevronLeft size={16} />
                  </button>
                  <input
                    type="date"
                    value={historyDate}
                    onChange={(e) => { setHistoryDate(e.target.value); fetchHistory(e.target.value); }}
                    className="px-2 py-1 text-sm border border-blue-200 rounded bg-white"
                  />
                  <button onClick={() => changeHistoryDate(1)} className="p-1 hover:bg-blue-100 rounded">
                    <ChevronRight size={16} />
                  </button>
                </div>
                {historyLoading ? (
                  <div className="text-center py-2">
                    <Loader2 className="animate-spin text-blue-400 mx-auto" size={20} />
                  </div>
                ) : historyRecords.length === 0 ? (
                  <p className="text-sm text-blue-600 text-center py-2">Bu tarihte kayıt yok</p>
                ) : (
                  <div className="space-y-1.5 max-h-40 overflow-y-auto">
                    {historyRecords.map((r) => (
                      <div key={r.id} className="flex items-center justify-between bg-white px-3 py-2 rounded-lg text-sm">
                        <div>
                          <span className="font-medium text-gray-800">{r.personnelName}</span>
                          {r.company && <span className="text-gray-500 ml-2">({r.company})</span>}
                        </div>
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                          r.workDuration === "FULL_DAY" ? "bg-green-100 text-green-700" : "bg-yellow-100 text-yellow-700"
                        }`}>
                          {r.workDuration === "FULL_DAY" ? "Tam Gün" : "Yarım Gün"}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Today's records */}
            <div className="flex-1 overflow-y-auto px-6 py-4">
              {popupLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="animate-spin text-gray-400" size={24} />
                </div>
              ) : (
                <>
                  {popupRecords.length === 0 ? (
                    <p className="text-gray-400 text-center py-6 text-sm">Bugün henüz personel kaydı yok</p>
                  ) : (
                    <div className="space-y-2 mb-4">
                      {popupRecords.map((r) => (
                        <div key={r.id} className="flex items-center justify-between bg-gray-50 px-4 py-2.5 rounded-lg">
                          <div className="flex-1 min-w-0">
                            <span className="font-medium text-gray-800">{r.personnelName}</span>
                            {r.company && <span className="text-gray-500 ml-2 text-sm">({r.company})</span>}
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                              r.workDuration === "FULL_DAY" ? "bg-green-100 text-green-700" : "bg-yellow-100 text-yellow-700"
                            }`}>
                              {r.workDuration === "FULL_DAY" ? "Tam Gün" : "Yarım Gün"}
                            </span>
                            <button
                              onClick={() => handleDeleteRecord(r.id)}
                              className="p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Add form */}
            <div className="px-6 py-4 border-t border-gray-200 bg-gray-50">
              <div className="grid grid-cols-[1fr_1fr_auto_auto] gap-2 items-end">
                <div className="relative">
                  <label className="text-xs text-gray-500 mb-1 block">Ad Soyad *</label>
                  <input
                    type="text"
                    value={formName}
                    onChange={(e) => handleNameChange(e.target.value)}
                    onFocus={() => {
                      const lower = formName.toLowerCase();
                      const filtered = formName.trim().length === 0
                        ? nameSuggestions
                        : nameSuggestions.filter((s) => s.name.toLowerCase().includes(lower));
                      setFilteredSuggestions(filtered);
                      setShowSuggestions(filtered.length > 0);
                    }}
                    onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
                    placeholder="Personel adı"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#c0392b]/20 focus:border-[#c0392b] outline-none"
                    onKeyDown={(e) => e.key === "Enter" && handleAddPersonnel()}
                    autoComplete="off"
                  />
                  {showSuggestions && filteredSuggestions.length > 0 && (
                    <div className="absolute z-10 left-0 right-0 bottom-full mb-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                      {filteredSuggestions.map((s, i) => (
                        <button
                          key={i}
                          type="button"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => selectSuggestion(s)}
                          className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100 transition-colors flex items-center justify-between"
                        >
                          <span className="font-medium text-gray-800">{s.name}</span>
                          {s.company && <span className="text-xs text-gray-400 ml-2">{s.company}</span>}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Firma</label>
                  <input
                    type="text"
                    value={formCompany}
                    onChange={(e) => setFormCompany(e.target.value)}
                    placeholder="Firma adı"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#c0392b]/20 focus:border-[#c0392b] outline-none"
                    onKeyDown={(e) => e.key === "Enter" && handleAddPersonnel()}
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Süre</label>
                  <select
                    value={formDuration}
                    onChange={(e) => setFormDuration(e.target.value as "FULL_DAY" | "HALF_DAY")}
                    className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-[#c0392b]/20 focus:border-[#c0392b] outline-none"
                  >
                    <option value="FULL_DAY">Tam Gün</option>
                    <option value="HALF_DAY">Yarım Gün</option>
                  </select>
                </div>
                <button
                  onClick={handleAddPersonnel}
                  disabled={!formName.trim()}
                  className="px-3 py-2 bg-[#c0392b] text-white rounded-lg hover:bg-[#a93226] transition-colors disabled:opacity-50"
                >
                  <Plus size={18} />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
