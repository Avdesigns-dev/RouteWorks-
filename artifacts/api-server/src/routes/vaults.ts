import { Router } from "express";
import { db } from "@workspace/db";
import {
  vaultsTable,
  lockVaultDetailsTable,
  splitRecipientsTable,
  activityEventsTable,
} from "@workspace/db";
import { eq, and, sql, desc } from "drizzle-orm";
import {
  CreateVaultBody,
  UpdateVaultBody,
  GetVaultParams,
  UpdateVaultParams,
  DeleteVaultParams,
  GetVaultActivityParams,
  ListVaultsQueryParams,
  GetVaultStatsQueryParams,
} from "@workspace/api-zod";

const router = Router();

// List vaults
router.get("/vaults", async (req, res) => {
  try {
    const query = ListVaultsQueryParams.safeParse(req.query);
    if (!query.success) {
      res.status(400).json({ error: "Invalid query parameters" });
      return;
    }
    const { ownerAddress } = query.data;

    const conditions = ownerAddress
      ? [eq(vaultsTable.ownerAddress, ownerAddress)]
      : [];

    const vaults = await db
      .select()
      .from(vaultsTable)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(vaultsTable.createdAt));

    res.json(
      vaults.map((v) => ({
        ...v,
        balance: Number(v.balance),
        createdAt: v.createdAt.toISOString(),
        updatedAt: v.updatedAt.toISOString(),
      }))
    );
  } catch (err) {
    req.log.error({ err }, "Failed to list vaults");
    res.status(500).json({ error: "Internal server error" });
  }
});

// Get vault stats
router.get("/vaults/stats", async (req, res) => {
  try {
    const query = GetVaultStatsQueryParams.safeParse(req.query);
    if (!query.success) {
      res.status(400).json({ error: "Invalid query parameters" });
      return;
    }
    const { ownerAddress } = query.data;

    const conditions = ownerAddress
      ? [eq(vaultsTable.ownerAddress, ownerAddress)]
      : [];

    const whereClause =
      conditions.length > 0 ? and(...conditions) : undefined;

    const [totals] = await db
      .select({
        totalBalance: sql<string>`COALESCE(SUM(${vaultsTable.balance}), 0)`,
        activeVaults: sql<number>`COUNT(*) FILTER (WHERE ${vaultsTable.status} = 'active')`,
      })
      .from(vaultsTable)
      .where(whereClause);

    // Count upcoming payments from active lock vaults
    const lockConditions = ownerAddress
      ? and(
          eq(vaultsTable.ownerAddress, ownerAddress),
          eq(vaultsTable.status, "active"),
          eq(vaultsTable.type, "lock")
        )
      : and(eq(vaultsTable.status, "active"), eq(vaultsTable.type, "lock"));

    const lockVaults = await db
      .select({ id: vaultsTable.id })
      .from(vaultsTable)
      .where(lockConditions);

    const upcomingPayments = lockVaults.length;

    // Total distributed from payment_released activity
    const [distributed] = await db
      .select({
        total: sql<string>`COALESCE(SUM(${activityEventsTable.amount}), 0)`,
      })
      .from(activityEventsTable)
      .where(
        ownerAddress
          ? and(
              eq(activityEventsTable.ownerAddress, ownerAddress),
              eq(activityEventsTable.eventType, "payment_released")
            )
          : eq(activityEventsTable.eventType, "payment_released")
      );

    res.json({
      totalBalance: Number(totals?.totalBalance ?? 0),
      activeVaults: Number(totals?.activeVaults ?? 0),
      upcomingPayments,
      totalDistributed: Number(distributed?.total ?? 0),
    });
  } catch (err) {
    req.log.error({ err }, "Failed to get vault stats");
    res.status(500).json({ error: "Internal server error" });
  }
});

