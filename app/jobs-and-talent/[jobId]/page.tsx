import { Shell } from "../../_components/route-pages";
export default async function Page({ params }: { params: Promise<{ jobId: string }> }) { return <Shell title={(await params).jobId.replaceAll("-", " ")} subtitle="Job details"><section className="grid"><article className="panel panel-wide"><div className="card">Job details have not been scraped yet.</div></article></section></Shell>; }
