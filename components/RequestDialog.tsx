"use client";

import { useMutation } from "convex/react";
import { useState, type FormEvent } from "react";
import {
  Button,
  controlClass,
  Field,
  FormError,
  Modal,
} from "@/components/ui";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { addDays } from "@/convex/lib/dates";
import { LIMITS } from "@/convex/lib/constants";
import { formatRange, localToday } from "@/lib/display";
import { errorMessage } from "@/lib/errors";

export type RequestableTool = {
  _id: Id<"tools">;
  name: string;
  activeLoan?: { startDate: string; endDate: string };
};

const DEFAULT_LENGTH_DAYS = 3;

/** Starts the suggestion after the current booking when the default dates would collide with it. */
function suggestedStart(tool: RequestableTool, firstDay: string): string {
  const loan = tool.activeLoan;
  const defaultEnd = addDays(firstDay, DEFAULT_LENGTH_DAYS - 1);
  if (loan && loan.startDate <= defaultEnd && loan.endDate >= firstDay) {
    return addDays(loan.endDate, 1);
  }
  return firstDay;
}

function RequestForm({
  tool,
  onDone,
  onSent,
}: {
  tool: RequestableTool;
  onDone: () => void;
  onSent: () => void;
}) {
  const request = useMutation(api.loans.request);
  const firstDay = localToday();
  const initialStart = suggestedStart(tool, firstDay);
  const [startDate, setStartDate] = useState(initialStart);
  const [endDate, setEndDate] = useState(
    addDays(initialStart, DEFAULT_LENGTH_DAYS - 1),
  );
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function changeStart(value: string) {
    setStartDate(value);
    if (value && endDate < value) setEndDate(value);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await request({ toolId: tool._id, startDate, endDate });
      onSent();
    } catch (caught) {
      setError(errorMessage(caught));
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="grid gap-4">
      {tool.activeLoan && (
        <p className="rounded-lg bg-amber-soft px-3 py-2 text-sm text-amber">
          Already booked {formatRange(tool.activeLoan.startDate, tool.activeLoan.endDate)}.
          Pick dates outside that window.
        </p>
      )}
      <div className="grid grid-cols-2 gap-3">
        <Field label="From">
          {(id) => (
            <input
              id={id}
              type="date"
              required
              min={firstDay}
              value={startDate}
              onChange={(e) => changeStart(e.target.value)}
              className={controlClass()}
            />
          )}
        </Field>
        <Field label="Until">
          {(id) => (
            <input
              id={id}
              type="date"
              required
              min={startDate}
              max={startDate ? addDays(startDate, LIMITS.loanMaxDays - 1) : undefined}
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className={controlClass()}
            />
          )}
        </Field>
      </div>
      <FormError message={error} />
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={busy}>
          Send request
        </Button>
      </div>
    </form>
  );
}

export function RequestDialog({
  tool,
  onClose,
  onSent,
}: {
  tool: RequestableTool | null;
  onClose: () => void;
  onSent: () => void;
}) {
  return (
    <Modal
      open={tool !== null}
      onClose={onClose}
      title={tool ? `Borrow the ${tool.name}` : "Borrow"}
    >
      {tool && (
        <RequestForm key={tool._id} tool={tool} onDone={onClose} onSent={onSent} />
      )}
    </Modal>
  );
}
