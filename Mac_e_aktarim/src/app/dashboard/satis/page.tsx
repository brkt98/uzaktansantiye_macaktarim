"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useBodyScrollLock } from "@/hooks/useBodyScrollLock";
import { AlertTriangle, Building2, TrendingUp, CheckCircle2, Clock, Home, Plus, X, Trash2, ArrowLeft } from "lucide-react";
import { DialogProvider, useDialog } from "./_components/DialogProvider";
import { useUser } from "@/app/dashboard/layout";
import { canEditSales } from "@/lib/roles";
import { useDevice } from "@/hooks/useDevice";

type Project = {
  type: "site" | "project";
  id: string;
  name: string;
  description: string | null;
  address: string | null;
  status: string | null;
  blockCount: number;
  unitsTotal: number;
  sold: number;
  reserved: number;
  available: number;
};

type DraftDaire = { name: string };
type DraftFloor = { name: string; daires: DraftDaire[] };
type DraftBlock = { name: string; floors: DraftFloor[] };

const newFloor = (idx: number): DraftFloor => ({
  name: idx === 0 ? "Zemin Kat" : `${idx}. Kat`,
  daires: [{ name: "Daire 1" }],
});

export default function SalesListPage() {
  return (
    <DialogProvider>
      <SalesListInner />
    </DialogProvider>
  );
}

