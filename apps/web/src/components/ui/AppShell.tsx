"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Workflow, PlayCircle, BookOpen, type LucideIcon } from "lucide-react";

interface NavItem {
  href: string;
  Icon: LucideIcon;
  label: string;
}

const NAV: NavItem[] = [
  { href: "/canvas", Icon: Workflow,   label: "Canvas" },
  { href: "/runs",   Icon: PlayCircle, label: "Runs" },
  { href: "/vault",  Icon: BookOpen,   label: "Vault" },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="flex h-screen overflow-hidden bg-[#080d18] text-[#e2e8f4]">
      {/* Left rail */}
      <nav className="flex w-11 flex-col items-center gap-1 border-r border-[#131c30] bg-[#080d18] py-3 shrink-0">
        {/* App mark */}
        <div className="mb-2 flex h-7 w-7 items-center justify-center rounded-md bg-blue-600/20 border border-blue-600/30">
          <Workflow size={13} className="text-blue-400" strokeWidth={2} />
        </div>

        <div className="flex flex-col gap-0.5 w-full px-1">
          {NAV.map(({ href, Icon, label }) => {
            const active = pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                title={label}
                className={[
                  "relative flex h-8 w-full items-center justify-center rounded-md transition-colors",
                  active
                    ? "bg-[#141c2e] text-[#e2e8f4]"
                    : "text-[#3d5070] hover:bg-[#141c2e]/70 hover:text-[#7d92ad]",
                ].join(" ")}
              >
                {active && (
                  <span className="absolute left-0 top-1/2 -translate-y-1/2 h-4 w-0.5 rounded-r-full bg-blue-500" />
                )}
                <Icon size={15} strokeWidth={active ? 2.2 : 1.8} />
              </Link>
            );
          })}
        </div>
      </nav>

      {/* Main */}
      <div className="flex flex-1 flex-col overflow-hidden">{children}</div>
    </div>
  );
}
