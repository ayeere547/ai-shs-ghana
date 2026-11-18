/**
 * Public website content. Every feature carries an honest availability label so the site never
 * presents roadmap items as live. Update `status` as development phases ship.
 */
export type FeatureStatus = "available" | "in_development";

export type Feature = { title: string; body: string; status: FeatureStatus; phase?: number };

export const FEATURE_GROUPS: { id: string; title: string; intro: string; features: Feature[] }[] = [
  {
    id: "management",
    title: "School management",
    intro: "Run the school's structure, staff and records in one place, with each school's data kept separate.",
    features: [
      { title: "Verified school onboarding", body: "Register, get verified by platform staff, and follow a guided setup wizard.", status: "available" },
      { title: "Roles and permissions", body: "Sixteen school roles from headteacher to storekeeper, enforced in the database.", status: "available" },
      { title: "Academic structure", body: "Academic years, terms, programmes, classes, subjects, departments and houses.", status: "available" },
      { title: "Student information", body: "Admissions, profiles, transfers, progression and bulk CSV/Excel import.", status: "in_development", phase: 2 },
      { title: "Timetables and attendance", body: "Conflict-checked timetables and daily attendance with trends.", status: "in_development", phase: 2 },
      { title: "Finance, boarding and library", body: "Fees in GHS, receipts, dormitories, library loans and inventory.", status: "in_development", phase: 5 },
    ],
  },
  {
    id: "ai",
    title: "AI learning",
    intro: "A curriculum-aware AI tutor that explains, asks questions back and cites its sources — designed to build understanding, not hand out answers.",
    features: [
      { title: "AI personal tutor", body: "Step-by-step explanations, worked examples and practice in core and elective subjects.", status: "in_development", phase: 4 },
      { title: "Cited curriculum answers", body: "Answers draw on licensed and school-approved materials, and say when they're unsure.", status: "in_development", phase: 4 },
      { title: "AI teacher assistant", body: "Lesson plans, notes, question sets and draft report comments — always reviewed by a teacher.", status: "in_development", phase: 4 },
    ],
  },
  {
    id: "wassce",
    title: "WASSCE preparation",
    intro: "Subject and topic practice, timed mock exams and readiness reports.",
    features: [
      { title: "Timed mock examinations", body: "Practise under exam conditions with automatic marking of objective questions.", status: "in_development", phase: 3 },
      { title: "Weak-topic detection", body: "Personalised revision plans based on each student's results.", status: "in_development", phase: 4 },
      { title: "Clearly labelled questions", body: "Licensed past questions and AI-generated practice questions are always labelled differently.", status: "in_development", phase: 3 },
    ],
  },
  {
    id: "parents",
    title: "Parents and communication",
    intro: "Keep verified parents and guardians informed about attendance, results and school announcements.",
    features: [
      { title: "Parent portal", body: "Mobile-friendly view of each linked child's progress and obligations.", status: "in_development", phase: 5 },
      { title: "Notifications", body: "In-app now; email and SMS through configurable providers next.", status: "in_development", phase: 5 },
    ],
  },
];

export type Audience = "schools" | "students" | "teachers" | "parents";

export const AUDIENCES: Record<Audience, { title: string; headline: string; intro: string; points: { title: string; body: string; status: FeatureStatus }[]; cta: { label: string; href: string } }> = {
  schools: {
    title: "For schools",
    headline: "Digital infrastructure built for Ghanaian Senior High Schools",
    intro: "Give your administration, teachers, students and parents one secure platform — configured for your school's own programmes, classes and calendar.",
    points: [
      { title: "Your school, your configuration", body: "Programmes, classes, subjects, houses, terms and branding are set by your school, not imposed.", status: "available" },
      { title: "Your data stays yours", body: "Each school is an isolated tenant. Other schools — and platform staff — cannot browse your records.", status: "available" },
      { title: "Accountable access", body: "Every role change and configuration change is recorded in an audit log you can read.", status: "available" },
      { title: "Plans that fit public schools", body: "Free, paid, sponsored and subsidised plans are supported, so funding models can differ by school.", status: "in_development" },
    ],
    cta: { label: "Register your school", href: "/register" },
  },
  students: {
    title: "For students",
    headline: "A study partner that helps you understand, not just answer",
    intro: "Your timetable, assignments, results and an AI tutor for your subjects — in one place, on your phone.",
    points: [
      { title: "AI tutor for your subjects", body: "Ask about Core Maths, Integrated Science, English, Social Studies and your electives.", status: "in_development" },
      { title: "WASSCE practice", body: "Topic practice, mock exams and a revision plan built around your weak areas.", status: "in_development" },
      { title: "Works on low bandwidth", body: "Lightweight pages and downloadable materials for patchy connections.", status: "in_development" },
    ],
    cta: { label: "Student sign in", href: "/login?as=student" },
  },
  teachers: {
    title: "For teachers",
    headline: "Spend less time on paperwork and more time teaching",
    intro: "Plan lessons, create assessments and track your classes with AI assistance you stay in control of.",
    points: [
      { title: "Lesson planner and question generator", body: "Structured lesson plans and question sets by subject, topic, difficulty and format.", status: "in_development" },
      { title: "Marking assistant", body: "Objective questions marked automatically; written answers get suggested marks you approve.", status: "in_development" },
      { title: "Nothing published without you", body: "AI-drafted grades and report comments are never released without teacher review.", status: "in_development" },
    ],
    cta: { label: "Staff sign in", href: "/login?as=school" },
  },
  parents: {
    title: "For parents",
    headline: "Stay close to your child's progress",
    intro: "See attendance, results and school announcements for the children you're verified to represent.",
    points: [
      { title: "Verified access only", body: "You only ever see records for children the school has linked to you.", status: "in_development" },
      { title: "Results and attendance", body: "Term results, attendance summaries and assignment progress.", status: "in_development" },
      { title: "School communication", body: "Announcements and messages from authorised school staff.", status: "in_development" },
    ],
    cta: { label: "Parent sign in", href: "/login?as=parent" },
  },
};

export const CORE_SUBJECTS = ["English Language", "Core Mathematics", "Integrated Science", "Social Studies"];
export const ELECTIVE_SUBJECTS = [
  "Elective Mathematics", "Biology", "Chemistry", "Physics", "Economics", "Geography", "Government", "History",
  "Literature in English", "Accounting", "Business Management", "Financial Accounting", "ICT",
];
