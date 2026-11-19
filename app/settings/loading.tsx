import { Header } from "@/components/Header";
import { Bar, Card, PageHeadSkeleton } from "@/components/ui/Skeleton";

export default function Loading() {
  return (
    <>
      <Header active="settings" />
      <main className="mx-auto max-w-[1160px] px-6 pb-24 pt-10">
        <PageHeadSkeleton />
        <Bar className="mb-6 h-9 w-64" />
        <div className="space-y-6">
          {[0, 1, 2].map((i) => (
            <div key={i}>
              <Bar className="mb-2 h-3 w-40" />
              <Card className="h-[150px]" />
            </div>
          ))}
        </div>
      </main>
    </>
  );
}
