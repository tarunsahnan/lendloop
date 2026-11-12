"use client";

import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { useRunner } from "@/components/Toast";
import { ToolCard } from "@/components/ToolCard";
import { ToolFormDialog, type EditableTool } from "@/components/ToolFormDialog";
import {
  Button,
  ConfirmDialog,
  EmptyState,
  LoadingCards,
  PageHeader,
} from "@/components/ui";
import { api } from "@/convex/_generated/api";

export default function ListingsPage() {
  const tools = useQuery(api.tools.listMine);
  const removeTool = useMutation(api.tools.remove);
  const run = useRunner();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<EditableTool | undefined>(undefined);
  const [deleting, setDeleting] = useState<EditableTool | null>(null);

  const listButton = <Button onClick={() => setCreating(true)}>List a tool</Button>;

  return (
    <>
      <PageHeader
        title="My listings"
        subtitle="What you've offered to lend."
        action={listButton}
      />

      {tools === undefined ? (
        <LoadingCards />
      ) : tools.length === 0 ? (
        <EmptyState
          title="You haven't listed anything yet"
          hint="Got a ladder, a drill or a tent that sits idle? Offer it to the neighbors."
          action={listButton}
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {tools.map((tool) => (
            <ToolCard
              key={tool._id}
              tool={tool}
              footer={
                <>
                  <Button variant="secondary" onClick={() => setEditing(tool)}>
                    Edit
                  </Button>
                  <Button
                    variant="ghost"
                    disabled={tool.activeLoan !== undefined}
                    title={
                      tool.activeLoan
                        ? "You can delete this once the loan is finished."
                        : undefined
                    }
                    onClick={() => setDeleting(tool)}
                  >
                    Delete
                  </Button>
                </>
              }
            />
          ))}
        </div>
      )}

      <ToolFormDialog open={creating} onClose={() => setCreating(false)} />
      <ToolFormDialog
        open={editing !== undefined}
        tool={editing}
        onClose={() => setEditing(undefined)}
      />
      <ConfirmDialog
        open={deleting !== null}
        title={`Delete ${deleting?.name ?? "listing"}?`}
        body="It will leave the board, and anyone waiting on a reply will be told it's no longer available."
        confirmLabel="Delete listing"
        danger
        onClose={() => setDeleting(null)}
        onConfirm={async () => {
          if (!deleting) return;
          await run(() => removeTool({ toolId: deleting._id }), "Listing deleted.");
          setDeleting(null);
        }}
      />
    </>
  );
}
