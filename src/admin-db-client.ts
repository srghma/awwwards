import type {
  DashboardCollection,
  DashboardCollectionItem,
  DashboardSite,
  DashboardUser,
  DashboardCounts,
  SiteCreatorRow,
  SiteMediaRow,
  SiteTagRow,
  SiteVoteRow,
  UserVoteRow,
} from "./admin-db";

const connectionString =
  process.env["AWWWARDS_DATABASE_URL"] ??
  `postgresql://${process.env["USER"] ?? "srghma"}@127.0.0.1:55432/awwwards`;

const exec = async <T>(code: string): Promise<T> => {
  const normalized = code.replace(/\s+/g, " ").trim();
  const proc = Bun.spawn(["bun", "-e", normalized], { stdout: "pipe", stderr: "pipe" });
  const [stdout, stderr, exitCode] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited]);
  if (exitCode !== 0) {
    throw new Error(stderr.trim() || "Query process failed");
  }
  return JSON.parse(stdout) as T;
};

const sql = (query: string): string => `await new Bun.SQL(${JSON.stringify(connectionString)})\`${query}\``;
export type ScrapeProgressRow = { worker_id: string; phase: string; current_url: string | null; discovered: number; completed: number; skipped: number; failed: number; updated_at: string };
export type { DashboardCollection, DashboardCollectionItem, DashboardSite, DashboardUser, DashboardCounts, SiteCreatorRow, SiteMediaRow, SiteTagRow, SiteVoteRow, UserVoteRow };

export const loadDashboardData = async (): Promise<{
  collections: DashboardCollection[];
  collectionItems: DashboardCollectionItem[];
  users: DashboardUser[];
  counts: DashboardCounts;
  collectionTotal: number;
  progress: ScrapeProgressRow[];
}> =>
  exec(`const sql = new Bun.SQL(${JSON.stringify(connectionString)}); const collections = await sql\`SELECT slug, name, url, category_name, creator_username, creator_name, followers_count, items_count FROM collections ORDER BY name ASC\`; const collectionItems = await sql\`SELECT collection_slug, element_slug, item_type, item_url, title, author_username, author_name, website_url, media_url, media_static_url, tags_json FROM collection_items ORDER BY collection_slug ASC, title ASC\`; const users = await sql\`SELECT username, name, display_name, country, role, website_url, works_count, award_soty_count, award_sotm_count, award_sotd_count, award_hm_count FROM users ORDER BY COALESCE(works_count, 0) DESC, username ASC\`; const countRows = await sql\`SELECT (SELECT COUNT(*)::int AS sites FROM sites), (SELECT COUNT(*)::int AS elements FROM elements)\`; const progress = await sql\`SELECT worker_id, phase, current_url, discovered, completed, skipped, failed, updated_at FROM scrape_progress ORDER BY updated_at DESC\`; const collectionTotalRows = await sql\`SELECT value::int AS collection_total FROM scraper_metadata WHERE key = 'collections_total' LIMIT 1\`; console.log(JSON.stringify({ collections, collectionItems, users, counts: countRows[0], collectionTotal: collectionTotalRows[0]?.collection_total || collections.length, progress }));`);

export const loadSitePageData = async (slug: string): Promise<{
  site: DashboardSite | null;
  creators: SiteCreatorRow[];
  tags: SiteTagRow[];
  media: SiteMediaRow[];
  votes: SiteVoteRow[];
  colors: string[];
  elements: Array<{ slug: string; title: string; media_type: string | null; media_url: string | null; media_static_url: string | null }>;
}> =>
  exec(`const sql = new Bun.SQL(${JSON.stringify(connectionString)}); const slug = ${JSON.stringify(slug)}; const siteRows = await sql\`SELECT slug, title, live_url, awwwards_url, description, award_type, award_date, creator_username, overall_score, design_score, usability_score, creativity_score, content_score, dev_overall_score, dev_semantics_score, dev_animations_score, dev_accessibility_score, dev_wpo_score, dev_responsive_score, dev_markup_score FROM sites WHERE slug = \${slug} LIMIT 1\`; const creators = await sql\`SELECT site_slug, username, display_name, profile_url, avatar_url, country, is_pro, creator_order FROM site_creators WHERE site_slug = \${slug} ORDER BY creator_order ASC, username ASC\`; const tags = await sql\`SELECT site_slug, tag_type, value, hex_code, label FROM site_tags WHERE site_slug = \${slug} ORDER BY tag_type ASC, value ASC\`; const media = await sql\`SELECT site_slug, media_type, source_url, preview_url, local_path FROM site_media WHERE site_slug = \${slug} ORDER BY media_type ASC, source_url ASC\`; const colors = await sql\`SELECT hex_code FROM site_colors WHERE site_slug = \${slug} ORDER BY hex_code ASC\`; const votes = await sql\`SELECT v.site_slug, v.voter_username, v.voter_name, v.voter_avatar_url, v.voter_profile_url, v.voter_country, v.voter_website_url, v.voter_role, v.vote_type, v.design_score, v.usability_score, v.creativity_score, v.content_score, v.overall_score FROM votes v WHERE v.site_slug = \${slug} ORDER BY COALESCE(v.overall_score, 0) DESC, v.voter_username ASC\`; const elements = await sql\`SELECT e.slug, e.title, e.media_type, e.media_url, e.media_static_url FROM elements e JOIN sites s ON (e.website_url = s.awwwards_url OR e.source_url LIKE '%' || s.slug OR split_part(replace(e.website_url, 'www.', ''), '/', 3) = split_part(replace(s.live_url, 'www.', ''), '/', 3)) WHERE s.slug = \${slug} ORDER BY e.title ASC\`; console.log(JSON.stringify({ site: siteRows[0] ?? null, creators, tags, media, colors: colors.map(row => row.hex_code), votes, elements }));`);

