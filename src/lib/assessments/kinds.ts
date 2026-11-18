export const ASSESSMENT_KINDS = [
  { value: "class_test", label: "Class test" },
  { value: "assignment", label: "Assignment" },
  { value: "project", label: "Project" },
  { value: "mid_term", label: "Mid-term exam" },
  { value: "end_of_term", label: "End-of-term exam" },
  { value: "mock", label: "Mock exam" },
] as const;

export const kindLabel = (k: string) => ASSESSMENT_KINDS.find((x) => x.value === k)?.label ?? k;