function SalesListInner() {
  const { alert } = useDialog();
  const user = useUser();
  const canEdit = canEditSales(user?.roles);
  const { isMobile } = useDevice();
  const searchParams = useSearchParams();
  const fromDashboard = searchParams.get("from") === "dashboard";
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [showRemoveModal, setShowRemoveModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<Project | null>(null);

  const [pName, setPName] = useState("");
  const [pDesc, setPDesc] = useState("");
  const [blocks, setBlocks] = useState<DraftBlock[]>([
    { name: "A Blok", floors: [newFloor(0)] },
  ]);
  const [bulkModal, setBulkModal] = useState<{ bi: number; fi: number } | null>(null);
    useBodyScrollLock(!!(showModal || showRemoveModal || bulkModal));
  const [bulkCount, setBulkCount] = useState("10");

  const reload = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/sales");
      const data = await res.json();
      if (res.ok) setProjects(data.projects || []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    reload();
  }, []);

  const resetForm = () => {
    setPName("");
    setPDesc("");
    setBlocks([{ name: "A Blok", floors: [newFloor(0)] }]);
  };

  const addBlock = () => {
    const next = String.fromCharCode(65 + blocks.length);
    setBlocks([...blocks, { name: `${next} Blok`, floors: [newFloor(0)] }]);
  };
  const removeBlock = (bi: number) => setBlocks(blocks.filter((_, i) => i !== bi));
  const renameBlock = (bi: number, name: string) =>
    setBlocks(blocks.map((b, i) => (i === bi ? { ...b, name } : b)));

  const addFloor = (bi: number) =>
    setBlocks(
      blocks.map((b, i) =>
        i === bi ? { ...b, floors: [...b.floors, newFloor(b.floors.length)] } : b
      )
    );
  const removeFloor = (bi: number, fi: number) =>
    setBlocks(
      blocks.map((b, i) =>
        i === bi ? { ...b, floors: b.floors.filter((_, j) => j !== fi) } : b
      )
    );
  const renameFloor = (bi: number, fi: number, name: string) =>
    setBlocks(
      blocks.map((b, i) =>
        i === bi
          ? { ...b, floors: b.floors.map((f, j) => (j === fi ? { ...f, name } : f)) }
          : b
      )
    );

  const addDaire = (bi: number, fi: number) =>
    setBlocks(
      blocks.map((b, i) =>
        i === bi
          ? {
              ...b,
              floors: b.floors.map((f, j) =>
                j === fi
                  ? {
                      ...f,
                      daires: [
                        ...f.daires,
                        { name: `Daire ${f.daires.length + 1}` },
                      ],
                    }
                  : f
              ),
            }
          : b
      )
    );
  const removeDaire = (bi: number, fi: number, di: number) =>
    setBlocks(
      blocks.map((b, i) =>
        i === bi
          ? {
              ...b,
              floors: b.floors.map((f, j) =>
                j === fi
                  ? { ...f, daires: f.daires.filter((_, k) => k !== di) }
                  : f
              ),
            }
          : b
      )
    );
  const renameDaire = (bi: number, fi: number, di: number, name: string) =>
    setBlocks(
      blocks.map((b, i) =>
        i === bi
          ? {
              ...b,
              floors: b.floors.map((f, j) =>
                j === fi
                  ? {
                      ...f,
                      daires: f.daires.map((d, k) =>
                        k === di ? { ...d, name } : d
                      ),
                    }
                  : f
              ),
            }
          : b
      )
    );
  const bulkAddDaires = (bi: number, fi: number, count: number) => {
    if (!count || count < 1) return;
    setBlocks(
      blocks.map((b, i) =>
        i === bi
          ? {
              ...b,
              floors: b.floors.map((f, j) =>
                j === fi
                  ? {
                      ...f,
                      daires: [
                        ...f.daires,
                        ...Array.from({ length: count }, (_, k) => ({
                          name: `Daire ${f.daires.length + k + 1}`,
                        })),
                      ],
                    }
                  : f
              ),
            }
          : b
      )
    );
  };

  const handleSave = async () => {
    if (!pName.trim()) {
      alert("Proje adı girin");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/sales/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: pName.trim(),
          description: pDesc.trim() || null,
          blocks: blocks.map((b) => ({
            name: b.name.trim() || "Blok",
            floors: b.floors.map((f) => ({
              name: f.name.trim() || "Kat",
              daires: f.daires.map((d) => ({ name: d.name.trim() || "Daire" })),
            })),
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data?.error || "Oluşturulamadı");
        return;
      }
      setShowModal(false);
      resetForm();
      await reload();
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = async () => {
    if (!removeTarget) return;
    setRemoving(true);
    try {
      const url =
        removeTarget.type === "project"
          ? `/api/sales/projects/${removeTarget.id}`
          : `/api/sales/${removeTarget.id}`;
      const res = await fetch(url, { method: "DELETE" });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        alert(data?.error || "Proje kaldırılamadı");
        return;
      }
      setShowRemoveModal(false);
      setRemoveTarget(null);
      await reload();
    } finally {
      setRemoving(false);
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {fromDashboard && (
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-2 mb-4 px-4 py-2 bg-white border border-slate-300 hover:bg-slate-50 rounded-xl text-sm font-medium text-slate-700 shadow-sm"
        >
          <ArrowLeft size={16} /> Ana sayfaya dön
        </Link>
      )}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold text-gray-800 flex items-center gap-3">
            <TrendingUp className="text-[#c0392b]" size={32} />
            Satış
          </h1>
          <p className="text-gray-500 mt-1">Satış yapılacak projeler</p>
        </div>
        {canEdit && (
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => setShowModal(true)}
              className="px-5 py-2.5 bg-green-600 hover:bg-green-700 text-white rounded-xl font-medium flex items-center gap-2 shadow-sm transition-colors"
            >
              <Plus size={18} /> Proje Ekle
            </button>
            <button
              onClick={() => {
                setRemoveTarget(null);
                setShowRemoveModal(true);
              }}
              disabled={loading || projects.length === 0}
              className="px-5 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-xl font-medium flex items-center gap-2 shadow-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Trash2 size={18} /> Proje Kaldır
            </button>
          </div>
        )}
      </div>

      {loading ? (
        <div className="text-center py-20 text-gray-500">Yükleniyor...</div>
      ) : projects.length === 0 ? (
        <div className="text-center py-20 text-gray-500 bg-white rounded-xl border-2 border-dashed border-gray-200">
          Henüz satış için proje yok. &quot;Proje Ekle&quot; ile yeni bir proje oluşturabilir veya şantiye ekledikçe otomatik listelenecektir.
        </div>
      ) : (
        <div className={isMobile ? "flex flex-col gap-3" : "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6"}>
          {projects.map((p) => {
            const href = p.type === "project" ? `/dashboard/satis/proje/${p.id}` : `/dashboard/satis/${p.id}`;
            const landOwner = Math.max(0, p.unitsTotal - p.available - p.reserved - p.sold);
            return isMobile ? (
              /* MOBİL: kompakt yatay satır */
              <Link
                key={`${p.type}-${p.id}`}
                href={href}
                className="pressable pressable-dark mob-fade-up bg-white rounded-2xl shadow-sm border border-gray-200 active:scale-[0.99] transition-transform p-3 flex items-center gap-3 relative"
              >
                <span className="shrink-0 w-11 h-11 bg-red-50 rounded-xl flex items-center justify-center">
                  <Building2 size={22} className="text-[#c0392b]" />
                </span>
                <div className="flex-1 min-w-0">
                  <h3 className="font-bold text-base text-gray-800 truncate">{p.name}</h3>
                  <div className="text-[10px] text-gray-400 mb-1">{p.blockCount} blok · {p.unitsTotal} daire</div>
                  <div className="flex items-center gap-1 flex-wrap">
                    <span className="px-1.5 py-0.5 rounded-md bg-emerald-100 text-emerald-700 text-[10px] font-bold" title="Boş">B:{p.available}</span>
                    <span className="px-1.5 py-0.5 rounded-md bg-amber-100 text-amber-700 text-[10px] font-bold" title="Rezerve">R:{p.reserved}</span>
                    <span className="px-1.5 py-0.5 rounded-md bg-violet-100 text-violet-700 text-[10px] font-bold" title="Arsa Sahibi">A:{landOwner}</span>
                    <span className="px-1.5 py-0.5 rounded-md bg-rose-100 text-rose-700 text-[10px] font-bold" title="Satıldı">S:{p.sold}</span>
                  </div>
                </div>
                <span className={`shrink-0 text-[9px] font-semibold uppercase px-1.5 py-0.5 rounded-full ${p.type === "project" ? "bg-[#c0392b]/10 text-[#c0392b]" : "bg-blue-100 text-blue-700"}`}>
                  {p.type === "project" ? "Proje" : "Şantiye"}
                </span>
              </Link>
            ) : (
              <Link
                key={`${p.type}-${p.id}`}
                href={href}
                className="bg-white rounded-2xl shadow-sm border-2 border-gray-100 hover:border-[#c0392b] hover:shadow-lg transition-all p-6 flex flex-col items-center justify-center gap-3 text-center group aspect-square relative"
              >
                {(p.type === "project" || p.type === "site") && (
                  <span className={`absolute top-3 right-3 text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full ${
                    p.type === "project"
                      ? "bg-[#c0392b]/10 text-[#c0392b]"
                      : "bg-blue-100 text-blue-700"
                  }`}>
                    {p.type === "project" ? "Satış Projesi" : "Aktif Şantiye"}
                  </span>
                )}
                <div className="w-20 h-20 bg-red-50 group-hover:bg-[#c0392b] rounded-2xl flex items-center justify-center transition-colors">
                  <Building2 size={40} className="text-[#c0392b] group-hover:text-white transition-colors" />
                </div>
                <h3 className="font-bold text-xl text-gray-800 group-hover:text-[#c0392b] line-clamp-2">{p.name}</h3>
                <div className="text-xs text-gray-500">{p.blockCount} blok · {p.unitsTotal} daire</div>
                <div className="flex items-center gap-2 text-xs flex-wrap justify-center">
                  <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-100 text-green-700">
                    <Home size={11} /> {p.available} boş
                  </span>
                  <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-700">
                    <Clock size={11} /> {p.reserved} rez
                  </span>
                  <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-100 text-red-700">
                    <CheckCircle2 size={11} /> {p.sold} satıldı
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      )}

      {showRemoveModal && (
        <div className={`fixed inset-0 bg-black/50 backdrop-blur-sm z-[60] flex ${isMobile ? "" : "items-center justify-center p-4"}`} onClick={() => !removing && setShowRemoveModal(false)}>
          <div className={`bg-white w-full ${isMobile ? "h-full flex flex-col" : "rounded-2xl max-w-2xl max-h-[85vh] overflow-hidden border-[5px] border-red-600 shadow-2xl"}`} onClick={(e) => e.stopPropagation()}>
            <div className={`flex items-center justify-between px-6 py-4 border-b ${isMobile ? "modal-safe-top shrink-0" : ""}`}>
              <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                <Trash2 className="text-red-600" size={22} />
                Proje Kaldır
              </h2>
              <button onClick={() => !removing && setShowRemoveModal(false)} className="p-2 hover:bg-gray-100 rounded-lg">
                <X size={20} />
              </button>
            </div>

            <div className={`p-6 space-y-4 ${isMobile ? "flex-1 overflow-y-auto" : "max-h-[58vh] overflow-y-auto"}`}>
              <div className="flex items-start gap-3 rounded-xl border border-red-100 bg-red-50 p-4 text-sm text-red-700">
                <AlertTriangle size={18} className="mt-0.5 flex-shrink-0" />
                <div>
                  <div className="font-semibold">Seçilen kayıt Çöp Kutusu'na taşınacak.</div>
                  <p className="mt-1 text-red-600">
                    Aktif şantiyeler ana sistemden silinmez, sadece Satış sayfasından gizlenir.
                  </p>
                </div>
              </div>

              {projects.length === 0 ? (
                <div className="text-center py-12 text-gray-500 bg-gray-50 rounded-xl border border-dashed border-gray-200">
                  Kaldırılacak proje bulunamadı.
                </div>
              ) : (
                <div className="space-y-2">
                  {projects.map((p) => {
                    const selected = removeTarget?.type === p.type && removeTarget?.id === p.id;
                    return (
                      <button
                        type="button"
                        key={`remove-${p.type}-${p.id}`}
                        onClick={() => setRemoveTarget(p)}
                        className={`w-full text-left rounded-xl border-2 p-4 transition-all ${
                          selected
                            ? "border-red-500 bg-red-50"
                            : "border-gray-200 bg-white hover:border-red-200 hover:bg-red-50/40"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="font-semibold text-gray-900 truncate">{p.name}</div>
                            <div className="mt-1 text-xs text-gray-500">
                              {p.blockCount} blok · {p.unitsTotal} daire · {p.available} boş · {p.reserved} rezerve · {p.sold} satıldı
                            </div>
                          </div>
                          <span className={`flex-shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                            p.type === "project"
                              ? "bg-red-100 text-red-700"
                              : "bg-blue-100 text-blue-700"
                          }`}>
                            {p.type === "project" ? "Satış Projesi" : "Aktif Şantiye"}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="border-t px-6 py-4 flex items-center justify-end gap-3 bg-white">
              <button
                onClick={() => !removing && setShowRemoveModal(false)}
                disabled={removing}
                className="px-6 py-2.5 text-sm font-semibold border-2 border-gray-200 text-gray-700 rounded-xl hover:bg-gray-50 disabled:opacity-50"
              >
                İptal
              </button>
              <button
                onClick={handleRemove}
                disabled={removing || !removeTarget}
                className="px-6 py-2.5 text-sm bg-red-600 hover:bg-red-700 text-white rounded-xl font-semibold disabled:opacity-50"
              >
                {removing ? "Taşınıyor..." : "Çöp Kutusuna Taşı"}
              </button>
            </div>
          </div>
        </div>
      )}

      {bulkModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[70] flex items-center justify-center p-4" onClick={() => setBulkModal(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xs p-6 border-2 border-[#1e3a5f]" onClick={e => e.stopPropagation()}>
            <h3 className="text-base font-bold text-gray-800 mb-1">Toplu Daire Ekle</h3>
            <p className="text-sm text-gray-500 mb-4">Kaç daire eklensin?</p>
            <input
              type="number"
              min={1}
              max={500}
              value={bulkCount}
              onChange={e => setBulkCount(e.target.value)}
              onKeyDown={e => {
                if (e.key === "Enter") {
                  const n = parseInt(bulkCount, 10);
                  if (n > 0) { bulkAddDaires(bulkModal.bi, bulkModal.fi, n); setBulkModal(null); }
                }
                if (e.key === "Escape") setBulkModal(null);
              }}
              autoFocus
              className="w-full px-3 py-2.5 border-2 border-gray-200 rounded-lg focus:outline-none focus:border-[#1e3a5f] text-lg font-semibold text-center mb-4"
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setBulkModal(null)}
                className="flex-1 px-4 py-2.5 text-sm font-semibold border-2 border-gray-200 text-gray-700 rounded-xl hover:bg-gray-50"
              >
                İptal
              </button>
              <button
                type="button"
                onClick={() => {
                  const n = parseInt(bulkCount, 10);
                  if (n > 0) { bulkAddDaires(bulkModal.bi, bulkModal.fi, n); setBulkModal(null); }
                }}
                disabled={!(parseInt(bulkCount, 10) > 0)}
                className="flex-1 px-4 py-2.5 text-sm bg-[#1e3a5f] hover:bg-[#16304f] text-white rounded-xl font-semibold disabled:opacity-40"
              >
                Ekle
              </button>
            </div>
          </div>
        </div>
      )}

      {showModal && (
        <div className={`fixed inset-0 bg-black/50 backdrop-blur-sm z-[60] flex ${isMobile ? "" : "items-center justify-center p-4"}`} onClick={() => !saving && setShowModal(false)}>
          <div className={`bg-white w-full ${isMobile ? "h-full flex flex-col" : "rounded-2xl max-w-3xl max-h-[90vh] overflow-y-auto border-[5px] border-[#c0392b]"}`} onClick={(e) => e.stopPropagation()}>
            <div className={`sticky top-0 bg-white z-10 flex items-center justify-between px-6 py-4 border-b ${isMobile ? "modal-safe-top shrink-0" : ""}`}>
              <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                <Building2 className="text-[#c0392b]" size={22} />
                Yeni Satış Projesi
              </h2>
              <button onClick={() => !saving && setShowModal(false)} className="p-2 hover:bg-gray-100 rounded-lg">
                <X size={20} />
              </button>
            </div>

            <div className={`p-6 space-y-5 ${isMobile ? "flex-1 overflow-y-auto" : ""}`}>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Proje Adı *</label>
                <input
                  type="text"
                  value={pName}
                  onChange={(e) => setPName(e.target.value)}
                  placeholder="Örn: Yeşilköy Park Konutları"
                  className="w-full px-3 py-2.5 border-2 border-gray-200 rounded-lg focus:outline-none focus:border-[#c0392b]"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Açıklama (opsiyonel)</label>
                <textarea
                  value={pDesc}
                  onChange={(e) => setPDesc(e.target.value)}
                  rows={2}
                  className="w-full px-3 py-2.5 border-2 border-gray-200 rounded-lg focus:outline-none focus:border-[#c0392b] resize-none"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm font-medium text-gray-700">Bloklar, Katlar ve Daireler</label>
                  <button type="button" onClick={addBlock} className="text-base font-semibold px-5 py-2.5 bg-[#1e3a5f] text-white rounded-xl hover:bg-[#16304f] inline-flex items-center gap-2 shadow-sm">
                    <Plus size={18} /> Blok Ekle
                  </button>
                </div>

                <div className="space-y-3">
                  {blocks.map((b, bi) => (
                    <div key={bi} className="border-2 border-gray-200 rounded-xl p-3 bg-gray-50">
                      <div className="flex items-center gap-2 mb-3">
                        <input
                          type="text"
                          value={b.name}
                          onChange={(e) => renameBlock(bi, e.target.value)}
                          placeholder="Blok adı"
                          className="flex-1 px-3 py-1.5 border border-gray-300 rounded-lg text-sm font-medium focus:outline-none focus:border-[#c0392b]"
                        />
                        <button
                          type="button"
                          onClick={() => addFloor(bi)}
                          className="text-xs px-2.5 py-1.5 bg-[#1e3a5f] text-white rounded-lg hover:bg-[#16304f] flex items-center gap-1"
                          title="Kat ekle"
                        >
                          <Plus size={12} /> Kat
                        </button>
                        <button
                          type="button"
                          onClick={() => removeBlock(bi)}
                          disabled={blocks.length <= 1}
                          className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg disabled:opacity-30"
                          title="Bloğu sil"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>

                      <div className="space-y-2">
                        {b.floors.map((f, fi) => (
                          <div key={fi} className="border border-gray-200 rounded-lg p-2 bg-white">
                            <div className="flex items-center gap-2 mb-2">
                              <input
                                type="text"
                                value={f.name}
                                onChange={(e) => renameFloor(bi, fi, e.target.value)}
                                placeholder="Kat adı"
                                className="flex-1 px-2 py-1 border border-gray-300 rounded text-xs font-medium focus:outline-none focus:border-[#c0392b]"
                              />
                              <button
                                type="button"
                                onClick={() => removeFloor(bi, fi)}
                                disabled={b.floors.length <= 1}
                                className="p-1 text-red-400 hover:bg-red-50 rounded disabled:opacity-30"
                                title="Katı sil"
                              >
                                <X size={14} />
                              </button>
                            </div>

                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                              {f.daires.map((d, di) => (
                                <div key={di} className="flex items-center gap-1">
                                  <input
                                    type="text"
                                    value={d.name}
                                    onChange={(e) => renameDaire(bi, fi, di, e.target.value)}
                                    className="flex-1 px-2 py-1.5 border border-gray-300 rounded-lg text-xs focus:outline-none focus:border-[#c0392b] bg-white"
                                  />
                                  <button type="button" onClick={() => removeDaire(bi, fi, di)} className="p-1 text-red-400 hover:bg-red-50 rounded" title="Daireyi sil">
                                    <X size={14} />
                                  </button>
                                </div>
                              ))}
                            </div>
                            <div className="flex items-center gap-2 mt-2 flex-wrap">
                              <button type="button" onClick={() => addDaire(bi, fi)} className="text-xs px-2.5 py-1 bg-white border border-gray-300 hover:border-[#c0392b] rounded-lg flex items-center gap-1">
                                <Plus size={11} /> Daire Ekle
                              </button>
                              <button
                                type="button"
                                onClick={() => { setBulkCount("10"); setBulkModal({ bi, fi }); }}
                                className="text-xs px-2.5 py-1 bg-white border border-gray-300 hover:border-[#c0392b] rounded-lg"
                              >
                                + N daire
                              </button>
                              <span className="text-xs text-gray-500 ml-auto">{f.daires.length} daire</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="sticky bottom-0 bg-white border-t px-6 py-4 flex items-center justify-end gap-3">
              <button onClick={() => !saving && setShowModal(false)} disabled={saving} className="px-8 py-3 text-base font-semibold border-2 border-gray-200 text-gray-700 rounded-xl hover:bg-gray-50">
                İptal
              </button>
              <button onClick={handleSave} disabled={saving || !pName.trim()} className="px-8 py-3 text-base bg-[#c0392b] hover:bg-[#a93226] text-white rounded-xl font-semibold disabled:opacity-50">
                {saving ? "Kaydediliyor..." : "Projeyi Oluştur"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
