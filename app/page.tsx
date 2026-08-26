"use client";

/**
 * The start page: new draft, and the lists of existing ones.
 *
 * The editor used to live here too, swapped in whenever a draft was open,
 * which meant opening one never changed the URL and the back button had
 * nothing to return to. A draft has its own address now — /draft/[id] — so
 * this page only ever shows the lists.
 */
import GenerateView from "@/components/drafter/GenerateView";

export default function Home() {
  return <GenerateView />;
}
