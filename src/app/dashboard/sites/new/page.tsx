"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Plus, Trash2, X } from "lucide-react";
import Link from "next/link";
import MetrajForm, { MetrajItem } from "@/components/MetrajForm";

interface FloorInput {
  name: string;
  units: { name: string }[];
}

interface BlockInput {
  name: string;
  floors: FloorInput[];
  squareMeters?: string;
}

export default function NewSitePage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [siteType, setSiteType] = useState("");
  const [address, setAddress] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const [blocks, setBlocks] = useState<BlockInput[]>([]);
  const [metraj, setMetraj] = useState<MetrajItem[]>([]);

  const [activeTab, setActiveTab] = useState<"general" | "blocks" | "metraj">("general");

  // Blok yönetimi
  const addBlock = () => {
    setBlocks([
      ...blocks,
      {
        name: `${String.fromCharCode(65 + blocks.length)} Blok`,
        floors: [
          { name: "Bodrum Kat", units: [] },
          { name: "Zemin Kat", units: [] },
          { name: "1. Kat", units: [] },
        ],
      },
    ]);
  };

  const removeBlock = (index: number) => {
    setBlocks(blocks.filter((_, i) => i !== index));
  };

  const addFloor = (blockIndex: number) => {
    const updated = [...blocks];
    const floors = updated[blockIndex].floors;
    // Find the highest numbered kat
    let maxKat = 0;
    for (const f of floors) {
      const match = f.name.match(/(\d+)\. Kat/);
      if (match) maxKat = Math.max(maxKat, parseInt(match[1]));
    }
    updated[blockIndex].floors.push({
      name: `${maxKat + 1}. Kat`,
      units: [],
    });
    setBlocks(updated);
  };

  const removeFloor = (blockIndex: number, floorIndex: number) => {
    const updated = [...blocks];
    updated[blockIndex].floors = updated[blockIndex].floors.filter((_, i) => i !== floorIndex);
    setBlocks(updated);
  };

  const addUnit = (blockIndex: number, floorIndex: number) => {
    const updated = [...blocks];
    // Bloktaki tüm katlardaki en yüksek daire numarasını bul
    let maxNum = 0;
    for (const floor of updated[blockIndex].floors) {
      for (const unit of floor.units) {
        const m = unit.name.match(/Daire\s+(\d+)/i);
        if (m) maxNum = Math.max(maxNum, parseInt(m[1], 10));
      }
    }
    updated[blockIndex].floors[floorIndex].units.push({
      name: `Daire ${maxNum + 1}`,
    });
    setBlocks(updated);
  };

  const addUnitsRange = (blockIndex: number, floorIndex: number, count: number) => {
    const updated = [...blocks];
    // Bloktaki tüm katlardaki en yüksek daire numarasını bul
    let maxNum = 0;
    for (const floor of updated[blockIndex].floors) {
      for (const unit of floor.units) {
        const m = unit.name.match(/Daire\s+(\d+)/i);
        if (m) maxNum = Math.max(maxNum, parseInt(m[1], 10));
      }
    }
    for (let i = 0; i < count; i++) {
      updated[blockIndex].floors[floorIndex].units.push({
        name: `Daire ${maxNum + i + 1}`,
      });
    }
    setBlocks(updated);
  };

  const handleSubmit = async () => {
    if (!name.trim()) {
      setError("Şantiye adı gereklidir");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/sites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          description,
          address,
          startDate: startDate || null,
          endDate: endDate || null,
          siteType: siteType || null,
          blocks,
          metraj,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Hata oluştu");
        return;
      }

      const data = await res.json();
      router.push(`/dashboard/sites/${data.site.id}`);
    } catch (err) {
      setError("Bağlantı hatası");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Başlık */}
      <div className="flex items-center gap-4">
        <Link
          href="/dashboard/sites"
          className="w-10 h-10 flex items-center justify-center bg-white rounded-lg border border-gray-200 hover:bg-gray-50"
        >
          <ArrowLeft size={20} />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Yeni Şantiye Oluştur</h1>
          <p className="text-gray-500 text-sm mt-1">Şantiye bilgilerini ve blokları tanımlayın</p>
        </div>
      </div>

      {/* Sekme Tabları */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100">
        <div className="flex border-b border-gray-200">
          {[
            { key: "general", label: "Genel Bilgiler" },
            { key: "blocks", label: "Bloklar & Katlar" },
            { key: "metraj", label: "Metraj" },
          ].map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key as typeof activeTab)}
              className={`px-6 py-3 text-sm font-medium transition-all ${
                activeTab === tab.key
                  ? "border-b-2 border-[#c0392b] text-[#c0392b]"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="p-6">
          {/* Genel Bilgiler */}
          {activeTab === "general" && (
            <div className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Şantiye Adı *</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#c0392b] focus:border-transparent outline-none"
                  placeholder="ör. Safir - II"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Şantiye Tipi *</label>
                <select
                  value={siteType}
                  onChange={(e) => setSiteType(e.target.value)}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#c0392b] focus:border-transparent outline-none bg-white"
                >
                  <option value="">Şantiye tipi seçin</option>
                  <option value="Villa">Villa</option>
                  <option value="Apartman">Apartman</option>
                  <option value="Fabrika">Fabrika</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Adres</label>
                <input
                  type="text"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#c0392b] focus:border-transparent outline-none"
                  placeholder="Şantiye adresi"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Başlangıç Tarihi</label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#c0392b] focus:border-transparent outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Tahmini Bitiş Tarihi</label>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#c0392b] focus:border-transparent outline-none"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Bloklar */}
          {activeTab === "blocks" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm text-gray-500">
                  {siteType === "Villa" || siteType === "Fabrika"
                    ? "Bloklarınızı ve metrekare bilgilerini tanımlayın"
                    : "Bloklarınızı, katlarını ve dairelerini tanımlayın"}
                </p>
                <button
                  onClick={addBlock}
                  className="flex items-center gap-1 text-sm text-[#c0392b] hover:text-[#922b21] font-medium"
                >
                  <Plus size={16} /> Blok Ekle
                </button>
              </div>

              {blocks.length === 0 && (
                <div className="text-center py-12 text-gray-400">
                  <p className="text-lg">Henüz blok eklenmedi</p>
                  <button onClick={addBlock} className="text-[#c0392b] text-sm mt-2 font-medium">+ Blok Ekle</button>
                </div>
              )}

              {blocks.map((block, bi) => (
                <div key={bi} className="border-2 border-[#1e3a5f]/20 rounded-xl overflow-hidden">
                  <div className="flex items-center justify-between bg-[#1e3a5f] px-4 py-2.5">
                    <input
                      type="text"
                      value={block.name}
                      onChange={(e) => {
                        const updated = [...blocks];
                        updated[bi].name = e.target.value;
                        setBlocks(updated);
                      }}
                      className="font-semibold text-white bg-transparent px-2 py-1 border border-transparent hover:border-white/30 rounded focus:border-white/60 outline-none placeholder-white/50"
                    />
                    <div className="flex items-center gap-2">
                      {siteType !== "Villa" && siteType !== "Fabrika" && (
                        <button
                          onClick={() => addFloor(bi)}
                          className="text-xs text-white/80 hover:text-white px-2 py-1 border border-white/30 hover:border-white/60 rounded transition-all"
                        >
                          + Kat
                        </button>
                      )}
                      <button onClick={() => removeBlock(bi)} className="text-white/60 hover:text-red-300 transition-all">
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>

                  {siteType === "Villa" || siteType === "Fabrika" ? (
                    <div className="ml-4 mt-2">
                      <label className="block text-sm text-gray-600 mb-1">Metrekare (m²)</label>
                      <input
                        type="number"
                        value={block.squareMeters || ""}
                        onChange={(e) => {
                          const updated = [...blocks];
                          updated[bi].squareMeters = e.target.value;
                          setBlocks(updated);
                        }}
                        className="w-48 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#c0392b] focus:border-transparent outline-none text-sm"
                        placeholder="ör. 250"
                        min="0"
                      />
                    </div>
                  ) : (
                    <div className="p-4">
                  {block.floors.map((floor, fi) => (
                    <div key={fi} className={`py-2.5 px-3 ${fi < block.floors.length - 1 ? "border-b-2 border-[#1e3a5f]/15" : ""}`}>
                      <div className="flex items-center justify-between">
                        <input
                          type="text"
                          value={floor.name}
                          onChange={(e) => {
                            const updated = [...blocks];
                            updated[bi].floors[fi].name = e.target.value;
                            setBlocks(updated);
                          }}
                          className="text-sm text-gray-700 font-medium px-2 py-1 border border-transparent hover:border-gray-200 rounded outline-none"
                        />
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-gray-400">{floor.units.length} daire</span>
                          <button
                            onClick={() => addUnit(bi, fi)}
                            className="text-xs text-green-500 hover:text-green-700"
                          >
                            +1
                          </button>
                          <button
                            onClick={() => addUnitsRange(bi, fi, 4)}
                            className="text-xs text-green-500 hover:text-green-700"
                          >
                            +4
                          </button>
                          <button
                            onClick={() => addUnitsRange(bi, fi, 8)}
                            className="text-xs text-green-500 hover:text-green-700"
                          >
                            +8
                          </button>
                          <button
                            onClick={() => removeFloor(bi, fi)}
                            className="text-red-300 hover:text-red-500 ml-1 transition-all"
                            title="Katı sil"
                          >
                            <X size={14} />
                          </button>
                        </div>
                      </div>
                      {floor.units.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1 ml-4">
                          {floor.units.map((unit, ui) => (
                            <div key={ui} className="relative">
                              <input
                                type="text"
                                value={unit.name}
                                onChange={(e) => {
                                  const updated = [...blocks];
                                  updated[bi].floors[fi].units[ui].name = e.target.value;
                                  setBlocks(updated);
                                }}
                                className="text-xs bg-gray-100 px-2 py-0.5 rounded border border-transparent focus:border-[#c0392b] focus:bg-white outline-none w-20 pr-5"
                              />
                              <button
                                onClick={() => {
                                  const updated = [...blocks];
                                  updated[bi].floors[fi].units = updated[bi].floors[fi].units.filter((_, i) => i !== ui);
                                  setBlocks(updated);
                                }}
                                className="absolute top-0 right-0 w-4 h-full text-red-400 hover:text-red-600 text-[10px] flex items-center justify-center"
                                title="Daireyi sil"
                              >
                                ×
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Metraj */}
          {activeTab === "metraj" && (
            <MetrajForm items={metraj} onChange={setMetraj} />
          )}
        </div>
      </div>

      {/* Alt Butonlar */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
          {error}
        </div>
      )}

      <div className="flex justify-end gap-3">
        <Link
          href="/dashboard/sites"
          className="px-6 py-2.5 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 text-sm font-medium"
        >
          İptal
        </Link>
        <button
          onClick={handleSubmit}
          disabled={loading}
          className="px-6 py-2.5 bg-[#c0392b] hover:bg-[#922b21] text-white rounded-lg text-sm font-medium disabled:opacity-50"
        >
          {loading ? "Oluşturuluyor..." : "Şantiyeyi Oluştur"}
        </button>
      </div>
    </div>
  );
}
