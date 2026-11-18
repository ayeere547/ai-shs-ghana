"use client";

import { useActionState } from "react";

import { SubmitButton } from "@/components/ui/confirm-submit";
import { Alert, Card, CardBody, CardHeader, Field, Input, Select, Textarea } from "@/components/ui/primitives";
import { BOARDING, CATEGORIES, COMMON_PROGRAMMES, OWNERSHIP, REGIONS } from "@/lib/ghana";
import type { FormState } from "@/lib/validation/auth";

import { registerSchool } from "./actions";

export function RegistrationForm({ defaultEmail }: { defaultEmail: string }) {
  const [state, action] = useActionState(registerSchool, {} as FormState);
  const v = (name: string, fallback = "") => {
    const value = state.values?.[name];
    return Array.isArray(value) ? value[0] : (value ?? fallback);
  };
  const chosen = new Set([state.values?.programmes ?? []].flat());
  const err = (name: string) => state.errors?.[name];
  const aria = (name: string) => (err(name) ? { "aria-invalid": true, "aria-describedby": `${name}-error` } : {});

  return (
    // key forces defaultValues to refresh after a failed submission
    <form key={JSON.stringify(state.values ?? {})} action={action} className="space-y-6" noValidate>
      {state.message && <Alert tone="danger">{state.message}</Alert>}

      <Card>
        <CardHeader title="School identity" description="As it appears on official GES / registration documents." />
        <CardBody className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Field label="Official school name" htmlFor="name" error={err("name")}>
              <Input id="name" name="name" defaultValue={v("name")} required {...aria("name")} />
            </Field>
          </div>
          <Field label="School code (optional)" htmlFor="schoolCode" error={err("schoolCode")} hint="Your GES or official identifier, if you have one.">
            <Input id="schoolCode" name="schoolCode" defaultValue={v("schoolCode")} {...aria("schoolCode")} />
          </Field>
          <Field label="Category" htmlFor="category" error={err("category")}>
            <Select id="category" name="category" defaultValue={v("category", "unclassified")}>
              {CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
            </Select>
          </Field>
          <Field label="School type" htmlFor="ownership" error={err("ownership")}>
            <Select id="ownership" name="ownership" defaultValue={v("ownership")} required {...aria("ownership")}>
              <option value="" disabled>Choose…</option>
              {OWNERSHIP.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </Select>
          </Field>
          <Field label="Day or boarding" htmlFor="boardingType" error={err("boardingType")}>
            <Select id="boardingType" name="boardingType" defaultValue={v("boardingType")} required {...aria("boardingType")}>
              <option value="" disabled>Choose…</option>
              {BOARDING.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </Select>
          </Field>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Location and contact" />
        <CardBody className="grid gap-4 sm:grid-cols-2">
          <Field label="Region" htmlFor="regionCode" error={err("regionCode")}>
            <Select id="regionCode" name="regionCode" defaultValue={v("regionCode")} required {...aria("regionCode")}>
              <option value="" disabled>Choose a region…</option>
              {REGIONS.map((r) => <option key={r.code} value={r.code}>{r.name}</option>)}
            </Select>
          </Field>
          <Field label="District" htmlFor="district" error={err("district")}>
            <Input id="district" name="district" defaultValue={v("district")} required {...aria("district")} />
          </Field>
          <div className="sm:col-span-2">
            <Field label="Physical / postal address" htmlFor="address" error={err("address")}>
              <Input id="address" name="address" defaultValue={v("address")} required {...aria("address")} />
            </Field>
          </div>
          <Field label="Official school email" htmlFor="email" error={err("email")}>
            <Input id="email" name="email" type="email" defaultValue={v("email")} required {...aria("email")} />
          </Field>
          <Field label="Official telephone" htmlFor="phone" error={err("phone")}>
            <Input id="phone" name="phone" type="tel" inputMode="tel" defaultValue={v("phone")} required {...aria("phone")} />
          </Field>
          <div className="sm:col-span-2">
            <Field label="Website (optional)" htmlFor="website" error={err("website")}>
              <Input id="website" name="website" defaultValue={v("website")} placeholder="www.example.edu.gh" {...aria("website")} />
            </Field>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Headteacher" />
        <CardBody className="grid gap-4 sm:grid-cols-3">
          <Field label="Full name" htmlFor="headmasterName" error={err("headmasterName")}>
            <Input id="headmasterName" name="headmasterName" defaultValue={v("headmasterName")} required {...aria("headmasterName")} />
          </Field>
          <Field label="Email (optional)" htmlFor="headmasterEmail" error={err("headmasterEmail")}>
            <Input id="headmasterEmail" name="headmasterEmail" type="email" defaultValue={v("headmasterEmail")} {...aria("headmasterEmail")} />
          </Field>
          <Field label="Phone (optional)" htmlFor="headmasterPhone" error={err("headmasterPhone")}>
            <Input id="headmasterPhone" name="headmasterPhone" type="tel" defaultValue={v("headmasterPhone")} {...aria("headmasterPhone")} />
          </Field>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Programmes offered" description="You can configure programmes, classes and subjects in detail after verification." />
        <CardBody className="space-y-4">
          <fieldset>
            <legend className="sr-only">Programmes</legend>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {COMMON_PROGRAMMES.map((p) => (
                <label key={p} className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm hover:bg-surface-muted">
                  <input type="checkbox" name="programmes" value={p} defaultChecked={chosen.has(p)} className="h-4 w-4 accent-[var(--royal)]" />
                  {p}
                </label>
              ))}
            </div>
          </fieldset>
          <Field label="Other programmes (comma-separated)" htmlFor="otherProgrammes" error={err("programmes")}>
            <Input id="otherProgrammes" name="otherProgrammes" defaultValue={v("otherProgrammes")} />
          </Field>
          <Field label="Short description (optional)" htmlFor="description" error={err("description")} hint="Shown in the public directory only if you choose to list the school.">
            <Textarea id="description" name="description" defaultValue={v("description")} maxLength={1000} />
          </Field>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Your role" description={`You (${defaultEmail}) will be the school's first administrator on the platform.`} />
        <CardBody className="space-y-4">
          <Field label="I am the school's" htmlFor="registrantRole" error={err("registrantRole")}>
            <Select id="registrantRole" name="registrantRole" defaultValue={v("registrantRole", "school_admin")}>
              <option value="headteacher">Headmaster / Headmistress</option>
              <option value="school_admin">School administrator (authorised by the headteacher)</option>
            </Select>
          </Field>
          <div className="space-y-1">
            <label className="flex items-start gap-2 text-sm text-muted-foreground">
              <input type="checkbox" name="confirmAuthority" className="mt-0.5 h-4 w-4 accent-[var(--royal)]" defaultChecked={v("confirmAuthority") === "on"} />
              <span>I confirm I am authorised to register this school and that these details are accurate. I understand platform staff will verify them before activation.</span>
            </label>
            {err("confirmAuthority") && <p className="text-xs text-danger">{err("confirmAuthority")![0]}</p>}
          </div>
        </CardBody>
      </Card>

      <div className="flex justify-end">
        <SubmitButton size="lg">Submit for verification</SubmitButton>
      </div>
    </form>
  );
}
