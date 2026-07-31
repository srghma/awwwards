export type DashboardCollection = {
  slug: string;
  name: string;
  url: string;
  category_name: string | null;
  creator_username: string | null;
  creator_name: string | null;
  followers_count: number | null;
  items_count: number | null;
  sites_count: number | null;
  inspirations_count: number | null;
};

export type DashboardCollectionItem = {
  collection_slug: string;
  element_slug: string;
  item_type: "site" | "inspiration";
  item_url: string;
  title: string;
  author_username: string | null;
  author_name: string | null;
  website_url: string | null;
  media_url: string | null;
  media_static_url: string | null;
  tags_json: string | null;
};

export type DashboardUser = {
  username: string;
  name: string;
  display_name: string | null;
  country: string | null;
  role: string | null;
  website_url: string | null;
  works_count: number | null;
  award_soty_count: number | null;
  award_sotm_count: number | null;
  award_sotd_count: number | null;
  award_hm_count: number | null;
};

export type DashboardCounts = { sites: number; elements: number };

export type DashboardSite = {
  slug: string;
  title: string;
  live_url: string | null;
  awwwards_url: string;
  description: string | null;
  award_type: "SOTD" | "Nominee" | "Honorable Mention" | "SOTM" | "SOTY";
  award_date: string | null;
  creator_username: string | null;
  overall_score: number | null;
  design_score: number | null;
  usability_score: number | null;
  creativity_score: number | null;
  content_score: number | null;
  dev_overall_score: number | null;
  dev_semantics_score: number | null;
  dev_animations_score: number | null;
  dev_accessibility_score: number | null;
  dev_wpo_score: number | null;
  dev_responsive_score: number | null;
  dev_markup_score: number | null;
};

export type SiteCreatorRow = {
  site_slug: string;
  username: string;
  display_name: string;
  profile_url: string | null;
  avatar_url: string | null;
  country: string | null;
  is_pro: boolean | null;
  creator_order: number;
};

export type SiteTagRow = {
  site_slug: string;
  tag_type: "color" | "tag";
  value: string;
  hex_code: string | null;
  label: string | null;
};

export type SiteMediaRow = {
  site_slug: string;
  media_type: "image" | "video";
  source_url: string;
  preview_url: string | null;
  local_path: string | null;
};

export type SiteVoteRow = {
  site_slug: string;
  voter_username: string;
  voter_name: string | null;
  voter_avatar_url: string | null;
  voter_profile_url: string | null;
  voter_country: string | null;
  voter_website_url: string | null;
  voter_role: string | null;
  vote_type: "Jury" | "Community" | "DevJury";
  design_score: number | null;
  usability_score: number | null;
  creativity_score: number | null;
  content_score: number | null;
  overall_score: number | null;
};

export type UserVoteRow = SiteVoteRow & {
  site_title: string;
  site_awwwards_url: string;
};

const pgUser = process.env["PGUSER"] ?? process.env["USER"] ?? "postgres";
const pgPort = process.env["PGPORT"] ?? "55432";
const connectionString = process.env["DATABASE_URL"] ?? `postgresql://${pgUser}@127.0.0.1:${pgPort}/awwwards`;

export const loadDashboardData = async (): Promise<{
  collections: DashboardCollection[];
  collectionItems: DashboardCollectionItem[];
  users: DashboardUser[];
}> => {
  const sql = new Bun.SQL(connectionString);
  const collections = await sql`
    SELECT slug, name, url, category_name, creator_username, creator_name, followers_count, items_count
    FROM collections
    ORDER BY name ASC
  ` as DashboardCollection[];
  const collectionItems = await sql`
    SELECT collection_slug, element_slug, title, author_username, author_name, website_url, media_url, media_static_url, tags_json
    FROM collection_items
    ORDER BY collection_slug ASC, title ASC
  ` as DashboardCollectionItem[];
  const users = await sql`
    SELECT username, name, display_name, country, role, website_url, works_count, award_soty_count, award_sotm_count, award_sotd_count, award_hm_count
    FROM users
    ORDER BY COALESCE(works_count, 0) DESC, username ASC
  ` as DashboardUser[];

  return { collections, collectionItems, users };
};

