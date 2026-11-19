import { Header } from "@/components/Header";
import { Bar, Card } from "@/components/ui/Skeleton";

export default function Loading() {
  return (
    <>
      <Header active="settings" />
      <div className="border-t-4 border-sand-200">
        <div className="mx-auto max-w-[1240px] px-6 py-10">
          <Bar className="h-3 w-32" />
          <Bar className="mt-6 h-2.5 w-24" />
          <Bar className="mt-3 h-9 w-80" />
          <Bar className="mt-3 h-3 w-64" />
          <Bar className="mt-5 h-10 w-36" />
        </div>
      </div>
      <main className="mx-auto max-w-[1240px] px-6 pb-24 pt-8">
        <Bar className="mb-6 h-9 w-[420px]" />
        <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
          <Card className="h-[320px]" />
          <div className="space-y-6">
            <Card className="h-[260px]" />
            <Card className="h-[200px]" />
          </div>
        </div>
      </main>
    </>
  );
}
