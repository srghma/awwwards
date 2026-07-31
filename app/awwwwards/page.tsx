import { loadDashboardData } from "../../src/admin-db-client";

export const dynamic = "force-dynamic";

const mirrorHref = (path: string): string => `/awwwwards${path.startsWith("/") ? path : `/${path}`}`;

const formatCount = (value: number | null | undefined): string => {
  if (value == null) return "—";
  return new Intl.NumberFormat("en-US").format(value);
};

export default async function Page() {
  const { collections, collectionItems, users } = await loadDashboardData();

  return (
    <main className="shell">
      <section className="hero">
        <div className="eyebrow">Awwwards mirror</div>
        <h1>Scraped data, in one place.</h1>
        <p>
          Collections first, then their item pages and profiles. This is a thin read-only dashboard over the Bun SQL database.
        </p>
        <div className="stats">
          <article className="stat">
            <span>Collections</span>
            <strong>{formatCount(collections.length)}</strong>
          </article>
          <article className="stat">
            <span>Collection items</span>
            <strong>{formatCount(collectionItems.length)}</strong>
          </article>
          <article className="stat">
            <span>Profiles</span>
            <strong>{formatCount(users.length)}</strong>
          </article>
        </div>
      </section>

      <section className="grid">
        <article className="panel panel-wide">
          <div className="panel-head">
            <h2>Collections</h2>
            <span>{collections.length} rows</span>
          </div>
          <div className="stack">
            {collections.slice(0, 20).map(collection => (
              <a key={collection.slug} className="card" href={mirrorHref(`/collections/${collection.slug}`)}>
                <strong>{collection.name}</strong>
                <span>{collection.category_name ?? "—"}</span>
                <small>{collection.creator_name ?? collection.creator_username ?? "—"}</small>
              </a>
            ))}
          </div>
        </article>
      </section>
    </main>
  );
}