export const loadCollectionPageData = async (slug: string): Promise<{
  collection: DashboardCollection | null;
  items: DashboardCollectionItem[];
  scrapedCount: number;
  scrapedSites: number;
  scrapedInspirations: number;
  remaining: number | null;
  remainingSites: number | null;
  remainingInspirations: number | null;
}> =>
  exec(`const sql = new Bun.SQL(${JSON.stringify(connectionString)}); const slug = ${JSON.stringify(slug)}; const collectionRows = await sql\`SELECT slug, name, url, category_name, creator_username, creator_name, followers_count, items_count, sites_count, inspirations_count FROM collections WHERE slug = \${slug} LIMIT 1\`; const items = await sql\`SELECT collection_slug, element_slug, item_type, item_url, title, author_username, author_name, website_url, media_url, media_static_url, tags_json FROM collection_items WHERE collection_slug = \${slug} ORDER BY title ASC\`; const countRows = await sql\`SELECT COUNT(*)::int AS count, COUNT(*) FILTER (WHERE item_type = 'site')::int AS sites, COUNT(*) FILTER (WHERE item_type = 'inspiration')::int AS inspirations FROM collection_items WHERE collection_slug = \${slug}\`; const collection = collectionRows[0] ?? null; const scrapedCount = countRows[0]?.count ?? 0; const expected = collection?.items_count ?? scrapedCount; const remaining = expected != null ? Math.max(0, expected - scrapedCount) : null; const remainingSites = collection?.sites_count == null ? null : Math.max(0, collection.sites_count - (countRows[0]?.sites ?? 0)); const remainingInspirations = collection?.inspirations_count == null ? null : Math.max(0, collection.inspirations_count - (countRows[0]?.inspirations ?? 0)); console.log(JSON.stringify({ collection, items, scrapedCount, scrapedSites: countRows[0]?.sites ?? 0, scrapedInspirations: countRows[0]?.inspirations ?? 0, remaining, remainingSites, remainingInspirations }));`);

export const loadCollectionPageDataByOwner = async (owner: string, slug: string): ReturnType<typeof loadCollectionPageData> =>
  exec(`const sql = new Bun.SQL(${JSON.stringify(connectionString)}); const owner = ${JSON.stringify(owner)}; const slug = ${JSON.stringify(slug)}; const collectionRows = await sql\`SELECT slug, name, url, category_name, creator_username, creator_name, followers_count, items_count FROM collections WHERE slug = \${slug} AND creator_username = \${owner} LIMIT 1\`; const items = await sql\`SELECT collection_slug, element_slug, item_type, item_url, title, author_username, author_name, website_url, media_url, media_static_url, tags_json FROM collection_items WHERE collection_slug = \${slug} ORDER BY title ASC\`; const countRows = await sql\`SELECT COUNT(*)::int AS count, COUNT(*) FILTER (WHERE item_type = 'site')::int AS sites, COUNT(*) FILTER (WHERE item_type = 'inspiration')::int AS inspirations FROM collection_items WHERE collection_slug = \${slug}\`; const collection = collectionRows[0] ?? null; const scrapedCount = countRows[0]?.count ?? 0; const expected = collection?.items_count ?? scrapedCount; const remaining = expected != null ? Math.max(0, expected - scrapedCount) : null; console.log(JSON.stringify({ collection, items, scrapedCount, scrapedSites: countRows[0]?.sites ?? 0, scrapedInspirations: countRows[0]?.inspirations ?? 0, remaining }));`);

