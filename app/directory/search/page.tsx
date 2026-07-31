import { Directory } from "../../_components/route-pages";
export const dynamic = "force-dynamic";
export default async function Page({ searchParams }: { searchParams: Promise<{ q?: string }> }) { return <Directory search={(await searchParams).q} />; }
