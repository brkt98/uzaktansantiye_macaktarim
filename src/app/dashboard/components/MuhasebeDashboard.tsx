"use client";

import Link from "next/link";
import { TrendingUp, Truck, Warehouse, Building2, ArrowRight, HardHat } from "lucide-react";

interface Props {
  firstName?: string;
}

const FINANCE_CARDS = [
  {
    href: "/dashboard/satis",
    label: "Satış",
    desc: "Projeler, daire/birim fiyatları, alıcılar ve ödemeler",
    icon: TrendingUp,
    color: "from-emerald-500 to-emerald-600",
  },
  {
    href: "/dashboard/teslimat",
    label: "Teslimat",
    desc: "Malzeme teslimatları, irsaliye ve tutarlar",
    icon: Truck,
    color: "from-blue-500 to-blue-600",
  },
  {
    href: "/dashboard/depo",
    label: "Depo",
    desc: "Stok, malzeme ve irsaliye yönetimi",
    icon: Warehouse,
    color: "from-amber-500 to-amber-600",
  },
  {
    href: "/dashboard/sites",
    label: "Maliyet / Giderler",
    desc: "Şantiye maliyet kayıtları ve giderleri (şantiye detayında)",
    icon: Building2,
    color: "from-rose-500 to-rose-600",
  },
  {
    href: "/dashboard/personel",
    label: "Personel",
    desc: "Personel kayıtları ve puantaj",
    icon: HardHat,
    color: "from-violet-500 to-violet-600",
  },
];

export default function MuhasebeDashboard({ firstName }: Props) {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-800">
          Merhaba{firstName ? `, ${firstName}` : ""} 👋
        </h1>
        <p className="text-gray-500 mt-1">Muhasebe paneli — finans modüllerine hızlı erişim</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {FINANCE_CARDS.map((card) => (
          <Link
            key={card.href + card.label}
            href={card.href}
            className="group bg-white rounded-2xl shadow-sm border border-gray-100 p-5 hover:shadow-md hover:border-gray-200 transition-all"
          >
            <div className="flex items-start justify-between">
              <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${card.color} flex items-center justify-center text-white`}>
                <card.icon size={24} />
              </div>
              <ArrowRight size={20} className="text-gray-300 group-hover:text-[#c0392b] group-hover:translate-x-1 transition-all" />
            </div>
            <h3 className="mt-4 text-lg font-semibold text-gray-800">{card.label}</h3>
            <p className="text-sm text-gray-500 mt-1">{card.desc}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
