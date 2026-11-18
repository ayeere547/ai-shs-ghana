import { z } from "zod";

const blank = z
  .string()
  .optional()
  .transform((v) => v?.trim() || undefined);

export const STAFF_TITLES = ["Mr", "Mrs", "Ms", "Miss", "Dr", "Rev", "Prof"] as const;
export const EMPLOYMENT_TYPES = [
  { value: "permanent", label: "Permanent" },
  { value: "contract", label: "Contract" },
  { value: "national_service", label: "National service" },
  { value: "part_time", label: "Part-time" },
  { value: "volunteer", label: "Volunteer" },
] as const;
export const EMPLOYMENT_STATUSES = [
  { value: "active", label: "Active" },
  { value: "on_leave", label: "On leave" },
  { value: "left", label: "Left the school" },
] as const;

export const staffSchema = z.object({
  staffNumber: blank.pipe(z.string().max(40).regex(/^[A-Za-z0-9/ -]+$/, "Use letters, numbers, / and - only").optional()),
  title: blank.pipe(z.enum(STAFF_TITLES).optional()),
  firstName: z.string().trim().min(1, "Enter the first name").max(80),
  lastName: z.string().trim().min(1, "Enter the surname").max(80),
  gender: blank.pipe(z.enum(["male", "female"]).optional()),
  email: blank.pipe(z.email("Enter a valid email").max(254).optional()),
  phone: blank.pipe(z.string().max(32).regex(/^[+0-9 ()-]+$/, "Use digits, spaces and + only").optional()),
  jobTitle: z.string().trim().min(2, "Enter the job title").max(80),
  departmentId: z
    .string()
    .optional()
    .transform((v) => v || null)
    .pipe(z.uuid().nullable()),
  isTeaching: z.literal("on").optional(),
  employmentType: z.enum(["permanent", "contract", "national_service", "part_time", "volunteer"]),
  employmentStatus: z.enum(["active", "on_leave", "left"]),
  dateJoined: blank.pipe(z.iso.date().optional()),
});

export const toStaffRow = (v: z.infer<typeof staffSchema>) => ({
  title: v.title ?? null,
  first_name: v.firstName,
  last_name: v.lastName,
  gender: v.gender ?? null,
  email: v.email ?? null,
  phone: v.phone ?? null,
  job_title: v.jobTitle,
  department_id: v.departmentId,
  is_teaching: v.isTeaching === "on",
  employment_type: v.employmentType,
  employment_status: v.employmentStatus,
  date_joined: v.dateJoined ?? null,
});

export const assignmentSchema = z.object({
  staffId: z.uuid(),
  classId: z.uuid("Choose a class"),
  subjectId: z.uuid("Choose a subject"),
  periodsPerWeek: z.coerce.number().int().min(0).max(20),
});

export const staffName = (s: { title?: string | null; first_name: string; last_name: string }) => [s.title, s.first_name, s.last_name].filter(Boolean).join(" ");