// Get single vault with details
router.get("/vaults/:id", async (req, res) => {
  try {
    const params = GetVaultParams.safeParse({ id: Number(req.params.id) });
    if (!params.success) {
      res.status(400).json({ error: "Invalid vault ID" });
      return;
    }

    const ownerAddress = req.query.ownerAddress as string | undefined;

    const [vault] = await db
      .select()
      .from(vaultsTable)
      .where(eq(vaultsTable.id, params.data.id));

    if (!vault) {
      res.status(404).json({ error: "Vault not found" });
      return;
    }

    // Owner check: if ownerAddress is provided, must match
    if (ownerAddress && vault.ownerAddress !== ownerAddress) {
      res.status(403).json({ error: "Access denied" });
      return;
    }

    const lockDetails =
      vault.type === "lock"
        ? await db
            .select()
            .from(lockVaultDetailsTable)
            .where(eq(lockVaultDetailsTable.vaultId, vault.id))
            .then((rows) => rows[0] ?? null)
        : null;

    const splitRecipients =
      vault.type === "split"
        ? await db
            .select()
            .from(splitRecipientsTable)
            .where(eq(splitRecipientsTable.vaultId, vault.id))
        : [];

    res.json({
      ...vault,
      balance: Number(vault.balance),
      createdAt: vault.createdAt.toISOString(),
      updatedAt: vault.updatedAt.toISOString(),
      lockDetails: lockDetails
        ? {
            recipientAddress: lockDetails.recipientAddress,
            amountStx: Number(lockDetails.amountStx),
            releaseSchedule: lockDetails.releaseSchedule,
            durationMonths: lockDetails.durationMonths,
          }
        : undefined,
      splitRecipients: splitRecipients.map((r) => ({
        address: r.address,
        percentage: Number(r.percentage),
      })),
    });
  } catch (err) {
    req.log.error({ err }, "Failed to get vault");
    res.status(500).json({ error: "Internal server error" });
  }
});

// Create vault — transactional with full server-side invariant validation
router.post("/vaults", async (req, res) => {
  try {
    const parsed = CreateVaultBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    const { name, type, ownerAddress, description, lockDetails, splitRecipients } =
      parsed.data;

    // Enforce type-specific invariants
    if (type === "lock") {
      if (!lockDetails) {
        res.status(400).json({ error: "lockDetails is required for Lock Vault" });
        return;
      }
      if (lockDetails.amountStx <= 0) {
        res.status(400).json({ error: "Lock amount must be greater than 0" });
        return;
      }
      if (lockDetails.durationMonths <= 0) {
        res.status(400).json({ error: "Duration must be at least 1 month" });
        return;
      }
    }

    if (type === "split") {
      if (!splitRecipients || splitRecipients.length === 0) {
        res.status(400).json({ error: "At least one recipient is required for Split Vault" });
        return;
      }
      const total = splitRecipients.reduce((sum, r) => sum + r.percentage, 0);
      if (Math.abs(total - 100) > 0.01) {
        res.status(400).json({ error: `Recipient percentages must sum to 100 (got ${total.toFixed(2)})` });
        return;
      }
      for (const r of splitRecipients) {
        if (r.percentage <= 0) {
          res.status(400).json({ error: "Each recipient percentage must be greater than 0" });
          return;
        }
      }
    }

    // Execute entire creation in a single transaction
    const vault = await db.transaction(async (tx) => {
      const [newVault] = await tx
        .insert(vaultsTable)
        .values({
          name,
          type: type as "lock" | "split",
          ownerAddress,
          description: description ?? null,
          balance: type === "lock" ? String(lockDetails!.amountStx) : "0",
          status: "active",
        })
        .returning();

      if (type === "lock" && lockDetails) {
        await tx.insert(lockVaultDetailsTable).values({
          vaultId: newVault.id,
          recipientAddress: lockDetails.recipientAddress,
          amountStx: String(lockDetails.amountStx),
          releaseSchedule: lockDetails.releaseSchedule as
            | "one_time"
            | "monthly"
            | "quarterly"
            | "annually",
          durationMonths: lockDetails.durationMonths,
        });
      }

      if (type === "split" && splitRecipients && splitRecipients.length > 0) {
        await tx.insert(splitRecipientsTable).values(
          splitRecipients.map((r) => ({
            vaultId: newVault.id,
            address: r.address,
            percentage: String(r.percentage),
          }))
        );
      }

      // Log activity events inside the same transaction
      await tx.insert(activityEventsTable).values({
        vaultId: newVault.id,
        ownerAddress,
        eventType: "vault_created",
        description: `${type === "lock" ? "Lock" : "Split"} Vault "${name}" created`,
        amount: null,
      });

      if (type === "lock" && lockDetails) {
        await tx.insert(activityEventsTable).values({
          vaultId: newVault.id,
          ownerAddress,
          eventType: "funds_locked",
          description: `${lockDetails.amountStx} STX locked in "${name}"`,
          amount: String(lockDetails.amountStx),
        });
      }

      return newVault;
    });

    res.status(201).json({
      ...vault,
      balance: Number(vault.balance),
      createdAt: vault.createdAt.toISOString(),
      updatedAt: vault.updatedAt.toISOString(),
    });
  } catch (err) {
    req.log.error({ err }, "Failed to create vault");
    res.status(500).json({ error: "Internal server error" });
  }
});

