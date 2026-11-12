"use client";

import { UserButton } from "@clerk/nextjs";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Logo } from "@/components/Logo";
import { LoadingCards } from "@/components/ui";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

type CurrentUser = {
  _id: Id<"users">;
  displayName: string;
  role: "admin" | "user";
  isTrustedLender: boolean;
};

const CurrentUserContext = createContext<CurrentUser | null>(null);

export function useCurrentUser(): CurrentUser {
  const user = useContext(CurrentUserContext);
  if (!user) throw new Error("useCurrentUser must be used inside AppShell");
  return user;
}

const LINKS = [
  { href: "/tools", label: "Tools" },
  { href: "/listings", label: "My listings" },
  { href: "/requests", label: "My requests" },
  { href: "/incoming", label: "Incoming requests" },
];

function NavLink({
  href,
  label,
  count,
}: {
  href: string;
  label: string;
  count?: number;
}) {
  const active = usePathname().startsWith(href);
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
        active ? "bg-moss-soft text-moss-deep" : "text-ink-soft hover:text-ink"
      }`}
    >
      {label}
      {count ? (
        <span className="ml-1.5 rounded-full bg-amber-soft px-1.5 py-0.5 font-mono text-[11px] text-amber">
          {count}
        </span>
      ) : null}
    </Link>
  );
}

function Nav({ user }: { user: CurrentUser }) {
  const incoming = useQuery(api.loans.incoming);
  const waiting = incoming?.filter((loan) => loan.status === "requested").length;
  const navRef = useRef<HTMLElement>(null);
  const pathname = usePathname();

  // On narrow screens the tabs scroll sideways, so bring the current one into view.
  // The waiting badge widens its tab once it loads, so that is a dependency too.
  useEffect(() => {
    navRef.current
      ?.querySelector('[aria-current="page"]')
      ?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [pathname, waiting]);

  return (
    <header className="border-b border-line bg-card">
      <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4 px-5 py-3 sm:px-8">
        <Link href="/" aria-label="LendLoop home">
          <Logo />
        </Link>
        <UserButton />
      </div>
      <nav
        ref={navRef}
        aria-label="Main"
        className="mx-auto flex w-full max-w-5xl gap-1 overflow-x-auto px-3 pb-2 sm:px-6"
      >
        {LINKS.map((link) => (
          <NavLink
            key={link.href}
            {...link}
            count={link.href === "/incoming" ? waiting : undefined}
          />
        ))}
        {user.role === "admin" && <NavLink href="/admin" label="Admin" />}
      </nav>
    </header>
  );
}

/** Member queries throw until the user row exists, so nothing below renders before ensureUser resolves. */
export function AppShell({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useConvexAuth();
  const ensureUser = useMutation(api.users.ensureUser);
  const [created, setCreated] = useState<CurrentUser | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!isAuthenticated) return;
    let active = true;
    ensureUser()
      .then((user) => {
        if (active) setCreated(user);
      })
      .catch(() => {
        if (active) setFailed(true);
      });
    return () => {
      active = false;
    };
  }, [isAuthenticated, ensureUser]);

  const live = useQuery(api.users.me, created ? {} : "skip");
  const user = live ?? created;

  if (failed) {
    return (
      <main className="mx-auto w-full max-w-md flex-1 px-6 py-24 text-center">
        <h1 className="font-display text-2xl font-semibold">
          We couldn&rsquo;t load your account
        </h1>
        <p className="mt-2 text-ink-soft">Please refresh the page to try again.</p>
      </main>
    );
  }

  if (!user) {
    return (
      <main className="mx-auto w-full max-w-5xl flex-1 px-5 py-10 sm:px-8">
        <LoadingCards />
      </main>
    );
  }

  return (
    <CurrentUserContext.Provider value={user}>
      <Nav user={user} />
      <main className="mx-auto w-full max-w-5xl flex-1 px-5 py-8 sm:px-8">
        {children}
      </main>
    </CurrentUserContext.Provider>
  );
}
