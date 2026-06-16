"use client";

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[GlobalError boundary]", error);
  }, [error]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-sand-50 px-6 text-center">
      <p className="text-[10.5px] font-medium uppercase tracking-[0.16em] text-clay-600">Error</p>
      <h2 className="mt-2 font-serif text-2xl text-sand-900">Something went wrong</h2>
      <p className="mt-3 max-w-md text-sm leading-relaxed text-sand-600">
        {error.message || "An unexpected error occurred. Check the browser console for details."}
      </p>
      {error.digest && (
        <p className="mt-1 font-mono text-[11px] text-sand-400">digest: {error.digest}</p>
      )}
      <button
        onClick={reset}
        className="mt-6 rounded bg-forest-600 px-4 py-2 text-sm font-medium text-white hover:bg-forest-700"
      >
        Try again
      </button>
    </div>
  );
}
