"use client";

import { useState, useEffect } from "react";
import { Settings as SettingsIcon, Database, Shield, Bell, Palette, Trash2, Building2, Edit3, Plus, ChevronDown, ChevronUp, ChevronRight, X, Check, Hammer, Layers } from "lucide-react";
import { useUser } from "../layout";
import { isAdmin as hasAdminRole } from "@/lib/roles";
import DeleteAccountSection from "../_components/DeleteAccountSection";

interface UnitItem { id?: string; name: string }
interface FloorItem { id?: string; name: string; units: UnitItem[] }
interface BlockItem { id?: string; name: string; floors: FloorItem[]; squareMeters?: string }
interface CategoryItem { id?: string; name: string; children: CategoryItem[]; config?: Record<string, string> }
interface ChecklistItem { name: string; children: { name: string }[] }
interface ConstructionFloorEdit { id?: string; name: string; works: { id?: string; name: string; order?: number }[] }
interface ConstructionDefaultFloor { name: string; type: string; order: number; isKatlar?: boolean; works: { name: string; order: number }[] }

interface SiteItem {
  id: string;
  name: string;
  description?: string;
  address?: string;
  status: string;
  startDate?: string;
  endDate?: string;
  config?: { siteType?: string };
  blocks: BlockItem[];
  categories: { id: string; name: string; config?: Record<string, string> }[];
  _count: { blocks: number };
}

