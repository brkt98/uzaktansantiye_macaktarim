"use client";

import { FileText, Building2 } from "lucide-react";

export default function ReportsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-800">Raporlar</h1>
        <p className="text-gray-500 mt-1">Şantiye ilerleme ve maliyet raporları</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100 card-hover cursor-pointer">
          <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center mb-4">
            <Building2 className="text-blue-600" size={24} />
          </div>
          <h3 className="font-semibold text-gray-800 mb-1">Şantiye İlerleme Raporu</h3>
          <p className="text-sm text-gray-500">Tüm şantiyelerin genel ilerleme durumu</p>
        </div>

        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100 card-hover cursor-pointer">
          <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center mb-4">
            <FileText className="text-green-600" size={24} />
          </div>
          <h3 className="font-semibold text-gray-800 mb-1">Maliyet Raporu</h3>
          <p className="text-sm text-gray-500">Gelir/gider özeti ve detaylı maliyet analizi</p>
        </div>

        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100 card-hover cursor-pointer">
          <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center mb-4">
            <FileText className="text-purple-600" size={24} />
          </div>
          <h3 className="font-semibold text-gray-800 mb-1">Tamamlanan İşler</h3>
          <p className="text-sm text-gray-500">Arşivlenmiş şantiye dokümantasyonu</p>
        </div>
      </div>

      <div className="bg-white rounded-xl p-12 text-center shadow-sm border border-gray-100">
        <FileText className="mx-auto text-gray-300 mb-4" size={48} />
        <p className="text-gray-500">Rapor modülü geliştirme aşamasında</p>
        <p className="text-sm text-gray-400 mt-1">Yakında detaylı raporlar burada görüntülenebilecek</p>
      </div>
    </div>
  );
}
