"use client";

import { useDraft } from "@/context/DraftContext";
import GenerateView from "@/components/drafter/GenerateView";
import EditorLayout from "@/components/drafter/EditorLayout";

export default function Home() {
  const { stage } = useDraft();
  return stage === "editing" ? <EditorLayout /> : <GenerateView />;
}