export const loadSitePageData = async (slug: string): Promise<{
  site: DashboardSite | null;
  creators: SiteCreatorRow[];
  tags: SiteTagRow[];
  media: SiteMediaRow[];
  votes: SiteVoteRow[];
}> => {
  const sql = new Bun.SQL(connectionString);
  const siteRows = await sql`
    SELECT slug, title, live_url, awwwards_url, description, award_type, award_date, creator_username, overall_score, design_score, usability_score, creativity_score, content_score, dev_overall_score, dev_semantics_score, dev_animations_score, dev_accessibility_score, dev_wpo_score, dev_responsive_score, dev_markup_score
    FROM sites
    WHERE slug = ${slug}
    LIMIT 1
  ` as DashboardSite[];
  const creators = await sql`
    SELECT site_slug, username, display_name, profile_url, avatar_url, country, is_pro, creator_order
    FROM site_creators
    WHERE site_slug = ${slug}
    ORDER BY creator_order ASC, username ASC
  ` as SiteCreatorRow[];
  const tags = await sql`
    SELECT site_slug, tag_type, value, hex_code, label
    FROM site_tags
    WHERE site_slug = ${slug}
    ORDER BY tag_type ASC, value ASC
  ` as SiteTagRow[];
  const media = await sql`
    SELECT site_slug, media_type, source_url, preview_url, local_path
    FROM site_media
    WHERE site_slug = ${slug}
    ORDER BY media_type ASC, source_url ASC
  ` as SiteMediaRow[];
  const votes = await sql`
    SELECT v.site_slug, v.voter_username, v.voter_name, v.voter_avatar_url, v.voter_profile_url, v.voter_country, v.voter_website_url, v.voter_role, v.vote_type, v.design_score, v.usability_score, v.creativity_score, v.content_score, v.overall_score
    FROM votes v
    WHERE v.site_slug = ${slug}
    ORDER BY COALESCE(v.overall_score, 0) DESC, v.voter_username ASC
  ` as SiteVoteRow[];

  return {
    site: siteRows[0] ?? null,
    creators,
    tags,
    media,
    votes,
  };
};

export const loadCollectionPageData = async (slug: string): Promise<{
  collection: DashboardCollection | null;
  items: DashboardCollectionItem[];
  scrapedCount: number;
  remaining: number | null;
}> => {
  const sql = new Bun.SQL(connectionString);
  const collectionRows = await sql`
    SELECT slug, name, url, category_name, creator_username, creator_name, followers_count, items_count
    FROM collections
    WHERE slug = ${slug}
    LIMIT 1
  ` as DashboardCollection[];
  const items = await sql`
    SELECT collection_slug, element_slug, title, author_username, author_name, website_url, media_url, media_static_url, tags_json
    FROM collection_items
    WHERE collection_slug = ${slug}
    ORDER BY title ASC
  ` as DashboardCollectionItem[];
  const countRows = await sql`
    SELECT COUNT(*)::int AS count
    FROM collection_items
    WHERE collection_slug = ${slug}
  ` as Array<{ count: number }>;

  const collection = collectionRows[0] ?? null;
  const scrapedCount = countRows[0]?.count ?? 0;
  const expected = collection?.items_count ?? scrapedCount;
  const remaining = expected != null ? Math.max(0, expected - scrapedCount) : null;

  return {
    collection,
    items,
    scrapedCount,
    remaining,
  };
};

export const loadUserPageData = async (username: string): Promise<{
  user: DashboardUser | null;
  collectionItems: DashboardCollectionItem[];
  sites: DashboardSite[];
}> => {
  const sql = new Bun.SQL(connectionString);
  const userRows = await sql`
    SELECT username, name, display_name, country, role, website_url, works_count, award_soty_count, award_sotm_count, award_sotd_count, award_hm_count
    FROM users
    WHERE username = ${username}
    LIMIT 1
  ` as DashboardUser[];
  const collectionItems = await sql`
    SELECT collection_slug, element_slug, title, author_username, author_name, website_url, media_url, media_static_url, tags_json
    FROM collection_items
    WHERE author_username = ${username}
    ORDER BY collection_slug ASC, title ASC
  ` as DashboardCollectionItem[];
  const sites = await sql`
    SELECT slug, title, live_url, awwwards_url, description, award_type, award_date, creator_username, overall_score, design_score, usability_score, creativity_score, content_score, dev_overall_score, dev_semantics_score, dev_animations_score, dev_accessibility_score, dev_wpo_score, dev_responsive_score, dev_markup_score
    FROM sites
    WHERE creator_username = ${username}
    ORDER BY award_date DESC NULLS LAST, slug ASC
  ` as DashboardSite[];

  return {
    user: userRows[0] ?? null,
    collectionItems,
    sites,
  };
};

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
  } | null;
}> => {
  const sql = new Bun.SQL(connectionString);
  const rows = await sql`
    SELECT slug, title, category_slug, source_url, author_username, author_name, website_url, media_type, media_url, media_static_url, tags_json, raw_json
    FROM elements
    WHERE slug = ${slug}
    LIMIT 1
  ` as Array<{
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
  }>;

  return { element: rows[0] ?? null };
};

