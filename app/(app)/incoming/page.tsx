"use client";

import { useMutation, useQuery } from "convex/react";
import { useState, type FormEvent } from "react";
import { LoanCard } from "@/components/LoanCard";
import { useRunner } from "@/components/Toast";
import {
  Button,
  ConfirmDialog,
  controlClass,
  EmptyState,
  Field,
  FormError,
  LoadingCards,
  Modal,
  PageHeader,
} from "@/components/ui";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { LIMITS } from "@/convex/lib/constants";
import { isCancelWindowOpen } from "@/convex/lib/loanState";
import { today } from "@/lib/display";
import { errorMessage } from "@/lib/errors";

type LoanId = Id<"loans">;
type Pending = { loanId: LoanId; action: "decline" | "return" | "cancel" };

const CONFIRMATIONS = {
  decline: {
    title: "Decline this request?",
    body: "The borrower will be told you can't lend it this time.",
    label: "Decline",
    done: "Request declined.",
    danger: true,
  },
  return: {
    title: "Mark as returned?",
    body: "This closes the loan, stops reminders and frees up the tool.",
    label: "Mark returned",
    done: "Marked as returned.",
    danger: false,
  },
  cancel: {
    title: "Cancel this loan?",
    body: "The borrower will be told it's off.",
    label: "Cancel loan",
    done: "Loan cancelled.",
    danger: true,
  },
};

function ApproveForm({ loanId, onDone }: { loanId: LoanId; onDone: () => void }) {
  const approve = useMutation(api.loans.approve);
  const [pickupNote, setPickupNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await approve({ loanId, pickupNote });
      onDone();
    } catch (caught) {
      setError(errorMessage(caught));
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="grid gap-4">
      <Field
        label="Pickup note (optional)"
        hint="Only you and the borrower see this, and it's deleted when the loan ends."
      >
        {(id) => (
          <textarea
            id={id}
            rows={3}
            maxLength={LIMITS.pickupNoteMax}
            value={pickupNote}
            onChange={(e) => setPickupNote(e.target.value)}
            placeholder="Side gate, any evening after 6."
            className={controlClass()}
          />
        )}
      </Field>
      <FormError message={error} />
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onDone}>
          Not yet
        </Button>
        <Button type="submit" disabled={busy}>
          Approve
        </Button>
      </div>
    </form>
  );
}

export default function IncomingPage() {
  const loans = useQuery(api.loans.incoming);
  const decline = useMutation(api.loans.decline);
  const markReturned = useMutation(api.loans.markReturned);
  const cancel = useMutation(api.loans.cancel);
  const run = useRunner();
  const [approving, setApproving] = useState<LoanId | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);

  const confirmation = pending ? CONFIRMATIONS[pending.action] : null;
  const mutations = { decline, return: markReturned, cancel };

  const waiting = loans?.filter((loan) => loan.status === "requested") ?? [];
  const others = loans?.filter((loan) => loan.status !== "requested") ?? [];

  return (
    <>
      <PageHeader
        title="Incoming requests"
        subtitle="Requests for your tools, and the loans you have out."
      />

      {loans === undefined ? (
        <LoadingCards />
      ) : loans.length === 0 ? (
        <EmptyState
          title="No requests yet"
          hint="When a neighbor asks to borrow one of your tools, you'll decide here."
        />
      ) : (
        <div className="grid gap-3">
          {[...waiting, ...others].map((loan) => (
            <LoanCard
              key={loan._id}
              loan={loan}
              counterpartLabel="to"
              actions={
                loan.status === "requested" ? (
                  <>
                    <Button
                      variant="secondary"
                      onClick={() => setPending({ loanId: loan._id, action: "decline" })}
                    >
                      Decline
                    </Button>
                    <Button onClick={() => setApproving(loan._id)}>Approve</Button>
                  </>
                ) : loan.status === "approved" ? (
                  <>
                    {isCancelWindowOpen(loan.startDate, today()) && (
                      <Button
                        variant="ghost"
                        onClick={() => setPending({ loanId: loan._id, action: "cancel" })}
                      >
                        Cancel
                      </Button>
                    )}
                    {loan.startDate <= today() && (
                      <Button
                        onClick={() => setPending({ loanId: loan._id, action: "return" })}
                      >
                        Mark returned
                      </Button>
                    )}
                  </>
                ) : undefined
              }
            />
          ))}
        </div>
      )}

      <Modal
        open={approving !== null}
        onClose={() => setApproving(null)}
        title="Approve this request"
      >
        {approving && (
          <ApproveForm key={approving} loanId={approving} onDone={() => setApproving(null)} />
        )}
      </Modal>

      <ConfirmDialog
        open={pending !== null}
        title={confirmation?.title ?? ""}
        body={confirmation?.body ?? ""}
        confirmLabel={confirmation?.label ?? ""}
        danger={confirmation?.danger}
        onClose={() => setPending(null)}
        onConfirm={async () => {
          if (!pending || !confirmation) return;
          await run(() => mutations[pending.action]({ loanId: pending.loanId }), confirmation.done);
          setPending(null);
        }}
      />
    </>
  );
}
