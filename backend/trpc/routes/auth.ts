import { z } from "zod";
import { createTRPCRouter, publicProcedure } from "../create-context";
import { store } from "../../data/store";
import { otpService } from "../../services/otp";
import { sendSms } from "../../services/sms";
import { mapUser } from "../../lib/mappers";

export const authRouter = createTRPCRouter({
  sendOtp: publicProcedure
    .input(
      z.object({
        phone: z.string().min(9),
      })
    )
    .mutation(async ({ input }) => {
      try {
        const { code, isDevMode } = otpService.createOtp(input.phone);

        const smsResult = await sendSms(
          input.phone,
          `Your TrustFin verification code is: ${code}. Valid for 5 minutes.`
        );

        console.log("[AUTH] OTP sent for:", input.phone, "provider:", smsResult.provider);

        return {
          success: true,
          isDevMode,
          devCode: isDevMode ? code : undefined,
          message: isDevMode
            ? "DEV MODE: OTP shown in app (no SMS provider configured)"
            : "OTP sent via SMS",
        };
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : "Unknown error";
        if (msg === "OTP_RATE_LIMITED") {
          return { success: false, message: "Please wait 60 seconds before requesting a new OTP" };
        }
        console.error("[AUTH] OTP send error:", msg);
        return { success: false, message: "Failed to send OTP" };
      }
    }),

  verifyOtp: publicProcedure
    .input(
      z.object({
        phone: z.string().min(9),
        code: z.string().length(6),
      })
    )
    .mutation(({ input }) => {
      const result = otpService.verifyOtp(input.phone, input.code);
      console.log("[AUTH] OTP verify for:", input.phone, "result:", result.message);
      return result;
    }),

  register: publicProcedure
    .input(
      z.object({
        name: z.string().min(1),
        phone: z.string().min(9),
        email: z.string().optional(),
        role: z.enum(["borrower", "agent"]),
        agentType: z.enum(["individual", "company"]).optional(),
        state: z.string().optional(),
        district: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const existing = await store.getUserByPhone(input.phone);
      if (existing) {
        return { success: false, message: "Phone already registered", user: mapUser(existing) };
      }

      const now = new Date().toISOString();
      const user = await store.createUser({
        id: `user_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        name: input.name,
        phone: input.phone,
        email: input.email || "",
        role: input.role,
        avatar: undefined,
        is_verified: false,
        agent_type: input.agentType,
        kyc_status: input.role === "agent" ? "none" : undefined,
        state: input.state,
        district: input.district,
        rating: 0,
        interests: [],
        is_online: true,
        last_active_at: now,
        created_at: now,
        updated_at: now,
      });

      console.log("[AUTH] User registered:", user.id, user.name);
      return { success: true, user: mapUser(user) };
    }),

  login: publicProcedure
    .input(
      z.object({
        phone: z.string().min(9),
      })
    )
    .mutation(async ({ input }) => {
      const user = await store.getUserByPhone(input.phone);
      if (!user) {
        const now = new Date().toISOString();
        const newUser = await store.createUser({
          id: `user_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          name: `User ${input.phone.slice(-4)}`,
          phone: input.phone,
          email: "",
          role: "borrower",
          is_verified: false,
          is_online: true,
          last_active_at: now,
          created_at: now,
          updated_at: now,
        });
        console.log("[AUTH] New user auto-created on login:", newUser.id);
        return { success: true, user: mapUser(newUser) };
      }

      await store.updateUser(user.id, { is_online: true, last_active_at: new Date().toISOString() });
      console.log("[AUTH] User logged in:", user.id, user.name);
      return { success: true, user: mapUser(user) };
    }),

  adminLogin: publicProcedure
    .input(
      z.object({
        email: z.string().email(),
        password: z.string().min(1),
      })
    )
    .mutation(async ({ input }) => {
      const creds = store.getAdminCredentials();
      if (input.email !== creds.email || input.password !== creds.password) {
        console.log("[AUTH] Admin login failed for:", input.email);
        return { success: false, message: "Invalid credentials" };
      }

      const admin = await store.getUserByEmail(creds.email);
      if (admin) {
        await store.updateUser(admin.id, { is_online: true, last_active_at: new Date().toISOString() });
      }
      console.log("[AUTH] Admin logged in successfully");
      return { success: true, user: admin ? mapUser(admin) : null };
    }),

  updateProfile: publicProcedure
    .input(
      z.object({
        userId: z.string(),
        name: z.string().optional(),
        email: z.string().optional(),
        avatar: z.string().optional(),
        state: z.string().optional(),
        district: z.string().optional(),
        phone: z.string().optional(),
        interests: z.array(z.string()).optional(),
        rating: z.number().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const { userId, ...data } = input;
      const updated = await store.updateUser(userId, data);
      if (!updated) {
        return { success: false, message: "User not found" };
      }
      console.log("[AUTH] Profile updated:", userId);
      return { success: true, user: mapUser(updated) };
    }),

  setOnlineStatus: publicProcedure
    .input(
      z.object({
        userId: z.string(),
        isOnline: z.boolean(),
      })
    )
    .mutation(async ({ input }) => {
      await store.updateUser(input.userId, {
        is_online: input.isOnline,
        last_active_at: new Date().toISOString(),
      });
      return { success: true };
    }),

  logout: publicProcedure
    .input(z.object({ userId: z.string() }))
    .mutation(async ({ input }) => {
      await store.updateUser(input.userId, { is_online: false });
      console.log("[AUTH] User logged out:", input.userId);
      return { success: true };
    }),
});
