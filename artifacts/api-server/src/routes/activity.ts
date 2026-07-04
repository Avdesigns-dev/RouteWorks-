import { Router } from "express";
import { db } from "@workspace/db";
import { activityEventsTable, vaultsTable } from "@workspace/db";
import { eq, and, desc, sql } from "drizzle-orm";
import { ListActivityQueryParams } from "@workspace/api-zod";

const router = Router();

router.get("/activity", async (req, res) => {
  try {
    const parsed = ListActivityQueryParams.safeParse(req.query);
    const ownerAddress = parsed.success ? parsed.data.ownerAddress : undefined;
    const limit = parsed.success ? (parsed.data.limit ?? 20) : 20;

    const conditions = ownerAddress
      ? [eq(activityEventsTable.ownerAddress, ownerAddress)]
      : [];

    const events = await db
      .select({
        id: activityEventsTable.id,
        vaultId: activityEventsTable.vaultId,
        vaultName: vaultsTable.name,
        ownerAddress: activityEventsTable.ownerAddress,
        eventType: activityEventsTable.eventType,
        description: activityEventsTable.description,
        amount: activityEventsTable.amount,
        createdAt: activityEventsTable.createdAt,
      })
      .from(activityEventsTable)
      .leftJoin(vaultsTable, eq(activityEventsTable.vaultId, vaultsTable.id))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(activityEventsTable.createdAt))
      .limit(limit);

    res.json(
      events.map((e) => ({
        ...e,
        amount: e.amount !== null ? Number(e.amount) : null,
        createdAt: e.createdAt.toISOString(),
        vaultName: e.vaultName ?? null,
      }))
    );
  } catch (err) {
    req.log.error({ err }, "Failed to list activity");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
