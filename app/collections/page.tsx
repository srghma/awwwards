import { loadDashboardData } from "../../src/admin-db-client";
import { collectionHref, Shell } from "../_components/route-pages";
export const dynamic = "force-dynamic";
export default async function Page() { const { collections } = await loadDashboardData(); return <Shell title="Collections" subtitle={`${collections.length} scraped collections`}><section className="grid"><article className="panel panel-wide"><div className="stack">{collections.map(c => <a className="card" key={c.slug} href={collectionHref(c.url, c.slug)}><strong>{c.name}</strong><span>{c.creator_name ?? c.creator_username ?? "—"}</span><small>{c.items_count ?? 0} items</small></a>)}</div></article></section></Shell>; }
