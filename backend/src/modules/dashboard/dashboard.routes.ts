import type { FastifyInstance, FastifyRequest } from "fastify";
import { supabaseAdmin } from "../../lib/supabase.js";
import { requireRole } from "../../plugins/roles.js";

type Role = "admin" | "supervisor" | "vendedor";

type DashboardTotals = {
  count: number;
  totalAmount: number;
  avgAmount: number;
};

type DashboardLowStock = {
  id: string;
  name: string;
  unit_base: string;
  stock: number;
};

type DashboardSellerStat = {
  userId: string;
  fullName?: string | null;
  role?: string | null;
  count: number;
  total: number;
  avg: number;
};

type DashboardResponse = {
  scope: "all" | "mine";
  totals: DashboardTotals;
  byStatus: Record<string, number>;
  recent: Array<{
    id: string;
    created_at?: string;
    status: string;
    total: number;
    product_id?: string;
    kind?: "quote" | "group";
  }>;
  lowStock?: DashboardLowStock[];
  salesBySeller?: DashboardSellerStat[];
  averages?: {
    daily: number;
    weekly: number;
    monthly: number;
  };
};

export async function dashboardRoutes(app: FastifyInstance) {
  app.get("/dashboard", async (req: FastifyRequest, reply) => {
    await app.requireAuth(req);
    requireRole(req, ["admin", "supervisor", "vendedor"]);

    const role = req.auth?.role as Role | undefined;
    const userId = req.auth?.userId;
    const scope: "all" | "mine" = role === "vendedor" ? "mine" : "all";

    const q = (req.query ?? {}) as Partial<{
      from: string;
      to: string;
      limit: string;
      lowStock: string;
    }>;

    const from = q.from ? new Date(q.from) : null;
    const to = q.to ? new Date(q.to) : null;
    const hasFrom = from && !Number.isNaN(from.getTime());
    const hasTo = to && !Number.isNaN(to.getTime());
    const limitRaw = Number(q.limit);
    const recentLimit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 25) : 8;

    const withScope = (query: any) => {
      if (scope === "mine" && userId) return query.eq("created_by", userId);
      return query;
    };

    const withDate = (query: any) => {
      let qx = query;
      if (hasFrom) qx = qx.gte("created_at", from!.toISOString());
      if (hasTo) qx = qx.lte("created_at", to!.toISOString());
      return qx;
    };

    const [quotesRes, groupsRes] = await Promise.all([
      withDate(withScope(supabaseAdmin.from("quotes").select("total, status, created_at, created_by")))
        .order("created_at", { ascending: false }),
      withDate(withScope(supabaseAdmin.from("quote_groups").select("total, status, created_at, created_by")))
        .order("created_at", { ascending: false }),
    ]);

    if ((quotesRes as any).error) return reply.code(500).send({ error: String((quotesRes as any).error) });
    if ((groupsRes as any).error) return reply.code(500).send({ error: String((groupsRes as any).error) });

    const quotes = (quotesRes as any).data ?? [];
    const groups = (groupsRes as any).data ?? [];

    const totalAmount =
      [...quotes, ...groups].reduce((sum, row) => sum + Number((row as any).total ?? 0), 0) ?? 0;
    const totalCount = Number((quotes?.length ?? 0) + (groups?.length ?? 0));
    const avgAmount = totalCount > 0 ? totalAmount / totalCount : 0;

    const byStatus: Record<string, number> = { draft: 0, approved: 0, converted: 0, expired: 0 };
    for (const row of [...quotes, ...groups]) {
      const status = String((row as any).status ?? "");
      if (status in byStatus) byStatus[status] += 1;
    }

    const [recentQuotesRes, recentGroupsRes] = await Promise.all([
      withDate(
        withScope(
          supabaseAdmin
            .from("quotes")
            .select("id, created_at, status, total, product_id")
            .order("created_at", { ascending: false })
            .limit(recentLimit)
        )
      ),
      withDate(
        withScope(
          supabaseAdmin
            .from("quote_groups")
            .select("id, created_at, status, total")
            .order("created_at", { ascending: false })
            .limit(recentLimit)
        )
      ),
    ]);

    if ((recentQuotesRes as any).error) {
      return reply.code(500).send({ error: String((recentQuotesRes as any).error) });
    }
    if ((recentGroupsRes as any).error) {
      return reply.code(500).send({ error: String((recentGroupsRes as any).error) });
    }

    const recentQuotes = ((recentQuotesRes as any).data ?? []).map((q: any) => ({
      id: q.id,
      created_at: q.created_at,
      status: q.status,
      total: Number(q.total ?? 0),
      product_id: q.product_id,
      kind: "quote" as const,
    }));

    const recentGroups = ((recentGroupsRes as any).data ?? []).map((g: any) => ({
      id: g.id,
      created_at: g.created_at,
      status: g.status,
      total: Number(g.total ?? 0),
      kind: "group" as const,
    }));

    const recent = [...recentQuotes, ...recentGroups]
      .sort((a, b) => new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime())
      .slice(0, recentLimit);

    // Admin-only: low stock + seller stats + averages
    let lowStock: DashboardLowStock[] | undefined;
    let salesBySeller: DashboardSellerStat[] | undefined;
    let averages: DashboardResponse["averages"] | undefined;

    if (scope === "all") {
      const lowStockThreshold = Number(q.lowStock);
      const threshold = Number.isFinite(lowStockThreshold) ? lowStockThreshold : 5;

      const { data: lowStockRows, error: lsErr } = await supabaseAdmin
        .from("supplies")
        .select("id, name, unit_base, stock")
        .lte("stock", threshold)
        .order("stock", { ascending: true })
        .limit(8);

      if (lsErr) return reply.code(500).send({ error: String(lsErr) });

      lowStock = (lowStockRows ?? []).map((s: any) => ({
        id: s.id,
        name: s.name,
        unit_base: s.unit_base,
        stock: Number(s.stock ?? 0),
      }));

      const convertedRows = [...quotes, ...groups].filter((r: any) => r.status === "converted");
      const bySeller = new Map<string, { count: number; total: number }>();
      for (const row of convertedRows) {
        const uid = String((row as any).created_by ?? "");
        if (!uid) continue;
        const agg = bySeller.get(uid) ?? { count: 0, total: 0 };
        agg.count += 1;
        agg.total += Number((row as any).total ?? 0);
        bySeller.set(uid, agg);
      }

      const sellerIds = Array.from(bySeller.keys());
      let profiles: Array<{ id: string; full_name?: string | null; role?: string | null }> = [];
      if (sellerIds.length > 0) {
        const { data: profs, error: pErr } = await supabaseAdmin
          .from("profiles")
          .select("id, full_name, role")
          .in("id", sellerIds);

        if (pErr) return reply.code(500).send({ error: String(pErr) });
        profiles = profs ?? [];
      }

      const profileById = new Map(profiles.map((p) => [p.id, p]));
      salesBySeller = sellerIds.map((id) => {
        const agg = bySeller.get(id)!;
        const profile = profileById.get(id);
        return {
          userId: id,
          fullName: profile?.full_name ?? null,
          role: profile?.role ?? null,
          count: agg.count,
          total: agg.total,
          avg: agg.count > 0 ? agg.total / agg.count : 0,
        };
      });

      salesBySeller.sort((a, b) => b.total - a.total);

      // averages based on date range or last 30 days
      const now = new Date();
      const rangeStart = hasFrom ? from! : new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      const rangeEnd = hasTo ? to! : now;
      const days = Math.max(
        1,
        Math.ceil((rangeEnd.getTime() - rangeStart.getTime()) / (24 * 60 * 60 * 1000))
      );
      const totalConverted = convertedRows.reduce(
        (sum: number, row: any) => sum + Number(row.total ?? 0),
        0
      );
      averages = {
        daily: totalConverted / days,
        weekly: totalConverted / Math.max(1, days / 7),
        monthly: totalConverted / Math.max(1, days / 30),
      };
    }

    const response: DashboardResponse = {
      scope,
      totals: { count: totalCount, totalAmount, avgAmount },
      byStatus,
      recent: Array.isArray(recent) ? (recent as DashboardResponse["recent"]) : [],
      lowStock,
      salesBySeller,
      averages,
    };

    return reply.send(response);
  });
}
