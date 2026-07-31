import { SiteListing } from "../../_components/route-pages";
export const dynamic = "force-dynamic";
export default async function Page({ params }: { params: Promise<{ categorySlug: string }> }) { return <SiteListing section={(await params).categorySlug} />; }
