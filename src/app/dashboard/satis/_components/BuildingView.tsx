"use client";

import { Home, Clock, CheckCircle2, Eye, FileText, Landmark } from "lucide-react";
import { useDevice } from "@/hooks/useDevice";

export type BuildingDaire = {
  id: string;
  name: string;
  status: "AVAILABLE" | "RESERVED" | "SOLD" | "LAND_OWNER";
  price?: string | null;
  floorId?: string | null;
  floorName?: string | null;
  mediaCount?: number;
  hasMedia?: boolean;
  hasDocuments?: boolean;
  buyerName?: string | null;
  buyerPhone?: string | null;
  totalPaid?: string | null;
  remainingAmount?: string | null;
};

export type BuildingFloor = {
  id: string;
  name: string;
  daires: BuildingDaire[];
};

export type BuildingBlock = {
  id: string;
  name: string;
  floors?: BuildingFloor[];
  daires?: BuildingDaire[];
};

type Props = {
  block: BuildingBlock;
  onDaireClick: (daire: BuildingDaire) => void;
  onShowMedia?: (daire: BuildingDaire) => void;
  onShowDocuments?: (daire: BuildingDaire) => void;
};

const STATUS_LABEL: Record<BuildingDaire["status"], string> = {
  AVAILABLE: "Boş",
  RESERVED: "Rezerve",
  SOLD: "Satıldı",
  LAND_OWNER: "Arsa Sahibi",
};

// Mat (solid) renkler — yeşil / turuncu / kırmızı / mor (kullanıcı talebi)
const STATUS_CARD: Record<BuildingDaire["status"], string> = {
  AVAILABLE: "bg-emerald-600 hover:bg-emerald-700 border border-black/5 shadow-sm",
  RESERVED: "bg-amber-600 hover:bg-amber-700 border border-black/5 shadow-sm",
  SOLD: "bg-rose-600 hover:bg-rose-700 border border-black/5 shadow-sm",
  LAND_OWNER: "bg-violet-600 hover:bg-violet-700 border border-black/5 shadow-sm",
};

const formatTl = (v: string | null | undefined) =>
  v != null ? Number(v).toLocaleString("tr-TR") : null;

