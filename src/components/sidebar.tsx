"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  FolderKanban,
  Send,
  MessageCircle,
  Settings,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ProjectSwitcher } from "@/components/project-switcher";

const NAV_ITEMS = [
  { label: "Dashboard", href: "/", icon: LayoutDashboard },
  { label: "Projects", href: "/projects", icon: FolderKanban },
  { label: "Outreach", href: "/outreach", icon: Send },
  { label: "Lead Expert", href: "/assistant", icon: MessageCircle },
  { label: "Settings", href: "/settings", icon: Settings },
] as const;

export function Sidebar() {
  const pathname = usePathname();

  function isActive(href: string): boolean {
    if (href === "/") return pathname === "/";
    return pathname === href || pathname.startsWith(href + "/");
  }

  return (
    <aside className="flex h-screen w-64 flex-shrink-0 flex-col bg-[#111111] border-r border-white/[0.06]">
      <div className="flex h-14 items-center px-5 border-b border-white/[0.06]">
        <span className="text-[15px] font-semibold tracking-tight text-white">
          LeadFlow
        </span>
      </div>

      <nav className="flex flex-col gap-0.5 px-2 pt-3 flex-1">
        {NAV_ITEMS.map(({ label, href, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className={cn(
              "group flex items-center gap-2.5 rounded-md px-3 py-2 text-[13.5px] font-medium transition-colors",
              isActive(href)
                ? "bg-white/10 text-white"
                : "text-white/50 hover:bg-white/5 hover:text-white/80"
            )}
          >
            <Icon
              className={cn(
                "size-4 shrink-0 transition-colors",
                isActive(href)
                  ? "text-white"
                  : "text-white/40 group-hover:text-white/70"
              )}
            />
            {label}
          </Link>
        ))}
      </nav>

      <div className="border-t border-white/[0.06] p-2">
        <ProjectSwitcher />
      </div>
    </aside>
  );
}
