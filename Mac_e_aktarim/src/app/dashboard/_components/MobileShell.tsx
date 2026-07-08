"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { isAdmin, hasRole, ROLE_LABELS } from "@/lib/roles";
import { useModalBack } from "@/lib/backStack";
import {
  LayoutDashboard,
  Building2,
  MessageCircle,
  Menu as MenuIcon,
  X,
  TrendingUp,
  Warehouse,
  Truck,
  HardHat,
  AlertTriangle,
  BookOpen,
  Users,
  Trash2,
  Settings,
  UserCog,
  Coffee,
  GraduationCap,
  LogOut,
  ChevronRight,
  type LucideIcon,
} from "lucide-react";

interface ShellUser {
  firstName: string;
  lastName: string;
  role: string;
  roles?: string[];
  studyankaAccess?: boolean;
}

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

export default function MobileShell({
  user,
  children,
  chatUnread,
  onLogout,
}: {
  user: ShellUser | null;
  children: React.ReactNode;
  chatUnread: number;
  onLogout: () => void;
}) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  // Android geri-gesture'ı önce açık menüyü kapatsın (sayfayı pop etmesin)
  useModalBack(menuOpen, () => setMenuOpen(false));

  const isLinkActive = (href: string) =>
    pathname === href || pathname.startsWith(href + "/");

  const tab = {
    home: pathname === "/dashboard",
    sales: pathname.startsWith("/dashboard/satis"),
    chat: pathname.startsWith("/dashboard/sohbet"),
  };
  const menuActive = !tab.home && !tab.sales && !tab.chat;

  const sections: { title: string; items: NavItem[] }[] = [
    {
      title: "Genel",
      items: [
        { href: "/dashboard", label: "Ana Sayfa", icon: LayoutDashboard },
        { href: "/dashboard/sites", label: "Şantiyeler", icon: Building2 },
        { href: "/dashboard/sohbet", label: "Sohbet", icon: MessageCircle },
      ],
    },
    {
      title: "İşlemler",
      items: [
        { href: "/dashboard/satis", label: "Satış", icon: TrendingUp },
        { href: "/dashboard/depo", label: "Depo", icon: Warehouse },
        { href: "/dashboard/teslimat", label: "Teslimat", icon: Truck },
        { href: "/dashboard/personel", label: "Personel", icon: HardHat },
        { href: "/dashboard/ariza", label: "Arıza Takip", icon: AlertTriangle },
        { href: "/dashboard/santiye-ariza", label: "Şantiye Arıza", icon: AlertTriangle },
        { href: "/dashboard/not-defteri", label: "Not Defteri", icon: BookOpen },
      ],
    },
    {
      title: "Hesap",
      items: [
        { href: "/dashboard/hesap", label: "Hesap Yönetimi", icon: UserCog },
      ],
    },
  ];
  if (isAdmin(user?.roles)) {
    sections.push({
      title: "Yönetim",
      items: [
        { href: "/dashboard/users", label: "Kullanıcılar", icon: Users },
        { href: "/dashboard/trash", label: "Çöp Kutusu", icon: Trash2 },
        { href: "/dashboard/settings", label: "Ayarlar", icon: Settings },
      ],
    });
  }
  const extra: NavItem[] = [];
  if (user?.studyankaAccess)
    extra.push({ href: "/dashboard/studyanka", label: "StudyAnka", icon: Coffee });
  if (hasRole(user?.roles, "SUPER_ADMIN"))
    extra.push({ href: "/dashboard/yurtanka-cebeci", label: "YurtAnka Cebeci", icon: GraduationCap });
  if (extra.length) sections.push({ title: "Diğer", items: extra });

  const headerStyle = {
    paddingTop: "env(safe-area-inset-top)",
    height: "calc(3.5rem + env(safe-area-inset-top))",
  } as const;

  return (
    <div data-device="mobile" className="h-[100dvh] flex flex-col overflow-hidden bg-[#f4f4f7]">
      <header
        className="bg-[#1a1a2e] text-white flex items-center justify-between px-4 flex-shrink-0"
        style={headerStyle}
      >
        <div className="flex items-center gap-2.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo_flame.png" alt="" className="h-7 w-auto select-none" draggable={false} />
          <span className="font-semibold text-[15px]">Uzaktan Şantiye</span>
        </div>
        <button
          onClick={() => setMenuOpen(true)}
          className="w-9 h-9 rounded-full bg-[#c0392b] flex items-center justify-center text-xs font-semibold"
          aria-label="Menü"
        >
          {user?.firstName?.[0]}
          {user?.lastName?.[0]}
        </button>
      </header>

      <main className="flex-1 min-h-0 overflow-y-auto">{children}</main>

      <nav
        className="flex-shrink-0 bg-white border-t border-gray-200 flex justify-around"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <TabLink href="/dashboard" label="Ana Sayfa" icon={LayoutDashboard} active={tab.home} />
        <TabLink href="/dashboard/satis" label="Satış" icon={TrendingUp} active={tab.sales} />
        <TabLink href="/dashboard/sohbet" label="Sohbet" icon={MessageCircle} active={tab.chat} badge={chatUnread} />
        <button
          onClick={() => setMenuOpen(true)}
          className={`flex flex-col items-center gap-0.5 py-2 flex-1 ${menuActive ? "text-[#c0392b]" : "text-gray-400"}`}
        >
          <MenuIcon size={22} />
          <span className="text-[10px] font-medium">Menü</span>
        </button>
      </nav>

      {menuOpen && (
        <div className="fixed inset-0 z-50 bg-[#f4f4f7] flex flex-col" style={{ height: "100dvh" }}>
          <div
            className="bg-[#1a1a2e] text-white flex items-center justify-between px-4 flex-shrink-0"
            style={headerStyle}
          >
            <span className="font-semibold text-lg">Menü</span>
            <button onClick={() => setMenuOpen(false)} aria-label="Kapat">
              <X size={24} />
            </button>
          </div>
          <div className="flex items-center gap-3 px-4 py-4 bg-white border-b border-gray-100 flex-shrink-0">
            <div className="w-12 h-12 rounded-full bg-[#c0392b] text-white flex items-center justify-center font-semibold">
              {user?.firstName?.[0]}
              {user?.lastName?.[0]}
            </div>
            <div>
              <p className="font-semibold text-gray-900">
                {user?.firstName} {user?.lastName}
              </p>
              <p className="text-xs text-gray-500">{ROLE_LABELS[user?.role || ""] || user?.role}</p>
            </div>
          </div>
          <div
            className="flex-1 overflow-y-auto px-3 py-3 space-y-5"
            style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 1rem)" }}
          >
            {sections.map((sec) => (
              <div key={sec.title}>
                <p className="text-xs font-semibold text-gray-400 uppercase px-2 mb-1.5">{sec.title}</p>
                <div className="bg-white rounded-2xl overflow-hidden">
                  {sec.items.map((it, i) => (
                    <Link
                      key={it.href}
                      href={it.href}
                      onClick={() => setMenuOpen(false)}
                      className={`flex items-center gap-3 px-4 py-3.5 ${i > 0 ? "border-t border-gray-50" : ""} ${
                        isLinkActive(it.href) ? "text-[#c0392b]" : "text-gray-800"
                      }`}
                    >
                      <it.icon size={20} />
                      <span className="flex-1 font-medium text-[15px]">{it.label}</span>
                      <ChevronRight size={18} className="text-gray-300" />
                    </Link>
                  ))}
                </div>
              </div>
            ))}
            <button
              onClick={onLogout}
              className="w-full flex items-center justify-center gap-2 bg-white rounded-2xl py-3.5 text-[#c0392b] font-medium"
            >
              <LogOut size={20} /> Çıkış Yap
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function TabLink({
  href,
  label,
  icon: Icon,
  active,
  badge,
}: {
  href: string;
  label: string;
  icon: LucideIcon;
  active: boolean;
  badge?: number;
}) {
  return (
    <Link
      href={href}
      className={`relative flex flex-col items-center gap-0.5 py-2 flex-1 ${active ? "text-[#c0392b]" : "text-gray-400"}`}
    >
      <span className="relative">
        <Icon size={22} />
        {!!badge && badge > 0 && (
          <span className="absolute -top-1.5 -right-2 bg-[#c0392b] text-white text-[9px] min-w-[15px] h-[15px] rounded-full flex items-center justify-center px-1 border border-white">
            {badge > 99 ? "99+" : badge}
          </span>
        )}
      </span>
      <span className="text-[10px] font-medium">{label}</span>
    </Link>
  );
}