export const loadWebsitesPageData = async (slug?: string | null): Promise<{
  title: string;
  subtitle: string;
  sites: DashboardSite[];
}> => {
  const sql = new Bun.SQL(connectionString);
  const normalized = slug?.toLowerCase() ?? "";
  const awardTitles: Record<string, { title: string; awardType: DashboardSite["award_type"] }> = {
    sites_of_the_day: { title: "Sites of the Day", awardType: "SOTD" },
    sites_of_the_month: { title: "Sites of the Month", awardType: "SOTM" },
    sites_of_the_year: { title: "Sites of the Year", awardType: "SOTY" },
    nominees: { title: "Nominees", awardType: "Nominee" },
  };

  if (!normalized) {
    const sites = await sql`
      SELECT slug, title, live_url, awwwards_url, description, award_type, award_date, creator_username, overall_score, design_score, usability_score, creativity_score, content_score, dev_overall_score, dev_semantics_score, dev_animations_score, dev_accessibility_score, dev_wpo_score, dev_responsive_score, dev_markup_score
      FROM sites
      ORDER BY award_date DESC NULLS LAST, slug ASC
    ` as DashboardSite[];
    return {
      title: "Websites",
      subtitle: `${sites.length} scraped websites`,
      sites,
    };
  }

  const award = awardTitles[normalized];
  if (award) {
    const sites = await sql`
      SELECT slug, title, live_url, awwwards_url, description, award_type, award_date, creator_username, overall_score, design_score, usability_score, creativity_score, content_score, dev_overall_score, dev_semantics_score, dev_animations_score, dev_accessibility_score, dev_wpo_score, dev_responsive_score, dev_markup_score
      FROM sites
      WHERE award_type = ${award.awardType}
      ORDER BY award_date DESC NULLS LAST, slug ASC
    ` as DashboardSite[];
    return {
      title: award.title,
      subtitle: `${sites.length} scraped sites`,
      sites,
    };
  }

  const term = normalized.replace(/-/g, " ");
  const like = `%${term}%`;
  const sites = await sql`
    SELECT slug, title, live_url, awwwards_url, description, award_type, award_date, creator_username, overall_score, design_score, usability_score, creativity_score, content_score, dev_overall_score, dev_semantics_score, dev_animations_score, dev_accessibility_score, dev_wpo_score, dev_responsive_score, dev_markup_score
    FROM sites s
    WHERE lower(s.slug) LIKE ${like}
      OR lower(s.title) LIKE ${like}
      OR EXISTS (
        SELECT 1
        FROM site_tags t
        WHERE t.site_slug = s.slug
          AND (lower(t.value) LIKE ${like} OR lower(COALESCE(t.label, '')) LIKE ${like})
      )
      OR EXISTS (
        SELECT 1
        FROM site_technologies tech
        WHERE tech.site_slug = s.slug
          AND lower(tech.technology_name) LIKE ${like}
      )
    ORDER BY s.award_date DESC NULLS LAST, s.slug ASC
  ` as DashboardSite[];

  return {
    title: term.replace(/\b\w/g, letter => letter.toUpperCase()),
    subtitle: `${sites.length} scraped sites`,
    sites,
  };
};

export const loadDirectoryPageData = async (options?: { search?: string; type?: string }): Promise<{
  title: string;
  subtitle: string;
  users: DashboardUser[];
}> => {
  const sql = new Bun.SQL(connectionString);
  const search = options?.search?.trim() ?? "";
  const type = options?.type?.trim() ?? "";
  const term = search || type;

  if (!term) {
    const users = await sql`
      SELECT username, name, display_name, country, role, website_url, works_count, award_soty_count, award_sotm_count, award_sotd_count, award_hm_count
      FROM users
      ORDER BY COALESCE(works_count, 0) DESC, username ASC
    ` as DashboardUser[];
    return {
      title: "Directory",
      subtitle: `${users.length} profiles`,
      users,
    };
  }

  const like = `%${term.toLowerCase().replace(/-/g, " ")}%`;
  const users = await sql`
    SELECT username, name, display_name, country, role, website_url, works_count, award_soty_count, award_sotm_count, award_sotd_count, award_hm_count
    FROM users
    WHERE lower(username) LIKE ${like}
      OR lower(COALESCE(name, '')) LIKE ${like}
      OR lower(COALESCE(display_name, '')) LIKE ${like}
      OR lower(COALESCE(country, '')) LIKE ${like}
      OR lower(COALESCE(role, '')) LIKE ${like}
      OR lower(COALESCE(website_url, '')) LIKE ${like}
    ORDER BY COALESCE(works_count, 0) DESC, username ASC
  ` as DashboardUser[];

  return {
    title: search ? "Directory search" : `Directory: ${type}`,
    subtitle: `${users.length} profiles`,
    users,
  };
};

export const loadUserVotesPageData = async (username: string): Promise<{
  user: DashboardUser | null;
  votes: UserVoteRow[];
}> => {
  const sql = new Bun.SQL(connectionString);
  const userRows = await sql`
    SELECT username, name, display_name, country, role, website_url, works_count, award_soty_count, award_sotm_count, award_sotd_count, award_hm_count
    FROM users
    WHERE username = ${username}
    LIMIT 1
  ` as DashboardUser[];
  const votes = await sql`
    SELECT
      v.site_slug,
      v.voter_username,
      v.voter_name,
      v.voter_avatar_url,
      v.voter_profile_url,
      v.voter_country,
      v.voter_website_url,
      v.voter_role,
      v.vote_type,
      v.design_score,
      v.usability_score,
      v.creativity_score,
      v.content_score,
      v.overall_score,
      s.title AS site_title,
      s.awwwards_url AS site_awwwards_url
    FROM votes v
    LEFT JOIN sites s ON s.slug = v.site_slug
    WHERE v.voter_username = ${username}
    ORDER BY COALESCE(v.overall_score, 0) DESC, v.site_slug ASC
  ` as UserVoteRow[];

  return {
    user: userRows[0] ?? null,
    votes,
  };
};
