"use client";

import { useState, useEffect, createContext, useContext, useCallback, useRef } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { useDevice } from "@/hooks/useDevice";
import { useSocket } from "@/hooks/useSocket";
import IncomingCallModal from "./sohbet/_components/IncomingCallModal";
import MobileShell from "./_components/MobileShell";
import PinGate from "./_components/PinGate";
import { setAppBadge } from "@/lib/badge";
import { isAdmin, hasRole, ROLE_LABELS } from "@/lib/roles";
import {
  Building2,
  LayoutDashboard,
  Settings,
  UserCog,
  LogOut,
  Menu,
  X,
  Users,
  Trash2,
  ChevronDown,
  Coffee,
  GraduationCap,
  Warehouse,
  Truck,
  HardHat,
  AlertTriangle,
  TrendingUp,
  BookOpen,
  MessageCircle,
} from "lucide-react";

interface User {
  id: string;
  username: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  roles?: string[];
  studyankaAccess?: boolean;
}

const UserContext = createContext<User | null>(null);
export const useUser = () => useContext(UserContext);

// Tablet detection context
const TabletContext = createContext<boolean>(false);
export const useIsTablet = () => useContext(TabletContext);

// Keep useSidebar export for backward compatibility (sites/[id]/page.tsx uses it)
interface SidebarContextType {
  collapsed: boolean;
  setCollapsed: (v: boolean) => void;
}
const SidebarContext = createContext<SidebarContextType>({ collapsed: false, setCollapsed: () => {} });
export const useSidebar = () => useContext(SidebarContext);

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<User | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [adminDropdownOpen, setAdminDropdownOpen] = useState(false);
  const [menuDropdownOpen, setMenuDropdownOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [chatUnread, setChatUnread] = useState(0);
  const [incomingCall, setIncomingCall] = useState<{
    conversationId: string;
    type: string;
    callerName: string;
    fromUserId: string;
  } | null>(null);
  const adminDropdownRef = useRef<HTMLDivElement>(null);
  const menuDropdownRef = useRef<HTMLDivElement>(null);
  const { isTablet, isMobile } = useDevice();
  const { socket } = useSocket();

  useEffect(() => {
    fetchUser();
  }, []);

  // Sohbet okunmamış sayısı (üst bar rozeti)
  const fetchUnread = useCallback(() => {
    fetch("/api/chat/conversations")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d) {
          const total = (d.conversations || []).reduce(
            (s: number, c: { unread?: number }) => s + (c.unread || 0),
            0
          );
          setChatUnread(total);
        }
      })
      .catch(() => {});
  }, []);

  // Mount + sayfa değişimi (okuyup başka sayfaya geçince temizlenir) + "chat:read" olayı + periyodik
  useEffect(() => {
    fetchUnread();
    const iv = setInterval(fetchUnread, 20000);
    const onRead = () => fetchUnread();
    window.addEventListener("chat:read", onRead);
    return () => {
      clearInterval(iv);
      window.removeEventListener("chat:read", onRead);
    };
  }, [fetchUnread, pathname]);

  // Yeni mesaj gelince rozeti canlı güncelle
  useEffect(() => {
    if (!socket) return;
    const onNew = (p: { message?: { senderId?: string } }) => {
      if (p?.message?.senderId !== user?.id) fetchUnread();
    };
    socket.on("message:new", onNew);
    return () => {
      socket.off("message:new", onNew);
    };
  }, [socket, user?.id, fetchUnread]);

  // Gelen arama (app genelinde)
  useEffect(() => {
    if (!socket) return;
    const onIncoming = (c: {
      conversationId: string;
      type: string;
      callerName: string;
      fromUserId: string;
    }) => setIncomingCall(c);
    const onCanceled = ({ conversationId }: { conversationId: string }) =>
      setIncomingCall((cur) => (cur && cur.conversationId === conversationId ? null : cur));
    socket.on("call:incoming", onIncoming);
    socket.on("call:canceled", onCanceled);
    socket.on("call:handled", onCanceled); // başka cihazda kabul/red edildi → bu cihazda da kapat
    return () => {
      socket.off("call:incoming", onIncoming);
      socket.off("call:canceled", onCanceled);
      socket.off("call:handled", onCanceled);
    };
  }, [socket]);

  // Uygulama ikonu rozeti = okunmamış sohbet sayısı
  useEffect(() => { setAppBadge(chatUnread); }, [chatUnread]);

  // Close admin dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (adminDropdownRef.current && !adminDropdownRef.current.contains(e.target as Node)) {
        setAdminDropdownOpen(false);
      }
      if (menuDropdownRef.current && !menuDropdownRef.current.contains(e.target as Node)) {
        setMenuDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const fetchUser = async () => {
    try {
      const res = await fetch("/api/auth/me");
      if (!res.ok) {
        router.push("/login");
        return;
      }
      const data = await res.json();
      setUser(data.user);
    } catch {
      router.push("/login");
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
  };

  const navItems = [
    { href: "/dashboard", label: "Ana Sayfa", icon: LayoutDashboard },
    { href: "/dashboard/sites", label: "Şantiyeler", icon: Building2 },
  ];

  const menuItems = [
    { href: "/dashboard/satis", label: "Satış", icon: TrendingUp },
    { href: "/dashboard/depo", label: "Depo", icon: Warehouse },
    { href: "/dashboard/teslimat", label: "Teslimat", icon: Truck },
    { href: "/dashboard/personel", label: "Personel", icon: HardHat },
    { href: "/dashboard/ariza", label: "Arıza Takip", icon: AlertTriangle },
    { href: "/dashboard/santiye-ariza", label: "Şantiye Arıza", icon: AlertTriangle },
    { href: "/dashboard/not-defteri", label: "Not Defteri", icon: BookOpen },
    { href: "/dashboard/hesap", label: "Hesap Yönetimi", icon: UserCog },
  ];

  const adminItems = [
    { href: "/dashboard/users", label: "Kullanıcılar", icon: Users },
    { href: "/dashboard/trash", label: "Çöp Kutusu", icon: Trash2 },
    { href: "/dashboard/settings", label: "Ayarlar", icon: Settings },
  ];

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="flex flex-col items-center gap-4">
          <div className="animate-spin rounded-full h-12 w-12 border-4 border-[#c0392b] border-t-transparent"></div>
          <p className="text-gray-500">Yükleniyor...</p>
        </div>
      </div>
    );
  }

  return (
    <UserContext.Provider value={user}>
      <TabletContext.Provider value={isTablet}>
      <SidebarContext.Provider value={{ collapsed: false, setCollapsed: () => {} }}>
      <PinGate>
      {isMobile ? (
        <MobileShell user={user} chatUnread={chatUnread} onLogout={handleLogout}>
          {children}
        </MobileShell>
      ) : (
      <div className={`min-h-screen bg-gray-50 ${isTablet ? "overflow-x-hidden" : ""}`} data-device={isTablet ? "tablet" : undefined}>
        {/* Top Navbar */}
        <header className="bg-[#1a1a2e] text-white sticky top-0 z-40 shadow-lg">
          <div className={`flex items-center justify-between px-4 ${isTablet ? "h-16" : "h-14"}`}>
            {/* Left: Logo + Nav Items */}
            <div className="flex items-center gap-1 sm:gap-2">
              {/* Mobile hamburger */}
              <button
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className={`${isTablet ? "hidden" : "lg:hidden"} text-gray-300 hover:text-white p-1.5 rounded-lg hover:bg-white/10 transition-all mr-1`}
              >
                {mobileMenuOpen ? <X size={22} /> : <Menu size={22} />}
              </button>

              {/* Meşale Grup logosu (sadece alev sembolü) */}
              <Link href="/dashboard" className="flex items-center justify-center mr-2 sm:mr-3 flex-shrink-0" aria-label="Meşale Grup">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/logo_flame.png" alt="Meşale Grup" className="h-9 w-auto select-none" draggable={false} />
              </Link>

              {/* Desktop Nav Items */}
              <nav className={`${isTablet ? "flex" : "hidden lg:flex"} items-center gap-1`}>
                {navItems.map((item) => {
                  const isActive = pathname === item.href || (item.href !== "/dashboard" && pathname.startsWith(item.href));
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={`flex items-center gap-2 px-3 ${isTablet ? "py-2.5 text-base" : "py-1.5 text-sm"} rounded-lg transition-all ${
                        isActive
                          ? "bg-[#c0392b] text-white"
                          : "text-gray-300 hover:bg-white/10 hover:text-white"
                      }`}
                    >
                      <item.icon size={18} />
                      {item.label}
                    </Link>
                  );
                })}

                {/* Menu dropdown (Depo, Teslimat, Personel) */}
                <div className="relative" ref={menuDropdownRef}>
                  <button
                    onClick={() => setMenuDropdownOpen(!menuDropdownOpen)}
                    className={`flex items-center gap-1.5 px-3 ${isTablet ? "py-2.5 text-base" : "py-1.5 text-sm"} rounded-lg transition-all ${
                      menuItems.some((item) => pathname === item.href || pathname.startsWith(item.href))
                        ? "bg-[#c0392b] text-white"
                        : "text-gray-300 hover:bg-white/10 hover:text-white"
                    }`}
                  >
                    <Menu size={18} />
                    Menü
                    <ChevronDown size={14} className={`transition-transform ${menuDropdownOpen ? "rotate-180" : ""}`} />
                  </button>
                  {menuDropdownOpen && (
                    <div className="absolute top-full left-0 mt-2 bg-[#1a1a2e] border border-white/10 rounded-xl shadow-2xl py-2 min-w-[240px] z-50">
                      {menuItems.map((item) => {
                        const isActive = pathname === item.href || pathname.startsWith(item.href);
                        return (
                          <Link
                            key={item.href}
                            href={item.href}
                            onClick={() => setMenuDropdownOpen(false)}
                            className={`flex items-center gap-3 px-5 py-3.5 text-base font-medium transition-all ${
                              isActive
                                ? "bg-[#c0392b] text-white"
                                : "text-gray-300 hover:bg-white/10 hover:text-white"
                            }`}
                          >
                            <item.icon size={20} />
                            {item.label}
                          </Link>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Admin dropdown */}
                {isAdmin(user?.roles) && (
                  <div className="relative" ref={adminDropdownRef}>
                    <button
                      onClick={() => setAdminDropdownOpen(!adminDropdownOpen)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all text-sm ${
                        adminItems.some((item) => pathname === item.href) || pathname === "/dashboard/studyanka" || pathname === "/dashboard/yurtanka-cebeci"
                          ? "bg-[#c0392b] text-white"
                          : "text-gray-300 hover:bg-white/10 hover:text-white"
                      }`}
                    >
                      <Settings size={18} />
                      Yönetim
                      <ChevronDown size={14} className={`transition-transform ${adminDropdownOpen ? "rotate-180" : ""}`} />
                    </button>
                    {adminDropdownOpen && (
                      <div className="absolute top-full left-0 mt-1 bg-[#1a1a2e] border border-white/10 rounded-lg shadow-xl py-1 min-w-[180px] z-50">
                        {adminItems.map((item) => {
                          const isActive = pathname === item.href;
                          return (
                            <Link
                              key={item.href}
                              href={item.href}
                              onClick={() => setAdminDropdownOpen(false)}
                              className={`flex items-center gap-2.5 px-4 py-2.5 text-sm transition-all ${
                                isActive
                                  ? "bg-[#c0392b] text-white"
                                  : "text-gray-300 hover:bg-white/10 hover:text-white"
                              }`}
                            >
                              <item.icon size={16} />
                              {item.label}
                            </Link>
                          );
                        })}
                        {/* StudyAnka */}
                        {user?.studyankaAccess && (
                          <>
                            <div className="border-t border-white/10 my-1" />
                            <Link
                              href="/dashboard/studyanka"
                              onClick={() => setAdminDropdownOpen(false)}
                              className={`flex items-center gap-2.5 px-4 py-2.5 text-sm transition-all ${
                                pathname === "/dashboard/studyanka"
                                  ? "bg-amber-600 text-white"
                                  : "text-amber-400 hover:bg-white/10 hover:text-amber-300"
                              }`}
                            >
                              <Coffee size={16} />
                              StudyAnka
                            </Link>
                          </>
                        )}
                        {/* YurtAnka Cebeci - sadece SUPER_ADMIN */}
                        {hasRole(user?.roles, "SUPER_ADMIN") && (
                          <Link
                            href="/dashboard/yurtanka-cebeci"
                            onClick={() => setAdminDropdownOpen(false)}
                            className={`flex items-center gap-2.5 px-4 py-2.5 text-sm transition-all ${
                              pathname === "/dashboard/yurtanka-cebeci"
                                ? "bg-emerald-600 text-white"
                                : "text-emerald-400 hover:bg-white/10 hover:text-emerald-300"
                            }`}
                          >
                            <GraduationCap size={16} />
                            YurtAnka Cebeci
                          </Link>
                        )}
                      </div>
                    )}
                  </div>
                )}


              </nav>
            </div>

            {/* Right: User + Logout */}
            <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
              <Link
                href="/dashboard/sohbet"
                className="relative text-gray-300 hover:text-white p-1.5 rounded-lg hover:bg-white/10 transition-all"
                title="Sohbet"
                aria-label="Sohbet"
              >
                <MessageCircle size={20} />
                {chatUnread > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 bg-[#c0392b] text-white text-[10px] font-bold min-w-[16px] h-[16px] rounded-full flex items-center justify-center px-1 border border-[#1a1a2e]">
                    {chatUnread > 99 ? "99+" : chatUnread}
                  </span>
                )}
              </Link>
              <div className="hidden sm:flex items-center gap-2">
                <div className="w-7 h-7 bg-[#c0392b] rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0">
                  {user?.firstName?.[0]}{user?.lastName?.[0]}
                </div>
                {!isTablet && (
                <div className="text-sm leading-tight">
                  <span className="text-white font-medium">{user?.firstName} {user?.lastName}</span>
                  <span className="ml-2 px-1.5 py-0.5 bg-white/10 rounded text-[10px] text-gray-300 uppercase">{ROLE_LABELS[user?.role || ""] || user?.role}</span>
                </div>
                )}
              </div>
              <button
                onClick={handleLogout}
                className="text-gray-400 hover:text-white p-1.5 rounded-lg hover:bg-white/10 transition-all"
                title="Çıkış Yap"
              >
                <LogOut size={18} />
              </button>
            </div>
          </div>

          {/* Mobile Menu */}
          {mobileMenuOpen && (
            <div className="lg:hidden border-t border-white/10 bg-[#1a1a2e]">
              <nav className="px-3 py-2 space-y-1">
                {navItems.map((item) => {
                  const isActive = pathname === item.href || (item.href !== "/dashboard" && pathname.startsWith(item.href));
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setMobileMenuOpen(false)}
                      className={`flex items-center gap-3 px-4 py-3.5 rounded-xl transition-all text-base font-medium ${
                        isActive ? "bg-[#c0392b] text-white" : "text-gray-300 hover:bg-white/10"
                      }`}
                    >
                      <item.icon size={20} />
                      {item.label}
                    </Link>
                  );
                })}
                <div className="pt-3 pb-1 px-3">
                  <p className="text-xs text-gray-500 uppercase tracking-wider">Menü</p>
                </div>
                {menuItems.map((item) => {
                  const isActive = pathname === item.href || pathname.startsWith(item.href);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setMobileMenuOpen(false)}
                      className={`flex items-center gap-3 px-4 py-3.5 rounded-xl transition-all text-base font-medium ${
                        isActive ? "bg-[#c0392b] text-white" : "text-gray-300 hover:bg-white/10"
                      }`}
                    >
                      <item.icon size={20} />
                      {item.label}
                    </Link>
                  );
                })}
                {isAdmin(user?.roles) && (
                  <>
                    <div className="pt-3 pb-1 px-3">
                      <p className="text-xs text-gray-500 uppercase tracking-wider">Yönetim</p>
                    </div>
                    {adminItems.map((item) => {
                      const isActive = pathname === item.href;
                      return (
                        <Link
                          key={item.href}
                          href={item.href}
                          onClick={() => setMobileMenuOpen(false)}
                          className={`flex items-center gap-3 px-4 py-3.5 rounded-xl transition-all text-base font-medium ${
                            isActive ? "bg-[#c0392b] text-white" : "text-gray-300 hover:bg-white/10"
                          }`}
                        >
                          <item.icon size={20} />
                          {item.label}
                        </Link>
                      );
                    })}
                  </>
                )}
                {/* StudyAnka (mobile) */}
                {user?.studyankaAccess && (
                  <Link
                    href="/dashboard/studyanka"
                    onClick={() => setMobileMenuOpen(false)}
                    className={`flex items-center gap-3 px-4 py-3.5 rounded-xl transition-all text-base font-medium ${
                      pathname === "/dashboard/studyanka"
                        ? "bg-amber-600 text-white"
                        : "text-amber-400 hover:bg-white/10"
                    }`}
                  >
                    <Coffee size={20} />
                    StudyAnka
                  </Link>
                )}
                {/* YurtAnka Cebeci (mobile) - sadece SUPER_ADMIN */}
                {hasRole(user?.roles, "SUPER_ADMIN") && (
                  <Link
                    href="/dashboard/yurtanka-cebeci"
                    onClick={() => setMobileMenuOpen(false)}
                    className={`flex items-center gap-3 px-4 py-3.5 rounded-xl transition-all text-base font-medium ${
                      pathname === "/dashboard/yurtanka-cebeci"
                        ? "bg-emerald-600 text-white"
                        : "text-emerald-400 hover:bg-white/10"
                    }`}
                  >
                    <GraduationCap size={20} />
                    YurtAnka Cebeci
                  </Link>
                )}
                {/* Mobile user info + logout */}
                <div className="pt-3 border-t border-white/10 mt-2">
                  <div className="flex items-center gap-3 px-3 py-2">
                    <div className="w-8 h-8 bg-[#c0392b] rounded-full flex items-center justify-center text-xs font-bold">
                      {user?.firstName?.[0]}{user?.lastName?.[0]}
                    </div>
                    <div>
                      <p className="text-sm font-medium">{user?.firstName} {user?.lastName}</p>
                      <p className="text-xs text-gray-400">{ROLE_LABELS[user?.role || ""] || user?.role}</p>
                    </div>
                  </div>
                  <button
                    onClick={handleLogout}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-gray-300 hover:bg-white/10 text-sm w-full"
                  >
                    <LogOut size={20} />
                    Çıkış Yap
                  </button>
                </div>
              </nav>
            </div>
          )}
        </header>

        {/* Page Content */}
        <main className={pathname?.startsWith("/dashboard/sohbet")
          ? `${isTablet ? "h-[calc(100dvh-4rem)]" : "h-[calc(100dvh-3.5rem)]"} overflow-hidden`
          : `p-4 md:p-6 lg:p-8 ${isTablet ? "!p-2" : ""}`}>{children}</main>
      </div>
      )}
      </PinGate>
      {incomingCall && (
        <IncomingCallModal
          call={incomingCall}
          onAccept={() => {
            const c = incomingCall;
            socket?.emit("call:accept", { conversationId: c.conversationId });
            setIncomingCall(null);
            router.push(
              `/dashboard/arama/${c.conversationId}?video=${c.type === "video" ? "1" : "0"}`
            );
          }}
          onReject={() => {
            socket?.emit("call:reject", {
              conversationId: incomingCall.conversationId,
              toUserId: incomingCall.fromUserId,
            });
            setIncomingCall(null);
          }}
        />
      )}
      </SidebarContext.Provider>
      </TabletContext.Provider>
    </UserContext.Provider>
  );
}
