import { v, type Infer } from "convex/values";

export const categoryValidator = v.union(
  v.literal("power_tools"),
  v.literal("hand_tools"),
  v.literal("garden"),
  v.literal("kitchen"),
  v.literal("camping"),
  v.literal("cleaning"),
  v.literal("other"),
);
export type Category = Infer<typeof categoryValidator>;

export const conditionValidator = v.union(
  v.literal("like_new"),
  v.literal("good"),
  v.literal("fair"),
  v.literal("worn"),
);
export type Condition = Infer<typeof conditionValidator>;

export const loanStatusValidator = v.union(
  v.literal("requested"),
  v.literal("approved"),
  v.literal("declined"),
  v.literal("cancelled"),
  v.literal("returned"),
);
export type LoanStatus = Infer<typeof loanStatusValidator>;

export const loanEventTypeValidator = v.union(
  v.literal("loan.requested"),
  v.literal("loan.approved"),
  v.literal("loan.declined"),
  v.literal("loan.cancelled"),
  v.literal("loan.returned"),
);
export type LoanEventType = Infer<typeof loanEventTypeValidator>;

export const notificationKindValidator = v.union(
  v.literal("loan_event"),
  v.literal("overdue_reminder"),
  v.literal("workflow_failure"),
);
export type NotificationKind = Infer<typeof notificationKindValidator>;

export const notificationStatusValidator = v.union(
  v.literal("pending"),
  v.literal("sent"),
  v.literal("failed"),
);
export type NotificationStatus = Infer<typeof notificationStatusValidator>;

export const LIMITS = {
  nameMin: 2,
  nameMax: 80,
  descriptionMin: 1,
  descriptionMax: 280,
  pickupNoteMax: 200,
  loanMaxDays: 30,
  publicList: 50,
  ownList: 100,
  overdueBatch: 200,
  adminList: 200,
  failureList: 50,
  activityPerLoan: 3,
} as const;