function DaireCard({
  d,
  onClick,
  onShowMedia,
  onShowDocuments,
}: {
  d: BuildingDaire;
  onClick: () => void;
  onShowMedia?: (d: BuildingDaire) => void;
  onShowDocuments?: (d: BuildingDaire) => void;
}) {
  const remainingRaw =
    d.remainingAmount != null
      ? d.remainingAmount
      : d.price != null
        ? (Math.max(0, Number(d.price) - Number(d.totalPaid ?? 0))).toFixed(2)
        : null;
  const remaining = formatTl(remainingRaw);
  const price = formatTl(d.price);
  const showBuyer = !!d.buyerName;
  const showPrice = !showBuyer && !!price;

  return (
    <div
      className={`pressable mob-fade-up group relative rounded-xl text-white border border-white/10 ${STATUS_CARD[d.status]} transition-all cursor-pointer p-3`}
      onClick={onClick}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="font-extrabold text-sm truncate drop-shadow-sm">{d.name}</div>
        <span className="text-[10px] px-1.5 py-0.5 rounded-full font-bold whitespace-nowrap bg-white/25 backdrop-blur-sm border border-white/30">
          {STATUS_LABEL[d.status]}
        </span>
      </div>

      {showBuyer && (
        <div className="mt-1.5 text-[12px] font-extrabold truncate drop-shadow-sm">
          {d.buyerName}
        </div>
      )}
      {showBuyer && d.buyerPhone && (
        <div className="text-[10px] font-semibold truncate opacity-90">
          {d.buyerPhone}
        </div>
      )}
      {showPrice && (
        <div className="text-xs font-bold mt-1.5">{price} ₺</div>
      )}
      {remaining != null && (d.status === "SOLD" || d.status === "RESERVED") && (
        <div className="text-[10px] font-semibold mt-0.5 opacity-95">Kalan: {remaining} ₺</div>
      )}

      {/* Butonlar yalnızca handler verildiğinde (editör) görünür; tam satır + büyük → kolay basılır */}
      {((onShowMedia && (d.hasMedia ?? (d.mediaCount ?? 0) > 0)) || (onShowDocuments && d.hasDocuments)) && (
        <div
          className="mt-2.5 flex items-center gap-2"
          onClick={(e) => e.stopPropagation()}
        >
          {onShowMedia && (d.hasMedia ?? (d.mediaCount ?? 0) > 0) && (
            <button
              type="button"
              onClick={() => onShowMedia(d)}
              className="tap flex-1 inline-flex items-center justify-center gap-1.5 py-2.5 rounded-lg bg-white/25 hover:bg-white/35 border border-white/40 text-white text-xs font-bold backdrop-blur-sm active:scale-95 transition-all"
            >
              <Eye size={15} /> Daireyi Gör
            </button>
          )}
          {onShowDocuments && d.hasDocuments && (
            <button
              type="button"
              onClick={() => onShowDocuments(d)}
              className="tap flex-1 inline-flex items-center justify-center gap-1.5 py-2.5 rounded-lg bg-white/25 hover:bg-white/35 border border-white/40 text-white text-xs font-bold backdrop-blur-sm active:scale-95 transition-all"
            >
              <FileText size={15} /> Belgeler
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default function BuildingView({ block, onDaireClick, onShowMedia, onShowDocuments }: Props) {
  const { isMobile } = useDevice();
  const floors: BuildingFloor[] =
    block.floors && block.floors.length > 0
      ? block.floors
      : block.daires
        ? [{ id: "_flat", name: "Daireler", daires: block.daires }]
        : [];

  const ordered = [...floors].reverse();

  const allDaires = floors.flatMap((f) => f.daires);
  const stats = {
    total: allDaires.length,
    sold: allDaires.filter((d) => d.status === "SOLD").length,
    reserved: allDaires.filter((d) => d.status === "RESERVED").length,
    available: allDaires.filter((d) => d.status === "AVAILABLE").length,
    landOwner: allDaires.filter((d) => d.status === "LAND_OWNER").length,
  };

  return (
    <div className="bg-gradient-to-b from-slate-900 via-slate-800 to-slate-700 rounded-2xl p-4 sm:p-6 border border-slate-700 shadow-inner">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <h3 className="text-lg font-bold text-white">{block.name}</h3>
        <div className="flex items-center gap-1.5 text-xs flex-wrap">
          <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/90 text-white font-bold">
            <Home size={11} /> {stats.available}
          </span>
          <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/90 text-white font-bold">
            <Clock size={11} /> {stats.reserved}
          </span>
          <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-rose-500/90 text-white font-bold">
            <CheckCircle2 size={11} /> {stats.sold}
          </span>
          {stats.landOwner > 0 && (
            <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-purple-500/90 text-white font-bold">
              <Landmark size={11} /> {stats.landOwner}
            </span>
          )}
        </div>
      </div>

      <div className="relative">
        <div
          className="mx-auto w-[92%] h-0 border-l-[24px] border-r-[24px] border-b-[28px] border-l-transparent border-r-transparent drop-shadow-md"
          style={{ borderBottomColor: "#ffffff" }}
        />
        <div className="mx-auto w-[92%] h-1 bg-white rounded-b-md" />

        <div className="mt-0 rounded-b-xl overflow-hidden border-x-4 border-b-4 border-slate-900 bg-slate-100">
          {ordered.map((floor, idx) => {
            const isGround = idx === ordered.length - 1;
            return (
              <div
                key={floor.id}
                className={`px-3 py-3 sm:px-4 sm:py-4 ${
                  idx === 0 ? "" : "border-t-2 border-slate-300"
                } ${isGround ? "bg-stone-200" : "bg-white"}`}
              >
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-[10px] font-bold tracking-wider uppercase text-slate-600">
                    {floor.name}
                  </span>
                  <span className="text-[10px] text-slate-400">·</span>
                  <span className="text-[10px] text-slate-500">
                    {floor.daires.length} daire
                  </span>
                  <div className="flex-1 border-b border-dashed border-slate-300 ml-1" />
                </div>
                {floor.daires.length === 0 ? (
                  <div className="text-center text-xs text-slate-400 py-3">
                    Bu katta daire yok
                  </div>
                ) : (
                  <div className={isMobile ? "flex flex-col gap-2" : "grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2"}>
                    {floor.daires.map((d) => (
                      <DaireCard
                        key={d.id}
                        d={d}
                        onClick={() => onDaireClick(d)}
                        onShowMedia={onShowMedia}
                        onShowDocuments={onShowDocuments}
                      />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="mx-auto w-full h-2 bg-stone-400 rounded-b-md mt-0" />
        <div className="mx-auto w-[110%] -ml-[5%] h-1 bg-stone-500 rounded-full mt-1" />
      </div>
    </div>
  );
}
