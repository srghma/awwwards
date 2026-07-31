import { SiteDetail } from "../../_components/route-pages";
export const dynamic = "force-dynamic";
export default async function Page({ params }: { params: Promise<{ slug: string }> }) { return <SiteDetail slug={(await params).slug} />; }
