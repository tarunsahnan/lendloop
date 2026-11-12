"use client";

import { usePaginatedQuery } from "convex/react";
import { useState } from "react";
import { RequestDialog, type RequestableTool } from "@/components/RequestDialog";
import { useToast } from "@/components/Toast";
import { ToolCard } from "@/components/ToolCard";
import { Button, EmptyState, LoadingCards, PageHeader } from "@/components/ui";
import { api } from "@/convex/_generated/api";
import type { Category } from "@/convex/lib/constants";
import { availabilityOf, CATEGORIES, CATEGORY_LABELS } from "@/lib/display";

const PAGE_SIZE = 12;

export default function ToolsPage() {
  const [category, setCategory] = useState<Category | undefined>(undefined);
  const [requesting, setRequesting] = useState<RequestableTool | null>(null);
  const showToast = useToast();
  const { results, status, loadMore } = usePaginatedQuery(
    api.tools.listForMembers,
    { category },
    { initialNumItems: PAGE_SIZE },
  );

  const filters: { value: Category | undefined; label: string }[] = [
    { value: undefined, label: "All" },
    ...CATEGORIES.map((value) => ({ value, label: CATEGORY_LABELS[value] })),
  ];

  return (
    <>
      <PageHeader
        title="Tools"
        subtitle="Everything your neighbors are willing to lend."
      />

      <div role="group" aria-label="Filter by category" className="mb-6 flex flex-wrap gap-1.5">
        {filters.map(({ value, label }) => (
          <button
            key={label}
            type="button"
            aria-pressed={category === value}
            onClick={() => setCategory(value)}
            className={`rounded-full border px-3 py-1 text-sm transition-colors ${
              category === value
                ? "border-moss bg-moss text-card"
                : "border-line bg-card text-ink-soft hover:text-ink"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {status === "LoadingFirstPage" ? (
        <LoadingCards />
      ) : results.length === 0 ? (
        <EmptyState
          title={category ? `Nothing in ${CATEGORY_LABELS[category]} yet` : "No tools listed yet"}
          hint="When a neighbor lists something it will show up here."
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {results.map((tool) => {
            const { canRequest } = availabilityOf(tool.activeLoan);
            return (
              <ToolCard
                key={tool._id}
                tool={tool}
                footer={
                  tool.isMine ? (
                    <span className="py-2 text-sm text-ink-soft">Your listing</span>
                  ) : (
                    <Button
                      variant="secondary"
                      disabled={!canRequest}
                      onClick={() => setRequesting(tool)}
                    >
                      Request to borrow
                    </Button>
                  )
                }
              />
            );
          })}
        </div>
      )}

      {status === "CanLoadMore" && (
        <div className="mt-6 text-center">
          <Button variant="secondary" onClick={() => loadMore(PAGE_SIZE)}>
            Show more
          </Button>
        </div>
      )}

      <RequestDialog
        tool={requesting}
        onClose={() => setRequesting(null)}
        onSent={() => {
          setRequesting(null);
          showToast("Request sent. The lender has been notified.");
        }}
      />
    </>
  );
}
