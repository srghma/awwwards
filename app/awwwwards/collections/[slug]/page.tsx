import { notFound } from "next/navigation";
import { loadCollectionPageData } from "../../../../src/admin-db-client";

export const dynamic = "force-dynamic";

const formatCount = (value: number | null | undefined): string => {
  if (value == null) return "—";
  return new Intl.NumberFormat("en-US").format(value);
};

const mirrorHref = (path: string): string => `/awwwwards${path.startsWith("/") ? path : `/${path}`}`;

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { collection, items, scrapedSites, scrapedInspirations, remaining } = await loadCollectionPageData(slug);
  if (!collection) notFound();

  return (
    <main className="shell">
      <section className="hero">
        <div className="eyebrow">Awwwards mirror</div>
        <h1>{collection.name}</h1>
        <p>
          {formatCount(scrapedInspirations)} inspirations · {formatCount(scrapedSites)} sites{remaining != null ? ` · ${formatCount(remaining)} remaining` : ""}
        </p>
        <p>
          <a href={mirrorHref("/")}>Home</a> · <a href={mirrorHref("/collections")}>Collections</a> · <a href={mirrorHref("/directory")}>Directory</a>
        </p>
      </section>

      <section className="grid">
        <article className="panel panel-wide">
          <div className="panel-head">
            <h2>Items</h2>
            <span>{formatCount(scrapedInspirations)} inspirations · {formatCount(scrapedSites)} sites</span>
          </div>
          <div className="stack">
            {items.map(item => (
              <a key={`${item.collection_slug}:${item.item_type}:${item.element_slug}`} className="card" href={mirrorHref(`/${item.item_type === "site" ? "sites" : "inspiration"}/${item.element_slug}`)}>
                {item.media_url?.endsWith(".mp4") ? <video muted preload="metadata" src={item.media_url} /> : item.media_url ? <img loading="lazy" src={item.media_url} alt={item.title} /> : null}
                <strong>{item.title}</strong>
                <span>{item.item_type} · {item.author_name ?? item.author_username ?? "Unknown"}</span>
                <small>{item.element_slug}</small>
              </a>
            ))}
          </div>
        </article>
      </section>
    </main>
  );
}
