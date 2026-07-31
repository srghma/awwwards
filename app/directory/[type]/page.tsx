import { Directory } from "../../_components/route-pages";
export const dynamic = "force-dynamic";
export default async function Page({ params }: { params: Promise<{ type: string }> }) { return <Directory type={(await params).type} />; }
