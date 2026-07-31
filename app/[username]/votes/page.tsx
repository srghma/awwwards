import { User } from "../../_components/route-pages";
export const dynamic = "force-dynamic";
export default async function Page({ params }: { params: Promise<{ username: string }> }) { return <User username={(await params).username} tab="votes" />; }
