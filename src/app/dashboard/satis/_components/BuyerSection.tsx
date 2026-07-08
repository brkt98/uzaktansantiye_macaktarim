"use client";

import { useEffect, useRef, useState } from "react";
import { User, Trash2, Check, Loader2 } from "lucide-react";
import { useDialog } from "./DialogProvider";

export type Buyer = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  notes: string | null;
};

type Props = {
  targetType: "unit" | "daire";
  targetId: string;
  onChange?: (buyer: Buyer | null) => void;
};

export default function BuyerSection({ targetType, targetId, onChange }: Props) {
  const { confirm } = useDialog();
  const [buyer, setBuyer] = useState<Buyer | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [notes, setNotes] = useState("");
  const [savingState, setSavingState] = useState<"idle" | "saving" | "saved">("idle");
  const [loading, setLoading] = useState(true);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedRef = useRef<string>("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await fetch(
          `/api/sales/buyers?targetType=${targetType}&targetId=${targetId}`
        );
        const data = await res.json();
        if (!cancelled && res.ok) {
          setBuyer(data.buyer ?? null);
          setName(data.buyer?.name ?? "");
          setPhone(data.buyer?.phone ?? "");
          setEmail(data.buyer?.email ?? "");
          setNotes(data.buyer?.notes ?? "");
          lastSavedRef.current = JSON.stringify({
            name: data.buyer?.name ?? "",
            phone: data.buyer?.phone ?? "",
            email: data.buyer?.email ?? "",
            notes: data.buyer?.notes ?? "",
          });
          onChange?.(data.buyer ?? null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [targetType, targetId]);

  const save = async () => {
    if (!name.trim()) return;
    const snapshot = JSON.stringify({ name: name.trim(), phone: phone.trim(), email: email.trim(), notes: notes.trim() });
    if (snapshot === lastSavedRef.current) return;
    setSavingState("saving");
    try {
      const res = await fetch("/api/sales/buyers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetType,
          targetId,
          name: name.trim(),
          phone: phone.trim() || null,
          email: email.trim() || null,
          notes: notes.trim() || null,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setBuyer(data.buyer);
        lastSavedRef.current = snapshot;
        setSavingState("saved");
        onChange?.(data.buyer);
        setTimeout(() => setSavingState("idle"), 1500);
      } else {
        setSavingState("idle");
      }
    } catch {
      setSavingState("idle");
    }
  };

  useEffect(() => {
    if (loading) return;
    if (!name.trim()) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      void save();
    }, 120);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, phone, email, notes]);

  const remove = async () => {
    if (!buyer) return;
    if (!(await confirm({ message: "Alıcı bilgilerini ve tüm ödeme kayıtlarını silmek istediğinize emin misiniz?", variant: "danger", confirmText: "Sil" }))) return;
    const res = await fetch(`/api/sales/buyers?buyerId=${buyer.id}`, {
      method: "DELETE",
    });
    if (res.ok) {
      setBuyer(null);
      setName("");
      setPhone("");
      setEmail("");
      setNotes("");
      lastSavedRef.current = "";
      onChange?.(null);
    }
  };

  if (loading) {
    return <div className="text-xs text-gray-400">Aliciya bakiliyor...</div>;
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2">
          <User size={16} className="text-slate-600" />
          <h4 className="font-semibold text-sm text-slate-800">Alici Bilgisi</h4>
        </div>
        <div className="text-[11px] text-slate-500 flex items-center gap-1">
          {savingState === "saving" && (<><Loader2 size={11} className="animate-spin" /> Kaydediliyor…</>)}
          {savingState === "saved" && (<><Check size={11} className="text-emerald-600" /> Kaydedildi</>)}
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Ad Soyad"
          className="px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-blue-400"
        />
        <input
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="Telefon"
          className="px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-blue-400"
        />
        <input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="E-posta (opsiyonel)"
          className="px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-blue-400 sm:col-span-2"
        />
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Notlar"
          rows={2}
          className="px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-blue-400 sm:col-span-2"
        />
      </div>
      {buyer && (
        <div className="flex items-center justify-end mt-3">
          <button
            onClick={remove}
            className="px-3 py-2 text-xs rounded-lg bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100 inline-flex items-center gap-1"
          >
            <Trash2 size={13} /> Alici Bilgilerini Sil
          </button>
        </div>
      )}
      <p className="text-[10px] text-slate-400 mt-2">Bilgiler otomatik kaydediliyor.</p>
    </div>
  );
}
