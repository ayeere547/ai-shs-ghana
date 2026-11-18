/** Permission keys mirror public.permissions. The database is the source of truth and enforces them. */
export type PlatformPermission =
  | "platform.dashboard"
  | "schools.read_all"
  | "schools.verify"
  | "schools.suspend"
  | "platform.users.manage"
  | "platform.audit.read"
  | "platform.settings.manage"
  | "plans.manage"
  | "subscriptions.manage"
  | "analytics.national"
  | "support.manage";

export type SchoolPermission =
  | "school.dashboard"
  | "school.settings.manage"
  | "school.branding.manage"
  | "members.read"
  | "members.manage"
  | "academics.read"
  | "academics.manage"
  | "school.audit.read"
  | "students.read"
  | "students.manage"
  | "staff.read"
  | "staff.manage"
  | "timetable.manage"
  | "attendance.record"
  | "attendance.manage"
  | "assessments.record"
  | "assessments.manage"
  | "results.read"
  | "results.publish"
  | "classroom.teach"
  | "classroom.manage"
  | "announcements.manage"
  | "library.manage"
  | "student.portal";

export type PlatformRoleKey = "super_admin" | "platform_admin" | "support_officer" | "finance_admin" | "data_analyst";

export type SchoolRoleKey =
  | "headteacher"
  | "assistant_headteacher"
  | "school_admin"
  | "academic_admin"
  | "hr_officer"
  | "accountant"
  | "exam_officer"
  | "head_of_department"
  | "counsellor"
  | "housemaster"
  | "librarian"
  | "storekeeper"
  | "nurse"
  | "teacher"
  | "student"
  | "parent";

export const PLATFORM_ROLES: { key: PlatformRoleKey; label: string; rank: number }[] = [
  { key: "super_admin", label: "Super Administrator", rank: 100 },
  { key: "platform_admin", label: "National Platform Administrator", rank: 90 },
  { key: "finance_admin", label: "Platform Finance Administrator", rank: 60 },
  { key: "support_officer", label: "Platform Support Officer", rank: 50 },
  { key: "data_analyst", label: "Platform Data Analyst", rank: 40 },
];

export const SCHOOL_ROLES: { key: SchoolRoleKey; label: string; rank: number; staff: boolean }[] = [
  { key: "headteacher", label: "Headmaster / Headmistress", rank: 100, staff: true },
  { key: "assistant_headteacher", label: "Assistant Headmaster", rank: 90, staff: true },
  { key: "school_admin", label: "School Administrator", rank: 85, staff: true },
  { key: "academic_admin", label: "Academic Administrator", rank: 70, staff: true },
  { key: "hr_officer", label: "Human Resource Officer", rank: 60, staff: true },
  { key: "accountant", label: "Accountant", rank: 60, staff: true },
  { key: "exam_officer", label: "Examination Officer", rank: 60, staff: true },
  { key: "head_of_department", label: "Head of Department", rank: 50, staff: true },
  { key: "counsellor", label: "Guidance & Counselling Officer", rank: 40, staff: true },
  { key: "housemaster", label: "Housemaster / Housemistress", rank: 40, staff: true },
  { key: "librarian", label: "School Librarian", rank: 40, staff: true },
  { key: "storekeeper", label: "Storekeeper", rank: 40, staff: true },
  { key: "nurse", label: "School Nurse", rank: 40, staff: true },
  { key: "teacher", label: "Teacher", rank: 30, staff: true },
  { key: "student", label: "Student", rank: 10, staff: false },
  { key: "parent", label: "Parent / Guardian", rank: 10, staff: false },
];

export const schoolRoleLabel = (key: string) => SCHOOL_ROLES.find((r) => r.key === key)?.label ?? key;
export const platformRoleLabel = (key: string) => PLATFORM_ROLES.find((r) => r.key === key)?.label ?? key;

/** Roles a member of the given rank may assign (mirrors the database guard in add_school_member). */
export const assignableSchoolRoles = (myRank: number) => SCHOOL_ROLES.filter((r) => r.rank <= myRank);
export const assignablePlatformRoles = (myRank: number) => PLATFORM_ROLES.filter((r) => r.rank <= myRank && (r.key !== "super_admin" || myRank >= 100));