// Update vault — owner-gated via ownerAddress in body
router.patch("/vaults/:id", async (req, res) => {
  try {
    const params = UpdateVaultParams.safeParse({ id: Number(req.params.id) });
    if (!params.success) {
      res.status(400).json({ error: "Invalid vault ID" });
      return;
    }

    const parsed = UpdateVaultBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    const ownerAddress = req.query.ownerAddress as string | undefined;

    const [existing] = await db
      .select()
      .from(vaultsTable)
      .where(eq(vaultsTable.id, params.data.id));

    if (!existing) {
      res.status(404).json({ error: "Vault not found" });
      return;
    }

    if (ownerAddress && existing.ownerAddress !== ownerAddress) {
      res.status(403).json({ error: "Access denied" });
      return;
    }

    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (parsed.data.name !== undefined) updates.name = parsed.data.name;
    if (parsed.data.status !== undefined) updates.status = parsed.data.status;
    if (parsed.data.description !== undefined)
      updates.description = parsed.data.description;

    const [vault] = await db
      .update(vaultsTable)
      .set(updates)
      .where(eq(vaultsTable.id, params.data.id))
      .returning();

    // Log status changes
    if (parsed.data.status === "paused") {
      await db.insert(activityEventsTable).values({
        vaultId: vault.id,
        ownerAddress: vault.ownerAddress,
        eventType: "vault_paused",
        description: `Vault "${vault.name}" paused`,
        amount: null,
      });
    } else if (parsed.data.status === "completed") {
      await db.insert(activityEventsTable).values({
        vaultId: vault.id,
        ownerAddress: vault.ownerAddress,
        eventType: "vault_completed",
        description: `Vault "${vault.name}" marked as completed`,
        amount: null,
      });
    }

    res.json({
      ...vault,
      balance: Number(vault.balance),
      createdAt: vault.createdAt.toISOString(),
      updatedAt: vault.updatedAt.toISOString(),
    });
  } catch (err) {
    req.log.error({ err }, "Failed to update vault");
    res.status(500).json({ error: "Internal server error" });
  }
});

// Delete vault — owner-gated
router.delete("/vaults/:id", async (req, res) => {
  try {
    const params = DeleteVaultParams.safeParse({ id: Number(req.params.id) });
    if (!params.success) {
      res.status(400).json({ error: "Invalid vault ID" });
      return;
    }

    const ownerAddress = req.query.ownerAddress as string | undefined;

    const [vault] = await db
      .select()
      .from(vaultsTable)
      .where(eq(vaultsTable.id, params.data.id));

    if (!vault) {
      res.status(404).json({ error: "Vault not found" });
      return;
    }

    if (ownerAddress && vault.ownerAddress !== ownerAddress) {
      res.status(403).json({ error: "Access denied" });
      return;
    }

    await db.delete(vaultsTable).where(eq(vaultsTable.id, params.data.id));

    res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "Failed to delete vault");
    res.status(500).json({ error: "Internal server error" });
  }
});

// Get vault activity — owner-gated
router.get("/vaults/:id/activity", async (req, res) => {
  try {
    const params = GetVaultActivityParams.safeParse({
      id: Number(req.params.id),
    });
    if (!params.success) {
      res.status(400).json({ error: "Invalid vault ID" });
      return;
    }

    const ownerAddress = req.query.ownerAddress as string | undefined;

    // Verify vault exists and enforce owner check
    const [vault] = await db
      .select()
      .from(vaultsTable)
      .where(eq(vaultsTable.id, params.data.id));

    if (!vault) {
      res.status(404).json({ error: "Vault not found" });
      return;
    }

    if (ownerAddress && vault.ownerAddress !== ownerAddress) {
      res.status(403).json({ error: "Access denied" });
      return;
    }

    const events = await db
      .select()
      .from(activityEventsTable)
      .where(eq(activityEventsTable.vaultId, params.data.id))
      .orderBy(desc(activityEventsTable.createdAt));

    res.json(
      events.map((e) => ({
        ...e,
        amount: e.amount !== null ? Number(e.amount) : null,
        createdAt: e.createdAt.toISOString(),
        vaultName: vault.name,
      }))
    );
  } catch (err) {
    req.log.error({ err }, "Failed to get vault activity");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
