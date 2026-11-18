"use client";

import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/primitives";

export default function DashboardError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="space-y-4">
      <Alert tone="danger" title="Something went wrong">
        {error.message || "An unexpected error occurred."} {error.digest && <span className="font-mono text-xs">(ref {error.digest})</span>}
      </Alert>
      <Button variant="secondary" onClick={reset}>
        Try again
      </Button>
    </div>
  );
}
