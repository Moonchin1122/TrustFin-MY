import { z } from "zod";
import { createTRPCRouter, publicProcedure } from "../create-context";
import { store } from "../../data/store";
import { mapUser } from "../../lib/mappers";

export const analyticsRouter = createTRPCRouter({
  trackEvent: publicProcedure
    .input(
      z.object({
        type: z.enum(["install", "app_open", "screen_view", "signup"]),
        userId: z.string().optional(),
        deviceId: z.string(),
        screenName: z.string().optional(),
        metadata: z.record(z.string(), z.string()).optional(),
      })
    )
    .mutation(async ({ input }) => {
      const event = {
        id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        type: input.type,
        user_id: input.userId,
        device_id: input.deviceId,
        screen_name: input.screenName,
        timestamp: new Date().toISOString(),
        metadata: input.metadata,
      };
      await store.addEvent(event);
      console.log("[ANALYTICS] Event tracked:", input.type, input.screenName || "");
      return { success: true };
    }),

  getDashboardStats: publicProcedure.query(async () => {
    const now = new Date();
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);

    const weekStart = new Date(now);
    weekStart.setDate(weekStart.getDate() - 7);

    const monthStart = new Date(now);
    monthStart.setDate(monthStart.getDate() - 30);

    const [
      totalUsers,
      onlineUsers,
      uniqueInstalls,
      signupsToday,
      signupsWeek,
      dau,
      mau,
      screenViews,
      popularInterests,
      signupTrend,
      retention,
      allEvents,
      appOpenEvents,
    ] = await Promise.all([
      store.getUserCount(),
      store.getOnlineUsers(),
      store.getUniqueInstalls(),
      store.getSignupsInRange(todayStart, now),
      store.getSignupsInRange(weekStart, now),
      store.getActiveUsersInRange(todayStart, now),
      store.getActiveUsersInRange(monthStart, now),
      store.getScreenViewCounts(),
      store.getPopularInterests(),
      store.getSignupTrend(14),
      store.getRetentionStats(),
      store.getEvents(),
      store.getEventsByType("app_open"),
    ]);

    console.log("[ANALYTICS] Dashboard stats fetched. Total users:", totalUsers);

    return {
      totalUsers,
      onlineUsers,
      uniqueInstalls,
      signupsToday,
      signupsWeek,
      dau,
      mau,
      screenViews,
      popularInterests,
      signupTrend,
      retention,
      totalEvents: allEvents.length,
      appOpens: appOpenEvents.length,
    };
  }),

  getAllUsers: publicProcedure
    .input(
      z.object({
        search: z.string().optional(),
        state: z.string().optional(),
        role: z.string().optional(),
        page: z.number().default(1),
        limit: z.number().default(50),
      })
    )
    .query(async ({ input }) => {
      let users = await store.getAllUsers();

      if (input.search) {
        const s = input.search.toLowerCase();
        users = users.filter(
          (u) =>
            u.name.toLowerCase().includes(s) ||
            u.phone.includes(s) ||
            u.email.toLowerCase().includes(s)
        );
      }

      if (input.state) {
        users = users.filter((u) => u.state === input.state);
      }

      if (input.role) {
        users = users.filter((u) => u.role === input.role);
      }

      const total = users.length;
      const start = (input.page - 1) * input.limit;
      const paginated = users.slice(start, start + input.limit);

      return {
        users: paginated.map(mapUser),
        total,
        page: input.page,
        totalPages: Math.ceil(total / input.limit),
      };
    }),

  exportUsersCSV: publicProcedure.query(async () => {
    const users = await store.getAllUsers();
    const headers = "ID,Name,Phone,Email,Role,State,District,Rating,Verified,KYC,Online,Last Active,Created At\n";
    const rows = users
      .map(
        (u) =>
          `${u.id},${u.name},${u.phone},${u.email},${u.role},${u.state || ""},${u.district || ""},${u.rating || 0},${u.is_verified},${u.kyc_status || ""},${u.is_online},${u.last_active_at},${u.created_at}`
      )
      .join("\n");
    return headers + rows;
  }),
});
