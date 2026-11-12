import type { ReactNode } from "react";
import { Badge, Eyebrow } from "@/components/ui";
import type { Category, Condition } from "@/convex/lib/constants";
import {
  availabilityOf,
  CATEGORY_LABELS,
  CONDITION_LABELS,
} from "@/lib/display";

export type ToolCardData = {
  name: string;
  category: Category;
  condition: Condition;
  description: string;
  activeLoan?: { startDate: string; endDate: string };
  ownerName: string;
  ownerIsTrusted: boolean;
};

export function ToolCard({
  tool,
  footer,
}: {
  tool: ToolCardData;
  footer: ReactNode;
}) {
  const availability = availabilityOf(tool.activeLoan);
  return (
    <article className="flex flex-col rounded-lg border border-line bg-card p-5">
      <div className="flex items-start justify-between gap-3">
        <Eyebrow>{CATEGORY_LABELS[tool.category]}</Eyebrow>
        <Badge tone={availability.tone}>{availability.label}</Badge>
      </div>
      <h2 className="mt-1.5 text-lg font-bold leading-snug">
        {tool.name}
      </h2>
      <p className="mt-1.5 flex-1 text-sm text-ink-soft">{tool.description}</p>
      <p className="mt-4 text-xs text-ink-soft">
        {CONDITION_LABELS[tool.condition]} condition
        <span aria-hidden className="mx-1.5">
          ·
        </span>
        <span className="text-ink">{tool.ownerName}</span>
        {tool.ownerIsTrusted && (
          <span className="ml-1.5 font-medium text-go">Trusted Lender</span>
        )}
      </p>
      <div className="mt-4 flex gap-2">{footer}</div>
    </article>
  );
}