export default function SettingsPage() {
  const user = useUser();
  const isAdmin = hasAdminRole(user?.roles);

  const [sites, setSites] = useState<SiteItem[]>([]);
  const [deletingSite, setDeletingSite] = useState<SiteItem | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Düzenleme
  const [editingSite, setEditingSite] = useState<SiteItem | null>(null);
  const [editTab, setEditTab] = useState<"general" | "blocks" | "checklist">("general");
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editAddress, setEditAddress] = useState("");
  const [editSiteType, setEditSiteType] = useState("");
  const [editStartDate, setEditStartDate] = useState("");
  const [editEndDate, setEditEndDate] = useState("");
  const [editBlocks, setEditBlocks] = useState<BlockItem[]>([]);
  const [editCategories, setEditCategories] = useState<CategoryItem[]>([]);
  const [editChecklist, setEditChecklist] = useState<ChecklistItem[]>([
    { name: "Mutfak İşleri", children: [] },
    { name: "Odalar", children: [] },
    { name: "Islak Zemin", children: [] },
    { name: "Balkon", children: [] },
  ]);
  const [saving, setSaving] = useState(false);
  const [editLoading, setEditLoading] = useState(false);

  // Daire kontrol ayarı state
  const [clSelectedBlock, setClSelectedBlock] = useState<number | null>(null);
  const [clSelectedFloor, setClSelectedFloor] = useState<number | null>(null);
  const [clSelectedUnit, setClSelectedUnit] = useState<UnitItem | null>(null);
  const [clSelectedCategory, setClSelectedCategory] = useState<CategoryItem | null>(null);
  const [clUnitChecklist, setClUnitChecklist] = useState<ChecklistItem[]>([]);
  const [clUnitLoading, setClUnitLoading] = useState(false);
  const [clUnitSaving, setClUnitSaving] = useState(false);
  const [originalCategories, setOriginalCategories] = useState<CategoryItem[]>([]);
  const [originalCategoryIds, setOriginalCategoryIds] = useState<Set<string>>(new Set());
  const [categoryWarning, setCategoryWarning] = useState<{ count: number } | null>(null);
  const [unitDeleteWarning, setUnitDeleteWarning] = useState<{ bi: number; fi: number; ui: number; unitName: string } | null>(null);

  // İnşaat takip ayarı state
  const [editConstructionBlock, setEditConstructionBlock] = useState<string | null>(null);
  const [editConstructionType, setEditConstructionType] = useState<"KABA_INSAAT" | "INCE_INSAAT" | "PEYZAJ" | "BINA_GENEL" | "RUHSAT_ISKAN">("KABA_INSAAT");
  const [editConstructionFloors, setEditConstructionFloors] = useState<ConstructionFloorEdit[]>([]);
  const [editConstructionLoading, setEditConstructionLoading] = useState(false);
  const [editConstructionSaving, setEditConstructionSaving] = useState(false);
  const [isPeyzajMode, setIsPeyzajMode] = useState(false);
  const [selectedTreeFloor, setSelectedTreeFloor] = useState<number | null>(null);
  // İnce İnşaat daire listesi
  const [editInceDaires, setEditInceDaires] = useState<{ id?: string; name: string }[]>([]);
  // Daire seçimi + daireye özel iş kalemleri
  const [selectedDaireIds, setSelectedDaireIds] = useState<Set<string>>(new Set());
  const [allDairesMode, setAllDairesMode] = useState(true);
  const [unitOverrides, setUnitOverrides] = useState<Record<string, { added: string[]; removed: string[] }>>({});

  // Varsayılan inşaat şablonu
  const [showConstructionDefaults, setShowConstructionDefaults] = useState(false);
  const [constructionDefaults, setConstructionDefaults] = useState<ConstructionDefaultFloor[]>([]);
  const [constructionDefaultsLoading, setConstructionDefaultsLoading] = useState(false);
  const [constructionDefaultsSaving, setConstructionDefaultsSaving] = useState(false);
  const [constructionDefaultsTab, setConstructionDefaultsTab] = useState<"KABA_INSAAT" | "INCE_INSAAT" | "PEYZAJ" | "BINA_GENEL" | "RUHSAT_ISKAN">("KABA_INSAAT");
  const [expandedDefaultFloor, setExpandedDefaultFloor] = useState<number | null>(null);

  useEffect(() => {
    if (isAdmin) fetchSites();
  }, [isAdmin]);

  // İnşaat varsayılan şablonunu getir
  const fetchConstructionDefaults = async () => {
    setConstructionDefaultsLoading(true);
    try {
      const res = await fetch('/api/construction-defaults');
      if (res.ok) {
        const data = await res.json();
        setConstructionDefaults(data.template?.floors || []);
      }
    } catch {}
    setConstructionDefaultsLoading(false);
  };

  const saveConstructionDefaults = async () => {
    setConstructionDefaultsSaving(true);
    try {
      const res = await fetch('/api/construction-defaults', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ template: { floors: constructionDefaults } }),
      });
      if (res.ok) {
        setShowConstructionDefaults(false);
      } else {
        alert('Şablon kaydedilemedi');
      }
    } catch { alert('Şablon kaydedilemedi'); }
    setConstructionDefaultsSaving(false);
  };

  // Per-site + per-block inşaat yapısını getir
  const fetchSiteConstruction = async (siteId: string, type: string, blockId?: string | null) => {
    setEditConstructionLoading(true);
    try {
      let url = `/api/construction?siteId=${siteId}&type=${type}`;
      if (blockId) url += `&blockId=${blockId}`;
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        const unitOv = data.unitOverrides || {};
        // Determine per-daire work names to filter from base works
        const perDaireNames = new Set<string>();
        if (type === "INCE_INSAAT") {
          for (const ov of Object.values(unitOv as Record<string, { added?: string[] }>)) {
            for (const n of (ov.added || [])) perDaireNames.add(n);
          }
        }
        setEditConstructionFloors(
          (data.floors || []).map((f: { id: string; name: string; works: { id: string; name: string }[] }) => ({
            id: f.id,
            name: f.name,
            works: (f.works || [])
              .filter((w: { name: string }) => !perDaireNames.has(w.name))
              .map((w: { id: string; name: string }) => ({ id: w.id, name: w.name })),
          }))
        );
        // İnce İnşaat: daire listesini de yükle
        if (type === "INCE_INSAAT") {
          setEditInceDaires((data.daires || []).map((d: { id: string; name: string }) => ({ id: d.id, name: d.name })));
          setUnitOverrides(data.unitOverrides || {});
          setSelectedDaireIds(new Set());
          setAllDairesMode(true);
        } else {
          setEditInceDaires([]);
          setUnitOverrides({});
        }
      }
    } catch {}
    setEditConstructionLoading(false);
  };

  const saveSiteConstruction = async () => {
    if (!editingSite || (!editConstructionBlock && !isPeyzajMode)) return;
    setEditConstructionSaving(true);
    try {
      const body: any = {
        siteId: editingSite.id,
        type: editConstructionType,
        blockId: isPeyzajMode ? null : editConstructionBlock,
        floors: editConstructionFloors.map((f, i) => ({
          id: f.id,
          name: f.name,
          order: i,
          works: f.works.map((w, j) => ({ id: w.id, name: w.name, order: j })),
        })),
      };
      // İnce İnşaat: daire listesini de kaydet
      if (editConstructionType === "INCE_INSAAT") {
        body.daires = editInceDaires.map((d) => ({
          id: d.id || crypto.randomUUID(),
          name: d.name,
        }));
        body.unitOverrides = unitOverrides;
      }
      await fetch('/api/construction', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    } catch {}
    setEditConstructionSaving(false);
  };

  const fetchSites = async () => {
    try {
      const res = await fetch("/api/sites");
      if (res.ok) {
        const data = await res.json();
        setSites(data.sites);
      }
    } catch {}
  };

  const confirmDeleteSite = async () => {
    if (!deletingSite) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/sites/${deletingSite.id}`, { method: "DELETE" });
      if (res.ok) {
        setSites(sites.filter((s) => s.id !== deletingSite.id));
        setDeletingSite(null);
      } else {
        const data = await res.json();
        alert(data.error || "Şantiye silinemedi");
      }
    } catch {
      alert("Şantiye silinirken hata oluştu");
    } finally {
      setDeleting(false);
    }
  };

  // Düzenleme popup'ını kapat ve state'leri sıfırla
  const closeEditPopup = () => {
    setEditingSite(null);
    setEditTab("general");
    setClSelectedBlock(null);
    setClSelectedFloor(null);
    setClSelectedUnit(null);
    setClSelectedCategory(null);
    setClUnitChecklist([]);
    setEditConstructionBlock(null);
    setEditConstructionType("KABA_INSAAT");
    setEditConstructionFloors([]);
    setEditInceDaires([]);
    setIsPeyzajMode(false);
  };

  // Düzenleme başlat
  const startEdit = async (site: SiteItem) => {
    setEditLoading(true);
    setEditingSite(site);
    setEditTab("general");
    setEditName(site.name);
    setEditDescription(site.description || "");
    setEditAddress(site.address || "");
    setEditSiteType((site.config as { siteType?: string })?.siteType || "");
    setEditStartDate(site.startDate ? site.startDate.split("T")[0] : "");
    setEditEndDate(site.endDate ? site.endDate.split("T")[0] : "");

    // Blokları ayarla (zaten sites listesinden geliyor)
    setEditBlocks(site.blocks.map((b) => ({
      id: b.id,
      name: b.name,
      squareMeters: (b as unknown as { squareMeters?: string }).squareMeters,
      floors: (b.floors || []).map((f) => ({
        id: f.id,
        name: f.name,
        units: (f.units || []).map((u) => ({ id: u.id, name: u.name })),
      })),
    })));

    // Kategorileri tam detayıyla getir
    try {
      const res = await fetch(`/api/sites/${site.id}`);
      if (res.ok) {
        const data = await res.json();
        const mapCats = (cats: { id: string; name: string; config?: Record<string, string>; subCategories?: unknown[] }[]): CategoryItem[] =>
          cats.map((c) => ({
            id: c.id,
            name: c.name,
            config: c.config as Record<string, string> | undefined,
            children: c.subCategories ? mapCats(c.subCategories as typeof cats) : [],
          }));
        const mapped = mapCats(data.site.categories);
        setEditCategories(mapped);
        // Orijinalleri kaydet (geri alma için)
        setOriginalCategories(JSON.parse(JSON.stringify(mapped)));
        const collectAllIds = (cats: CategoryItem[]): string[] => cats.flatMap(c => [c.id || '', ...collectAllIds(c.children)]).filter(Boolean);
        setOriginalCategoryIds(new Set(collectAllIds(mapped)));
      }
    } catch {}

    // Kontrol listesini getir
    try {
      const clRes = await fetch(`/api/sites/${site.id}/checklist`);
      if (clRes.ok) {
        const clData = await clRes.json();
        if (clData.templates && clData.templates.length > 0) {
          setEditChecklist(clData.templates.map((t: { name: string; children: { name: string }[] }) => ({
            name: t.name,
            children: (t.children || []).map((c: { name: string }) => ({ name: c.name })),
          })));
        } else {
          setEditChecklist([
            { name: "Mutfak İşleri", children: [] },
            { name: "Odalar", children: [] },
            { name: "Islak Zemin", children: [] },
            { name: "Balkon", children: [] },
          ]);
        }
      }
    } catch {}

    // İnşaat yapısını sıfırla (blok seçimi yapılması gerekiyor)
    setEditConstructionBlock(null);
    setEditConstructionType("KABA_INSAAT");
    setEditConstructionFloors([]);
    setEditInceDaires([]);

    setEditLoading(false);
  };

  // Daire+Kategori özel kırılımları yükle
  const loadUnitChecklist = async (unit: UnitItem | null, category?: CategoryItem | null) => {
    if (!editingSite) return;
    if (category !== undefined) setClSelectedCategory(category);
    const catToUse = category !== undefined ? category : clSelectedCategory;
    if (!catToUse?.id) { setClUnitChecklist([]); return; }

    // Belirli bir daire seçiliyse, onun özelleştirmesini yükle
    if (unit?.id) {
      setClUnitLoading(true);
      try {
        const res = await fetch(`/api/sites/${editingSite.id}/checklist?unitId=${unit.id}&categoryId=${catToUse.id}`);
        if (res.ok) {
          const data = await res.json();
          if (data.templates && data.templates.length > 0) {
            setClUnitChecklist(data.templates.map((t: { name: string; children: { name: string }[] }) => ({
              name: t.name,
              children: (t.children || []).map((c: { name: string }) => ({ name: c.name })),
            })));
          } else {
            setClUnitChecklist(catToUse.children.map(sub => ({
              name: sub.name,
              children: sub.children.map(ch => ({ name: ch.name })),
            })));
          }
        }
      } catch {}
      setClUnitLoading(false);
    } else {
      // Blok veya kat kapsamı — kategori varsayılan kırılımlarını yükle
      setClUnitChecklist(catToUse.children.map(sub => ({
        name: sub.name,
        children: sub.children.map(ch => ({ name: ch.name })),
      })));
    }
  };

  // Kapsamdaki tüm daireleri getir
  const getScopeUnits = (): UnitItem[] => {
    if (clSelectedBlock === null) return [];
    const block = editBlocks[clSelectedBlock];
    if (!block) return [];
    if (clSelectedUnit?.id) return [clSelectedUnit];
    if (clSelectedFloor !== null) return block.floors[clSelectedFloor]?.units.filter(u => u.id) || [];
    return block.floors.flatMap(f => f.units).filter(u => u.id);
  };

  const getScopeText = (): string => {
    if (clSelectedBlock === null) return '';
    const block = editBlocks[clSelectedBlock];
    if (!block) return '';
    if (clSelectedUnit) {
      const floorName = clSelectedFloor !== null ? block.floors[clSelectedFloor]?.name : '';
      return `${block.name} > ${floorName} > ${clSelectedUnit.name}`;
    }
    const units = getScopeUnits();
    if (clSelectedFloor !== null) {
      return `${block.name} > ${block.floors[clSelectedFloor]?.name} — Tüm daireler (${units.length} daire)`;
    }
    return `${block.name} — Tüm daireler (${units.length} daire)`;
  };

  // Daire+Kategori özel kırılımları kaydet (kapsamdaki tüm daireler)
  const saveUnitChecklist = async () => {
    if (!editingSite || !clSelectedCategory?.id || clSelectedBlock === null) return;
    const units = getScopeUnits();
    if (units.length === 0) return;
    setClUnitSaving(true);
    try {
      for (const unit of units) {
        await fetch(`/api/sites/${editingSite.id}/checklist`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ templates: clUnitChecklist, unitId: unit.id, categoryId: clSelectedCategory.id }),
        });
      }
    } catch {}
    setClUnitSaving(false);
  };

  // Blok yönetimi
  const addEditBlock = () => {
    setEditBlocks([...editBlocks, {
      name: `${String.fromCharCode(65 + editBlocks.length)} Blok`,
      floors: [{ name: "Bodrum Kat", units: [] }, { name: "Zemin Kat", units: [] }, { name: "1. Kat", units: [] }],
    }]);
  };

  const removeEditBlock = (index: number) => {
    setEditBlocks(editBlocks.filter((_, i) => i !== index));
  };

  const addEditFloor = (bi: number) => {
    const updated = [...editBlocks];
    const floors = updated[bi].floors;
    let maxKat = 0;
    for (const f of floors) {
      const match = f.name.match(/(\d+)\. Kat/);
      if (match) maxKat = Math.max(maxKat, parseInt(match[1]));
    }
    updated[bi].floors.push({ name: `${maxKat + 1}. Kat`, units: [] });
    setEditBlocks(updated);
  };

  const removeEditFloor = (bi: number, fi: number) => {
    const updated = [...editBlocks];
    updated[bi].floors = updated[bi].floors.filter((_, i) => i !== fi);
    setEditBlocks(updated);
  };

  const addEditUnit = (bi: number, fi: number) => {
    const updated = [...editBlocks];
    // Bloktaki tüm katlardaki en yüksek daire numarasını bul
    let maxNum = 0;
    for (const floor of updated[bi].floors) {
      for (const unit of floor.units) {
        const m = unit.name.match(/Daire\s+(\d+)/i);
        if (m) maxNum = Math.max(maxNum, parseInt(m[1], 10));
      }
    }
    updated[bi].floors[fi].units.push({ name: `Daire ${maxNum + 1}` });
    setEditBlocks(updated);
  };

  const addEditUnitsRange = (bi: number, fi: number, count: number) => {
    const updated = [...editBlocks];
    // Bloktaki tüm katlardaki en yüksek daire numarasını bul
    let maxNum = 0;
    for (const floor of updated[bi].floors) {
      for (const unit of floor.units) {
        const m = unit.name.match(/Daire\s+(\d+)/i);
        if (m) maxNum = Math.max(maxNum, parseInt(m[1], 10));
      }
    }
    for (let i = 0; i < count; i++) {
      updated[bi].floors[fi].units.push({ name: `Daire ${maxNum + i + 1}` });
    }
    setEditBlocks(updated);
  };

  const removeEditUnit = async (bi: number, fi: number, ui: number) => {
    const unit = editBlocks[bi]?.floors[fi]?.units[ui];
    if (unit?.id && editingSite) {
      try {
        const r = await fetch(`/api/sites/${editingSite.id}/checklist?checkCategoryIds=unit-check&unitId=${unit.id}`);
        if (r.ok) {
          const d = await r.json();
          if (d.affectedCount > 0) {
            setUnitDeleteWarning({ bi, fi, ui, unitName: unit.name });
            return;
          }
        }
      } catch {}
    }
    const updated = [...editBlocks];
    updated[bi].floors[fi].units = updated[bi].floors[fi].units.filter((_, i) => i !== ui);
    setEditBlocks(updated);
  };

  const confirmDeleteUnit = () => {
    if (!unitDeleteWarning) return;
    const { bi, fi, ui } = unitDeleteWarning;
    const updated = [...editBlocks];
    updated[bi].floors[fi].units = updated[bi].floors[fi].units.filter((_, i) => i !== ui);
    setEditBlocks(updated);
    setUnitDeleteWarning(null);
  };

  // Kategori yönetimi
  const addEditCategory = () => {
    setEditCategories([...editCategories, { name: "Yeni Kategori", config: { scope: "block" }, children: [] }]);
  };

  const addEditSubCategory = (path: number[]) => {
    const updated = [...editCategories];
    let current: CategoryItem[] = updated;
    for (let i = 0; i < path.length; i++) {
      current = current[path[i]].children;
    }
    current.push({ name: "Alt Kategori", children: [] });
    setEditCategories(updated);
  };

  const updateEditCategoryName = (path: number[], name: string) => {
    const updated = [...editCategories];
    let current: CategoryItem = updated[path[0]];
    for (let i = 1; i < path.length; i++) {
      current = current.children[path[i]];
    }
    current.name = name;
    setEditCategories(updated);
  };

  const removeEditCategory = (path: number[]) => {
    if (path.length === 1) {
      setEditCategories(editCategories.filter((_, i) => i !== path[0]));
    } else {
      const updated = [...editCategories];
      let parent: CategoryItem = updated[path[0]];
      for (let i = 1; i < path.length - 1; i++) {
        parent = parent.children[path[i]];
      }
      parent.children = parent.children.filter((_, i) => i !== path[path.length - 1]);
      setEditCategories(updated);
    }
  };

  const saveEdit = async (forceSkipCheck?: boolean) => {
    if (!editingSite || !editName.trim()) return;

    // Silinecek kategori ID'lerini hesapla
    if (!forceSkipCheck) {
      const collectEditIds = (cats: CategoryItem[]): string[] => cats.flatMap(c => [c.id || '', ...collectEditIds(c.children)]).filter(Boolean);
      const currentIds = new Set(collectEditIds(editCategories));
      const deletedIds = [...originalCategoryIds].filter(id => !currentIds.has(id));
      if (deletedIds.length > 0) {
        try {
          const checkRes = await fetch(`/api/sites/${editingSite.id}/checklist?checkCategoryIds=${deletedIds.join(',')}`);
          if (checkRes.ok) {
            const checkData = await checkRes.json();
            if (checkData.affectedCount > 0) {
              setCategoryWarning({ count: checkData.affectedCount });
              return;
            }
          }
        } catch {}
      }
    }

    setSaving(true);
    try {
      const res = await fetch(`/api/sites/${editingSite.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editName,
          description: editDescription,
          address: editAddress,
          siteType: editSiteType,
          startDate: editStartDate || null,
          endDate: editEndDate || null,
          blocks: editBlocks,
          categories: editCategories,
        }),
      });
      if (res.ok) {
        // Kontrol listesini kaydet
        await fetch(`/api/sites/${editingSite.id}/checklist`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ templates: editChecklist }),
        });
        // Daire+Kategori kırılımlarını kaydet (kapsamdaki tüm daireler)
        if (clSelectedCategory?.id && clSelectedBlock !== null) {
          const units = getScopeUnits();
          for (const unit of units) {
            await fetch(`/api/sites/${editingSite.id}/checklist`, {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ templates: clUnitChecklist, unitId: unit.id, categoryId: clSelectedCategory.id }),
            });
          }
        }
        // İnşaat takip ayarını da kaydet (blok seçiliyse)
        if (editConstructionBlock && (editInceDaires.length > 0 || editConstructionFloors.length > 0)) {
          const conBody: any = {
            siteId: editingSite.id,
            type: editConstructionType,
            blockId: editConstructionBlock,
            floors: editConstructionFloors.map((f, i) => ({
              id: f.id, name: f.name, order: i,
              works: f.works.map((w, j) => ({ id: w.id, name: w.name, order: j })),
            })),
          };
          if (editConstructionType === "INCE_INSAAT") {
            conBody.daires = editInceDaires.map((d) => ({
              id: d.id || crypto.randomUUID(), name: d.name,
            }));
            conBody.unitOverrides = unitOverrides;
          }
          await fetch('/api/construction', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(conBody),
          });
        }
        closeEditPopup();
        fetchSites();
      } else {
        const data = await res.json();
        alert(data.error || "Güncelleme başarısız");
      }
    } catch {
      alert("Güncelleme sırasında hata oluştu");
    } finally {
      setSaving(false);
    }
  };

  const renderEditCategoryTree = (cats: CategoryItem[], path: number[] = [], depth = 0) => {
    return cats.map((cat, index) => {
      const currentPath = [...path, index];
      return (
        <div key={currentPath.join("-")} className={`${depth > 0 ? "ml-6 border-l-2 border-gray-200 pl-4" : ""}`}>
          <div className="flex items-center gap-2 mb-2">
            {cat.children.length > 0 && <ChevronDown size={14} className="text-gray-400" />}
            <input
              type="text"
              value={cat.name}
              onChange={(e) => updateEditCategoryName(currentPath, e.target.value)}
              className="flex-1 px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-[#c0392b] outline-none"
            />
            <button onClick={() => addEditSubCategory(currentPath)} className="text-blue-500 hover:text-blue-700 text-xs px-2 py-1 border border-blue-200 rounded" title="Alt kategori ekle">+ Alt</button>
            <button onClick={() => removeEditCategory(currentPath)} className="text-red-400 hover:text-red-600" title="Sil"><Trash2 size={14} /></button>
          </div>
          {cat.children.length > 0 && renderEditCategoryTree(cat.children, currentPath, depth + 1)}
        </div>
      );
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-800">Ayarlar</h1>
        <p className="text-gray-500 mt-1">Sistem yapılandırması ve tercihler</p>
      </div>

      {/* Şantiye Yönetimi - Sadece Admin */}
      {isAdmin && (
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 bg-red-100 rounded-lg flex items-center justify-center">
              <Building2 className="text-red-600" size={20} />
            </div>
            <div>
              <h3 className="font-semibold text-gray-800">Şantiye Yönetimi</h3>
              <p className="text-xs text-gray-400">Şantiyeleri düzenleyin veya silin</p>
            </div>
          </div>
          {sites.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-4">Henüz şantiye yok</p>
          ) : (
            <div className="space-y-2">
              {sites.map((site) => (
                <div key={site.id} className="flex items-center justify-between py-2.5 px-3 rounded-lg border border-gray-100 hover:border-gray-200 transition-all">
                  <div className="flex items-center gap-3 min-w-0">
                    <Building2 size={16} className="text-gray-400 flex-shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-800 truncate">{site.name}</p>
                      <p className="text-[10px] text-gray-400">{site._count?.blocks || 0} blok</p>
                    </div>
                  </div>
                  <div className="site-list-actions flex items-center gap-1 flex-shrink-0">
                    <button
                      onClick={() => startEdit(site)}
                      className="p-2 rounded-lg text-gray-300 hover:text-[#1e3a5f] hover:bg-blue-50 transition-all"
                      title="Şantiyeyi Düzenle"
                    >
                      <Edit3 size={16} />
                    </button>
                    <button
                      onClick={() => setDeletingSite(site)}
                      className="p-2 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 transition-all"
                      title="Şantiyeyi Sil"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
              <Shield className="text-blue-600" size={20} />
            </div>
            <h3 className="font-semibold text-gray-800">Güvenlik Ayarları</h3>
          </div>
          <div className="space-y-3">
            <div className="flex items-center justify-between py-2 border-b border-gray-50">
              <span className="text-sm text-gray-600">İki faktörlü doğrulama</span>
              <span className="text-xs text-gray-400">Yakında</span>
            </div>
            <div className="flex items-center justify-between py-2 border-b border-gray-50">
              <span className="text-sm text-gray-600">Oturum süresi</span>
              <span className="text-sm text-gray-800">7 gün</span>
            </div>
            <div className="flex items-center justify-between py-2">
              <span className="text-sm text-gray-600">IP kısıtlama</span>
              <span className="text-xs text-gray-400">Yakında</span>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
              <Bell className="text-green-600" size={20} />
            </div>
            <h3 className="font-semibold text-gray-800">Bildirim Ayarları</h3>
          </div>
          <div className="space-y-3">
            <div className="flex items-center justify-between py-2 border-b border-gray-50">
              <span className="text-sm text-gray-600">E-posta bildirimleri</span>
              <label className="relative inline-flex items-center cursor-pointer">
                <input type="checkbox" className="sr-only peer" defaultChecked />
                <div className="w-9 h-5 bg-gray-200 peer-checked:bg-[#c0392b] rounded-full transition-all after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-4"></div>
              </label>
            </div>
            <div className="flex items-center justify-between py-2 border-b border-gray-50">
              <span className="text-sm text-gray-600">Onay bildirimleri</span>
              <label className="relative inline-flex items-center cursor-pointer">
                <input type="checkbox" className="sr-only peer" defaultChecked />
                <div className="w-9 h-5 bg-gray-200 peer-checked:bg-[#c0392b] rounded-full transition-all after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-4"></div>
              </label>
            </div>
            <div className="flex items-center justify-between py-2">
              <span className="text-sm text-gray-600">Yorum bildirimleri</span>
              <label className="relative inline-flex items-center cursor-pointer">
                <input type="checkbox" className="sr-only peer" defaultChecked />
                <div className="w-9 h-5 bg-gray-200 peer-checked:bg-[#c0392b] rounded-full transition-all after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-4"></div>
              </label>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
              <Database className="text-purple-600" size={20} />
            </div>
            <h3 className="font-semibold text-gray-800">Sistem Bilgileri</h3>
          </div>
          <div className="space-y-3">
            <div className="flex items-center justify-between py-2 border-b border-gray-50">
              <span className="text-sm text-gray-600">Versiyon</span>
              <span className="text-sm text-gray-800">1.0.0-beta</span>
            </div>
            <div className="flex items-center justify-between py-2 border-b border-gray-50">
              <span className="text-sm text-gray-600">Veritabanı</span>
              <span className="text-sm text-gray-800">PostgreSQL</span>
            </div>
            <div className="flex items-center justify-between py-2">
              <span className="text-sm text-gray-600">Framework</span>
              <span className="text-sm text-gray-800">Next.js 16</span>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 bg-orange-100 rounded-lg flex items-center justify-center">
              <Palette className="text-orange-600" size={20} />
            </div>
            <h3 className="font-semibold text-gray-800">Görünüm</h3>
          </div>
          <div className="space-y-3">
            <div className="flex items-center justify-between py-2 border-b border-gray-50">
              <span className="text-sm text-gray-600">Tema</span>
              <span className="text-sm text-gray-800">Varsayılan</span>
            </div>
            <div className="flex items-center justify-between py-2">
              <span className="text-sm text-gray-600">Dil</span>
              <span className="text-sm text-gray-800">Türkçe</span>
            </div>
          </div>
        </div>
      </div>

      {/* Varsayılan İnşaat Şablonu - Sadece Admin */}
      {isAdmin && (
        <div className="mt-5">
          <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-amber-100 rounded-lg flex items-center justify-center">
                  <Hammer className="text-amber-600" size={20} />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-800">Varsayılan İnşaat Şablonu</h3>
                  <p className="text-xs text-gray-400">Yeni şantiyelerde otomatik oluşturulacak inşaat maddeleri</p>
                </div>
              </div>
              <button
                onClick={() => { setShowConstructionDefaults(true); fetchConstructionDefaults(); }}
                className="px-4 py-2 bg-[#1e3a5f] hover:bg-[#152d4a] text-white rounded-lg text-sm font-medium transition-all"
              >
                Düzenle
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Varsayılan İnşaat Şablonu Popup */}
      {showConstructionDefaults && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden construction-template-popup" style={{ border: '5px solid #1e3a5f' }}>
            <div className="flex-shrink-0 flex items-center justify-between px-6 py-4 border-b border-gray-200">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-amber-50 rounded-full flex items-center justify-center">
                  <Hammer size={20} className="text-amber-600" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">Varsayılan İnşaat Şablonu</h3>
                  <p className="text-xs text-gray-400">Yeni şantiyelere otomatik eklenecek maddeler</p>
                </div>
              </div>
              <button onClick={() => setShowConstructionDefaults(false)} className="p-2 hover:bg-gray-100 rounded-lg">
                <X size={20} className="text-gray-500" />
              </button>
            </div>

            {/* Tab seçimi */}
            <div className="flex-shrink-0 flex border-b border-gray-200">
              {([
                { key: "KABA_INSAAT" as const, label: "Kaba İnşaat" },
                { key: "INCE_INSAAT" as const, label: "İnce İşler" },
                { key: "PEYZAJ" as const, label: "Peyzaj" },
                { key: "BINA_GENEL" as const, label: "Bina Genel" },
                { key: "RUHSAT_ISKAN" as const, label: "Belgeler" },
              ]).map(tab => (
                <button
                  key={tab.key}
                  onClick={() => { setConstructionDefaultsTab(tab.key); setExpandedDefaultFloor(null); }}
                  className={`template-tab-btn flex-1 py-3 text-sm font-medium transition-all ${
                    constructionDefaultsTab === tab.key
                      ? "text-[#1e3a5f] border-b-2 border-[#1e3a5f] bg-blue-50/50"
                      : "text-gray-500 hover:text-gray-700 hover:bg-gray-50"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="flex-1 overflow-y-auto p-6">
              {constructionDefaultsLoading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="animate-spin rounded-full h-8 w-8 border-4 border-[#1e3a5f] border-t-transparent"></div>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-gray-500">
                      {constructionDefaultsTab === "KABA_INSAAT" || constructionDefaultsTab === "BINA_GENEL" ? "Kategorileri ve iş kalemlerini düzenleyin. \"Katlar\" grubu şantiyeye yüklenirken bloğun gerçek katlarına genişler." :
                       constructionDefaultsTab === "INCE_INSAAT" ? "İş kalemlerini düzenleyin" :
                       constructionDefaultsTab === "RUHSAT_ISKAN" ? "Belgeler gruplarını ve alt maddelerini düzenleyin" :
                       "Peyzaj kategorilerini ve iş kalemlerini düzenleyin"}
                    </p>
                    <button
                      onClick={() => {
                        const filtered = constructionDefaults.filter(f => f.type === constructionDefaultsTab);
                        setConstructionDefaults([...constructionDefaults, {
                          name: constructionDefaultsTab === "KABA_INSAAT" || constructionDefaultsTab === "BINA_GENEL" ? "Yeni Kat" : constructionDefaultsTab === "INCE_INSAAT" ? "Yeni Kategori" : constructionDefaultsTab === "RUHSAT_ISKAN" ? "Yeni Grup" : "Yeni Alan",
                          type: constructionDefaultsTab,
                          order: filtered.length,
                          works: []
                        }]);
                      }}
                      className="template-add-floor-btn flex items-center gap-1 text-xs text-[#c0392b] hover:text-[#922b21] font-medium px-2 py-1 border border-red-200 rounded-lg"
                    >
                      <Plus size={14} /> {constructionDefaultsTab === "KABA_INSAAT" || constructionDefaultsTab === "BINA_GENEL" ? "Kat Ekle" : constructionDefaultsTab === "INCE_INSAAT" ? "Kategori Ekle" : constructionDefaultsTab === "RUHSAT_ISKAN" ? "Grup Ekle" : "Alan Ekle"}
                    </button>
                  </div>

                  {(() => {
                    const filteredFloors = constructionDefaults.filter(f => f.type === constructionDefaultsTab);
                    let globalNum = 0;
                    return filteredFloors.map((floor) => {
                    const fi = constructionDefaults.indexOf(floor);
                    const indexInFiltered = filteredFloors.indexOf(floor);
                    return (
                    <div key={fi} className="border border-gray-200 rounded-lg p-3">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-1 flex-1">
                          <div className="flex flex-col">
                            <button
                              onClick={() => {
                                if (indexInFiltered === 0) return;
                                const u = [...constructionDefaults];
                                const prevFi = constructionDefaults.indexOf(filteredFloors[indexInFiltered - 1]);
                                [u[prevFi], u[fi]] = [u[fi], u[prevFi]];
                                setConstructionDefaults(u);
                              }}
                              disabled={indexInFiltered === 0}
                              className={`template-reorder-btn p-0.5 rounded transition-colors ${indexInFiltered === 0 ? 'text-gray-200 cursor-not-allowed' : 'text-gray-400 hover:text-[#1e3a5f] hover:bg-gray-100'}`}
                              title="Yukarı taşı"
                            >
                              <ChevronUp size={14} />
                            </button>
                            <button
                              onClick={() => {
                                if (indexInFiltered === filteredFloors.length - 1) return;
                                const u = [...constructionDefaults];
                                const nextFi = constructionDefaults.indexOf(filteredFloors[indexInFiltered + 1]);
                                [u[fi], u[nextFi]] = [u[nextFi], u[fi]];
                                setConstructionDefaults(u);
                              }}
                              disabled={indexInFiltered === filteredFloors.length - 1}
                              className={`template-reorder-btn p-0.5 rounded transition-colors ${indexInFiltered === filteredFloors.length - 1 ? 'text-gray-200 cursor-not-allowed' : 'text-gray-400 hover:text-[#1e3a5f] hover:bg-gray-100'}`}
                              title="Aşağı taşı"
                            >
                              <ChevronDown size={14} />
                            </button>
                          </div>
                          <button
                            onClick={() => setExpandedDefaultFloor(expandedDefaultFloor === fi ? null : fi)}
                            className="template-expand-btn p-1 rounded hover:bg-gray-100 transition-colors text-gray-400 hover:text-[#1e3a5f]"
                            title={expandedDefaultFloor === fi ? "Alt maddeleri kapat" : "Alt maddeleri göster"}
                          >
                            <ChevronRight size={14} className={`transition-transform duration-200 ${expandedDefaultFloor === fi ? 'rotate-90' : ''}`} />
                          </button>
                          <input
                            type="text"
                            value={floor.name}
                            onChange={(e) => {
                              const u = [...constructionDefaults];
                              u[fi] = { ...u[fi], name: e.target.value };
                              setConstructionDefaults(u);
                            }}
                            className="font-semibold text-gray-800 px-2 py-1 border border-transparent hover:border-gray-200 rounded focus:border-[#c0392b] outline-none text-sm flex-1"
                          />
                          {floor.works.length > 0 && expandedDefaultFloor !== fi && (
                            <span className="text-xs text-gray-400 ml-1">({floor.works.length} iş kalemi)</span>
                          )}
                          {(floor as any).isKatlar && (
                            <p className="text-xs text-blue-500 ml-2 mt-0.5">⟳ Şantiyeye yüklenirken bloğun katlarına otomatik genişler</p>
                          )}
                        </div>
                        <div className="flex items-center gap-1 ml-2">
                            <button
                              onClick={() => {
                                const u = [...constructionDefaults];
                                u[fi] = { ...u[fi], works: [...u[fi].works, { name: constructionDefaultsTab === "RUHSAT_ISKAN" ? "Yeni Madde" : "Yeni İş", order: u[fi].works.length }] };
                                setConstructionDefaults(u);
                                setExpandedDefaultFloor(fi);
                              }}
                              className="template-add-work-btn text-xs text-blue-500 hover:text-blue-700 px-2 py-1 border border-blue-200 rounded"
                            >
                              {constructionDefaultsTab === "RUHSAT_ISKAN" ? "+ Madde" : "+ İş Kalemi"}
                            </button>
                          <button
                            onClick={() => setConstructionDefaults(constructionDefaults.filter((_, i) => i !== fi))}
                            className="template-delete-floor-btn text-red-400 hover:text-red-600 p-1"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                      {floor.works.length > 0 && (() => {
                        // Always count globalNum for correct numbering, even when collapsed
                        const floorStartNum = globalNum;
                        globalNum += floor.works.length;
                        if (expandedDefaultFloor !== fi) return null;
                        return (
                        <div className="ml-4 border-l-2 border-gray-200 pl-3 space-y-1">
                          {floor.works.map((work, wi) => {
                            const num = floorStartNum + wi + 1;
                            return (
                            <div key={wi} className="flex items-center gap-2">
                              <span className="text-xs text-gray-400 font-mono w-5 text-right">{num}.</span>
                              <div className="flex flex-col">
                                <button
                                  onClick={() => {
                                    if (wi === 0) return;
                                    const u = [...constructionDefaults];
                                    const works = [...u[fi].works];
                                    [works[wi - 1], works[wi]] = [works[wi], works[wi - 1]];
                                    works.forEach((w, idx) => { w.order = idx; });
                                    u[fi] = { ...u[fi], works };
                                    setConstructionDefaults(u);
                                  }}
                                  disabled={wi === 0}
                                  className={`template-work-reorder-btn p-0.5 rounded transition-colors ${wi === 0 ? 'text-gray-200 cursor-not-allowed' : 'text-gray-400 hover:text-[#1e3a5f] hover:bg-gray-100'}`}
                                  title="Yukarı taşı"
                                >
                                  <ChevronUp size={12} />
                                </button>
                                <button
                                  onClick={() => {
                                    if (wi === floor.works.length - 1) return;
                                    const u = [...constructionDefaults];
                                    const works = [...u[fi].works];
                                    [works[wi], works[wi + 1]] = [works[wi + 1], works[wi]];
                                    works.forEach((w, idx) => { w.order = idx; });
                                    u[fi] = { ...u[fi], works };
                                    setConstructionDefaults(u);
                                  }}
                                  disabled={wi === floor.works.length - 1}
                                  className={`template-work-reorder-btn p-0.5 rounded transition-colors ${wi === floor.works.length - 1 ? 'text-gray-200 cursor-not-allowed' : 'text-gray-400 hover:text-[#1e3a5f] hover:bg-gray-100'}`}
                                  title="Aşağı taşı"
                                >
                                  <ChevronDown size={12} />
                                </button>
                              </div>
                              <input
                                type="text"
                                value={work.name}
                                onChange={(e) => {
                                  const u = [...constructionDefaults];
                                  u[fi] = { ...u[fi], works: u[fi].works.map((w, i) => i === wi ? { ...w, name: e.target.value } : w) };
                                  setConstructionDefaults(u);
                                }}
                                className="flex-1 text-sm text-gray-600 px-2 py-1 border border-gray-200 rounded focus:border-[#c0392b] outline-none"
                              />
                              <button
                                onClick={() => {
                                  const u = [...constructionDefaults];
                                  const works = u[fi].works.filter((_, i) => i !== wi);
                                  works.forEach((w, idx) => { w.order = idx; });
                                  u[fi] = { ...u[fi], works };
                                  setConstructionDefaults(u);
                                }}
                                className="template-work-delete-btn text-red-300 hover:text-red-500"
                              >
                                <X size={12} />
                              </button>
                            </div>
                            );
                          })}
                        </div>
                        );
                      })()}
                    </div>
                    );
                  });
                  })()}

                  {constructionDefaults.filter(f => f.type === constructionDefaultsTab).length === 0 && (
                    <div className="text-center py-8 text-gray-400 text-sm">
                      Henüz {constructionDefaultsTab === "KABA_INSAAT" || constructionDefaultsTab === "BINA_GENEL" ? "kat" : constructionDefaultsTab === "INCE_INSAAT" ? "iş kategorisi" : constructionDefaultsTab === "RUHSAT_ISKAN" ? "belge grubu" : "peyzaj alanı"} eklenmemiş.
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-3">
              <button onClick={() => setShowConstructionDefaults(false)} className="template-cancel-btn px-5 py-2.5 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50">
                İptal
              </button>
              <button
                onClick={saveConstructionDefaults}
                disabled={constructionDefaultsSaving}
                className="template-save-btn px-5 py-2.5 bg-[#1e3a5f] hover:bg-[#152d4a] text-white rounded-lg text-sm font-medium disabled:opacity-50 flex items-center gap-2"
              >
                {constructionDefaultsSaving ? (
                  <><div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div> Kaydediliyor...</>
                ) : (
                  <><Check size={16} /> Kaydet</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Şantiye Düzenleme Popup */}
      {editingSite && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="site-edit-popup bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden" style={{ border: '5px solid #1e3a5f' }}>
            {/* Başlık */}
            <div className="flex-shrink-0 flex items-center justify-between px-6 py-4 border-b border-gray-200">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-blue-50 rounded-full flex items-center justify-center">
                  <Edit3 size={20} className="text-[#1e3a5f]" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">Şantiye Düzenle</h3>
                  <p className="text-xs text-gray-400">{editingSite.name}</p>
                </div>
              </div>
              <button onClick={closeEditPopup} className="p-2 hover:bg-gray-100 rounded-lg"><X size={20} className="text-gray-500" /></button>
            </div>

            {/* Sekmeler */}
            <div className="flex-shrink-0 flex border-b border-gray-200">
              {[
                { key: "general" as const, label: "Genel Bilgiler" },
                { key: "blocks" as const, label: "Bloklar & Katlar" },
                { key: "checklist" as const, label: "İnşaat Takip Ayarı" },
              ].map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setEditTab(tab.key)}
                  className={`site-edit-tab flex-1 px-4 py-3 text-sm font-medium transition-all ${
                    editTab === tab.key ? "border-b-2 border-[#c0392b] text-[#c0392b]" : "text-gray-500 hover:text-gray-700"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* İçerik */}
            <div className="flex-1 overflow-y-auto p-6">
              {editLoading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="animate-spin rounded-full h-8 w-8 border-4 border-[#1e3a5f] border-t-transparent"></div>
                </div>
              ) : (
                <>
                  {/* Genel Bilgiler */}
                  {editTab === "general" && (
                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Şantiye Adı *</label>
                        <input type="text" value={editName} onChange={(e) => setEditName(e.target.value)}
                          className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#c0392b] focus:border-transparent outline-none"
                          placeholder="ör. Safir - II" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Şantiye Tipi</label>
                        <select value={editSiteType} onChange={(e) => setEditSiteType(e.target.value)}
                          className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#c0392b] focus:border-transparent outline-none bg-white">
                          <option value="">Şantiye tipi seçin</option>
                          <option value="Villa">Villa</option>
                          <option value="Apartman">Apartman</option>
                          <option value="Fabrika">Fabrika</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Açıklama</label>
                        <input type="text" value={editDescription} onChange={(e) => setEditDescription(e.target.value)}
                          className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#c0392b] focus:border-transparent outline-none"
                          placeholder="Şantiye açıklaması" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Adres</label>
                        <input type="text" value={editAddress} onChange={(e) => setEditAddress(e.target.value)}
                          className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#c0392b] focus:border-transparent outline-none"
                          placeholder="Şantiye adresi" />
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Başlangıç Tarihi</label>
                          <input type="date" value={editStartDate} onChange={(e) => setEditStartDate(e.target.value)}
                            className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#c0392b] focus:border-transparent outline-none" />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Tahmini Bitiş</label>
                          <input type="date" value={editEndDate} onChange={(e) => setEditEndDate(e.target.value)}
                            className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#c0392b] focus:border-transparent outline-none" />
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Bloklar & Katlar */}
                  {editTab === "blocks" && (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <p className="text-sm text-gray-500">
                          {editSiteType === "Villa" || editSiteType === "Fabrika"
                            ? "Bloklarınızı ve metrekare bilgilerini düzenleyin"
                            : "Bloklarınızı, katlarını ve dairelerini düzenleyin"}
                        </p>
                        <button onClick={addEditBlock} className="site-edit-add-btn flex items-center gap-1 text-sm text-[#c0392b] hover:text-[#922b21] font-medium">
                          <Plus size={16} /> Blok Ekle
                        </button>
                      </div>

                      {editBlocks.length === 0 && (
                        <div className="text-center py-8 text-gray-400">
                          <p>Henüz blok yok</p>
                          <button onClick={addEditBlock} className="text-[#c0392b] text-sm mt-2">+ Blok Ekle</button>
                        </div>
                      )}

                      {editBlocks.map((block, bi) => (
                        <div key={bi} className="border border-gray-200 rounded-lg p-4">
                          <div className="flex items-center justify-between mb-3">
                            <input type="text" value={block.name}
                              onChange={(e) => { const u = [...editBlocks]; u[bi].name = e.target.value; setEditBlocks(u); }}
                              className="font-semibold text-gray-800 px-2 py-1 border border-transparent hover:border-gray-200 rounded focus:border-[#c0392b] outline-none" />
                            <div className="flex items-center gap-2">
                              {editSiteType !== "Villa" && editSiteType !== "Fabrika" && (
                                <button onClick={() => addEditFloor(bi)} className="site-edit-add-btn text-xs text-blue-500 hover:text-blue-700 px-2 py-1 border border-blue-200 rounded">+ Kat</button>
                              )}
                              <button onClick={() => removeEditBlock(bi)} className="site-edit-delete-btn text-red-400 hover:text-red-600"><Trash2 size={16} /></button>
                            </div>
                          </div>

                          {editSiteType === "Villa" || editSiteType === "Fabrika" ? (
                            <div className="ml-4 mt-2">
                              <label className="block text-sm text-gray-600 mb-1">Metrekare (m²)</label>
                              <input type="number" value={block.squareMeters || ""}
                                onChange={(e) => { const u = [...editBlocks]; u[bi].squareMeters = e.target.value; setEditBlocks(u); }}
                                className="w-48 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#c0392b] focus:border-transparent outline-none text-sm"
                                placeholder="ör. 250" min="0" />
                            </div>
                          ) : (
                            block.floors.map((floor, fi) => (
                              <div key={fi} className="ml-4 mb-2 border-l-2 border-gray-200 pl-3">
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-1">
                                    <div className="flex flex-col">
                                      <button
                                        onClick={() => {
                                          if (fi === 0) return;
                                          const u = [...editBlocks];
                                          [u[bi].floors[fi - 1], u[bi].floors[fi]] = [u[bi].floors[fi], u[bi].floors[fi - 1]];
                                          setEditBlocks(u);
                                        }}
                                        disabled={fi === 0}
                                        className={`site-edit-reorder-btn p-0.5 rounded ${fi === 0 ? 'text-gray-200' : 'text-gray-400 hover:text-[#1e3a5f] hover:bg-gray-100'}`}
                                        title="Yukarı taşı"
                                      >
                                        <ChevronUp size={12} />
                                      </button>
                                      <button
                                        onClick={() => {
                                          if (fi === block.floors.length - 1) return;
                                          const u = [...editBlocks];
                                          [u[bi].floors[fi], u[bi].floors[fi + 1]] = [u[bi].floors[fi + 1], u[bi].floors[fi]];
                                          setEditBlocks(u);
                                        }}
                                        disabled={fi === block.floors.length - 1}
                                        className={`site-edit-reorder-btn p-0.5 rounded ${fi === block.floors.length - 1 ? 'text-gray-200' : 'text-gray-400 hover:text-[#1e3a5f] hover:bg-gray-100'}`}
                                        title="Aşağı taşı"
                                      >
                                        <ChevronDown size={12} />
                                      </button>
                                    </div>
                                    <input type="text" value={floor.name}
                                      onChange={(e) => { const u = [...editBlocks]; u[bi].floors[fi].name = e.target.value; setEditBlocks(u); }}
                                      className="text-sm text-gray-600 px-2 py-1 border border-transparent hover:border-gray-200 rounded outline-none" />
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <span className="text-xs text-gray-400">{floor.units.length} daire</span>
                                    <button onClick={() => addEditUnit(bi, fi)} className="site-edit-unit-add text-xs text-green-500 hover:text-green-700">+1</button>
                                    <button onClick={() => addEditUnitsRange(bi, fi, 4)} className="site-edit-unit-add text-xs text-green-500 hover:text-green-700">+4</button>
                                    <button onClick={() => removeEditFloor(bi, fi)} className="site-edit-delete-btn text-red-300 hover:text-red-500"><Trash2 size={12} /></button>
                                  </div>
                                </div>
                                {floor.units.length > 0 && (
                                  <div className="flex flex-wrap gap-1 mt-1 ml-4">
                                    {floor.units.map((unit, ui) => (
                                      <div key={ui} className="flex items-center gap-0.5">
                                        <span className="text-[9px] text-gray-400 font-mono">{ui + 1}</span>
                                        <div className="flex flex-col -my-0.5">
                                          <button
                                            onClick={() => {
                                              if (ui === 0) return;
                                              const u = [...editBlocks];
                                              [u[bi].floors[fi].units[ui - 1], u[bi].floors[fi].units[ui]] = [u[bi].floors[fi].units[ui], u[bi].floors[fi].units[ui - 1]];
                                              setEditBlocks(u);
                                            }}
                                            disabled={ui === 0}
                                            className={`site-edit-unit-reorder leading-none ${ui === 0 ? 'text-gray-200' : 'text-gray-400 hover:text-[#1e3a5f]'}`}
                                            title="Öne al"
                                          >
                                            <ChevronUp size={10} />
                                          </button>
                                          <button
                                            onClick={() => {
                                              if (ui === floor.units.length - 1) return;
                                              const u = [...editBlocks];
                                              [u[bi].floors[fi].units[ui], u[bi].floors[fi].units[ui + 1]] = [u[bi].floors[fi].units[ui + 1], u[bi].floors[fi].units[ui]];
                                              setEditBlocks(u);
                                            }}
                                            disabled={ui === floor.units.length - 1}
                                            className={`site-edit-unit-reorder leading-none ${ui === floor.units.length - 1 ? 'text-gray-200' : 'text-gray-400 hover:text-[#1e3a5f]'}`}
                                            title="Arkaya al"
                                          >
                                            <ChevronDown size={10} />
                                          </button>
                                        </div>
                                        <input type="text" value={unit.name}
                                          onChange={(e) => { const u = [...editBlocks]; u[bi].floors[fi].units[ui].name = e.target.value; setEditBlocks(u); }}
                                          className="text-xs bg-gray-100 px-2 py-0.5 rounded border border-transparent focus:border-[#c0392b] focus:bg-white outline-none w-20" />
                                        <button onClick={() => removeEditUnit(bi, fi, ui)} className="site-edit-unit-delete text-red-300 hover:text-red-500"><X size={10} /></button>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            ))
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* İnşaat Takip Ayarı */}
                  {editTab === "checklist" && (
                    <div className="space-y-4">
                      {/* Ağaç Navigasyon */}
                      <div className="flex border border-gray-200 rounded-lg overflow-hidden bg-white" style={{ minHeight: 200 }}>
                        {/* Kolon 1: Blok / Peyzaj */}
                        <div className="min-w-[140px] max-w-[170px] border-r border-gray-200 flex flex-col">
                          <div className="px-3 py-2 bg-gray-50 border-b border-gray-200 flex-shrink-0">
                            <h4 className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide flex items-center gap-1.5">
                              <Building2 size={12} /> Blok
                            </h4>
                          </div>
                          <div className="overflow-y-auto flex-1">
                            {editBlocks.length === 0 && (
                              <p className="text-[11px] text-gray-400 p-3">Henüz blok yok</p>
                            )}
                            {editBlocks.map((block) => {
                              const isSelected = !isPeyzajMode && editConstructionBlock === block.id;
                              return (
                                <button
                                  key={block.id || block.name}
                                  onClick={() => {
                                    const bid = block.id || null;
                                    setIsPeyzajMode(false);
                                    setEditConstructionBlock(bid);
                                    setEditConstructionFloors([]);
                                    setEditInceDaires([]);
                                    setSelectedTreeFloor(null);
                                    if (bid && editingSite) fetchSiteConstruction(editingSite.id, editConstructionType === "PEYZAJ" ? "KABA_INSAAT" : editConstructionType, bid);
                                    if (editConstructionType === "PEYZAJ") setEditConstructionType("KABA_INSAAT");
                                  }}
                                  className={`w-full text-left px-3 py-2 text-sm flex items-center justify-between border-b border-gray-100 transition-colors ${
                                    isSelected ? "bg-[#1e3a5f] text-white font-medium" : "hover:bg-gray-50 text-gray-700"
                                  }`}
                                >
                                  <span className="truncate">{block.name}</span>
                                  {isSelected && <ChevronRight size={14} className="flex-shrink-0" />}
                                </button>
                              );
                            })}
                            <button
                              onClick={() => {
                                setIsPeyzajMode(true);
                                setEditConstructionBlock(null);
                                setEditConstructionType("PEYZAJ");
                                setEditConstructionFloors([]);
                                setEditInceDaires([]);
                                setSelectedTreeFloor(null);
                                if (editingSite) fetchSiteConstruction(editingSite.id, "PEYZAJ", null);
                              }}
                              className={`w-full text-left px-3 py-2 text-sm flex items-center justify-between border-b border-gray-100 transition-colors ${
                                isPeyzajMode ? "bg-[#27ae60] text-white font-medium" : "hover:bg-gray-50 text-green-700"
                              }`}
                            >
                              <span className="flex items-center gap-1.5"><Layers size={13} /> Peyzaj</span>
                              {isPeyzajMode && <ChevronRight size={14} className="flex-shrink-0" />}
                            </button>
                          </div>
                        </div>

                        {/* Kolon 2: İnşaat Türü */}
                        {(editConstructionBlock || isPeyzajMode) && (
                          <div className="min-w-[140px] max-w-[170px] border-r border-gray-200 flex flex-col">
                            <div className="px-3 py-2 bg-gray-50 border-b border-gray-200 flex-shrink-0">
                              <h4 className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide flex items-center gap-1.5">
                                <Hammer size={12} /> Tür
                              </h4>
                            </div>
                            <div className="overflow-y-auto flex-1">
                              {isPeyzajMode ? (
                                <div className="w-full px-3 py-2 text-sm bg-[#27ae60] text-white font-medium flex items-center justify-between">
                                  Peyzaj <ChevronRight size={14} />
                                </div>
                              ) : (
                                (["KABA_INSAAT", "INCE_INSAAT", "BINA_GENEL", "RUHSAT_ISKAN"] as const).map((t) => {
                                  const isSelected = editConstructionType === t;
                                  return (
                                    <button
                                      key={t}
                                      onClick={() => {
                                        setEditConstructionType(t);
                                        setSelectedTreeFloor(null);
                                        if (editingSite && editConstructionBlock) fetchSiteConstruction(editingSite.id, t, editConstructionBlock);
                                      }}
                                      className={`w-full text-left px-3 py-2 text-sm flex items-center justify-between border-b border-gray-100 transition-colors ${
                                        isSelected ? "bg-[#1e3a5f] text-white font-medium" : "hover:bg-gray-50 text-gray-700"
                                      }`}
                                    >
                                      {t === "KABA_INSAAT" ? "Kaba İnşaat" : t === "INCE_INSAAT" ? "İnce İşler" : t === "RUHSAT_ISKAN" ? "Belgeler" : "Bina Genel"}
                                      {isSelected && <ChevronRight size={14} className="flex-shrink-0" />}
                                    </button>
                                  );
                                })
                              )}
                            </div>
                          </div>
                        )}

                        {/* Kolon 3: Katlar / Ana Maddeler (İnce İnşaat hariç) */}
                        {(editConstructionBlock || isPeyzajMode) && editConstructionType !== "INCE_INSAAT" && !editConstructionLoading && (
                          <div className="flex-1 min-w-[170px] flex flex-col">
                            <div className="px-3 py-2 bg-gray-50 border-b border-gray-200 flex items-center justify-between flex-shrink-0">
                              <h4 className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
                                {editConstructionType === "RUHSAT_ISKAN" ? "Gruplar" : "Katlar"}
                              </h4>
                              <button
                                onClick={() => {
                                  const newFloor: ConstructionFloorEdit = { name: editConstructionType === "RUHSAT_ISKAN" ? "Yeni Grup" : "Yeni Kat", works: [] };
                                  const newFloors = [...editConstructionFloors, newFloor];
                                  setEditConstructionFloors(newFloors);
                                  setSelectedTreeFloor(newFloors.length - 1);
                                }}
                                className="site-edit-tree-add text-[11px] text-[#c0392b] hover:text-[#922b21] font-semibold"
                              >
                                + Ekle
                              </button>
                            </div>
                            <div className="overflow-y-auto flex-1">
                              {editConstructionFloors.length === 0 ? (
                                <div className="p-3 text-center">
                                  <p className="text-[11px] text-gray-400">Henüz kat tanımlanmamış</p>
                                  <button
                                    onClick={async () => {
                                      try {
                                        const res = await fetch('/api/construction-defaults');
                                        if (res.ok) {
                                          const data = await res.json();
                                          const block = editBlocks.find(b => b.id === editConstructionBlock);
                                          const floors = (data.template?.floors || [])
                                            .filter((f: ConstructionDefaultFloor) => f.type === editConstructionType)
                                            .flatMap((f: ConstructionDefaultFloor) => {
                                              if (f.isKatlar && block && block.floors.length > 0) {
                                                return block.floors.map(fl => ({
                                                  name: fl.name,
                                                  works: f.works.map((w: { name: string }) => ({ name: w.name })),
                                                }));
                                              }
                                              return [{
                                                name: f.name,
                                                works: f.works.map((w: { name: string }) => ({ name: w.name })),
                                              }];
                                            });
                                          setEditConstructionFloors(floors);
                                        }
                                      } catch {}
                                    }}
                                    className="mt-2 px-3 py-1.5 bg-[#1e3a5f] text-white rounded text-[11px] font-medium hover:bg-[#152d4a]"
                                  >
                                    Şablondan Yükle
                                  </button>
                                </div>
                              ) : (
                                editConstructionFloors.map((floor, fi) => {
                                  const isSelected = selectedTreeFloor === fi;
                                  return (
                                    <button
                                      key={fi}
                                      onClick={() => setSelectedTreeFloor(isSelected ? null : fi)}
                                      className={`w-full text-left px-3 py-2 text-sm flex items-center justify-between border-b border-gray-100 transition-colors ${
                                        isSelected ? "bg-[#1e3a5f] text-white font-medium" : "hover:bg-gray-50 text-gray-700"
                                      }`}
                                    >
                                      <span className="truncate">{floor.name}</span>
                                      <span className={`text-[10px] ml-1 ${isSelected ? "text-white/70" : "text-gray-400"}`}>({floor.works.length})</span>
                                    </button>
                                  );
                                })
                              )}
                            </div>
                          </div>
                        )}

                        {/* Loading durumu */}
                        {(editConstructionBlock || isPeyzajMode) && editConstructionLoading && (
                          <div className="flex-1 flex items-center justify-center">
                            <div className="animate-spin rounded-full h-5 w-5 border-2 border-[#1e3a5f] border-t-transparent"></div>
                          </div>
                        )}

                        {/* İnce İnşaat üçüncü kolon placeholder */}
                        {(editConstructionBlock || isPeyzajMode) && editConstructionType === "INCE_INSAAT" && !editConstructionLoading && (
                          <div className="flex-1 flex items-center justify-center text-[11px] text-gray-400 italic">
                            ↓ Daire ve iş kalemleri aşağıda
                          </div>
                        )}
                      </div>

                      {/* === İnce İnşaat: Daire + İş Kalemleri === */}
                      {(editConstructionBlock || isPeyzajMode) && !editConstructionLoading && editConstructionType === "INCE_INSAAT" && (
                        <div className="space-y-4">

                          {/* Boş durum: varsayılandan yükle */}
                          {editInceDaires.length === 0 && editConstructionFloors.length === 0 && (
                            <div className="text-center py-8 text-gray-400">
                              <p>Henüz ince inşaat yapısı tanımlanmamış.</p>
                              <p className="text-xs mt-1">Daire ve iş kalemlerini ekleyin veya şablondan yükleyin.</p>
                              <button
                                onClick={async () => {
                                  try {
                                    const res = await fetch('/api/construction-defaults');
                                    if (res.ok) {
                                      const data = await res.json();
                                      const inceFloor = (data.template?.floors || []).find((f: ConstructionDefaultFloor) => f.type === "INCE_INSAAT");
                                      if (inceFloor) {
                                        setEditConstructionFloors([{ name: inceFloor.name, works: inceFloor.works.map((w: { name: string }) => ({ name: w.name })) }]);
                                      }
                                      const defaultDaires = data.template?.inceDaires || [];
                                      if (defaultDaires.length > 0) {
                                        setEditInceDaires(defaultDaires.map((d: { id?: string; name: string }) => ({ id: d.id || crypto.randomUUID(), name: d.name })));
                                      }
                                    }
                                  } catch {}
                                }}
                                className="mt-3 px-4 py-2 bg-[#1e3a5f] text-white rounded-lg text-sm font-medium hover:bg-[#152d4a]"
                              >
                                Varsayılan Şablondan Yükle
                              </button>
                            </div>
                          )}

                          {/* Daire Seçimi (iş kalemi düzenlemesi için) */}
                          {editInceDaires.length > 0 && (
                            <div className="border border-[#1e3a5f]/20 rounded-lg p-3 bg-[#1e3a5f]/5">
                              <h4 className="font-semibold text-[#1e3a5f] text-sm mb-2">Daire Seçimi (İş Kalemi Düzenleme)</h4>
                              <p className="text-xs text-gray-500 mb-2">İş kalemlerini düzenlemek istediğiniz daireleri seçin. &quot;Hepsi&quot; tüm dairelerin ortak iş kalemlerini düzenler.</p>
                              <div className="flex flex-wrap gap-1.5">
                                <button
                                  onClick={() => { setAllDairesMode(true); setSelectedDaireIds(new Set()); }}
                                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                                    allDairesMode
                                      ? "bg-[#1e3a5f] text-white border-[#1e3a5f]"
                                      : "bg-white text-gray-600 border-gray-200 hover:border-[#1e3a5f]"
                                  }`}
                                >
                                  Hepsi
                                </button>
                                {editInceDaires.map((daire) => {
                                  const did = daire.id || "";
                                  const isSelected = selectedDaireIds.has(did);
                                  const hasOverride = unitOverrides[did] && (unitOverrides[did].added?.length > 0 || unitOverrides[did].removed?.length > 0);
                                  return (
                                    <button
                                      key={did}
                                      onClick={() => {
                                        const newSet = new Set(selectedDaireIds);
                                        if (isSelected) {
                                          newSet.delete(did);
                                          if (newSet.size === 0) setAllDairesMode(true);
                                        } else {
                                          newSet.add(did);
                                          setAllDairesMode(false);
                                        }
                                        setSelectedDaireIds(newSet);
                                      }}
                                      className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                                        isSelected
                                          ? "bg-[#27ae60] text-white border-[#27ae60]"
                                          : "bg-white text-gray-600 border-gray-200 hover:border-[#27ae60]"
                                      }`}
                                    >
                                      {daire.name}
                                      {hasOverride && <span className="ml-1 text-[10px] opacity-70">●</span>}
                                    </button>
                                  );
                                })}
                              </div>
                              {!allDairesMode && selectedDaireIds.size > 0 && (
                                <p className="text-xs text-[#27ae60] mt-2 font-medium">
                                  {selectedDaireIds.size} daire seçili — aşağıdaki değişiklikler seçili dairelere uygulanacak
                                </p>
                              )}
                            </div>
                          )}

                          {/* İş Kalemleri Bölümü */}
                          {(editInceDaires.length > 0 || editConstructionFloors.length > 0) && (() => {
                            const baseWorks = editConstructionFloors[0]?.works || [];

                            // Helper: get effective works for one daire
                            const getEffective = (did: string): { name: string; isBase: boolean }[] => {
                              const ov = unitOverrides[did] || { added: [], removed: [] };
                              const base = baseWorks.filter(w => !(ov.removed || []).includes(w.name)).map(w => ({ name: w.name, isBase: true }));
                              const added = (ov.added || []).map(a => ({ name: a, isBase: false }));
                              return [...base, ...added];
                            };

                            // Target daires
                            const targetIds = allDairesMode
                              ? editInceDaires.map(d => d.id || "").filter(Boolean)
                              : Array.from(selectedDaireIds);

                            if (targetIds.length === 0) return null;

                            // Check if all targeted daires have the same effective works
                            const perDaire = targetIds.map(did => getEffective(did));
                            const serialize = (ws: { name: string }[]) => ws.map(w => w.name).sort().join("\x00");
                            const allSame = perDaire.length > 0 && perDaire.every(ws => serialize(ws) === serialize(perDaire[0]));
                            const isSingle = targetIds.length === 1;
                            const showList = isSingle || allSame;
                            const displayWorks = showList ? perDaire[0] : [];

                            // Next unique work name
                            const getNextName = () => {
                              const allNames = new Set<string>();
                              for (const did of targetIds) for (const w of getEffective(did)) allNames.add(w.name);
                              for (const bw of baseWorks) allNames.add(bw.name);
                              let n = 1;
                              let name = "Yeni İş";
                              while (allNames.has(name)) { n++; name = `Yeni İş ${n}`; }
                              return name;
                            };

                            const handleAdd = () => {
                              const newName = getNextName();
                              const newOv = { ...unitOverrides };
                              for (const did of targetIds) {
                                const ov = newOv[did] || { added: [], removed: [] };
                                newOv[did] = { ...ov, added: [...(ov.added || []), newName] };
                              }
                              setUnitOverrides(newOv);
                            };

                            const handleRemove = (workName: string, isBase: boolean) => {
                              const newOv = { ...unitOverrides };
                              for (const did of targetIds) {
                                const ov = { ...(newOv[did] || { added: [], removed: [] }) };
                                if (isBase) {
                                  ov.removed = [...(ov.removed || [])];
                                  if (!ov.removed.includes(workName)) ov.removed.push(workName);
                                } else {
                                  ov.added = (ov.added || []).filter(a => a !== workName);
                                }
                                newOv[did] = ov;
                              }
                              setUnitOverrides(newOv);
                            };

                            const handleRename = (oldName: string, newName: string, isBase: boolean) => {
                              if (isBase) {
                                const u = [...editConstructionFloors];
                                if (u[0]) {
                                  const wi = u[0].works.findIndex(w => w.name === oldName);
                                  if (wi >= 0) {
                                    u[0].works = [...u[0].works];
                                    u[0].works[wi] = { ...u[0].works[wi], name: newName };
                                    setEditConstructionFloors(u);
                                  }
                                }
                                // Update removed references
                                const newOv = { ...unitOverrides };
                                for (const did of Object.keys(newOv)) {
                                  const ov = newOv[did];
                                  if (ov.removed?.includes(oldName)) {
                                    newOv[did] = { ...ov, removed: ov.removed.map(r => r === oldName ? newName : r) };
                                  }
                                }
                                setUnitOverrides(newOv);
                              } else {
                                const newOv = { ...unitOverrides };
                                for (const did of targetIds) {
                                  const ov = newOv[did] || { added: [], removed: [] };
                                  const idx = (ov.added || []).indexOf(oldName);
                                  if (idx >= 0) {
                                    const newAdded = [...ov.added];
                                    newAdded[idx] = newName;
                                    newOv[did] = { ...ov, added: newAdded };
                                  }
                                }
                                setUnitOverrides(newOv);
                              }
                            };

                            const borderClass = allDairesMode ? "border-gray-200" : "border-[#27ae60]/30 bg-[#27ae60]/5";

                            return (
                              <div className={`border rounded-lg p-3 ${borderClass}`}>
                                <div className="flex items-center justify-between mb-2">
                                  <h4 className="font-semibold text-gray-800 text-sm">
                                    İş Kalemleri{allDairesMode
                                      ? " — Tüm Daireler"
                                      : isSingle
                                        ? ` — ${editInceDaires.find(d => d.id === targetIds[0])?.name || "Seçili Daire"}`
                                        : ` — ${targetIds.length} Daire`}
                                    {showList ? ` (${displayWorks.length})` : ""}
                                  </h4>
                                  <button
                                    onClick={handleAdd}
                                    className="flex items-center gap-1 text-xs text-blue-500 hover:text-blue-700 font-medium px-2 py-1 border border-blue-200 rounded-lg"
                                  >
                                    <Plus size={14} /> İş Kalemi Ekle
                                  </button>
                                </div>

                                {!showList && (() => {
                                  // Show merged union view of all works across targeted daires
                                  const unionWorks = new Map<string, { name: string; isBase: boolean; daireCount: number }>(); 
                                  for (const pd of perDaire) {
                                    for (const w of pd) {
                                      const existing = unionWorks.get(w.name);
                                      if (existing) { existing.daireCount++; }
                                      else { unionWorks.set(w.name, { name: w.name, isBase: w.isBase, daireCount: 1 }); }
                                    }
                                  }
                                  const mergedWorks = Array.from(unionWorks.values());
                                  return (
                                    <div>
                                      <div className="flex items-start gap-2 bg-amber-50 border border-amber-300 rounded-lg px-3 py-2 mb-3">
                                        <span className="text-amber-500 text-lg leading-none mt-0.5">⚠</span>
                                        <p className="text-sm text-amber-800 font-medium">Dairelerin iş kalemleri birbirinden farklı. Eklediğiniz iş kalemleri seçili dairelerin hepsine eklenecektir.</p>
                                      </div>
                                      <div className="space-y-1">
                                        {mergedWorks.map((mw, i) => (
                                          <div key={i} className="flex items-center gap-2">
                                            <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${mw.isBase ? "bg-[#1e3a5f]" : "bg-[#27ae60]"}`} />
                                            <input
                                              type="text"
                                              value={mw.name}
                                              onChange={(e) => handleRename(mw.name, e.target.value, mw.isBase)}
                                              className={`flex-1 text-sm px-2 py-1 border rounded focus:border-[#c0392b] outline-none ${
                                                mw.isBase ? "text-gray-600 border-gray-200" : "text-[#27ae60] font-medium border-[#27ae60]/20 bg-white"
                                              }`}
                                            />
                                            <span className="text-[10px] text-gray-400 whitespace-nowrap">{mw.daireCount}/{targetIds.length}</span>
                                            <button onClick={() => handleRemove(mw.name, mw.isBase)} className="text-red-300 hover:text-red-500"><X size={12} /></button>
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  );
                                })()}

                                {showList && (
                                  <div className="space-y-1">
                                    {displayWorks.map((ew, ewi) => {
                                      const isFirstBase = ewi === 0 || !displayWorks[ewi - 1]?.isBase;
                                      const isLastBase = !ew.isBase || ewi === displayWorks.length - 1 || !displayWorks[ewi + 1]?.isBase;
                                      const handleMoveUp = () => {
                                        if (!ew.isBase || isFirstBase) return;
                                        const u = [...editConstructionFloors];
                                        if (!u[0]) return;
                                        const works = [...u[0].works];
                                        const idx = works.findIndex(w => w.name === ew.name);
                                        if (idx <= 0) return;
                                        [works[idx - 1], works[idx]] = [works[idx], works[idx - 1]];
                                        works.forEach((w: any, i: number) => { w.order = i; });
                                        u[0] = { ...u[0], works };
                                        setEditConstructionFloors(u);
                                      };
                                      const handleMoveDown = () => {
                                        if (!ew.isBase || isLastBase) return;
                                        const u = [...editConstructionFloors];
                                        if (!u[0]) return;
                                        const works = [...u[0].works];
                                        const idx = works.findIndex(w => w.name === ew.name);
                                        if (idx < 0 || idx >= works.length - 1) return;
                                        [works[idx], works[idx + 1]] = [works[idx + 1], works[idx]];
                                        works.forEach((w: any, i: number) => { w.order = i; });
                                        u[0] = { ...u[0], works };
                                        setEditConstructionFloors(u);
                                      };
                                      return (
                                      <div key={ewi} className="flex items-center gap-2">
                                        <span className="text-xs text-gray-400 font-mono w-5 text-right">{ewi + 1}.</span>
                                        {ew.isBase && (
                                          <div className="flex flex-col">
                                            <button
                                              onClick={handleMoveUp}
                                              disabled={isFirstBase}
                                              className={`p-0.5 rounded ${isFirstBase ? 'text-gray-200' : 'text-gray-400 hover:text-[#1e3a5f] hover:bg-gray-100'}`}
                                              title="Yukarı taşı"
                                            >
                                              <ChevronUp size={12} />
                                            </button>
                                            <button
                                              onClick={handleMoveDown}
                                              disabled={isLastBase}
                                              className={`p-0.5 rounded ${isLastBase ? 'text-gray-200' : 'text-gray-400 hover:text-[#1e3a5f] hover:bg-gray-100'}`}
                                              title="Aşağı taşı"
                                            >
                                              <ChevronDown size={12} />
                                            </button>
                                          </div>
                                        )}
                                        <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${ew.isBase ? "bg-[#1e3a5f]" : "bg-[#27ae60]"}`} />
                                        <input
                                          type="text"
                                          value={ew.name}
                                          onChange={(e) => handleRename(ew.name, e.target.value, ew.isBase)}
                                          className={`flex-1 text-sm px-2 py-1 border rounded focus:border-[#c0392b] outline-none ${
                                            ew.isBase ? "text-gray-600 border-gray-200" : "text-[#27ae60] font-medium border-[#27ae60]/20 bg-white"
                                          }`}
                                        />
                                        <button
                                          onClick={() => handleRemove(ew.name, ew.isBase)}
                                          className="text-red-300 hover:text-red-500"
                                        >
                                          <X size={12} />
                                        </button>
                                      </div>
                                      );
                                    })}
                                    {displayWorks.length === 0 && (
                                      <p className="text-xs text-gray-400 text-center py-2">İş kalemi bulunmuyor</p>
                                    )}
                                  </div>
                                )}
                              </div>
                            );
                          })()}

                          {/* Kaydet */}
                          {(editInceDaires.length > 0 || editConstructionFloors.length > 0) && (
                            <button
                              onClick={saveSiteConstruction}
                              disabled={editConstructionSaving}
                              className="site-edit-construction-save w-full px-4 py-2.5 bg-[#27ae60] hover:bg-[#229954] text-white rounded-lg text-sm font-medium transition-all disabled:opacity-50"
                            >
                              {editConstructionSaving ? "Kaydediliyor..." : "İnce İnşaat Yapısını Kaydet"}
                            </button>
                          )}
                        </div>
                      )}

                      {/* === Kat Detayı (İnce İnşaat hariç) === */}
                      {(editConstructionBlock || isPeyzajMode) && !editConstructionLoading && editConstructionType !== "INCE_INSAAT" && (
                        <>
                          {selectedTreeFloor !== null && editConstructionFloors[selectedTreeFloor] ? (() => {
                            const floor = editConstructionFloors[selectedTreeFloor];
                            const fi = selectedTreeFloor;
                            const floorStartNum = editConstructionFloors.slice(0, fi).reduce((sum, f) => sum + f.works.length, 0);
                            return (
                              <div className="border border-gray-200 rounded-lg p-4 space-y-3">
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-1 flex-1">
                                    <div className="flex flex-col">
                                      <button
                                        onClick={() => {
                                          if (fi === 0) return;
                                          const u = [...editConstructionFloors];
                                          [u[fi - 1], u[fi]] = [u[fi], u[fi - 1]];
                                          setEditConstructionFloors(u);
                                          setSelectedTreeFloor(fi - 1);
                                        }}
                                        disabled={fi === 0}
                                        className={`site-edit-reorder-btn p-0.5 rounded transition-colors ${fi === 0 ? 'text-gray-200 cursor-not-allowed' : 'text-gray-400 hover:text-[#1e3a5f] hover:bg-gray-100'}`}
                                        title="Yukarı taşı"
                                      >
                                        <ChevronUp size={14} />
                                      </button>
                                      <button
                                        onClick={() => {
                                          if (fi === editConstructionFloors.length - 1) return;
                                          const u = [...editConstructionFloors];
                                          [u[fi], u[fi + 1]] = [u[fi + 1], u[fi]];
                                          setEditConstructionFloors(u);
                                          setSelectedTreeFloor(fi + 1);
                                        }}
                                        disabled={fi === editConstructionFloors.length - 1}
                                        className={`site-edit-reorder-btn p-0.5 rounded transition-colors ${fi === editConstructionFloors.length - 1 ? 'text-gray-200 cursor-not-allowed' : 'text-gray-400 hover:text-[#1e3a5f] hover:bg-gray-100'}`}
                                        title="Aşağı taşı"
                                      >
                                        <ChevronDown size={14} />
                                      </button>
                                    </div>
                                    <input
                                      type="text"
                                      value={floor.name}
                                      onChange={(e) => {
                                        const u = [...editConstructionFloors];
                                        u[fi].name = e.target.value;
                                        setEditConstructionFloors(u);
                                      }}
                                      className="font-semibold text-gray-800 px-2 py-1 border border-transparent hover:border-gray-200 rounded focus:border-[#c0392b] outline-none text-sm flex-1"
                                    />
                                  </div>
                                  <div className="flex items-center gap-1">
                                    <button
                                      onClick={() => {
                                        const u = [...editConstructionFloors];
                                        const maxOrder = u[fi].works.length > 0 ? Math.max(...u[fi].works.map((w: any) => w.order ?? 0)) + 1 : 0;
                                        u[fi].works.push({ name: editConstructionType === "RUHSAT_ISKAN" ? "Yeni Madde" : "Yeni İş", order: maxOrder });
                                        setEditConstructionFloors(u);
                                      }}
                                      className="site-edit-add-btn text-xs text-blue-500 hover:text-blue-700 px-2 py-1 border border-blue-200 rounded"
                                    >
                                      {editConstructionType === "RUHSAT_ISKAN" ? "+ Madde" : "+ İş Kalemi"}
                                    </button>
                                    <button
                                      onClick={() => {
                                        setEditConstructionFloors(editConstructionFloors.filter((_, i) => i !== fi));
                                        setSelectedTreeFloor(null);
                                      }}
                                      className="site-edit-delete-btn text-red-400 hover:text-red-600 p-1"
                                    >
                                      <Trash2 size={14} />
                                    </button>
                                  </div>
                                </div>

                                {floor.works.length > 0 && (
                                  <div className="ml-4 border-l-2 border-gray-200 pl-3 space-y-1">
                                    {floor.works.map((work, wi) => {
                                      const num = floorStartNum + wi + 1;
                                      return (
                                        <div key={wi} className="flex items-center gap-2">
                                          <span className="text-xs text-gray-400 font-mono w-5 text-right">{num}.</span>
                                          <div className="flex flex-col">
                                            <button
                                              onClick={() => {
                                                if (wi === 0) return;
                                                const u = [...editConstructionFloors];
                                                const works = [...u[fi].works];
                                                [works[wi - 1], works[wi]] = [works[wi], works[wi - 1]];
                                                works.forEach((w: any, idx: number) => { w.order = idx; });
                                                u[fi].works = works;
                                                setEditConstructionFloors(u);
                                              }}
                                              disabled={wi === 0}
                                              className={`site-edit-reorder-btn p-0.5 rounded transition-colors ${wi === 0 ? 'text-gray-200 cursor-not-allowed' : 'text-gray-400 hover:text-[#1e3a5f] hover:bg-gray-100'}`}
                                              title="Yukarı taşı"
                                            >
                                              <ChevronUp size={12} />
                                            </button>
                                            <button
                                              onClick={() => {
                                                if (wi === floor.works.length - 1) return;
                                                const u = [...editConstructionFloors];
                                                const works = [...u[fi].works];
                                                [works[wi], works[wi + 1]] = [works[wi + 1], works[wi]];
                                                works.forEach((w: any, idx: number) => { w.order = idx; });
                                                u[fi].works = works;
                                                setEditConstructionFloors(u);
                                              }}
                                              disabled={wi === floor.works.length - 1}
                                              className={`site-edit-reorder-btn p-0.5 rounded transition-colors ${wi === floor.works.length - 1 ? 'text-gray-200 cursor-not-allowed' : 'text-gray-400 hover:text-[#1e3a5f] hover:bg-gray-100'}`}
                                              title="Aşağı taşı"
                                            >
                                              <ChevronDown size={12} />
                                            </button>
                                          </div>
                                          <input
                                            type="text"
                                            value={work.name}
                                            onChange={(e) => {
                                              const u = [...editConstructionFloors];
                                              u[fi].works[wi].name = e.target.value;
                                              setEditConstructionFloors(u);
                                            }}
                                            className="flex-1 text-sm text-gray-600 px-2 py-1 border border-gray-200 rounded focus:border-[#c0392b] outline-none"
                                          />
                                          <button
                                            onClick={() => {
                                              const u = [...editConstructionFloors];
                                              u[fi].works = u[fi].works.filter((_, i) => i !== wi);
                                              u[fi].works.forEach((w: any, idx: number) => { w.order = idx; });
                                              setEditConstructionFloors(u);
                                            }}
                                            className="site-edit-work-delete text-red-300 hover:text-red-500"
                                          >
                                            <X size={12} />
                                          </button>
                                        </div>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>
                            );
                          })() : editConstructionFloors.length > 0 ? (
                            <div className="text-center py-6 text-gray-400 border border-dashed border-gray-200 rounded-lg">
                              <p className="text-sm">Düzenlemek için soldaki listeden bir {editConstructionType === "RUHSAT_ISKAN" ? "grup" : "kat"} seçin</p>
                            </div>
                          ) : null}

                          {editConstructionFloors.length > 0 && (
                            <button
                              onClick={saveSiteConstruction}
                              disabled={editConstructionSaving}
                              className="site-edit-construction-save w-full px-4 py-2.5 bg-[#27ae60] hover:bg-[#229954] text-white rounded-lg text-sm font-medium transition-all disabled:opacity-50"
                            >
                              {editConstructionSaving ? "Kaydediliyor..." : "İnşaat Yapısını Kaydet"}
                            </button>
                          )}
                        </>
                      )}
                    </div>

                  )}
                </>
              )}
            </div>

            {/* Alt Butonlar */}
            <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-3">
              <button onClick={closeEditPopup} disabled={saving}
                className="site-edit-cancel-btn px-5 py-2.5 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50">İptal</button>
              <button onClick={() => saveEdit()} disabled={saving || !editName.trim()}
                className="site-edit-save-btn px-5 py-2.5 bg-[#1e3a5f] hover:bg-[#152d4a] text-white rounded-lg text-sm font-medium disabled:opacity-50 flex items-center gap-2">
                {saving ? (
                  <><div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div> Kaydediliyor...</>
                ) : (
                  <><Check size={16} /> Kaydet</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Kategori Silme Uyarı Popup */}
      {categoryWarning && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[70]">
          <div className="bg-white rounded-2xl border-[5px] border-[#c0392b] shadow-2xl w-full max-w-md mx-4 overflow-hidden">
            <div className="px-6 py-5">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center">
                  <Trash2 className="text-[#c0392b]" size={24} />
                </div>
                <div>
                  <h3 className="font-bold text-gray-900 text-lg">Dikkat!</h3>
                  <p className="text-sm text-gray-500">Özelleştirmeler etkilenecek</p>
                </div>
              </div>
              <p className="text-sm text-gray-700 leading-relaxed">
                Silmek istediğiniz kategorilere bağlı <span className="font-bold text-[#c0392b]">{categoryWarning.count}</span> adet daire kontrol özelleştirmesi bulunuyor.
                Bu kategorileri silerseniz, ilgili tüm özelleştirmeler <span className="font-bold">kalıcı olarak silinecektir</span>.
              </p>
            </div>
            <div className="px-6 py-4 bg-gray-50 flex justify-end gap-3">
              <button
                onClick={() => { setCategoryWarning(null); setEditCategories(JSON.parse(JSON.stringify(originalCategories))); }}
                className="px-5 py-2.5 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-white font-medium"
              >
                Vazgeç
              </button>
              <button
                onClick={() => { setCategoryWarning(null); saveEdit(true); }}
                className="px-5 py-2.5 bg-[#c0392b] hover:bg-[#a93226] text-white rounded-lg text-sm font-medium"
              >
                Devam Et
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Daire Silme Uyarı Popup */}
      {unitDeleteWarning && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[70]">
          <div className="bg-white rounded-2xl border-[5px] border-[#c0392b] shadow-2xl w-full max-w-md mx-4 overflow-hidden">
            <div className="px-6 py-5">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center">
                  <Trash2 className="text-[#c0392b]" size={24} />
                </div>
                <div>
                  <h3 className="font-bold text-gray-900 text-lg">Dikkat!</h3>
                  <p className="text-sm text-gray-500">Daire özelleştirmeleri etkilenecek</p>
                </div>
              </div>
              <p className="text-sm text-gray-700 leading-relaxed">
                <span className="font-bold">{unitDeleteWarning.unitName}</span> dairesine ait kontrol özelleştirmeleri bulunuyor.
                Bu daireyi silerseniz, ilgili tüm özelleştirmeler <span className="font-bold">kalıcı olarak silinecektir</span>.
              </p>
            </div>
            <div className="px-6 py-4 bg-gray-50 flex justify-end gap-3">
              <button
                onClick={() => setUnitDeleteWarning(null)}
                className="px-5 py-2.5 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-white font-medium"
              >
                Vazgeç
              </button>
              <button
                onClick={confirmDeleteUnit}
                className="px-5 py-2.5 bg-[#c0392b] hover:bg-[#a93226] text-white rounded-lg text-sm font-medium"
              >
                Devam Et
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Şantiye Silme Onay Popup */}
      {deletingSite && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="site-delete-popup bg-white rounded-2xl max-w-sm w-full p-6 border-[5px] border-[#1e3a5f]">
            <div className="w-14 h-14 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Trash2 size={28} className="text-red-600" />
            </div>
            <h3 className="text-lg font-semibold text-gray-800 text-center mb-1">Şantiye Çöp Kutusuna Taşınacak</h3>
            <p className="text-sm text-gray-500 text-center mb-2">
              <span className="font-medium text-gray-700">&ldquo;{deletingSite.name}&rdquo;</span> şantiyesini çöp kutusuna taşımak istediğinize emin misiniz?
            </p>
            <p className="text-xs text-amber-600 text-center mb-5">Şantiye çöp kutusundan 30 gün içinde geri yüklenebilir. Tüm veriler korunacaktır.</p>
            <div className="flex gap-3 justify-center">
              <button onClick={() => setDeletingSite(null)} disabled={deleting}
                className="px-5 py-2.5 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50">İptal</button>
              <button onClick={confirmDeleteSite} disabled={deleting}
                className="px-5 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium disabled:opacity-50">
                {deleting ? "Siliniyor..." : "Sil"}
              </button>
            </div>
          </div>
        </div>
      )}


      {/* Hesabımı Sil — paylaşılan bileşen (Hesap Yönetimi sayfasıyla aynı) */}
      <div className="mt-8 pt-6 border-t border-gray-200">
        <DeleteAccountSection />
      </div>

    </div>
  );
}
