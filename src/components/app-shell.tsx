"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type MouseEvent } from "react";
import {
  House,
  Megaphone,
  ListTodo,
  CalendarDays,
  Layers,
  Film,
  Wallet,
  Users,
  Settings2,
  Menu,
  Ellipsis,
  X,
  LogOut,
} from "lucide-react";
import { Brand } from "./brand";
import { signOut } from "@/features/identity/actions";
import type { Member } from "@/features/identity/policy";
const navigation = [
  { label: "Home", href: "/home", icon: House },
  {
    label: "Announcements",
    href: "/announcements",
    icon: Megaphone,
  },
  { label: "To-Dos", href: "/todos", icon: ListTodo },
  {
    label: "Practice Calendar",
    href: "/calendar",
    icon: CalendarDays,
  },
  { label: "Set Design", href: "/segments", icon: Layers },
  { label: "Choreo", href: "/choreo", icon: Film },
  { label: "Payments", href: "/payments", icon: Wallet },
  { label: "Roster", href: "/roster", icon: Users },
];
const mobileNavigation = [
  { label: "Home", href: "/home", icon: House },
  { label: "To-Dos", href: "/todos", icon: ListTodo },
  { label: "Calendar", href: "/calendar", icon: CalendarDays },
  { label: "Updates", href: "/announcements", icon: Megaphone },
];
const isCurrent = (path: string, href: string) =>
  path === href || path.startsWith(`${href}/`);
export function AppShell({
  member,
  children,
}: {
  member: Member;
  children: React.ReactNode;
}) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const opener = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    if (open) dialog.current?.showModal();
    else dialog.current?.close();
  }, [open]);
  useEffect(() => {
    const desktop = window.matchMedia("(min-width: 761px)");
    const onResize = () => {
      if (desktop.matches) setOpen(false);
    };
    desktop.addEventListener("change", onResize);
    return () => desktop.removeEventListener("change", onResize);
  }, []);
  function openNavigation(event: MouseEvent<HTMLButtonElement>) {
    opener.current = event.currentTarget;
    setOpen(true);
  }
  function close() {
    dialog.current?.close();
    setOpen(false);
    opener.current?.focus();
  }
  const links = (
    <>
      <p className="nav-label">TEAM SPACE</p>
      <nav aria-label="Main navigation">
        {navigation.map(({ label, href, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className={`nav-item ${isCurrent(path, href) ? "selected" : ""}`}
            aria-current={isCurrent(path, href) ? "page" : undefined}
            onNavigate={close}
          >
            <Icon size={19} />
            {label}
            {isCurrent(path, href) && <span className="nav-dot" />}
          </Link>
        ))}
        {member.is_admin && (
          <>
            <p className="nav-label admin-label">MANAGEMENT</p>
            <Link
              href="/admin"
              className={`nav-item ${isCurrent(path, "/admin") ? "selected" : ""}`}
              onNavigate={close}
              aria-current={isCurrent(path, "/admin") ? "page" : undefined}
            >
              <Settings2 size={19} />
              Admin
            </Link>
          </>
        )}
      </nav>
    </>
  );
  const account = (
    <div className="account">
      <span className="account-initial" aria-hidden="true">
        {member.display_name?.slice(0, 1)}
      </span>
      <div className="account-copy">
        <strong>{member.display_name}</strong>
        <small>{member.is_admin ? "Dancer · Admin access" : "Dancer"}</small>
      </div>
      <form action={signOut}>
        <button className="icon-button" aria-label="Sign out">
          <LogOut size={18} />
        </button>
      </form>
    </div>
  );
  return (
    <div className="app">
      <aside className="sidebar">
        <Brand />
        {links}
        <div className="sidebar-bottom">{account}</div>
      </aside>
      <header className="mobile-header">
        <Brand compact />
        <button
          className="icon-button"
          onClick={openNavigation}
          aria-label="Open navigation"
          aria-expanded={open}
          aria-controls="team-navigation"
          aria-haspopup="dialog"
        >
          <Menu />
        </button>
      </header>
      <dialog
        ref={dialog}
        id="team-navigation"
        aria-label="Team navigation"
        className="nav-dialog"
        onCancel={(event) => {
          event.preventDefault();
          close();
        }}
        onClick={(e) => {
          if (e.target === e.currentTarget) close();
        }}
      >
        <div className="drawer-header">
          <Brand compact onNavigate={close} />
          <button
            className="icon-button"
            onClick={close}
            aria-label="Close navigation"
          >
            <X />
          </button>
        </div>
        <div className="drawer-links">{links}</div>
        <div className="drawer-account">{account}</div>
      </dialog>
      <main id="main" className="main-content">
        <div className="topbar">
          <span>
            TEAM HUB <span className="slash">/</span>{" "}
            {navigation.find(
              (item) => path === item.href || path.startsWith(`${item.href}/`),
            )?.label ?? "Admin"}
          </span>
          <span className="badge">Texas A&M University</span>
        </div>
        <div className="page-content">{children}</div>
      </main>
      <nav className="mobile-tabs" aria-label="Quick navigation">
        {mobileNavigation.map(({ label, href, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className={`mobile-tab ${isCurrent(path, href) ? "selected" : ""}`}
            aria-current={isCurrent(path, href) ? "page" : undefined}
          >
            <Icon size={21} aria-hidden="true" />
            <span>{label}</span>
          </Link>
        ))}
        <button
          type="button"
          className={`mobile-tab ${!mobileNavigation.some((item) => isCurrent(path, item.href)) ? "selected" : ""}`}
          onClick={openNavigation}
          aria-expanded={open}
          aria-controls="team-navigation"
          aria-haspopup="dialog"
          aria-label="More pages"
        >
          <Ellipsis size={21} aria-hidden="true" />
          <span>More</span>
        </button>
      </nav>
    </div>
  );
}
