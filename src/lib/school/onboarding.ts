/** Onboarding wizard steps (brief §8). Completion is derived from real data, never from a stored flag. */
export type OnboardingCounts = {
  status: string;
  hasLogoOrMotto: boolean;
  brandingCustomised: boolean;
  years: number;
  currentYear: boolean;
  terms: number;
  programmes: number;
  classes: number;
  staff: number;
  settingsReviewed: boolean;
  launched: boolean;
};

export type OnboardingStep = {
  number: number;
  key: string;
  title: string;
  description: string;
  done: boolean;
  required: boolean;
  available: boolean;
  note?: string;
};

export function onboardingSteps(c: OnboardingCounts): OnboardingStep[] {
  const active = c.status === "active";
  return [
    { number: 1, key: "register", title: "Register school", description: "Official details submitted.", done: true, required: true, available: true },
    { number: 2, key: "verify", title: "Verification", description: "Platform staff confirm the school's details.", done: active || c.status === "suspended", required: true, available: true },
    { number: 3, key: "admin", title: "Administrator account", description: "Your account administers the school.", done: true, required: true, available: true },
    { number: 4, key: "branding", title: "Branding", description: "Logo, colours and motto used on documents and portals.", done: c.brandingCustomised || c.hasLogoOrMotto, required: false, available: active },
    { number: 5, key: "calendar", title: "Academic year & terms", description: "The current academic year and its terms.", done: c.currentYear && c.terms > 0, required: true, available: active },
    { number: 6, key: "structure", title: "Programmes & classes", description: "What the school offers and its class groups.", done: c.programmes > 0 && c.classes > 0, required: true, available: active },
    { number: 7, key: "staff", title: "Add staff", description: "Invite teachers and administrators.", done: c.staff > 1, required: false, available: active },
    { number: 8, key: "students", title: "Import students", description: "CSV/Excel import with validation and duplicate detection.", done: false, required: false, available: false, note: "Arrives with the student management module (Phase 2)." },
    { number: 9, key: "settings", title: "School settings", description: "School days, form levels, period length and portals.", done: c.settingsReviewed, required: false, available: active },
    { number: 10, key: "launch", title: "Launch", description: "Open the school dashboard to your staff.", done: c.launched, required: true, available: active },
  ];
}

/** Launch is allowed once every required step before it is done. */
export const canLaunch = (steps: OnboardingStep[]) => steps.filter((s) => s.required && s.key !== "launch").every((s) => s.done);

export const progressPercent = (steps: OnboardingStep[]) => Math.round((steps.filter((s) => s.done).length / steps.filter((s) => s.available || s.done).length) * 100);
