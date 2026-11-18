/** Ghana's 16 administrative regions (mirrors public.regions). */
export const REGIONS = [
  { code: "AH", name: "Ahafo" },
  { code: "AS", name: "Ashanti" },
  { code: "BE", name: "Bono East" },
  { code: "BO", name: "Bono" },
  { code: "CP", name: "Central" },
  { code: "EP", name: "Eastern" },
  { code: "AA", name: "Greater Accra" },
  { code: "NE", name: "North East" },
  { code: "NP", name: "Northern" },
  { code: "OT", name: "Oti" },
  { code: "SV", name: "Savannah" },
  { code: "UE", name: "Upper East" },
  { code: "UW", name: "Upper West" },
  { code: "TV", name: "Volta" },
  { code: "WP", name: "Western" },
  { code: "WN", name: "Western North" },
] as const;

export const REGION_CODES = REGIONS.map((r) => r.code) as [string, ...string[]];

/** Common SHS programmes, offered as suggestions — schools can add their own. */
export const COMMON_PROGRAMMES = ["General Science", "General Arts", "Business", "Visual Arts", "Home Economics", "Agricultural Science", "Technical"];

export const OWNERSHIP = [
  { value: "public", label: "Public" },
  { value: "private", label: "Private" },
] as const;

export const BOARDING = [
  { value: "day", label: "Day" },
  { value: "boarding", label: "Boarding" },
  { value: "day_and_boarding", label: "Day and boarding" },
] as const;

export const CATEGORIES = [
  { value: "unclassified", label: "Not sure / not classified" },
  { value: "A", label: "Category A" },
  { value: "B", label: "Category B" },
  { value: "C", label: "Category C" },
  { value: "D", label: "Category D" },
  { value: "E", label: "Category E" },
] as const;

export const labelOf = (list: readonly { value: string; label: string }[], value: string) => list.find((i) => i.value === value)?.label ?? value;
