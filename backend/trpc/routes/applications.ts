import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, publicProcedure } from "../create-context";
import { store } from "../../data/store";
import { mapApplication } from "../../lib/mappers";

export const applicationsRouter = createTRPCRouter({
  submit: publicProcedure
    .input(
      z.object({
        userId: z.string().optional(),
        fullName: z.string().min(1),
        phone: z.string().min(9),
        state: z.string().min(1),
        loanType: z.string().min(1),
        amount: z.string().min(1),
        mode: z.enum(["basic", "premium"]),
        monthlyIncome: z.string().optional(),
        occupation: z.string().optional(),
        yearsEmployed: z.string().optional(),
        hasCtos: z.boolean().optional(),
        existingLoans: z.string().optional(),
        plannedTimeline: z.string().optional(),
        leadScore: z.number().optional(),
      })
    )
    .mutation(async ({ input }) => {
      try {
        const now = new Date().toISOString();
        const app = await store.createApplication({
          id: `app_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          user_id: input.userId,
          full_name: input.fullName,
          phone: input.phone,
          state: input.state,
          loan_type: input.loanType,
          amount: input.amount,
          mode: input.mode,
          monthly_income: input.monthlyIncome,
          occupation: input.occupation,
          years_employed: input.yearsEmployed,
          has_ctos: input.hasCtos,
          existing_loans: input.existingLoans,
          planned_timeline: input.plannedTimeline,
          lead_score: input.leadScore,
          status: "pending",
          created_at: now,
          updated_at: now,
        });

        console.log("[APPLICATIONS] New application submitted:", app.id, input.fullName, input.loanType);
        return { success: true, application: mapApplication(app) };
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Failed to submit application";
        console.error("[APPLICATIONS] Submit error:", message);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Application submission failed: ${message}`,
        });
      }
    }),

  getAll: publicProcedure
    .input(
      z.object({
        search: z.string().optional(),
        status: z.string().optional(),
        loanType: z.string().optional(),
        page: z.number().default(1),
        limit: z.number().default(50),
      })
    )
    .query(async ({ input }) => {
      let apps = await store.getAllApplications();

      if (input.search) {
        const s = input.search.toLowerCase();
        apps = apps.filter(
          (a) =>
            a.full_name.toLowerCase().includes(s) ||
            a.phone.includes(s) ||
            a.state.toLowerCase().includes(s)
        );
      }

      if (input.status) {
        apps = apps.filter((a) => a.status === input.status);
      }

      if (input.loanType) {
        apps = apps.filter((a) => a.loan_type === input.loanType);
      }

      apps.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

      const total = apps.length;
      const start = (input.page - 1) * input.limit;
      const paginated = apps.slice(start, start + input.limit);

      const [pending, reviewing, approved, rejected] = await Promise.all([
        store.getApplicationsByStatus("pending"),
        store.getApplicationsByStatus("reviewing"),
        store.getApplicationsByStatus("approved"),
        store.getApplicationsByStatus("rejected"),
      ]);

      const statusCounts = {
        pending: pending.length,
        reviewing: reviewing.length,
        approved: approved.length,
        rejected: rejected.length,
      };

      return {
        applications: paginated.map(mapApplication),
        total,
        page: input.page,
        totalPages: Math.ceil(total / input.limit),
        statusCounts,
      };
    }),

  updateStatus: publicProcedure
    .input(
      z.object({
        id: z.string(),
        status: z.enum(["pending", "reviewing", "approved", "rejected"]),
      })
    )
    .mutation(async ({ input }) => {
      const updated = await store.updateApplication(input.id, { status: input.status });
      if (!updated) {
        return { success: false, message: "Application not found" };
      }
      console.log("[APPLICATIONS] Status updated:", input.id, "->", input.status);
      return { success: true, application: mapApplication(updated) };
    }),

  getStats: publicProcedure.query(async () => {
    const all = await store.getAllApplications();
    const now = new Date();
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);

    const todayApps = all.filter((a) => new Date(a.created_at) >= todayStart);
    const premiumApps = all.filter((a) => a.mode === "premium");
    const avgScore = premiumApps.length > 0
      ? Math.round(premiumApps.reduce((sum, a) => sum + (a.lead_score || 0), 0) / premiumApps.length)
      : 0;

    const [pending, reviewing, approved, rejected] = await Promise.all([
      store.getApplicationsByStatus("pending"),
      store.getApplicationsByStatus("reviewing"),
      store.getApplicationsByStatus("approved"),
      store.getApplicationsByStatus("rejected"),
    ]);

    return {
      total: all.length,
      today: todayApps.length,
      pending: pending.length,
      reviewing: reviewing.length,
      approved: approved.length,
      rejected: rejected.length,
      premiumCount: premiumApps.length,
      avgLeadScore: avgScore,
    };
  }),
});
