"use client";

import { useEffect, useRef, useState } from "react";
import { Plus, Trash2 } from "lucide-react";

export interface MetrajItem {
  id: string;
  malzeme: string;
  birim: string;
  miktar: number;
  // Eski kayıtlarla geriye dönük uyumluluk için (UI'da gösterilmez)
  birimFiyat?: number;
  kdv?: number;
}

// Teslimat sayfası ile birebir aynı birim listesi
const BIRIMLER = [
  "metre",
  "metrekare",
  "metreküp",
  "adet",
  "kg",
  "ton",
  "paket",
  "saat",
];

function makeId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `m_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

export function emptyMetrajItem(): MetrajItem {
  return {
    id: makeId(),
    malzeme: "",
    birim: "metre",
    miktar: 0,
  };
}

export default function MetrajForm({
  items,
  onChange,
}: {
  items: MetrajItem[];
  onChange: (next: MetrajItem[]) => void;
}) {
  const [justAddedId, setJustAddedId] = useState<string | null>(null);
  const rowRefs = useRef<Record<string, HTMLTableRowElement | null>>({});

  const addItem = () => {
    const item = emptyMetrajItem();
    onChange([...items, item]);
    setJustAddedId(item.id);
  };
  const updateItem = (id: string, patch: Partial<MetrajItem>) => {
    onChange(items.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  };
  const removeItem = (id: string) => onChange(items.filter((it) => it.id !== id));

  // Yeni eklenen kaleme doğru animasyon: o satıra kaydır + vurgula + ilk alana odaklan
  useEffect(() => {
    if (!justAddedId) return;
    const row = rowRefs.current[justAddedId];
    if (row) {
      row.scrollIntoView({ behavior: "smooth", block: "nearest" });
      row.querySelector<HTMLInputElement>("input[type='text']")?.focus();
    }
    const t = setTimeout(() => setJustAddedId(null), 1300);
    return () => clearTimeout(t);
  }, [justAddedId]);

  return (
    <div className="space-y-3">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <p className="text-sm text-gray-500">Şantiye için kullanılacak malzemeleri kalem kalem ekleyin</p>
        <button
          type="button"
          onClick={addItem}
          className="inline-flex items-center justify-center gap-2 px-6 py-3 text-base font-semibold text-[#c0392b] hover:text-white hover:bg-[#c0392b] bg-white border-2 border-dashed border-[#c0392b] rounded-full transition-all shadow-sm hover:shadow-md active:scale-95 self-start sm:self-auto"
        >
          <Plus size={20} /> Ürün Ekle
        </button>
      </div>

      {items.length === 0 ? (
        <div className="text-center py-12 text-gray-400 border-2 border-dashed border-gray-200 rounded-lg">
          <p className="text-lg">Henüz metraj kalemi eklenmedi</p>
          <button
            type="button"
            onClick={addItem}
            className="inline-flex items-center justify-center gap-2 mt-4 px-6 py-3 text-base font-semibold text-[#c0392b] hover:text-white hover:bg-[#c0392b] bg-white border-2 border-dashed border-[#c0392b] rounded-full transition-all shadow-sm hover:shadow-md active:scale-95"
          >
            <Plus size={20} /> Ürün Ekle
          </button>
        </div>
      ) : (
        <div className="overflow-x-auto -mx-1">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-gray-600 text-xs uppercase">
                <th className="px-2 py-2 text-left">Malzeme Adı</th>
                <th className="px-2 py-2 text-left w-32">Birim</th>
                <th className="px-2 py-2 text-right w-32">Miktar</th>
                <th className="w-10"></th>
              </tr>
            </thead>
            <tbody>
              {items.map((it) => (
                <tr
                  key={it.id}
                  ref={(el) => { rowRefs.current[it.id] = el; }}
                  className={`border-b border-gray-100 align-top ${it.id === justAddedId ? "metraj-row-pop" : ""}`}
                >
                  <td className="px-2 py-1.5">
                    <input
                      type="text"
                      value={it.malzeme}
                      onChange={(e) => updateItem(it.id, { malzeme: e.target.value })}
                      className="w-full px-2 py-1.5 border border-gray-200 rounded focus:ring-1 focus:ring-[#c0392b] focus:border-transparent outline-none"
                      placeholder="ör. Çimento"
                    />
                  </td>
                  <td className="px-2 py-1.5">
                    <select
                      value={it.birim}
                      onChange={(e) => updateItem(it.id, { birim: e.target.value })}
                      className="w-full px-2 py-1.5 border border-gray-200 rounded focus:ring-1 focus:ring-[#c0392b] focus:border-transparent outline-none bg-white"
                    >
                      {BIRIMLER.map((b) => (
                        <option key={b} value={b}>
                          {b}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-2 py-1.5">
                    <input
                      type="number"
                      min="0"
                      step="any"
                      value={it.miktar}
                      onChange={(e) =>
                        updateItem(it.id, { miktar: parseFloat(e.target.value) || 0 })
                      }
                      className="w-full px-2 py-1.5 border border-gray-200 rounded text-right outline-none focus:ring-1 focus:ring-[#c0392b]"
                    />
                  </td>
                  <td className="px-2 py-1.5 text-right">
                    <button
                      type="button"
                      onClick={() => removeItem(it.id)}
                      className="text-red-400 hover:text-red-600"
                      title="Kalemi sil"
                    >
                      <Trash2 size={16} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-gray-50 font-semibold text-gray-800">
                <td colSpan={2} className="px-2 py-2 text-right">
                  Toplam Kalem:
                </td>
                <td className="px-2 py-2 text-right">{items.length}</td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
