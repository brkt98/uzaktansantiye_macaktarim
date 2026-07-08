"use client";

import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import {
  DollarSign,
  Plus,
  TrendingUp,
  TrendingDown,
  Receipt,
  CreditCard,
  X,
} from "lucide-react";

interface Cost {
  id: string;
  type: string;
  amount: number;
  currency: string;
  description: string;
  vendor: string;
  date: string;
  dueDate: string;
  isPaid: boolean;
  category: { name: string } | null;
  creator: { firstName: string; lastName: string };
}

interface Summary {
  totalExpense: number;
  totalIncome: number;
  totalPayment: number;
  unpaidCount: number;
}

interface Site {
  id: string;
  name: string;
}

export default function CostsPage() {
  const searchParams = useSearchParams();
  const siteIdParam = searchParams.get("siteId");

  const [costs, setCosts] = useState<Cost[]>([]);
  const [summary, setSummary] = useState<Summary>({ totalExpense: 0, totalIncome: 0, totalPayment: 0, unpaidCount: 0 });
  const [sites, setSites] = useState<Site[]>([]);
  const [selectedSite, setSelectedSite] = useState(siteIdParam || "");
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);

  // Form state
  const [formType, setFormType] = useState("EXPENSE");
  const [formAmount, setFormAmount] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formVendor, setFormVendor] = useState("");
  const [formDate, setFormDate] = useState(new Date().toISOString().split("T")[0]);
  const [formDueDate, setFormDueDate] = useState("");
  const [formIsPaid, setFormIsPaid] = useState(false);

  useEffect(() => {
    fetchSites();
  }, []);

  useEffect(() => {
    if (selectedSite) fetchCosts();
  }, [selectedSite]);

  const fetchSites = async () => {
    const res = await fetch("/api/sites");
    const data = await res.json();
    setSites(data.sites || []);
    if (!selectedSite && data.sites?.length > 0) {
      setSelectedSite(siteIdParam || data.sites[0].id);
    }
    setLoading(false);
  };

  const fetchCosts = async () => {
    try {
      const res = await fetch(`/api/costs?siteId=${selectedSite}`);
      const data = await res.json();
      setCosts(data.costs || []);
      setSummary(data.summary || { totalExpense: 0, totalIncome: 0, totalPayment: 0, unpaidCount: 0 });
    } catch (error) {
      console.error(error);
    }
  };

  const handleSubmit = async () => {
    if (!formAmount || !selectedSite) return;

    try {
      const res = await fetch("/api/costs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          siteId: selectedSite,
          type: formType,
          amount: formAmount,
          description: formDescription,
          vendor: formVendor,
          date: formDate,
          dueDate: formDueDate || null,
          isPaid: formIsPaid,
        }),
      });

      if (res.ok) {
        setShowModal(false);
        setFormAmount("");
        setFormDescription("");
        setFormVendor("");
        setFormIsPaid(false);
        fetchCosts();
      }
    } catch (error) {
      console.error(error);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY" }).format(amount);
  };

  const getTypeLabel = (type: string) => {
    switch (type) {
      case "EXPENSE": return "Gider";
      case "INCOME": return "Gelir";
      case "INVOICE": return "Fatura";
      case "PAYMENT": return "Ödeme";
      default: return type;
    }
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case "EXPENSE": return "text-red-600 bg-red-50";
      case "INCOME": return "text-green-600 bg-green-50";
      case "INVOICE": return "text-orange-600 bg-orange-50";
      case "PAYMENT": return "text-blue-600 bg-blue-50";
      default: return "text-gray-600 bg-gray-50";
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Maliyet Yönetimi</h1>
          <p className="text-gray-500 mt-1">Gelir, gider, fatura ve ödemeleri takip edin</p>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={selectedSite}
            onChange={(e) => setSelectedSite(e.target.value)}
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-[#c0392b]"
          >
            {sites.map((site) => (
              <option key={site.id} value={site.id}>{site.name}</option>
            ))}
          </select>
          <button
            onClick={() => setShowModal(true)}
            className="inline-flex items-center gap-2 bg-[#c0392b] hover:bg-[#922b21] text-white px-4 py-2 rounded-lg text-sm font-medium"
          >
            <Plus size={18} />
            Kayıt Ekle
          </button>
        </div>
      </div>

      {/* Özet Kartları */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-red-100 rounded-lg flex items-center justify-center">
              <TrendingDown className="text-red-600" size={20} />
            </div>
            <div>
              <p className="text-lg font-bold text-red-600">{formatCurrency(summary.totalExpense)}</p>
              <p className="text-xs text-gray-500">Toplam Gider</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
              <TrendingUp className="text-green-600" size={20} />
            </div>
            <div>
              <p className="text-lg font-bold text-green-600">{formatCurrency(summary.totalIncome)}</p>
              <p className="text-xs text-gray-500">Toplam Gelir</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
              <CreditCard className="text-blue-600" size={20} />
            </div>
            <div>
              <p className="text-lg font-bold text-blue-600">{formatCurrency(summary.totalPayment)}</p>
              <p className="text-xs text-gray-500">Yapılan Ödemeler</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-orange-100 rounded-lg flex items-center justify-center">
              <Receipt className="text-orange-600" size={20} />
            </div>
            <div>
              <p className="text-lg font-bold text-orange-600">
                {formatCurrency(summary.totalExpense - summary.totalPayment)}
              </p>
              <p className="text-xs text-gray-500">Ödenmemiş ({summary.unpaidCount})</p>
            </div>
          </div>
        </div>
      </div>

      {/* Kayıt Listesi */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Tür</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Açıklama</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Tedarikçi</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Tutar</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Tarih</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Durum</th>
              </tr>
            </thead>
            <tbody>
              {costs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-8 text-gray-400">
                    Henüz maliyet kaydı bulunmuyor
                  </td>
                </tr>
              ) : (
                costs.map((cost) => (
                  <tr key={cost.id} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 rounded text-xs font-medium ${getTypeColor(cost.type)}`}>
                        {getTypeLabel(cost.type)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700">{cost.description || "-"}</td>
                    <td className="px-4 py-3 text-sm text-gray-500">{cost.vendor || "-"}</td>
                    <td className="px-4 py-3 text-sm font-semibold text-right">
                      <span className={cost.type === "INCOME" ? "text-green-600" : "text-gray-800"}>
                        {formatCurrency(cost.amount)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500 text-center">
                      {new Date(cost.date).toLocaleDateString("tr-TR")}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`px-2 py-1 rounded text-xs ${cost.isPaid ? "bg-green-50 text-green-600" : "bg-red-50 text-red-600"}`}>
                        {cost.isPaid ? "Ödendi" : "Bekliyor"}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">Yeni Maliyet Kaydı</h2>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600">
                <X size={20} />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Tür</label>
                <select
                  value={formType}
                  onChange={(e) => setFormType(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-[#c0392b]"
                >
                  <option value="EXPENSE">Gider</option>
                  <option value="INCOME">Gelir</option>
                  <option value="INVOICE">Fatura</option>
                  <option value="PAYMENT">Ödeme</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Tutar (₺) *</label>
                <input
                  type="number"
                  value={formAmount}
                  onChange={(e) => setFormAmount(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-[#c0392b]"
                  placeholder="0.00"
                  step="0.01"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Açıklama</label>
                <input
                  type="text"
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-[#c0392b]"
                  placeholder="Maliyet açıklaması"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Tedarikçi / Taşeron</label>
                <input
                  type="text"
                  value={formVendor}
                  onChange={(e) => setFormVendor(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-[#c0392b]"
                  placeholder="Firma adı"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Tarih</label>
                  <input
                    type="date"
                    value={formDate}
                    onChange={(e) => setFormDate(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-[#c0392b]"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Vade Tarihi</label>
                  <input
                    type="date"
                    value={formDueDate}
                    onChange={(e) => setFormDueDate(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-[#c0392b]"
                  />
                </div>
              </div>

              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={formIsPaid}
                  onChange={(e) => setFormIsPaid(e.target.checked)}
                  className="rounded"
                />
                <span className="text-sm text-gray-700">Ödendi</span>
              </label>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50"
                >
                  İptal
                </button>
                <button
                  onClick={handleSubmit}
                  className="px-4 py-2 bg-[#c0392b] hover:bg-[#922b21] text-white rounded-lg text-sm font-medium"
                >
                  Kaydet
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
