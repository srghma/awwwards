import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import {
  loadCollectionPageData,
  loadDashboardData,
  loadDirectoryPageData,
  loadElementPageData,
  loadSitePageData,
  loadUserPageData,
  loadUserVotesPageData,
  loadWebsitesPageData,
} from "../../src/admin-db-client";
import { getSearchPreviewImages } from "../_components/route-pages";

export const dynamic = "force-dynamic";

const mirrorHref = (path: string): string => `/awwwwards${path.startsWith("/") ? path : `/${path}`}`;

const formatCount = (value: number | null | undefined): string => {
  if (value == null) return "—";
  return new Intl.NumberFormat("en-US").format(value);
};

const parseJson = <T,>(value: string | null): T[] => {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed as T[] : [];
  } catch {
    return [];
  }
};

const firstQueryValue = (value: string | string[] | undefined): string => {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
};

const PageShell = ({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) => (
  <main className="shell">
    <section className="hero">
      <div className="eyebrow">Awwwards mirror</div>
      <h1>{title}</h1>
      {subtitle ? <p>{subtitle}</p> : null}
      <p>
        <a href={mirrorHref("/")}>Home</a> · <a href={mirrorHref("/collections")}>Collections</a> · <a href={mirrorHref("/directory")}>Directory</a>
      </p>
    </section>
    {children}
  </main>
);

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ slug?: string[] | string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>> | Record<string, string | string[] | undefined>;
}) {
  const resolvedParams = await params;
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const rawSlug = resolvedParams.slug;
  const slug = Array.isArray(rawSlug) ? rawSlug : typeof rawSlug === "string" ? rawSlug.split("/") : [];
  const path = slug[0] === "awwwards" ? slug.slice(1) : slug;
  const first = path[0] ?? "";

  if (path.length === 0) {
    const { collections, collectionItems, counts } = await loadDashboardData();
    return (
      <PageShell title="Awwwards mirror" subtitle={`${formatCount(collections.length)} collections · ${formatCount(collectionItems.length)} items · ${formatCount(counts.sites)} sites`}>
        <section className="grid">
          <article className="panel panel-wide">
            <div className="panel-head">
              <h2>Collections</h2>
              <span>{formatCount(collections.length)} rows</span>
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
      </PageShell>
    );
  }

  if (first === "collections" && path.length === 1) {
    const { collections } = await loadDashboardData();
    return (
      <PageShell title="Collections" subtitle={`${formatCount(collections.length)} scraped collections`}>
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
      </PageShell>
    );
  }

  if (first === "directory" && path.length === 1) {
    const { title, subtitle, users } = await loadDirectoryPageData();
    return (
      <PageShell title={title} subtitle={subtitle}>
        <section className="grid">
          <article className="panel panel-wide">
            <div className="panel-head">
              <h2>Profiles</h2>
              <span>{formatCount(users.length)} rows</span>
            </div>
            <div className="stack">
              {users.map(user => (
                <a key={user.username} className="card" href={mirrorHref(`/${user.username}`)}>
                  <strong>{user.display_name ?? user.name}</strong>
                  <span>@{user.username}</span>
                  <small>{user.country ?? "Unknown"} · {formatCount(user.works_count)} works</small>
                </a>
              ))}
            </div>
          </article>
        </section>
      </PageShell>
    );
  }

  if (first === "directory" && path[1] === "search") {
    const q = firstQueryValue(resolvedSearchParams["q"]);
    const { title, subtitle, users } = await loadDirectoryPageData({ search: q });
    return (
      <PageShell title={title} subtitle={q ? `${subtitle} for "${q}"` : subtitle}>
        <section className="grid">
          <article className="panel panel-wide">
            <div className="panel-head">
              <h2>Results</h2>
              <span>{formatCount(users.length)} rows</span>
            </div>
            <div className="stack">
              {users.map(user => (
                <a key={user.username} className="card" href={mirrorHref(`/${user.username}`)}>
                  <strong>{user.display_name ?? user.name}</strong>
                  <span>@{user.username}</span>
                  <small>{user.country ?? "Unknown"} · {formatCount(user.works_count)} works</small>
                </a>
              ))}
            </div>
          </article>
        </section>
      </PageShell>
    );
  }

  if (first === "directory" && path.length === 2) {
    const type = path[1] ?? "";
    const { title, subtitle, users } = await loadDirectoryPageData({ type });
    return (
      <PageShell title={title} subtitle={subtitle}>
        <section className="grid">
          <article className="panel panel-wide">
            <div className="panel-head">
              <h2>Profiles</h2>
              <span>{formatCount(users.length)} rows</span>
            </div>
            <div className="stack">
              {users.map(user => (
                <a key={user.username} className="card" href={mirrorHref(`/${user.username}`)}>
                  <strong>{user.display_name ?? user.name}</strong>
                  <span>@{user.username}</span>
                  <small>{user.country ?? "Unknown"} · {formatCount(user.works_count)} works</small>
                </a>
              ))}
            </div>
          </article>
        </section>
      </PageShell>
    );
  }

  if (first === "websites" && path.length === 1) {
    const { title, subtitle, sites } = await loadWebsitesPageData();
    return (
      <PageShell title={title} subtitle={subtitle}>
        <section className="grid">
          <article className="panel panel-wide">
            <div className="panel-head">
              <h2>Sites</h2>
              <span>{formatCount(sites.length)} rows</span>
            </div>
            <div className="stack">
              {sites.slice(0, 100).map(site => (
                <a key={site.slug} className="card" href={mirrorHref(`/sites/${site.slug}`)}>
                  <strong>{site.title}</strong>
                  <span>{site.award_type}</span>
                  <small>{site.creator_username ?? "Unknown"}</small>
                </a>
              ))}
            </div>
          </article>
        </section>
      </PageShell>
    );
  }

  if (first === "websites" && path.length === 2) {
    const section = path[1] ?? "";
    const { title, subtitle, sites } = await loadWebsitesPageData(section);
    return (
      <PageShell title={title} subtitle={subtitle}>
        <section className="grid">
          <article className="panel panel-wide">
            <div className="panel-head">
              <h2>Sites</h2>
              <span>{formatCount(sites.length)} rows</span>
            </div>
            <div className="stack">
              {sites.map(site => (
                <a key={site.slug} className="card" href={mirrorHref(`/sites/${site.slug}`)}>
                  <strong>{site.title}</strong>
                  <span>{site.award_type}</span>
                  <small>{site.creator_username ?? "Unknown"}</small>
                </a>
              ))}
            </div>
          </article>
        </section>
      </PageShell>
    );
  }

  if (first === "academy" && path.length >= 1) {
    const title = path.length === 1 ? "Academy" : path[1]!.replace(/-/g, " ");
    return (
      <PageShell title={title} subtitle="Not scraped yet">
        <section className="grid">
          <article className="panel panel-wide">
            <div className="card">Academy pages are routed, but no scrape source is wired yet.</div>
          </article>
        </section>
      </PageShell>
    );
  }

  if (first === "jobs-and-talent" && path.length >= 1) {
    const title = path.length === 1 ? "Jobs and Talent" : path[1]!.replace(/-/g, " ");
    return (
      <PageShell title={title} subtitle="Not scraped yet">
        <section className="grid">
          <article className="panel panel-wide">
            <div className="card">Jobs pages are routed, but no scrape source is wired yet.</div>
          </article>
        </section>
      </PageShell>
    );
  }

  if ((first === "collections" || first === "elements") && path.length > 1) {
    const collectionSlug = path[path.length - 1] ?? "";
    const { collection, items, scrapedCount, remaining } = await loadCollectionPageData(collectionSlug);
    if (!collection) notFound();
    return (
      <PageShell
        title={collection.name}
        subtitle={`${formatCount(scrapedCount)} scraped items${remaining != null ? ` · ${formatCount(remaining)} remaining` : ""}`}
      >
        <section className="grid">
          <article className="panel panel-wide">
            <div className="panel-head">
              <h2>Items</h2>
              <span>{formatCount(scrapedCount)} scraped</span>
            </div>
            <div className="stack">
              {items.map(item => (
                <a key={`${item.collection_slug}:${item.element_slug}`} className="card" href={mirrorHref(`/inspiration/${item.element_slug}`)}>
                  <strong>{item.title}</strong>
                  <span>{item.author_name ?? item.author_username ?? "Unknown"}</span>
                  <small>{item.element_slug}</small>
                </a>
              ))}
            </div>
          </article>
        </section>
      </PageShell>
    );
  }

  if (first === "sites" && path.length > 1) {
    const siteSlug = path[path.length - 1] ?? "";
    const { site, creators, tags, media, votes } = await loadSitePageData(siteSlug);
    if (!site) notFound();
    const colors = tags.filter(tag => tag.tag_type === "color");
    const textTags = tags.filter(tag => tag.tag_type === "tag");
    const searchPreviews = getSearchPreviewImages(media);
    return (
      <PageShell title={site.title} subtitle={`${site.award_type} · ${site.award_date ?? "Unknown date"}`}>
        <section className="grid">
          {searchPreviews.length > 0 ? (
            <article className="panel panel-wide">
              <div className="panel-head">
                <h2>Search preview images</h2>
                <span>{searchPreviews.length}</span>
              </div>
              <div className="media-grid">
                {searchPreviews.map(item => (
                  <div key={item.url} className="card">
                    <img loading="lazy" src={item.url} alt={`${site.title} preview ${item.resolution}`} />
                    <strong>{item.resolution}</strong>
                    <small>{item.url}</small>
                  </div>
                ))}
              </div>
            </article>
          ) : null}

          <article className="panel panel-wide">
            <div className="panel-head">
              <h2>Creators</h2>
              <span>{formatCount(creators.length)}</span>
            </div>
            <div className="stack">
              {creators.map(creator => (
                <a key={`${creator.site_slug}:${creator.username}`} className="card" href={mirrorHref(`/${creator.username}`)}>
                  <strong>{creator.display_name}</strong>
                  <span>@{creator.username}</span>
                  <small>{creator.is_pro ? "PRO" : "Creator"} · {creator.country ?? "Unknown"}</small>
                </a>
              ))}
            </div>
          </article>

          <article className="panel">
            <div className="panel-head">
              <h2>Tags</h2>
              <span>{formatCount(tags.length)}</span>
            </div>
            <div className="stack">
              {colors.map(tag => (
                <div key={`${tag.site_slug}:${tag.value}`} className="card">
                  <strong>{tag.value}</strong>
                  <small>{tag.hex_code ?? "—"}</small>
                </div>
              ))}
              {textTags.map(tag => (
                <div key={`${tag.site_slug}:${tag.value}`} className="card">
                  <strong>{tag.label ?? tag.value}</strong>
                </div>
              ))}
            </div>
          </article>

          <article className="panel">
            <div className="panel-head">
              <h2>Media</h2>
              <span>{formatCount(media.length)}</span>
            </div>
            <div className="stack">
              {media.map(item => (
                <div key={`${item.site_slug}:${item.source_url}`} className="card">
                  <strong>{item.media_type}</strong>
                  <span>{item.source_url}</span>
                  <small>{item.preview_url ?? "—"}</small>
                </div>
              ))}
            </div>
          </article>

          <article className="panel panel-wide">
            <div className="panel-head">
              <h2>Votes</h2>
              <span>{formatCount(votes.length)}</span>
            </div>
            <div className="stack">
              {votes.map(vote => (
                <div key={`${vote.site_slug}:${vote.vote_type}:${vote.voter_username}`} className="card">
                  <strong>{vote.voter_name ?? vote.voter_username}</strong>
                  <span>{vote.vote_type} · {vote.voter_country ?? "Unknown"}</span>
                  <small>{[vote.design_score, vote.usability_score, vote.creativity_score, vote.content_score, vote.overall_score].map(v => v == null ? "—" : v.toFixed(2)).join(" / ")}</small>
                </div>
              ))}
            </div>
          </article>
        </section>
      </PageShell>
    );
  }

  if (first === "inspiration" && path.length > 1) {
    const elementSlug = path[path.length - 1] ?? "";
    const { element } = await loadElementPageData(elementSlug);
    if (!element) notFound();
    const tags = parseJson<string>(element.tags_json);
    let raw: Record<string, unknown> | null = null;
    if (element.raw_json) {
      try {
        raw = JSON.parse(element.raw_json) as Record<string, unknown>;
      } catch {
        raw = null;
      }
    }
    return (
      <PageShell title={element.title} subtitle={element.author_name ?? element.author_username ?? "Unknown author"}>
        <section className="grid">
          <article className="panel panel-wide">
            <div className="panel-head">
              <h2>Element</h2>
              <span>{element.category_slug}</span>
            </div>
            <div className="stack">
              <div className="card">
                <strong>{element.title}</strong>
                <span>{element.website_url ?? "—"}</span>
                <small>{element.source_url ?? "—"}</small>
              </div>
              <div className="card">
                <strong>Tags</strong>
                <span>{tags.join(", ") || "—"}</span>
              </div>
              <div className="card">
                <strong>Media</strong>
                <span>{element.media_type ?? "—"}</span>
                {element.media_type === "video" && element.media_url ? <video controls preload="metadata" src={element.media_url} /> : null}
                {element.media_type !== "video" && element.media_url ? <img src={element.media_url} alt={element.title} loading="lazy" /> : null}
                <small>{element.media_url ?? "—"}</small>
                <small>{element.media_static_url ?? "—"}</small>
              </div>
              <div className="card">
                <strong>Raw</strong>
                <small>{raw ? JSON.stringify(raw).slice(0, 300) : "—"}</small>
              </div>
            </div>
          </article>
        </section>
      </PageShell>
    );
  }

  if (path.length === 1) {
    const username = first;
    const { user, collectionItems, sites } = await loadUserPageData(username);
    if (!user) notFound();
    return (
      <PageShell title={user.display_name ?? user.name} subtitle={`@${user.username}`}>
        <section className="grid">
          <article className="panel">
            <div className="panel-head">
              <h2>Profile</h2>
              <span>{user.role ?? "—"}</span>
            </div>
            <div className="stack">
              <div className="card">
                <strong>{user.country ?? "Unknown"}</strong>
                <span>{user.website_url ?? "—"}</span>
                <small>{formatCount(user.works_count)} works</small>
              </div>
              <div className="card">
                <strong>Awards</strong>
                <small>SOTY {formatCount(user.award_soty_count)} · SOTM {formatCount(user.award_sotm_count)} · SOTD {formatCount(user.award_sotd_count)} · HM {formatCount(user.award_hm_count)}</small>
              </div>
            </div>
          </article>

          <article className="panel">
            <div className="panel-head">
              <h2>Works</h2>
              <span>{formatCount(sites.length + collectionItems.length)}</span>
            </div>
            <div className="stack">
              {sites.map(site => (
                <a key={site.slug} className="card" href={mirrorHref(`/sites/${site.slug}`)}>
                  <strong>{site.title}</strong>
                  <span>{site.award_type}</span>
                </a>
              ))}
              {collectionItems.map(item => (
                <a key={`${item.collection_slug}:${item.element_slug}`} className="card" href={mirrorHref(`/inspiration/${item.element_slug}`)}>
                  <strong>{item.title}</strong>
                  <span>{item.collection_slug}</span>
                </a>
              ))}
            </div>
          </article>
        </section>
      </PageShell>
    );
  }

  if (path.length === 2 && path[1] === "likes") {
    const username = first;
    const { user } = await loadUserPageData(username);
    if (!user) notFound();
    return (
      <PageShell title={`${user.display_name ?? user.name} likes`} subtitle={`@${user.username}`}>
        <section className="grid">
          <article className="panel panel-wide">
            <div className="card">Likes are not stored in the scrape yet.</div>
          </article>
        </section>
      </PageShell>
    );
  }

  if (path.length === 2 && path[1] === "votes") {
    const username = first;
    const { user, votes } = await loadUserVotesPageData(username);
    if (!user) notFound();
    return (
      <PageShell title={`${user.display_name ?? user.name} votes`} subtitle={`@${user.username}`}>
        <section className="grid">
          <article className="panel panel-wide">
            <div className="panel-head">
              <h2>Votes</h2>
              <span>{formatCount(votes.length)}</span>
            </div>
            <div className="stack">
              {votes.map(vote => (
                <a key={`${vote.site_slug}:${vote.vote_type}`} className="card" href={mirrorHref(`/sites/${vote.site_slug}`)}>
                  <strong>{vote.site_title ?? vote.site_slug}</strong>
                  <span>{vote.vote_type} · {vote.overall_score?.toFixed(2) ?? "—"}</span>
                  <small>{[vote.design_score, vote.usability_score, vote.creativity_score, vote.content_score].map(v => v == null ? "—" : v.toFixed(2)).join(" / ")}</small>
                </a>
              ))}
            </div>
          </article>
        </section>
      </PageShell>
    );
  }

  notFound();
}