export const loadUserPageData = async (username: string): Promise<{
  user: DashboardUser | null;
  collectionItems: DashboardCollectionItem[];
  sites: DashboardSite[];
}> =>
  exec(
    `const username=${JSON.stringify(username)}; const userRows=${sql(`
      SELECT username, name, display_name, country, role, website_url, works_count, award_soty_count, award_sotm_count, award_sotd_count, award_hm_count
      FROM users
      WHERE username = ${"${username}"}
      LIMIT 1
    `)}; const collectionItems=${sql(`
      SELECT collection_slug, element_slug, title, author_username, author_name, website_url, media_url, media_static_url, tags_json
      FROM collection_items
      WHERE author_username = ${"${username}"}
      ORDER BY collection_slug ASC, title ASC
    `)}; const sites=${sql(`
      SELECT slug, title, live_url, awwwards_url, description, award_type, award_date, creator_username, overall_score, design_score, usability_score, creativity_score, content_score, dev_overall_score, dev_semantics_score, dev_animations_score, dev_accessibility_score, dev_wpo_score, dev_responsive_score, dev_markup_score
      FROM sites
      WHERE creator_username = ${"${username}"}
      ORDER BY award_date DESC NULLS LAST, slug ASC
    `)}; console.log(JSON.stringify({ user: userRows[0] ?? null, collectionItems, sites }));`.replace(/\$\{username\}/g, username),
  );

export const loadElementPageData = async (slug: string): Promise<{
  element: {
    slug: string;
    title: string;
    category_slug: string;
    source_url: string | null;
    author_username: string | null;
    author_name: string | null;
    website_url: string | null;
    media_type: string | null;
    media_url: string | null;
    media_static_url: string | null;
    tags_json: string | null;
    raw_json: string | null;
    site_slug: string | null;
    site_title: string | null;
  } | null;
}> =>
  exec(`const sql = new Bun.SQL(${JSON.stringify(connectionString)}); const slug = ${JSON.stringify(slug)}; const rows = await sql\`SELECT e.slug, e.title, e.category_slug, e.source_url, e.author_username, e.author_name, e.website_url, e.media_type, e.media_url, e.media_static_url, e.tags_json, e.raw_json, s.slug AS site_slug, s.title AS site_title FROM elements e LEFT JOIN sites s ON split_part(replace(e.website_url, 'www.', ''), '/', 3) = split_part(replace(s.live_url, 'www.', ''), '/', 3) OR e.website_url = s.awwwards_url WHERE e.slug = \${slug} OR trim(both '-' from lower(regexp_replace(e.title, '[^a-zA-Z0-9]+', '-', 'g'))) || '-' || s.slug = \${slug} LIMIT 1\`; console.log(JSON.stringify({ element: rows[0] ?? null }));`);

