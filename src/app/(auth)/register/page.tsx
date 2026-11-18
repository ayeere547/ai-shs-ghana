import type { Metadata } from "next";
import Link from "next/link";

import { RegisterForm } from "@/components/auth/auth-forms";

export const metadata: Metadata = { title: "Create an account" };

export default function RegisterPage() {
  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Create an account</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Registering a school? Create your personal account first, then submit your school for verification. Staff, students and parents are added by their school.
      </p>
      <div className="mt-6">
        <RegisterForm />
      </div>
      <p className="mt-6 text-center text-sm text-muted-foreground">
        Already registered?{" "}
        <Link href="/login" className="font-medium text-primary hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}
