"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useChannel } from "@/lib/client";
import { isAdChannel } from "@/lib/channel";
import { ChannelSwitcher } from "./channel-switcher";
import { cn } from "./ui";

const LINKS = [
  { href: "/", label: "Videos" },
  { href: "/ideas", label: "Ideas" },
  { href: "/channel", label: "Channel" },
  { href: "/settings", label: "Settings" },
];

export function TopNav() {
  const path = usePathname();
  const { data } = useChannel();
  const keys = data?.keys;
  // Product-ad channels start from a product brief, not from ideas.
  const ad = data ? isAdChannel(data.channel.profile) : false;
  const links = ad
    ? LINKS.flatMap((l) => (l.href === "/ideas" ? [{ href: "/products", label: "Products" }, { href: "/ads/new", label: "New ad" }] : [l]))
    : LINKS;
  const missing = keys && !keys.dryRun ? (["anthropic", "elevenlabs", "openai"] as const).filter((k) => !keys[k]) : [];

  return (
    <header className="sticky top-0 z-30 border-b border-stone-200 bg-background/90 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-[1400px] items-center gap-4 px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2">
          <span className="grid size-8 place-items-center rounded-full bg-white ring-2 ring-stone-900">
            <span className="block h-2 w-4 rounded-t-full bg-brand" />
          </span>
          <span className="font-marker text-lg tracking-wide">Doodle Studio</span>
        </Link>
        <ChannelSwitcher />
        <nav className="flex items-center gap-1">
          {links.map((l) => {
            const active = l.href === "/" ? path === "/" || path.startsWith("/projects") : path === l.href || (path.startsWith(l.href + "/") && !path.startsWith("/channel/new"));
            return (
              <Link
                key={l.href}
                href={l.href}
                className={cn(
                  "rounded-md px-3 py-1.5 text-sm font-medium",
                  active ? "bg-stone-900 text-white" : "text-stone-600 hover:bg-stone-200/60 hover:text-stone-900",
                )}
              >
                {l.label}
              </Link>
            );
          })}
        </nav>
        <div className="ml-auto flex items-center gap-2 text-xs">
          {keys?.dryRun ? (
            <Link
              href="/settings"
              className="rounded-full bg-amber-100 px-2.5 py-1 font-medium text-amber-900 hover:bg-amber-200"
              title="Placeholder text, audio and images. No API calls, no cost. Click to change."
            >
              Dry run
            </Link>
          ) : null}
          {missing.length ? (
            <Link
              href="/settings"
              className="rounded-full bg-red-50 px-2.5 py-1 font-medium text-red-700 ring-1 ring-red-200 hover:bg-red-100"
              title="Add the missing keys in Settings"
            >
              Missing key: {missing.join(", ")}
            </Link>
          ) : null}
        </div>
      </div>
    </header>
  );
}
