import { pgTable, serial, text, numeric, integer, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const vaultTypeEnum = pgEnum("vault_type", ["lock", "split"]);
export const vaultStatusEnum = pgEnum("vault_status", ["active", "paused", "completed"]);
export const releaseScheduleEnum = pgEnum("release_schedule", ["one_time", "monthly", "quarterly", "annually"]);
export const activityEventTypeEnum = pgEnum("activity_event_type", [
  "vault_created",
  "funds_locked",
  "payment_released",
  "split_executed",
  "recipient_added",
  "vault_paused",
  "vault_completed",
]);

export const vaultsTable = pgTable("vaults", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  type: vaultTypeEnum("type").notNull(),
  ownerAddress: text("owner_address").notNull(),
  balance: numeric("balance", { precision: 20, scale: 6 }).notNull().default("0"),
  status: vaultStatusEnum("status").notNull().default("active"),
  description: text("description"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const lockVaultDetailsTable = pgTable("lock_vault_details", {
  id: serial("id").primaryKey(),
  vaultId: integer("vault_id").notNull().references(() => vaultsTable.id, { onDelete: "cascade" }),
  recipientAddress: text("recipient_address").notNull(),
  amountStx: numeric("amount_stx", { precision: 20, scale: 6 }).notNull(),
  releaseSchedule: releaseScheduleEnum("release_schedule").notNull(),
  durationMonths: integer("duration_months").notNull(),
});

export const splitRecipientsTable = pgTable("split_recipients", {
  id: serial("id").primaryKey(),
  vaultId: integer("vault_id").notNull().references(() => vaultsTable.id, { onDelete: "cascade" }),
  address: text("address").notNull(),
  percentage: numeric("percentage", { precision: 5, scale: 2 }).notNull(),
});

export const activityEventsTable = pgTable("activity_events", {
  id: serial("id").primaryKey(),
  vaultId: integer("vault_id").references(() => vaultsTable.id, { onDelete: "set null" }),
  ownerAddress: text("owner_address").notNull(),
  eventType: activityEventTypeEnum("event_type").notNull(),
  description: text("description").notNull(),
  amount: numeric("amount", { precision: 20, scale: 6 }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Insert schemas
export const insertVaultSchema = createInsertSchema(vaultsTable).omit({ id: true, createdAt: true, updatedAt: true });
export const insertLockVaultDetailsSchema = createInsertSchema(lockVaultDetailsTable).omit({ id: true });
export const insertSplitRecipientSchema = createInsertSchema(splitRecipientsTable).omit({ id: true });
export const insertActivityEventSchema = createInsertSchema(activityEventsTable).omit({ id: true, createdAt: true });

export type InsertVault = z.infer<typeof insertVaultSchema>;
export type Vault = typeof vaultsTable.$inferSelect;
export type LockVaultDetail = typeof lockVaultDetailsTable.$inferSelect;
export type SplitRecipient = typeof splitRecipientsTable.$inferSelect;
export type ActivityEvent = typeof activityEventsTable.$inferSelect;
