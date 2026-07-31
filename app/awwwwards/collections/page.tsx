import { loadDashboardData } from "../../../src/admin-db-client";

export const dynamic = "force-dynamic";

const mirrorHref = (path: string): string => `/awwwwards${path.startsWith("/") ? path : `/${path}`}`;

const formatCount = (value: number | null | undefined): string => {
  if (value == null) return "—";
  return new Intl.NumberFormat("en-US").format(value);
};

export default async function Page() {
  const { collections } = await loadDashboardData();

  return (
    <main className="shell">
      <section className="hero">
        <div className="eyebrow">Awwwards mirror</div>
        <h1>Collections</h1>
        <p>{formatCount(collections.length)} scraped collections</p>
        <p>
          <a href={mirrorHref("/")}>Home</a> · <a href={mirrorHref("/collections")}>Collections</a> · <a href={mirrorHref("/directory")}>Directory</a>
        </p>
      </section>

      <section className="grid">
        <article className="panel panel-wide">
          <div className="panel-head">
            <h2>All collections</h2>
            <span>{formatCount(collections.length)} rows</span>
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
                      <a href={mirrorHref(`/collections/${collection.slug}`)}>{collection.name}</a>
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
      </section>
    </main>
  );
}
