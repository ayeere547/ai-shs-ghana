import { describe, expect, it } from "vitest";

import { assignablePlatformRoles, assignableSchoolRoles } from "@/lib/auth/permissions";
import { platformNavigation, schoolNavigation } from "@/lib/navigation";
import { canLaunch, onboardingSteps, type OnboardingCounts } from "@/lib/school/onboarding";
import { readResourceForm, RESOURCES, resourceSchema } from "@/lib/school/resources";
import { pageRange, searchTerm } from "@/lib/schools";
import { formValues, loginSchema, registerSchema } from "@/lib/validation/auth";
import { friendlyDbError, parseRegistrationForm, toRegistrationPayload } from "@/lib/validation/school";
import { safeNextPath } from "@/lib/utils";

const form = (entries: [string, string][]) => {
  const fd = new FormData();
  for (const [k, v] of entries) fd.append(k, v);
  return fd;
};

const validRegistration: [string, string][] = [
  ["name", "Test Hills Senior High School"],
  ["category", "unclassified"],
  ["ownership", "public"],
  ["boardingType", "day_and_boarding"],
  ["regionCode", "AS"],
  ["district", "Kumasi Metropolitan"],
  ["address", "P.O. Box 10, Kumasi"],
  ["email", "Office@TestHills.example"],
  ["phone", "+233 24 000 0000"],
  ["website", "testhills.example"],
  ["headmasterName", "Ama Mensah"],
  ["headmasterEmail", ""],
  ["headmasterPhone", ""],
  ["programmes", "General Science"],
  ["programmes", "Business"],
  ["otherProgrammes", "Visual Arts, General Science ,"],
  ["registrantRole", "headteacher"],
  ["confirmAuthority", "on"],
];

describe("school registration validation", () => {
  it("accepts a complete registration and normalises it", () => {
    const r = parseRegistrationForm(form(validRegistration));
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(r.data.email).toBe("office@testhills.example");
    expect(r.data.website).toBe("https://testhills.example");
    expect(r.data.programmes).toEqual(["General Science", "Business", "Visual Arts"]);
    expect(r.data.headmasterEmail).toBeUndefined();
    const payload = toRegistrationPayload(r.data);
    expect(payload).toMatchObject({ region_code: "AS", boarding_type: "day_and_boarding", registrant_role: "headteacher", headmaster_email: null });
  });

  it("requires authority confirmation, a region and at least one programme", () => {
    const r = parseRegistrationForm(form(validRegistration.filter(([k]) => !["confirmAuthority", "regionCode", "programmes", "otherProgrammes"].includes(k))));
    expect(r.success).toBe(false);
    if (r.success) return;
    const fields = Object.keys(r.error.flatten().fieldErrors);
    expect(fields).toEqual(expect.arrayContaining(["confirmAuthority", "regionCode", "programmes"]));
  });

  it("rejects non-http websites and invalid regions", () => {
    const r = parseRegistrationForm(form(validRegistration.map(([k, v]) => (k === "website" ? [k, "javascript:alert(1)"] : k === "regionCode" ? [k, "XX"] : [k, v]))));
    expect(r.success).toBe(false);
  });
});

describe("auth validation", () => {
  it("enforces a strong password and matching confirmation", () => {
    const base = { fullName: "Kofi Owusu", email: "kofi@example.com", acceptPrivacy: "on" };
    expect(registerSchema.safeParse({ ...base, password: "short", confirmPassword: "short" }).success).toBe(false);
    expect(registerSchema.safeParse({ ...base, password: "Str0ng!Password", confirmPassword: "different" }).success).toBe(false);
    expect(registerSchema.safeParse({ ...base, password: "Str0ng!Password", confirmPassword: "Str0ng!Password" }).success).toBe(true);
  });

  it("normalises login emails", () => {
    const r = loginSchema.safeParse({ email: "  USER@Example.COM ", password: "x" });
    expect(r.success && r.data.email).toBe("user@example.com");
  });

  it("never echoes passwords back to the browser", () => {
    const v = formValues(form([["email", "a@b.c"], ["password", "secret"], ["confirmPassword", "secret"], ["$ACTION_ID_x", "1"]]));
    expect(v).toEqual({ email: "a@b.c" });
  });
});

describe("safeNextPath", () => {
  it.each([
    ["/school", "/school"],
    ["//evil.example", "/app"],
    ["/\\evil.example", "/app"],
    ["https://evil.example", "/app"],
    [null, "/app"],
  ])("%s → %s", (input, expected) => expect(safeNextPath(input)).toBe(expected));
});

