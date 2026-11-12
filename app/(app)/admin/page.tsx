"use client";

import { useMutation, usePaginatedQuery, useQuery } from "convex/react";
import { useState, type ReactNode } from "react";
import { useCurrentUser } from "@/components/AppShell";
import { useRunner } from "@/components/Toast";
import {
  Badge,
  Button,
  ConfirmDialog,
  EmptyState,
  LoadingCards,
  PageHeader,
} from "@/components/ui";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import {
  CATEGORY_LABELS,
  describeActivity,
  formatRange,
  loanBadge,
  timeAgo,
} from "@/lib/display";

const PAGE_SIZE = 15;

function Section({
  title,
  hint,
  children,
}: {
  title: string;
  hint: string;
  children: ReactNode;
}) {
  return (
    <section className="mb-10">
      <h2 className="text-xl font-bold">{title}</h2>
      <p className="mb-3 text-sm text-ink-soft">{hint}</p>
      {children}
    </section>
  );
}

function Table({ head, children }: { head: string[]; children: ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-line bg-card">
      <table className="w-full min-w-[34rem] text-left text-sm">
        <thead className="bg-paper">
          <tr className="border-b border-line">
            {head.map((label) => (
              <th
                key={label}
                scope="col"
                className="px-4 py-2.5 text-xs font-semibold text-ink-soft"
              >
                {label || <span className="sr-only">Actions</span>}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">{children}</tbody>
      </table>
    </div>
  );
}

// One line per row; the table scrolls sideways inside its frame on narrow screens.
const cell = "whitespace-nowrap px-4 py-2.5 align-middle";

function MoreButton({ status, onMore }: { status: string; onMore: () => void }) {
  if (status !== "CanLoadMore") return null;
  return (
    <div className="mt-3 text-center">
      <Button variant="secondary" onClick={onMore}>
        Show more
      </Button>
    </div>
  );
}

function AutomationFailures() {
  const rows = useQuery(api.admin.automationFailures);
  const redeliver = useMutation(api.admin.redeliver);
  const run = useRunner();

  if (rows === undefined) return <LoadingCards count={1} />;
  if (rows.length === 0) {
    return (
      <EmptyState
        title="All clear"
        hint="Failed notifications and workflow runs will appear here."
      />
    );
  }

  return (
    <Table head={["What failed", "Detail", "When", ""]}>
      {rows.map((row) => (
        <tr key={row._id}>
          <td className={cell}>
            {row.kind === "workflow_failure"
              ? row.workflowName
              : row.kind === "overdue_reminder"
                ? "Overdue reminder"
                : row.type?.replace("loan.", "Loan ")}
          </td>
          <td className={`${cell} font-mono text-xs text-ink-soft`}>
            {row.failedNode ?? row.lastErrorCode ?? "Unknown"}
          </td>
          <td className={`${cell} text-ink-soft`}>{timeAgo(row.updatedAt)}</td>
          <td className={`${cell} text-right`}>
            {row.kind === "loan_event" && (
              <Button
                variant="secondary"
                onClick={() =>
                  run(() => redeliver({ notificationId: row._id }), "Queued for redelivery.")
                }
              >
                Redeliver
              </Button>
            )}
          </td>
        </tr>
      ))}
    </Table>
  );
}

function AllLoans() {
  const { results, status, loadMore } = usePaginatedQuery(
    api.admin.allLoans,
    {},
    { initialNumItems: PAGE_SIZE },
  );

  if (status === "LoadingFirstPage") return <LoadingCards count={1} />;
  if (results.length === 0) {
    return <EmptyState title="No loans yet" hint="Every loan on the board will be listed here." />;
  }

  return (
    <>
      <Table head={["Tool", "Lender", "Borrower", "Dates", "Status", "Latest automation"]}>
        {results.map((loan) => {
          const badge = loanBadge(loan);
          const latest = loan.activity[0] ? describeActivity(loan.activity[0]) : null;
          return (
            <tr key={loan._id}>
              <td className={`${cell} font-medium`}>{loan.toolName}</td>
              <td className={cell}>{loan.lenderName}</td>
              <td className={cell}>{loan.borrowerName}</td>
              <td className={`${cell} whitespace-nowrap tabular-nums`}>
                {formatRange(loan.startDate, loan.endDate)}
              </td>
              <td className={cell}>
                <Badge tone={badge.tone}>{badge.label}</Badge>
              </td>
              <td className={`${cell} text-xs ${latest?.isProblem ? "text-rust" : "text-ink-soft"}`}>
                {latest?.text}
              </td>
            </tr>
          );
        })}
      </Table>
      <MoreButton status={status} onMore={() => loadMore(PAGE_SIZE)} />
    </>
  );
}

function AllListings() {
  const { results, status, loadMore } = usePaginatedQuery(
    api.admin.allListings,
    {},
    { initialNumItems: PAGE_SIZE },
  );
  const removeListing = useMutation(api.admin.removeListing);
  const run = useRunner();
  const [removing, setRemoving] = useState<{ id: Id<"tools">; name: string } | null>(null);

  if (status === "LoadingFirstPage") return <LoadingCards count={1} />;
  if (results.length === 0) {
    return <EmptyState title="No listings yet" hint="Listings from every neighbor appear here." />;
  }

  return (
    <>
      <Table head={["Listing", "Category", "Owner", ""]}>
        {results.map((tool) => (
          <tr key={tool._id}>
            <td className={`${cell} font-medium`}>{tool.name}</td>
            <td className={`${cell} text-ink-soft`}>{CATEGORY_LABELS[tool.category]}</td>
            <td className={cell}>{tool.ownerName}</td>
            <td className={`${cell} text-right`}>
              {tool.removedAt !== undefined ? (
                <Badge tone="neutral">Removed</Badge>
              ) : (
                <Button
                  variant="ghost"
                  onClick={() => setRemoving({ id: tool._id, name: tool.name })}
                >
                  Remove
                </Button>
              )}
            </td>
          </tr>
        ))}
      </Table>
      <MoreButton status={status} onMore={() => loadMore(PAGE_SIZE)} />
      <ConfirmDialog
        open={removing !== null}
        title={`Remove ${removing?.name ?? "listing"}?`}
        body="Open requests and loans that haven't started will be cancelled. A loan already under way continues until it's returned."
        confirmLabel="Remove listing"
        danger
        onClose={() => setRemoving(null)}
        onConfirm={async () => {
          if (!removing) return;
          await run(() => removeListing({ toolId: removing.id }), "Listing removed.");
          setRemoving(null);
        }}
      />
    </>
  );
}

function Neighbors() {
  const users = useQuery(api.admin.allUsers);
  const setTrusted = useMutation(api.admin.setTrustedLender);
  const run = useRunner();

  if (users === undefined) return <LoadingCards count={1} />;

  return (
    <Table head={["Neighbor", "Role", "Trusted Lender"]}>
      {users.map((user) => (
        <tr key={user._id}>
          <td className={`${cell} font-medium`}>{user.displayName}</td>
          <td className={`${cell} text-ink-soft`}>{user.role === "admin" ? "Admin" : "Member"}</td>
          <td className={cell}>
            <label className="inline-flex items-center gap-2">
              <input
                type="checkbox"
                checked={user.isTrustedLender}
                aria-label={`Mark ${user.displayName} as a Trusted Lender`}
                onChange={(e) =>
                  run(() => setTrusted({ userId: user._id, trusted: e.target.checked }))
                }
                className="h-4 w-4 accent-[var(--color-ink)]"
              />
              <span className="text-ink-soft">{user.isTrustedLender ? "Trusted" : "Not yet"}</span>
            </label>
          </td>
        </tr>
      ))}
    </Table>
  );
}

export default function AdminPage() {
  const user = useCurrentUser();

  if (user.role !== "admin") {
    return (
      <EmptyState title="Admins only" hint="You don't have access to this page." />
    );
  }

  return (
    <>
      <PageHeader title="Admin" subtitle="Keep the board healthy." />
      <Section title="Automation failures" hint="Anything that could not be delivered, and any workflow run that failed.">
        <AutomationFailures />
      </Section>
      <Section title="All loans" hint="Every loan, with its latest automation activity.">
        <AllLoans />
      </Section>
      <Section title="All listings" hint="Remove anything that doesn't belong on the board.">
        <AllListings />
      </Section>
      <Section title="Neighbors" hint="Trusted Lenders get a badge on their listings.">
        <Neighbors />
      </Section>
    </>
  );
}
