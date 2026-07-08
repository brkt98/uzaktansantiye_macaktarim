"use client";

import { useState, useEffect } from "react";
import { Users, Plus, Edit3, Shield, X, Check, Trash2, Eye, EyeOff, Coffee, MapPin } from "lucide-react";
import { useUser } from "../layout";
import { ROLE_LABELS, ROLE_COLORS, ASSIGNABLE_ROLES, getRoleLabel, getRoleColor, hasRole } from "@/lib/roles";

interface User {
  id: string;
  username: string;
  email: string;
  firstName: string;
  lastName: string;
  phone: string;
  role: string;
  roles?: string[];
  isActive: boolean;
  studyankaAccess: boolean;
  createdAt: string;
}

interface SiteOption {
  id: string;
  name: string;
  status: string;
}

export default function UsersPage() {
  const currentUser = useUser();
  const isSuperAdmin = hasRole(currentUser?.roles, "SUPER_ADMIN");
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<User | null>(null);
  const [error, setError] = useState("");

  const [formUsername, setFormUsername] = useState("");
  const [formEmail, setFormEmail] = useState("");
  const [formPassword, setFormPassword] = useState("");
  const [formFirstName, setFormFirstName] = useState("");
  const [formLastName, setFormLastName] = useState("");
  const [formPhone, setFormPhone] = useState("");
  const [formRoles, setFormRoles] = useState<string[]>(["USER"]);
  const [formPrimaryRole, setFormPrimaryRole] = useState("USER");
  const [showPassword, setShowPassword] = useState(false);
  const [allSites, setAllSites] = useState<SiteOption[]>([]);
  const [assignedSiteIds, setAssignedSiteIds] = useState<string[]>([]);

  useEffect(() => {
    fetchUsers();
    fetchAllSites();
  }, []);

  const fetchUsers = async () => {
    try {
      const res = await fetch("/api/users");
      const data = await res.json();
      setUsers(data.users || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const fetchAllSites = async () => {
    try {
      const res = await fetch("/api/sites");
      const data = await res.json();
      setAllSites((data.sites || []).map((s: SiteOption) => ({ id: s.id, name: s.name, status: s.status })));
    } catch {
      // ignore
    }
  };

  const fetchUserSites = async (userId: string) => {
    try {
      const res = await fetch(`/api/users/${userId}/sites`);
      const data = await res.json();
      setAssignedSiteIds(data.siteIds || []);
    } catch {
      setAssignedSiteIds([]);
    }
  };

  const saveUserSites = async (userId: string) => {
    try {
      await fetch(`/api/users/${userId}/sites`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ siteIds: assignedSiteIds }),
      });
    } catch {
      // ignore
    }
  };

  // Rol seçimini aç/kapat; en az bir rol kalmasını ve Ana Rol'ün geçerli olmasını sağlar.
  const toggleRole = (role: string) => {
    setFormRoles((prev) => {
      const has = prev.includes(role);
      const next = has ? prev.filter((r) => r !== role) : [...prev, role];
      if (next.length === 0) return prev; // en az bir rol kalmalı
      // Ana Rol artık seçili değilse ilk role'a düşür
      setFormPrimaryRole((cur) => (next.includes(cur) ? cur : next[0]));
      return next;
    });
  };

  const handleSubmit = async () => {
    setError("");
    if (!formFirstName || !formLastName || !formEmail) {
      setError("Ad, soyad ve e-posta zorunludur");
      return;
    }
    if (!editingUser && (!formUsername || !formPassword)) {
      setError("Kullanıcı adı ve şifre zorunludur");
      return;
    }
    if (formRoles.length === 0) {
      setError("En az bir rol seçilmelidir");
      return;
    }
    const primaryRole = formRoles.includes(formPrimaryRole) ? formPrimaryRole : formRoles[0];
    const hasSiteChief = formRoles.includes("SITE_CHIEF");

    try {
      if (editingUser) {
        // Düzenleme
        const res = await fetch(`/api/users/${editingUser.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            firstName: formFirstName,
            lastName: formLastName,
            email: formEmail,
            phone: formPhone,
            role: primaryRole,
            roles: formRoles,
            password: formPassword || undefined,
          }),
        });
        const data = await res.json();
        if (!res.ok) { setError(data.error || "Hata oluştu"); return; }

        // Şantiye atamaları kaydet
        if (hasSiteChief) {
          await saveUserSites(editingUser.id);
        } else {
          // Şantiye Şefi rolü kaldırıldıysa atamaları temizle
          await fetch(`/api/users/${editingUser.id}/sites`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ siteIds: [] }),
          });
        }
      } else {
        // Yeni oluştur
        const res = await fetch("/api/users", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            username: formUsername,
            email: formEmail,
            password: formPassword,
            firstName: formFirstName,
            lastName: formLastName,
            phone: formPhone,
            role: primaryRole,
            roles: formRoles,
            assignedSiteIds: hasSiteChief ? assignedSiteIds : [],
          }),
        });
        const data = await res.json();
        if (!res.ok) { setError(data.error || "Hata oluştu"); return; }
      }

      setShowModal(false);
      setEditingUser(null);
      resetForm();
      fetchUsers();
    } catch (err) {
      setError("Bağlantı hatası");
    }
  };

  const handleDelete = async () => {
    if (!deleteConfirm) return;
    try {
      const res = await fetch(`/api/users/${deleteConfirm.id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) { alert(data.error || "Silinemedi"); return; }
      setDeleteConfirm(null);
      fetchUsers();
    } catch {
      alert("Bağlantı hatası");
    }
  };

  const toggleStudyanka = async (userId: string, current: boolean) => {
    try {
      const res = await fetch(`/api/users/${userId}/studyanka`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ studyankaAccess: !current }),
      });
      if (!res.ok) return;
      setUsers((prev) => prev.map((u) => u.id === userId ? { ...u, studyankaAccess: !current } : u));
      setEditingUser((prev) => prev && prev.id === userId ? { ...prev, studyankaAccess: !current } : prev);
    } catch {
      // ignore
    }
  };

  const openEdit = (user: User) => {
    const userRoles = user.roles && user.roles.length > 0 ? user.roles : [user.role];
    setEditingUser(user);
    setFormFirstName(user.firstName);
    setFormLastName(user.lastName);
    setFormUsername(user.username);
    setFormEmail(user.email);
    setFormPhone(user.phone || "");
    setFormRoles(userRoles);
    setFormPrimaryRole(user.role);
    setFormPassword("");
    setError("");
    setShowModal(true);
    if (userRoles.includes("SITE_CHIEF")) {
      fetchUserSites(user.id);
    } else {
      setAssignedSiteIds([]);
    }
  };

  const resetForm = () => {
    setFormUsername("");
    setFormEmail("");
    setFormPassword("");
    setFormFirstName("");
    setFormLastName("");
    setFormPhone("");
    setFormRoles(["USER"]);
    setFormPrimaryRole("USER");
    setError("");
    setEditingUser(null);
    setShowPassword(false);
    setAssignedSiteIds([]);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Kullanıcı Yönetimi</h1>
          <p className="text-gray-500 mt-1">Sistem kullanıcılarını yönetin</p>
        </div>
        <button
          onClick={() => { resetForm(); setShowModal(true); }}
          className="inline-flex items-center gap-2 bg-[#c0392b] hover:bg-[#922b21] text-white px-4 py-2.5 rounded-lg text-sm font-medium"
        >
          <Plus size={18} />
          Yeni Kullanıcı
        </button>
      </div>

      {/* Tablo */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Kullanıcı</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase users-col-email">E-posta</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase users-col-phone">Telefon</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Rol</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase users-col-status">Durum</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase">İşlemler</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id} className="border-b border-gray-50 hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-[#c0392b] rounded-full flex items-center justify-center text-white text-xs font-bold">
                        {user.firstName[0]}{user.lastName[0]}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-800">{user.firstName} {user.lastName}</p>
                        <p className="text-xs text-gray-400">@{user.username}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500 users-col-email">{user.email}</td>
                  <td className="px-4 py-3 text-sm text-gray-500 users-col-phone">{user.phone || "-"}</td>
                  <td className="px-4 py-3 text-center">
                    <div className="flex flex-wrap items-center justify-center gap-1">
                      <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${getRoleColor(user.role)}`} title="Ana Rol">
                        {getRoleLabel(user.role)}
                      </span>
                      {(user.roles || [])
                        .filter((r) => r !== user.role)
                        .map((r) => (
                          <span key={r} className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${getRoleColor(r)}`}>
                            {getRoleLabel(r)}
                          </span>
                        ))}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-center users-col-status">
                    <span className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs ${user.isActive ? "bg-green-50 text-green-600" : "bg-gray-100 text-gray-500"}`}>
                      {user.isActive ? <><Check size={12} /> Aktif</> : "Pasif"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <div className="flex items-center justify-center gap-2 users-actions">
                      <button onClick={() => openEdit(user)} className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors" title="Düzenle">
                        <Edit3 size={15} />
                      </button>
                      <button onClick={() => setDeleteConfirm(user)} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors" title="Sil">
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 border-[5px] border-[#1e3a5f] max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">{editingUser ? "Kullanıcı Düzenle" : "Yeni Kullanıcı"}</h2>
              <button onClick={() => { setShowModal(false); setEditingUser(null); }} className="text-gray-400 hover:text-gray-600">
                <X size={20} />
              </button>
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Ad *</label>
                  <input type="text" value={formFirstName} onChange={(e) => setFormFirstName(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-[#c0392b]" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Soyad *</label>
                  <input type="text" value={formLastName} onChange={(e) => setFormLastName(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-[#c0392b]" />
                </div>
              </div>

              {!editingUser && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Kullanıcı Adı *</label>
                  <input type="text" value={formUsername} onChange={(e) => setFormUsername(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-[#c0392b]" />
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">E-posta *</label>
                <input type="email" value={formEmail} onChange={(e) => setFormEmail(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-[#c0392b]" />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{editingUser ? "Şifre (değiştirmek için doldurun)" : "Şifre *"}</label>
                <div className="relative">
                  <input type={showPassword ? "text" : "password"} value={formPassword} onChange={(e) => setFormPassword(e.target.value)}
                    className="w-full px-3 py-2 pr-10 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-[#c0392b]" />
                  <button type="button" onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Telefon</label>
                <input type="tel" value={formPhone} onChange={(e) => setFormPhone(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-[#c0392b]" />
              </div>

              {/* Roller (çoklu seçim) */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Roller</label>
                <p className="text-xs text-gray-400 mb-2">Birden fazla rol seçebilirsiniz. Yetkiler seçilen tüm rollerin birleşimi olur.</p>
                <div className="grid grid-cols-2 gap-2">
                  {[...ASSIGNABLE_ROLES, ...(isSuperAdmin ? ["SUPER_ADMIN"] : [])].map((r) => {
                    const checked = formRoles.includes(r);
                    return (
                      <label
                        key={r}
                        className={`flex items-center gap-2 p-2 rounded-lg border cursor-pointer transition-colors ${
                          checked ? "border-[#c0392b] bg-red-50" : "border-gray-200 hover:bg-gray-50"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleRole(r)}
                          className="rounded border-gray-300 text-[#c0392b] focus:ring-[#c0392b]"
                        />
                        <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${ROLE_COLORS[r] || "bg-gray-100 text-gray-700"}`}>
                          {ROLE_LABELS[r] || r}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* Ana Rol — açılış arayüzünü belirler */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Ana Rol (açılış arayüzü)</label>
                <select value={formPrimaryRole} onChange={(e) => setFormPrimaryRole(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-[#c0392b]">
                  {formRoles.map((r) => (
                    <option key={r} value={r}>{ROLE_LABELS[r] || r}</option>
                  ))}
                </select>
                <p className="text-xs text-gray-400 mt-1">Kullanıcı giriş yaptığında bu role göre ana sayfa görünümü açılır.</p>
              </div>

              {/* StudyAnka Erişimi - sadece düzenleme modunda */}
              {editingUser && (
                <div className="flex items-center justify-between p-3 rounded-lg border border-amber-200 bg-amber-50">
                  <div className="flex items-center gap-2">
                    <Coffee size={18} className="text-amber-600" />
                    <span className="text-sm font-medium text-gray-700">StudyAnka Erişimi</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => toggleStudyanka(editingUser.id, editingUser.studyankaAccess)}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      editingUser.studyankaAccess ? "bg-amber-500" : "bg-gray-300"
                    }`}
                  >
                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      editingUser.studyankaAccess ? "translate-x-6" : "translate-x-1"
                    }`} />
                  </button>
                </div>
              )}

              {/* Şantiye Ataması - rollerden biri SITE_CHIEF ise */}
              {formRoles.includes("SITE_CHIEF") && (
                <div className="p-3 rounded-lg border border-orange-200 bg-orange-50">
                  <div className="flex items-center gap-2 mb-2">
                    <MapPin size={18} className="text-orange-600" />
                    <span className="text-sm font-medium text-gray-700">Şantiye Ataması</span>
                  </div>
                  <div className="max-h-40 overflow-y-auto space-y-1">
                    {allSites.length === 0 ? (
                      <p className="text-xs text-gray-400">Şantiye bulunamadı</p>
                    ) : (
                      allSites.map((site) => (
                        <label key={site.id} className="flex items-center gap-2 p-1.5 rounded hover:bg-orange-100 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={assignedSiteIds.includes(site.id)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setAssignedSiteIds((prev) => [...prev, site.id]);
                              } else {
                                setAssignedSiteIds((prev) => prev.filter((id) => id !== site.id));
                              }
                            }}
                            className="rounded border-gray-300 text-orange-600 focus:ring-orange-500"
                          />
                          <span className="text-sm text-gray-700">{site.name}</span>
                        </label>
                      ))
                    )}
                  </div>
                </div>
              )}

              {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-lg text-sm">{error}</div>
              )}

              <div className="flex justify-end gap-3 pt-2">
                <button onClick={() => { setShowModal(false); setEditingUser(null); }}
                  className="px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50">İptal</button>
                <button onClick={handleSubmit}
                  className="px-4 py-2 bg-[#c0392b] hover:bg-[#922b21] text-white rounded-lg text-sm font-medium">
                  {editingUser ? "Güncelle" : "Oluştur"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Silme Onay Popup */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 border-[5px] border-[#1e3a5f] text-center">
            <div className="w-14 h-14 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Trash2 size={28} className="text-red-600" />
            </div>
            <h3 className="text-lg font-semibold text-gray-800 mb-2">Kullanıcıyı Sil</h3>
            <p className="text-sm text-gray-500 mb-6">
              <span className="font-medium text-gray-700">{deleteConfirm.firstName} {deleteConfirm.lastName}</span> kullanıcısını silmek istediğinize emin misiniz? Bu işlem geri alınamaz.
            </p>
            <div className="flex gap-3 justify-center">
              <button onClick={() => setDeleteConfirm(null)}
                className="px-5 py-2.5 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50">İptal</button>
              <button onClick={handleDelete}
                className="px-5 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium">Sil</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
