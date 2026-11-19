import { Header } from "@/components/Header";
import { Bar, Card, PageHeadSkeleton } from "@/components/ui/Skeleton";

export default function Loading() {
  return (
    <>
      <Header active="social" />
      <main className="mx-auto max-w-[1160px] px-6 pb-24 pt-10">
        <PageHeadSkeleton />
        <div className="grid gap-7 lg:grid-cols-[264px_minmax(0,1fr)]">
          <div>
            <Card className="h-11" />
            <Bar className="mt-3 h-9 w-full" />
            <div className="mt-3 space-y-1.5">
              {[0, 1, 2, 3, 4].map((i) => (
                <Card key={i} className="h-[58px]" />
              ))}
            </div>
          </div>
          <div className="space-y-3">
            <Bar className="h-3 w-48" />
            <Bar className="h-7 w-80" />
            <div className="h-6" />
            {[0, 1, 2].map((i) => (
              <Card key={i} className="h-[86px]" />
            ))}
            <Card className="h-[220px]" />
          </div>
        </div>
      </main>
    </>
  );
}
