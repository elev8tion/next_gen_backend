"use client";

import { usePathname } from "next/navigation";

const PRIMARY_LINKS = [
  { href: "/", label: "Dashboard" },
  { href: "/modules", label: "Modules" },
  { href: "/composer", label: "Composer" },
  { href: "/workers", label: "Workers" },
];

export function NavLinks() {
  const pathname = usePathname();

  function isActive(href: string) {
    if (href === "/") return pathname === "/";
    return pathname.startsWith(href);
  }

  return (
    <>
      {PRIMARY_LINKS.map((link) => (
        <a
          key={link.href}
          href={link.href}
          className={`transition-colors ${
            isActive(link.href)
              ? "font-medium text-foreground"
              : "text-muted hover:text-foreground"
          }`}
        >
          {link.label}
        </a>
      ))}
      <span className="text-card-border">|</span>
      <a
        href="/setup"
        className={`text-xs transition-colors ${
          isActive("/setup")
            ? "font-medium text-foreground"
            : "text-muted hover:text-foreground"
        }`}
      >
        Setup
      </a>
    </>
  );
}
