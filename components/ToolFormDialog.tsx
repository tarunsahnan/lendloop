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
import { LIMITS, type Category, type Condition } from "@/convex/lib/constants";
import {
  CATEGORIES,
  CATEGORY_LABELS,
  CONDITION_LABELS,
  CONDITIONS,
} from "@/lib/display";
import { errorMessage } from "@/lib/errors";

export type EditableTool = {
  _id: Id<"tools">;
  name: string;
  category: Category;
  condition: Condition;
  description: string;
};

function ToolForm({
  tool,
  onDone,
}: {
  tool?: EditableTool;
  onDone: () => void;
}) {
  const create = useMutation(api.tools.create);
  const update = useMutation(api.tools.update);
  const [name, setName] = useState(tool?.name ?? "");
  const [category, setCategory] = useState<Category>(tool?.category ?? "power_tools");
  const [condition, setCondition] = useState<Condition>(tool?.condition ?? "good");
  const [description, setDescription] = useState(tool?.description ?? "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    // The browser accepts a name of only spaces, which the server then rejects.
    if (name.trim().length < LIMITS.nameMin) {
      setError(`Give the tool a name of at least ${LIMITS.nameMin} characters.`);
      return;
    }
    if (description.trim().length < LIMITS.descriptionMin) {
      setError("Add a short description.");
      return;
    }
    setBusy(true);
    setError(null);
    const fields = { name, category, condition, description };
    try {
      if (tool) {
        await update({ toolId: tool._id, ...fields });
      } else {
        await create(fields);
      }
      onDone();
    } catch (caught) {
      setError(errorMessage(caught));
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="grid gap-4">
      <Field label="Name">
        {(id) => (
          <input
            id={id}
            required
            minLength={LIMITS.nameMin}
            maxLength={LIMITS.nameMax}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Cordless drill"
            className={controlClass()}
          />
        )}
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Category">
          {(id) => (
            <select
              id={id}
              value={category}
              onChange={(e) => setCategory(e.target.value as Category)}
              className={controlClass()}
            >
              {CATEGORIES.map((value) => (
                <option key={value} value={value}>
                  {CATEGORY_LABELS[value]}
                </option>
              ))}
            </select>
          )}
        </Field>
        <Field label="Condition">
          {(id) => (
            <select
              id={id}
              value={condition}
              onChange={(e) => setCondition(e.target.value as Condition)}
              className={controlClass()}
            >
              {CONDITIONS.map((value) => (
                <option key={value} value={value}>
                  {CONDITION_LABELS[value]}
                </option>
              ))}
            </select>
          )}
        </Field>
      </div>
      <Field label="Short description" hint="What's included, and anything a borrower should know.">
        {(id) => (
          <textarea
            id={id}
            required
            rows={3}
            maxLength={LIMITS.descriptionMax}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className={controlClass()}
          />
        )}
      </Field>
      <FormError message={error} />
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={busy}>
          {tool ? "Save changes" : "List tool"}
        </Button>
      </div>
    </form>
  );
}

export function ToolFormDialog({
  open,
  tool,
  onClose,
}: {
  open: boolean;
  tool?: EditableTool;
  onClose: () => void;
}) {
  return (
    <Modal open={open} onClose={onClose} title={tool ? "Edit listing" : "List a tool"}>
      <ToolForm key={tool?._id ?? "new"} tool={tool} onDone={onClose} />
    </Modal>
  );
}