describe("resource engine", () => {
  it("validates academic years including date order", () => {
    const schema = resourceSchema(RESOURCES.years);
    expect(schema.safeParse(readResourceForm(RESOURCES.years, form([["name", "2026/2027"], ["starts_on", "2026-09-01"], ["ends_on", "2027-07-31"], ["is_current", "on"]])))).toMatchObject({
      success: true,
      data: { name: "2026/2027", is_current: true },
    });
    const backwards = schema.safeParse(readResourceForm(RESOURCES.years, form([["name", "Bad"], ["starts_on", "2027-01-01"], ["ends_on", "2026-01-01"]])));
    expect(backwards.success).toBe(false);
  });

  it("treats empty optional selects/numbers as null and rejects bad ids", () => {
    const schema = resourceSchema(RESOURCES.classes);
    expect(schema.safeParse(readResourceForm(RESOURCES.classes, form([["name", "1 Arts A"], ["form_level", "1"], ["programme_id", ""], ["capacity", ""]])))).toMatchObject({
      success: true,
      data: { programme_id: null, capacity: null, form_level: 1 },
    });
    expect(schema.safeParse(readResourceForm(RESOURCES.classes, form([["name", "X"], ["form_level", "1"], ["programme_id", "not-a-uuid"]]))).success).toBe(false);
    expect(schema.safeParse(readResourceForm(RESOURCES.classes, form([["name", "X"], ["form_level", "9"]]))).success).toBe(false);
  });

  it("never accepts school_id from the form", () => {
    const parsed = resourceSchema(RESOURCES.departments).safeParse({ ...readResourceForm(RESOURCES.departments, form([["name", "Science"], ["school_id", "x"]])), school_id: "x" });
    expect(parsed.success && "school_id" in parsed.data).toBe(false);
  });
});

describe("onboarding", () => {
  const base: OnboardingCounts = { status: "active", hasLogoOrMotto: false, brandingCustomised: false, years: 1, currentYear: true, terms: 3, programmes: 2, classes: 4, staff: 1, students: 0, settingsReviewed: false, launched: false };

  it("can launch once required steps are done, regardless of optional ones", () => {
    expect(canLaunch(onboardingSteps(base))).toBe(true);
  });

  it("blocks launch without a current year or classes", () => {
    expect(canLaunch(onboardingSteps({ ...base, currentYear: false }))).toBe(false);
    expect(canLaunch(onboardingSteps({ ...base, classes: 0 }))).toBe(false);
  });

  it("locks configuration steps until verification", () => {
    const steps = onboardingSteps({ ...base, status: "pending_verification" });
    expect(steps.find((s) => s.key === "verify")!.done).toBe(false);
    expect(steps.filter((s) => s.number >= 4).every((s) => !s.available)).toBe(true);
  });

  it("student import is optional, available once active, and done when students exist", () => {
    expect(onboardingSteps(base).find((s) => s.key === "students")).toMatchObject({ available: true, done: false, required: false });
    expect(onboardingSteps({ ...base, students: 3 }).find((s) => s.key === "students")!.done).toBe(true);
    expect(onboardingSteps({ ...base, status: "pending_verification" }).find((s) => s.key === "students")!.available).toBe(false);
  });
});

describe("roles and navigation", () => {
  it("mirrors the database rank guard", () => {
    expect(assignableSchoolRoles(85).map((r) => r.key)).not.toContain("headteacher");
    expect(assignableSchoolRoles(100).map((r) => r.key)).toContain("headteacher");
    expect(assignablePlatformRoles(90).map((r) => r.key)).not.toContain("super_admin");
    expect(assignablePlatformRoles(100).map((r) => r.key)).toContain("super_admin");
  });

  it("filters navigation by permission", () => {
    const teacher = schoolNavigation(new Set(["school.dashboard", "academics.read"]));
    const labels = teacher.flatMap((s) => s.items.map((i) => i.label));
    expect(labels).toContain("Academic setup");
    expect(labels).not.toContain("Settings");
    expect(labels).not.toContain("Members & access");
    expect(platformNavigation(new Set(["platform.dashboard", "analytics.national"])).flatMap((s) => s.items.map((i) => i.label))).not.toContain("Platform staff");
  });
});

describe("helpers", () => {
  it("bounds pagination", () => {
    expect(pageRange("3", 20)).toMatchObject({ page: 3, from: 40, to: 59 });
    expect(pageRange("-5")).toMatchObject({ page: 1, from: 0 });
    expect(pageRange("abc")).toMatchObject({ page: 1 });
  });

  it("strips PostgREST filter metacharacters from search terms", () => {
    expect(searchTerm("a,b).or(x%")).toBe("a b .or x");
    expect(searchTerm("   ")).toBeNull();
  });

  it("maps database errors to safe messages", () => {
    expect(friendlyDbError("new row violates row-level security policy")).toMatch(/permission/);
    expect(friendlyDbError("you cannot assign a role above your own")).toMatch(/above your own/);
    expect(friendlyDbError("some internal detail")).toBe("Something went wrong. Please try again.");
  });
});
