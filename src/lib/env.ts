/** Central, typed access to configuration. Server-only secrets are never read in client components. */
export const publicEnv = {
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
  siteUrl: process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3400",
  supportEmail: process.env.NEXT_PUBLIC_SUPPORT_EMAIL ?? "",
};

export const isSupabaseConfigured = () => Boolean(publicEnv.supabaseUrl && publicEnv.supabaseAnonKey);

export function serverEnv() {
  return {
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
    openaiApiKey: process.env.OPENAI_API_KEY ?? "",
    resendApiKey: process.env.RESEND_API_KEY ?? "",
    smsApiKey: process.env.SMS_API_KEY ?? "",
    paystackSecretKey: process.env.PAYSTACK_SECRET_KEY ?? "",
  };
}

/** Integration status for the setup page — reports configured / not configured, never the values. */
export function integrationStatus() {
  const env = serverEnv();
  return [
    { key: "supabase", name: "Supabase (database, auth, storage)", required: true, configured: isSupabaseConfigured() && Boolean(env.serviceRoleKey), envVars: ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY"] },
    { key: "openai", name: "OpenAI (AI tutor & teacher tools — Phase 4)", required: false, configured: Boolean(env.openaiApiKey), envVars: ["OPENAI_API_KEY", "OPENAI_MODEL"] },
    { key: "email", name: "Email notifications (Resend — Phase 5)", required: false, configured: Boolean(env.resendApiKey), envVars: ["RESEND_API_KEY", "EMAIL_FROM"] },
    { key: "sms", name: "SMS provider (Phase 5)", required: false, configured: Boolean(env.smsApiKey), envVars: ["SMS_PROVIDER", "SMS_API_KEY", "SMS_SENDER_ID"] },
    { key: "payments", name: "Paystack / Hubtel (Phase 6)", required: false, configured: Boolean(env.paystackSecretKey), envVars: ["PAYSTACK_SECRET_KEY", "HUBTEL_CLIENT_ID"] },
  ];
}
