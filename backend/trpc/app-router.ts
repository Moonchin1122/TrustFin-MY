import { createTRPCRouter } from "./create-context";
import { authRouter } from "./routes/auth";
import { analyticsRouter } from "./routes/analytics";
import { applicationsRouter } from "./routes/applications";

export const appRouter = createTRPCRouter({
  auth: authRouter,
  analytics: analyticsRouter,
  applications: applicationsRouter,
});

export type AppRouter = typeof appRouter;
