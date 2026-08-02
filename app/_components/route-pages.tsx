import { notFound } from "next/navigation";
import {
  loadDirectoryPageData,
  loadElementPageData,
  loadSitePageData,
  loadUserPageData,
  loadUserVotesPageData,
  loadWebsitesPageData,
} from "../../src/admin-db-client";

const href = (path: string) => path.startsWith("/") ? path : `/${path}`;
export const collectionHref = (url: string, slug: string) => {
  try {
    const pathname = new URL(url).pathname;
    return pathname.includes("/collections/") ? pathname : `/collections/${slug}`;
  } catch {
    return `/collections/${slug}`;
  }
};
const count = (value: number | null | undefined) => value == null ? "—" : new Intl.NumberFormat("en-US").format(value);
const publicSlug = (value: string) => value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

export function Shell({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return <main className="shell"><section className="hero"><div className="eyebrow">Awwwards archive</div><h1>{title}</h1>{subtitle ? <p>{subtitle}</p> : null}<p><a href="/">Home</a> · <a href="/websites/">Websites</a> · <a href="/collections/">Collections</a> · <a href="/directory/">Directory</a></p></section>{children}</main>;
}

export async function SiteListing({ section }: { section?: string }) {
  const data = await loadWebsitesPageData(section);
  return <Shell title={data.title} subtitle={data.subtitle}><section className="grid"><article className="panel panel-wide"><div className="panel-head"><h2>Websites</h2><span>{count(data.sites.length)}</span></div><div className="stack">{data.sites.map(site => <a className="card" key={site.slug} href={href(`/sites/${site.slug}`)}><strong>{site.title}</strong><span>{site.award_type} · {site.award_date ?? "—"}</span><small>{site.creator_username ?? "Unknown creator"} · {site.overall_score?.toFixed(2) ?? "—"}</small></a>)}</div></article></section></Shell>;
}

export type SearchPreviewImage = {
  url: string;
  resolution: string;
};

export function getSearchPreviewImages(media: Array<{ source_url: string; preview_url?: string | null }>): SearchPreviewImage[] {
  const subUrl = media
    .flatMap(m => [m.source_url, m.preview_url])
    .find(u => u && u.includes("submissions/"));

  if (!subUrl) return [];

  const match = subUrl.match(/submissions\/[^\s"']+\.(?:jpg|jpeg|png|webp|gif)/i);
  if (!match) return [];

  const subPath = match[0];
  const baseUrl = "https://assets.awwwards.com/awards/media/cache";

  return [
    {
      url: `${baseUrl}/thumb_440_330/${subPath}`,
      resolution: "440 × 330",
    },
    {
      url: `${baseUrl}/thumb_880_660/${subPath}`,
      resolution: "880 × 660",
    },
  ];
}

export async function SiteDetail({ slug }: { slug: string }) {
  const { site, creators, tags, colors, media, votes, elements } = await loadSitePageData(slug);
  if (!site) notFound();
  const sotdScores = [["Design", site.design_score], ["Usability", site.usability_score], ["Creativity", site.creativity_score], ["Content", site.content_score]] as const;
  const devScores = [["Semantics / SEO", site.dev_semantics_score], ["Animations / Transitions", site.dev_animations_score], ["Accessibility", site.dev_accessibility_score], ["WPO", site.dev_wpo_score], ["Responsive Design", site.dev_responsive_score], ["Markup / Meta-data", site.dev_markup_score]] as const;
  const searchPreviews = getSearchPreviewImages(media);

  return <Shell title={site.title} subtitle={`${site.award_type} · ${site.award_date ?? "Unknown date"} · ${site.overall_score?.toFixed(2) ?? "—"}/10`}><section className="grid"><article className="panel panel-wide"><div className="score-heading"><h2>SOTD / SCORE</h2><strong>→ {site.overall_score?.toFixed(2) ?? "—"} / 10</strong></div><div className="score-grid">{sotdScores.map(([label, value]) => <div className="score-card" key={label}><span>{label}</span><strong>{value?.toFixed(2) ?? "—"} / 10</strong></div>)}</div><div className="score-heading"><h2>DEV AWARD</h2><strong>→ {site.dev_overall_score?.toFixed(2) ?? "—"} / 10</strong></div><div className="score-grid">{devScores.map(([label, value]) => <div className="score-card" key={label}><span>{label}</span><strong>{value?.toFixed(2) ?? "—"} / 10</strong></div>)}</div><div className="card"><strong>{site.description ?? "No description scraped"}</strong><a href={site.live_url ?? site.awwwards_url}>{site.live_url ?? site.awwwards_url}</a></div></article><article className="panel"><h2>Creators</h2><div className="stack">{creators.map(c => <a className="card" key={c.username} href={href(`/${c.username}`)}><strong>{c.display_name}</strong><span>@{c.username} · {c.country ?? "—"}</span></a>)}</div></article>{searchPreviews.length > 0 ? <article className="panel panel-wide"><div className="panel-head"><h2>Search preview images</h2><span>{searchPreviews.length}</span></div><div className="media-grid">{searchPreviews.map(p => <div className="card" key={p.url}><img loading="lazy" src={p.url} alt={`${site.title} preview ${p.resolution}`} /><strong>{p.resolution}</strong><small>{p.url}</small></div>)}</div></article> : null}<article className="panel panel-wide"><h2>Gallery ({media.length})</h2><div className="media-grid">{media.map(m => m.media_type === "video" ? <video key={m.source_url} controls preload="metadata" src={m.source_url} /> : <img key={m.source_url} loading="lazy" src={m.source_url} alt={site.title} />)}</div></article><article className="panel panel-wide"><h2>Elements ({elements.length})</h2><div className="media-grid">{elements.map(e => <a className="card" key={e.slug} href={href(`/inspiration/${e.slug}`)}><strong>{e.title}</strong>{e.media_type === "video" && e.media_url ? <video muted preload="metadata" src={e.media_url} /> : e.media_url ? <img loading="lazy" src={e.media_url} alt={e.title} /> : null}</a>)}</div></article><article className="panel"><h2>Color Palette ({colors.length})</h2><div className="palette-grid">{colors.map(color => <div className="palette-chip" key={color} style={{ backgroundColor: color }}><strong>HEX</strong><span>{color}</span></div>)}</div></article><article className="panel"><h2>Votes ({votes.length})</h2><div className="stack">{votes.map(v => <div className="card" key={`${v.voter_username}-${v.vote_type}`}><strong>{v.voter_name ?? v.voter_username}</strong><span>{v.vote_type} · {v.overall_score ?? "—"}</span></div>)}</div></article><article className="panel"><h2>Tags</h2><div className="stack">{tags.map(t => <div className="card" key={`${t.tag_type}-${t.value}`}><strong>{t.label ?? t.value}</strong><span>{t.hex_code ?? t.tag_type}</span></div>)}</div></article></section></Shell>;
}

export async function ElementDetail({ slug }: { slug: string }) {
  const { element } = await loadElementPageData(slug);
  if (!element) notFound();
  const tags = element.tags_json ? JSON.parse(element.tags_json) as string[] : [];
  const isUuid = /^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(element.slug);
  const canonicalSlug = isUuid && element.site_slug
    ? `${publicSlug(element.title)}-${element.site_slug}`
    : element.slug;
  return <Shell title={element.title} subtitle={`${element.category_slug} · ${element.author_name ?? element.author_username ?? "Unknown author"}`}><section className="grid"><article className="panel panel-wide"><div className="card"><strong>{element.site_slug ? <a href={`/sites/${element.site_slug}`}>{element.site_title ?? element.site_slug}</a> : element.website_url ? <a href={element.website_url}>{element.website_url}</a> : ""}</strong><a href={`/inspiration/${canonicalSlug}`}>Original Awwwards page</a><span>{tags.join(", ")}</span>{element.media_type === "video" && element.media_url ? <video controls src={element.media_url} /> : element.media_url ? <img src={element.media_url} alt={element.title} /> : null}<small>{element.media_url ?? "No media URL"}</small><small>{element.media_static_url ?? ""}</small></div></article></section></Shell>;
}

export async function Directory({ search, type }: { search?: string; type?: string }) {
  const data = await loadDirectoryPageData({ search, type });
  return <Shell title={data.title} subtitle={data.subtitle}><section className="grid"><article className="panel panel-wide"><div className="stack">{data.users.map(user => <a className="card" key={user.username} href={href(`/${user.username}`)}><strong>{user.display_name ?? user.name}</strong><span>@{user.username} · {user.role ?? "Professional"}</span><small>{user.country ?? "—"} · {count(user.works_count)} works</small></a>)}</div></article></section></Shell>;
}

export async function User({ username, tab }: { username: string; tab?: "likes" | "votes" }) {
  if (tab === "votes") { const { user, votes } = await loadUserVotesPageData(username); if (!user) notFound(); return <Shell title={`${user.display_name ?? user.name} votes`} subtitle={`@${username}`}><section className="grid"><article className="panel panel-wide"><div className="stack">{votes.map(v => <a className="card" key={`${v.site_slug}-${v.vote_type}`} href={href(`/sites/${v.site_slug}`)}><strong>{v.site_title}</strong><span>{v.vote_type} · {v.overall_score ?? "—"}</span></a>)}</div></article></section></Shell>; }
  const { user, collectionItems, sites } = await loadUserPageData(username); if (!user) notFound();
  return <Shell title={user.display_name ?? user.name} subtitle={`@${username} · ${user.role ?? "Creator"}`}><section className="grid"><article className="panel"><h2>Profile</h2><div className="card"><strong>{user.country ?? "—"}</strong><span>{user.website_url ?? ""}</span><small>{count(user.works_count)} works</small></div></article><article className="panel panel-wide"><h2>{tab === "likes" ? "Likes" : "Works"}</h2><div className="stack">{tab === "likes" ? <div className="card">Likes have not been scraped yet.</div> : sites.map(s => <a className="card" key={s.slug} href={href(`/sites/${s.slug}`)}><strong>{s.title}</strong><span>{s.award_type}</span></a>)}{tab !== "likes" && collectionItems.map(i => <a className="card" key={`${i.collection_slug}-${i.element_slug}`} href={href(`/inspiration/${i.element_slug}`)}><strong>{i.title}</strong><span>{i.collection_slug}</span></a>)}</div></article></section></Shell>;
}
