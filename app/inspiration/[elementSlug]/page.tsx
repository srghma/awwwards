import { ElementDetail } from "../../_components/route-pages";
export const dynamic = "force-dynamic";
export default async function Page({ params }: { params: Promise<{ elementSlug: string }> }) { return <ElementDetail slug={(await params).elementSlug} />; }