export const loadWebsitesPageData = async (slug?: string | null): Promise<{
  title: string;
  subtitle: string;
  sites: DashboardSite[];
}> =>
  exec(
    `const slug=${JSON.stringify((slug ?? "").toLowerCase())}; const awardTitles={sites_of_the_day:{title:"Sites of the Day",awardType:"SOTD"},sites_of_the_month:{title:"Sites of the Month",awardType:"SOTM"},sites_of_the_year:{title:"Sites of the Year",awardType:"SOTY"},nominees:{title:"Nominees",awardType:"Nominee"}}; if (!slug) { const sites=${sql(`
      SELECT slug, title, live_url, awwwards_url, description, award_type, award_date, creator_username, overall_score, design_score, usability_score, creativity_score, content_score, dev_overall_score, dev_semantics_score, dev_animations_score, dev_accessibility_score, dev_wpo_score, dev_responsive_score, dev_markup_score
      FROM sites
      ORDER BY award_date DESC NULLS LAST, slug ASC
    `)}; console.log(JSON.stringify({ title:"Websites", subtitle:\`\${sites.length} scraped websites\`, sites })); } else if (awardTitles[slug]) { const award=awardTitles[slug]; const sites=${sql(`
      SELECT slug, title, live_url, awwwards_url, description, award_type, award_date, creator_username, overall_score, design_score, usability_score, creativity_score, content_score, dev_overall_score, dev_semantics_score, dev_animations_score, dev_accessibility_score, dev_wpo_score, dev_responsive_score, dev_markup_score
      FROM sites
      WHERE award_type = ${"${award.awardType}"}
      ORDER BY award_date DESC NULLS LAST, slug ASC
    `)}; console.log(JSON.stringify({ title: award.title, subtitle:\`\${sites.length} scraped sites\`, sites })); } else { const term=slug.replace(/-/g," "); const like=\`%\${term}%\`; const sites=${sql(`
      SELECT slug, title, live_url, awwwards_url, description, award_type, award_date, creator_username, overall_score, design_score, usability_score, creativity_score, content_score, dev_overall_score, dev_semantics_score, dev_animations_score, dev_accessibility_score, dev_wpo_score, dev_responsive_score, dev_markup_score
      FROM sites s
      WHERE lower(s.slug) LIKE ${"${like}"}
        OR lower(s.title) LIKE ${"${like}"}
        OR EXISTS (SELECT 1 FROM site_tags t WHERE t.site_slug = s.slug AND (lower(t.value) LIKE ${"${like}"} OR lower(COALESCE(t.label, '')) LIKE ${"${like}"}))
        OR EXISTS (SELECT 1 FROM site_technologies tech WHERE tech.site_slug = s.slug AND lower(tech.technology_name) LIKE ${"${like}"})
      ORDER BY s.award_date DESC NULLS LAST, s.slug ASC
    `)}; console.log(JSON.stringify({ title: term.replace(/\\b\\w/g, letter => letter.toUpperCase()), subtitle:\`\${sites.length} scraped sites\`, sites })); }`.replace(/\$\{award\.awardType\}/g, "${award.awardType}").replace(/\$\{like\}/g, "${like}"),
  );

export const loadDirectoryPageData = async (options?: { search?: string; type?: string }): Promise<{
  title: string;
  subtitle: string;
  users: DashboardUser[];
}> =>
  exec(
    `const search=${JSON.stringify(options?.search ?? "")}; const type=${JSON.stringify(options?.type ?? "")}; const term=search||type; if (!term) { const users=${sql(`
      SELECT username, name, display_name, country, role, website_url, works_count, award_soty_count, award_sotm_count, award_sotd_count, award_hm_count
      FROM users
      ORDER BY COALESCE(works_count, 0) DESC, username ASC
    `)}; console.log(JSON.stringify({ title:"Directory", subtitle:\`\${users.length} profiles\`, users })); } else { const like=\`%\${term.toLowerCase().replace(/-/g, " ")}%\`; const users=${sql(`
      SELECT username, name, display_name, country, role, website_url, works_count, award_soty_count, award_sotm_count, award_sotd_count, award_hm_count
      FROM users
      WHERE lower(username) LIKE ${"${like}"}
        OR lower(COALESCE(name, '')) LIKE ${"${like}"}
        OR lower(COALESCE(display_name, '')) LIKE ${"${like}"}
        OR lower(COALESCE(country, '')) LIKE ${"${like}"}
        OR lower(COALESCE(role, '')) LIKE ${"${like}"}
        OR lower(COALESCE(website_url, '')) LIKE ${"${like}"}
      ORDER BY COALESCE(works_count, 0) DESC, username ASC
    `)}; console.log(JSON.stringify({ title: search ? "Directory search" : \`Directory: \${type}\`, subtitle:\`\${users.length} profiles\`, users })); }`.replace(/\$\{like\}/g, "${like}"),
  );

export const loadUserVotesPageData = async (username: string): Promise<{
  user: DashboardUser | null;
  votes: UserVoteRow[];
}> =>
  exec(
    `const username=${JSON.stringify(username)}; const userRows=${sql(`
      SELECT username, name, display_name, country, role, website_url, works_count, award_soty_count, award_sotm_count, award_sotd_count, award_hm_count
      FROM users
      WHERE username = ${"${username}"}
      LIMIT 1
    `)}; const votes=${sql(`
      SELECT v.site_slug, v.voter_username, v.voter_name, v.voter_avatar_url, v.voter_profile_url, v.voter_country, v.voter_website_url, v.voter_role, v.vote_type, v.design_score, v.usability_score, v.creativity_score, v.content_score, v.overall_score, s.title AS site_title, s.awwwards_url AS site_awwwards_url
      FROM votes v
      LEFT JOIN sites s ON s.slug = v.site_slug
      WHERE v.voter_username = ${"${username}"}
      ORDER BY COALESCE(v.overall_score, 0) DESC, v.site_slug ASC
    `)}; console.log(JSON.stringify({ user: userRows[0] ?? null, votes }));`.replace(/\$\{username\}/g, username),
  );
