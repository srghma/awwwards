import { loadDashboardData } from "../src/admin-db-client";
import { collectionHref } from "./_components/route-pages";

export const dynamic = "force-dynamic";

const mirrorHref = (path: string): string => (path.startsWith("/") ? path : `/${path}`);

const formatCount = (value: number | null | undefined): string => {
  if (value == null) return "—";
  return new Intl.NumberFormat("en-US").format(value);
};

export default async function Page() {
  const { collections, collectionItems, users, counts, collectionTotal, progress } = await loadDashboardData();
  const stats = [
    { label: "Collections", value: collectionTotal },
    { label: "Collection items", value: collectionItems.length },
    { label: "Sites", value: counts.sites },
  ];

  return (
    <main className="shell">
      <section className="hero">
        <div className="eyebrow">Awwwards scrape admin</div>
        <h1>Scraped data, in one place.</h1>
        <p>
          Collections first, then their item pages and profiles. This is a thin read-only dashboard over the Bun SQL database.
        </p>
        <div className="stats">
          {stats.map(stat => (
            <article key={stat.label} className="stat">
              <span>{stat.label}</span>
              <strong>{formatCount(stat.value)}</strong>
            </article>
          ))}
        </div>
      </section>

      <section className="grid">
        <article className="panel panel-wide">
          <div className="panel-head"><h2>Scraping progress</h2><span>{progress.length} worker(s)</span></div>
          <div className="stack">{progress.length === 0 ? <div className="card">No scraper progress has been recorded yet.</div> : progress.map(worker => <div className="card" key={worker.worker_id}><strong>{worker.worker_id} · {worker.phase}</strong><span>{worker.completed} completed · {worker.skipped} skipped · {worker.failed} failed</span><small>{worker.current_url ?? "—"}</small></div>)}</div>
        </article>
        <article className="panel panel-wide">
          <div className="panel-head">
          <h2>Collections</h2>
          <span>{collectionTotal} discovered · {collections.length} stored</span>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Category</th>
                  <th>Creator</th>
                  <th>Followers</th>
                  <th>Items</th>
                </tr>
              </thead>
              <tbody>
                {collections.map(collection => (
                  <tr key={collection.slug}>
                    <td>
                      <a href={collectionHref(collection.url, collection.slug)}>{collection.name}</a>
                      <small>{collection.slug}</small>
                    </td>
                    <td>{collection.category_name ?? "—"}</td>
                    <td>{collection.creator_name ?? collection.creator_username ?? "—"}</td>
                    <td>{formatCount(collection.followers_count)}</td>
                    <td>{formatCount(collection.items_count)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>

        <article className="panel">
          <div className="panel-head">
            <h2>Directory profiles</h2>
            <span>{users.length} rows</span>
          </div>
          <div className="stack">
            {users.slice(0, 20).map(user => (
              <div key={user.username} className="card">
                <strong>{user.display_name ?? user.name}</strong>
                <span>@{user.username}</span>
                <small>{user.country ?? "Unknown"} · {formatCount(user.works_count)} works</small>
              </div>
            ))}
          </div>
        </article>

        <article className="panel">
          <div className="panel-head">
            <h2>Recent items</h2>
            <span>{collectionItems.length} rows</span>
          </div>
          <div className="stack">
            {collectionItems.slice(0, 20).map(item => (
              <a key={`${item.collection_slug}:${item.element_slug}`} className="card" href={mirrorHref(`/inspiration/${item.element_slug}`)}>
                <strong>{item.title}</strong>
                <span>{item.collection_slug}</span>
                <small>{item.author_name ?? item.author_username ?? "Unknown"}</small>
              </a>
            ))}
          </div>
        </article>
      </section>
    </main>
  );
}
