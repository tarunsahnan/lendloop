"use client";

import { useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { useState } from "react";
import { LoanCard } from "@/components/LoanCard";
import { useRunner } from "@/components/Toast";
import {
  Button,
  ConfirmDialog,
  EmptyState,
  LoadingCards,
  PageHeader,
} from "@/components/ui";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { isCancelWindowOpen } from "@/convex/lib/loanState";
import { today } from "@/lib/display";

export default function RequestsPage() {
  const loans = useQuery(api.loans.myRequests);
  const cancel = useMutation(api.loans.cancel);
  const run = useRunner();
  const [cancelling, setCancelling] = useState<Id<"loans"> | null>(null);

  return (
    <>
      <PageHeader
        title="My requests"
        subtitle="What you've asked to borrow, and where each request stands."
      />

      {loans === undefined ? (
        <LoadingCards />
      ) : loans.length === 0 ? (
        <EmptyState
          title="You haven't borrowed anything yet"
          hint="Find something useful on the board and send a request."
          action={
            <Link href="/tools" className="font-medium text-moss underline underline-offset-2">
              Browse tools
            </Link>
          }
        />
      ) : (
        <div className="grid gap-3">
          {loans.map((loan) => {
            const canCancel =
              loan.status === "requested" ||
              (loan.status === "approved" &&
                isCancelWindowOpen(loan.startDate, today()));
            return (
              <LoanCard
                key={loan._id}
                loan={loan}
                counterpartLabel="from"
                actions={
                  canCancel ? (
                    <Button variant="secondary" onClick={() => setCancelling(loan._id)}>
                      {loan.status === "requested" ? "Withdraw" : "Cancel loan"}
                    </Button>
                  ) : undefined
                }
              />
            );
          })}
        </div>
      )}

      <ConfirmDialog
        open={cancelling !== null}
        title="Cancel this?"
        body="The lender will be told you no longer need it."
        confirmLabel="Yes, cancel"
        danger
        onClose={() => setCancelling(null)}
        onConfirm={async () => {
          if (!cancelling) return;
          await run(() => cancel({ loanId: cancelling }), "Cancelled.");
          setCancelling(null);
        }}
      />
    </>
  );
}
