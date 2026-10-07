"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  House,
  Megaphone,
  ListTodo,
  CalendarDays,
  Layers,
  Wallet,
  Users,
  Settings2,
  Menu,
  X,
  LogOut,
  ArrowUpRight,
} from "lucide-react";
import { Brand } from "./brand";
import { signOut } from "@/features/identity/actions";
import type { Member } from "@/features/identity/policy";
const navigation = [
  { label: "Home", href: "/home", icon: House, ready: true },
  {
    label: "Announcements",
    href: "/announcements",
    icon: Megaphone,
    ready: true,
  },
  { label: "To-Dos", href: "/todos", icon: ListTodo, ready: true },
  {
    label: "Practice Calendar",
    href: "/calendar",
    icon: CalendarDays,
    ready: true,
  },
  { label: "Set Design", href: "/segments", icon: Layers, ready: true },
  { label: "Payments", href: "/payments", icon: Wallet, ready: true },
  { label: "Roster", href: "/roster", icon: Users, ready: true },
];
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
  const trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (open) dialog.current?.showModal();
    else dialog.current?.close();
  }, [open]);
  function close() {
    setOpen(false);
    trigger.current?.focus();
  }
  const links = (
    <>
      <p className="nav-label">TEAM SPACE</p>
      <nav aria-label="Main navigation">
        {navigation.map(({ label, href, icon: Icon, ready }) =>
          ready ? (
            <Link
              key={href}
              href={href}
              className={`nav-item ${path === href ? "selected" : ""}`}
              aria-current={path === href ? "page" : undefined}
              onClick={close}
            >
              <Icon size={19} />
              {label}
              {path === href && <span className="nav-dot" />}
            </Link>
          ) : (
            <span
              key={href}
              className="nav-item unavailable"
              aria-disabled="true"
              title="Not available yet"
            >
              <Icon size={19} />
              {label}
            </span>
          ),
        )}
        {member.is_admin && (
          <>
            <p className="nav-label admin-label">MANAGEMENT</p>
            <Link
              href="/admin"
              className={`nav-item ${path === "/admin" ? "selected" : ""}`}
              onClick={close}
              aria-current={path === "/admin" ? "page" : undefined}
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
        <div className="sidebar-bottom">
          <div className="team-note">
            <span>IN STEP. TOGETHER.</span>
            <ArrowUpRight size={18} />
          </div>
          {account}
        </div>
      </aside>
      <header className="mobile-header">
        <Brand compact />
        <button
          className="icon-button"
          ref={trigger}
          onClick={() => setOpen(true)}
          aria-label="Open navigation"
          aria-expanded={open}
        >
          <Menu />
        </button>
      </header>
      <dialog
        ref={dialog}
        className="nav-dialog"
        onCancel={close}
        onClick={(e) => {
          if (e.target === e.currentTarget) close();
        }}
      >
        <div className="drawer-header">
          <Brand compact />
          <button
            className="icon-button"
            onClick={close}
            aria-label="Close navigation"
          >
            <X />
          </button>
        </div>
        {links}
        {account}
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
        {children}
      </main>
    </div>
  );
}
