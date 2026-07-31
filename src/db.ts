import { SQL } from "bun";
import { readdir } from "node:fs/promises";
import { join } from "node:path";

export interface DbUser {
  username: string;
  name: string;
  avatar_url: string | null;
  profile_url: string | null;
  role: string | null;
  country: string | null;
  email: string | null;
  display_name?: string | null;
  website_url?: string | null;
  is_pro?: boolean | null;
  works_count?: number | null;
  award_soty_count?: number | null;
  award_sotm_count?: number | null;
  award_sotd_count?: number | null;
  award_hm_count?: number | null;
  source_url?: string | null;
  raw_json?: string | null;
}

export interface DbSite {
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
}

export interface DbSiteTechnology {
  site_slug: string;
  technology_name: string;
}

export interface DbSiteColor {
  site_slug: string;
  hex_code: string;
}

export interface DbSiteMedia {
  site_slug: string;
  media_type: "image" | "video";
  source_url: string;
  preview_url?: string | null;
  local_path?: string | null;
}

export interface DbSiteCreator {
  site_slug: string;
  username: string;
  display_name: string;
  profile_url: string | null;
  avatar_url: string | null;
  country: string | null;
  is_pro: boolean | null;
  creator_order: number;
  raw_json?: string | null;
}

export interface DbSiteTag {
  site_slug: string;
  tag_type: "color" | "tag";
  value: string;
  hex_code: string | null;
  label: string | null;
  raw_json?: string | null;
}

export interface DbVote {
  site_slug: string;
  voter_username: string;
  voter_role: string | null;
  vote_type: "Jury" | "Community" | "DevJury";
  voter_name?: string | null;
  voter_avatar_url?: string | null;
  voter_profile_url?: string | null;
  voter_country?: string | null;
  voter_website_url?: string | null;
  design_score: number | null;
  usability_score: number | null;
  creativity_score: number | null;
  content_score: number | null;
  overall_score: number | null;
  source_url?: string | null;
  raw_json?: string | null;
}

export interface DbCollection {
  slug: string;
  name: string;
  url: string;
  is_blocked: boolean;
  is_valuable: boolean;
  clone_name_x6: string | null;
  category_name?: string | null;
  creator_username?: string | null;
  creator_name?: string | null;
  followers_count?: number | null;
  items_count?: number | null;
  sites_count?: number | null;
  inspirations_count?: number | null;
  source_url?: string | null;
  raw_json?: string | null;
}

export interface DbCollectionPost {
  collection_slug: string;
  site_slug: string;
  description: string | null;
}

export interface DbElementCategory {
  slug: string;
  name: string;
  post_count: number;
  should_track: boolean;
}

export interface DbElement {
  slug: string;
  title: string;
  category_slug: string;
  source_url: string | null;
  author_username?: string | null;
  author_name?: string | null;
  website_url?: string | null;
  media_type?: "image" | "video" | null;
  media_url?: string | null;
  media_static_url?: string | null;
  tags_json?: string | null;
  raw_json?: string | null;
}

export interface DbCollectionItem {
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
  raw_json: string | null;
}

export interface PendingCollectionItem {
  collection_slug: string;
  item_type: "site" | "inspiration";
  element_slug: string;
  item_url: string;
}

const runMigrations = async (sql: SQL): Promise<void> => {
  await sql`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename TEXT PRIMARY KEY,
      applied_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    )
  `;

  const appliedRows = await sql`SELECT filename FROM schema_migrations` as Array<{ filename: string }>;
  const applied = new Set(appliedRows.map(r => r.filename));

  const files = (await readdir("migrations"))
    .filter(name => name.endsWith(".sql"))
    .sort();

  for (const file of files) {
    if (!applied.has(file)) {
      console.log(`Running migration: ${file}`);
      await sql.unsafe(await Bun.file(join("migrations", file)).text());
      await sql`INSERT INTO schema_migrations (filename) VALUES (${file})`;
    }
  }
};

// Pure functional DB operations
export const initDb = async (connectionString: string): Promise<SQL> => {
  const sql = new SQL(connectionString);
  await runMigrations(sql);
  return sql;
};

// Pure functions to safely insert or retrieve records
export const insertUser = async (sql: SQL, user: DbUser): Promise<void> => {
  await sql`
    INSERT INTO users (username, name, avatar_url, profile_url, role, country, email, display_name, website_url, is_pro, works_count, award_soty_count, award_sotm_count, award_sotd_count, award_hm_count, source_url, raw_json)
    VALUES (${user.username}, ${user.name}, ${user.avatar_url}, ${user.profile_url}, ${user.role}, ${user.country}, ${user.email}, ${user.display_name ?? null}, ${user.website_url ?? null}, ${user.is_pro ?? null}, ${user.works_count ?? null}, ${user.award_soty_count ?? null}, ${user.award_sotm_count ?? null}, ${user.award_sotd_count ?? null}, ${user.award_hm_count ?? null}, ${user.source_url ?? null}, ${user.raw_json ?? null})
    ON CONFLICT (username) DO UPDATE
    SET name = COALESCE(EXCLUDED.name, users.name),
        avatar_url = COALESCE(EXCLUDED.avatar_url, users.avatar_url),
        profile_url = COALESCE(EXCLUDED.profile_url, users.profile_url),
        role = COALESCE(EXCLUDED.role, users.role),
        country = COALESCE(EXCLUDED.country, users.country),
        email = COALESCE(EXCLUDED.email, users.email),
        display_name = COALESCE(EXCLUDED.display_name, users.display_name),
        website_url = COALESCE(EXCLUDED.website_url, users.website_url),
        is_pro = COALESCE(EXCLUDED.is_pro, users.is_pro),
        works_count = COALESCE(EXCLUDED.works_count, users.works_count),
        award_soty_count = COALESCE(EXCLUDED.award_soty_count, users.award_soty_count),
        award_sotm_count = COALESCE(EXCLUDED.award_sotm_count, users.award_sotm_count),
        award_sotd_count = COALESCE(EXCLUDED.award_sotd_count, users.award_sotd_count),
        award_hm_count = COALESCE(EXCLUDED.award_hm_count, users.award_hm_count),
        source_url = COALESCE(EXCLUDED.source_url, users.source_url),
        raw_json = COALESCE(EXCLUDED.raw_json, users.raw_json)
  `;
};

export const insertSite = async (sql: SQL, site: DbSite): Promise<void> => {
  await sql`
    INSERT INTO sites (
       slug, title, live_url, awwwards_url, description, award_type, award_date, creator_username,
       overall_score, design_score, usability_score, creativity_score, content_score,
       dev_overall_score, dev_semantics_score, dev_animations_score, dev_accessibility_score, dev_wpo_score, dev_responsive_score, dev_markup_score
     ) VALUES (
       ${site.slug}, ${site.title}, ${site.live_url}, ${site.awwwards_url}, ${site.description}, ${site.award_type}, ${site.award_date}, ${site.creator_username},
       ${site.overall_score}, ${site.design_score}, ${site.usability_score}, ${site.creativity_score}, ${site.content_score},
       ${site.dev_overall_score}, ${site.dev_semantics_score}, ${site.dev_animations_score}, ${site.dev_accessibility_score}, ${site.dev_wpo_score}, ${site.dev_responsive_score}, ${site.dev_markup_score}
     ) ON CONFLICT (slug) DO UPDATE
     SET title = EXCLUDED.title,
         live_url = EXCLUDED.live_url,
         awwwards_url = EXCLUDED.awwwards_url,
         description = EXCLUDED.description,
         award_type = EXCLUDED.award_type,
         award_date = EXCLUDED.award_date,
         creator_username = EXCLUDED.creator_username,
         overall_score = EXCLUDED.overall_score,
         design_score = EXCLUDED.design_score,
         usability_score = EXCLUDED.usability_score,
         creativity_score = EXCLUDED.creativity_score,
         content_score = EXCLUDED.content_score,
         dev_overall_score = EXCLUDED.dev_overall_score,
         dev_semantics_score = EXCLUDED.dev_semantics_score,
         dev_animations_score = EXCLUDED.dev_animations_score,
         dev_accessibility_score = EXCLUDED.dev_accessibility_score,
         dev_wpo_score = EXCLUDED.dev_wpo_score,
         dev_responsive_score = EXCLUDED.dev_responsive_score,
         dev_markup_score = EXCLUDED.dev_markup_score
  `;
};

export const insertSiteTechnology = async (sql: SQL, tech: DbSiteTechnology): Promise<void> => {
  await sql`
    INSERT INTO site_technologies (site_slug, technology_name)
    VALUES (${tech.site_slug}, ${tech.technology_name})
    ON CONFLICT DO NOTHING
  `;
};

export const insertSiteColor = async (sql: SQL, color: DbSiteColor): Promise<void> => {
  await sql`
    INSERT INTO site_colors (site_slug, hex_code)
    VALUES (${color.site_slug}, ${color.hex_code})
    ON CONFLICT DO NOTHING
  `;
};

export const insertSiteMedia = async (sql: SQL, media: DbSiteMedia): Promise<void> => {
  await sql`
    INSERT INTO site_media (site_slug, media_type, source_url, preview_url, local_path)
    VALUES (${media.site_slug}, ${media.media_type}, ${media.source_url}, ${media.preview_url ?? null}, ${media.local_path ?? null})
    ON CONFLICT (site_slug, source_url) DO UPDATE
    SET media_type = EXCLUDED.media_type,
        preview_url = COALESCE(EXCLUDED.preview_url, site_media.preview_url),
        local_path = COALESCE(EXCLUDED.local_path, site_media.local_path)
  `;
};

export const insertSiteCreator = async (sql: SQL, creator: DbSiteCreator): Promise<void> => {
  await sql`
    INSERT INTO site_creators (site_slug, username, display_name, profile_url, avatar_url, country, is_pro, creator_order, raw_json)
    VALUES (${creator.site_slug}, ${creator.username}, ${creator.display_name}, ${creator.profile_url}, ${creator.avatar_url}, ${creator.country}, ${creator.is_pro}, ${creator.creator_order}, ${creator.raw_json ?? null})
    ON CONFLICT (site_slug, username) DO UPDATE
    SET display_name = EXCLUDED.display_name,
        profile_url = COALESCE(EXCLUDED.profile_url, site_creators.profile_url),
        avatar_url = COALESCE(EXCLUDED.avatar_url, site_creators.avatar_url),
        country = COALESCE(EXCLUDED.country, site_creators.country),
        is_pro = COALESCE(EXCLUDED.is_pro, site_creators.is_pro),
        creator_order = EXCLUDED.creator_order,
        raw_json = COALESCE(EXCLUDED.raw_json, site_creators.raw_json)
  `;
};

export const insertSiteTag = async (sql: SQL, tag: DbSiteTag): Promise<void> => {
  await sql`
    INSERT INTO site_tags (site_slug, tag_type, value, hex_code, label, raw_json)
    VALUES (${tag.site_slug}, ${tag.tag_type}, ${tag.value}, ${tag.hex_code}, ${tag.label}, ${tag.raw_json ?? null})
    ON CONFLICT (site_slug, tag_type, value) DO UPDATE
    SET hex_code = COALESCE(EXCLUDED.hex_code, site_tags.hex_code),
        label = COALESCE(EXCLUDED.label, site_tags.label),
        raw_json = COALESCE(EXCLUDED.raw_json, site_tags.raw_json)
  `;
};

export const insertVote = async (sql: SQL, vote: DbVote): Promise<void> => {
  await sql`
    INSERT INTO votes (site_slug, voter_username, voter_name, voter_avatar_url, voter_profile_url, voter_country, voter_website_url, voter_role, vote_type, design_score, usability_score, creativity_score, content_score, overall_score, source_url, raw_json)
    VALUES (${vote.site_slug}, ${vote.voter_username}, ${vote.voter_name ?? null}, ${vote.voter_avatar_url ?? null}, ${vote.voter_profile_url ?? null}, ${vote.voter_country ?? null}, ${vote.voter_website_url ?? null}, ${vote.voter_role}, ${vote.vote_type}, ${vote.design_score}, ${vote.usability_score}, ${vote.creativity_score}, ${vote.content_score}, ${vote.overall_score}, ${vote.source_url ?? null}, ${vote.raw_json ?? null})
    ON CONFLICT (site_slug, voter_username, vote_type) DO UPDATE
    SET voter_name = COALESCE(EXCLUDED.voter_name, votes.voter_name),
        voter_avatar_url = COALESCE(EXCLUDED.voter_avatar_url, votes.voter_avatar_url),
        voter_profile_url = COALESCE(EXCLUDED.voter_profile_url, votes.voter_profile_url),
        voter_country = COALESCE(EXCLUDED.voter_country, votes.voter_country),
        voter_website_url = COALESCE(EXCLUDED.voter_website_url, votes.voter_website_url),
        voter_role = EXCLUDED.voter_role,
        design_score = EXCLUDED.design_score,
        usability_score = EXCLUDED.usability_score,
        creativity_score = EXCLUDED.creativity_score,
        content_score = EXCLUDED.content_score,
        overall_score = EXCLUDED.overall_score,
        source_url = COALESCE(EXCLUDED.source_url, votes.source_url),
        raw_json = COALESCE(EXCLUDED.raw_json, votes.raw_json)
  `;
};

export const insertCollection = async (sql: SQL, col: DbCollection): Promise<void> => {
  await sql`
    INSERT INTO collections (slug, name, url, is_blocked, is_valuable, clone_name_x6, category_name, creator_username, creator_name, followers_count, items_count, sites_count, inspirations_count, source_url, raw_json)
    VALUES (${col.slug}, ${col.name}, ${col.url}, ${col.is_blocked}, ${col.is_valuable}, ${col.clone_name_x6}, ${col.category_name ?? null}, ${col.creator_username ?? null}, ${col.creator_name ?? null}, ${col.followers_count ?? null}, ${col.items_count ?? null}, ${col.sites_count ?? null}, ${col.inspirations_count ?? null}, ${col.source_url ?? null}, ${col.raw_json ?? null})
    ON CONFLICT (slug) DO UPDATE
    SET name = EXCLUDED.name,
        url = EXCLUDED.url,
        is_blocked = EXCLUDED.is_blocked,
        is_valuable = EXCLUDED.is_valuable,
        clone_name_x6 = COALESCE(EXCLUDED.clone_name_x6, collections.clone_name_x6),
        category_name = COALESCE(EXCLUDED.category_name, collections.category_name),
        creator_username = COALESCE(EXCLUDED.creator_username, collections.creator_username),
        creator_name = COALESCE(EXCLUDED.creator_name, collections.creator_name),
        followers_count = COALESCE(EXCLUDED.followers_count, collections.followers_count),
        items_count = COALESCE(EXCLUDED.items_count, collections.items_count),
        sites_count = COALESCE(EXCLUDED.sites_count, collections.sites_count),
        inspirations_count = COALESCE(EXCLUDED.inspirations_count, collections.inspirations_count),
        source_url = COALESCE(EXCLUDED.source_url, collections.source_url),
        raw_json = COALESCE(EXCLUDED.raw_json, collections.raw_json)
  `;
};

export const resolveCollectionStorageSlug = async (sql: SQL, publicSlug: string, sourceUrl: string): Promise<string> => {
  const byUrl = await sql`SELECT slug FROM collections WHERE url = ${sourceUrl} LIMIT 1` as Array<{ slug: string }>;
  if (byUrl[0]?.slug) return byUrl[0].slug;

  const bySlug = await sql`SELECT slug, url FROM collections WHERE slug = ${publicSlug} LIMIT 1` as Array<{ slug: string; url: string }>;
  if (!bySlug[0]) return publicSlug;

  const pathParts = new URL(sourceUrl).pathname.split("/").filter(Boolean);
  const owner = pathParts[pathParts.indexOf("collections") - 1] || "unknown-owner";
  const disambiguatedSlug = `${owner}--${publicSlug}`;
  const collision = await sql`SELECT slug, url FROM collections WHERE slug = ${disambiguatedSlug} LIMIT 1` as Array<{ slug: string; url: string }>;
  if (collision[0] && collision[0].url !== sourceUrl) {
    throw new Error(`Collection storage slug collision for ${sourceUrl}: ${disambiguatedSlug}`);
  }
  return disambiguatedSlug;
};

export const insertCollectionPost = async (sql: SQL, post: DbCollectionPost): Promise<void> => {
  await sql`
    INSERT INTO collection_posts (collection_slug, site_slug, description)
    VALUES (${post.collection_slug}, ${post.site_slug}, ${post.description})
    ON CONFLICT (collection_slug, site_slug) DO UPDATE
    SET description = EXCLUDED.description
  `;
};

export const insertElementCategory = async (sql: SQL, cat: DbElementCategory): Promise<void> => {
  await sql`
    INSERT INTO element_categories (slug, name, post_count, should_track)
    VALUES (${cat.slug}, ${cat.name}, ${cat.post_count}, ${cat.should_track})
    ON CONFLICT (slug) DO UPDATE
    SET name = EXCLUDED.name,
        post_count = EXCLUDED.post_count,
        should_track = EXCLUDED.should_track
  `;
};

export const insertElement = async (sql: SQL, elem: DbElement): Promise<void> => {
  await sql`
    INSERT INTO elements (slug, title, category_slug, source_url, author_username, author_name, website_url, media_type, media_url, media_static_url, tags_json, raw_json)
    VALUES (${elem.slug}, ${elem.title}, ${elem.category_slug}, ${elem.source_url}, ${elem.author_username ?? null}, ${elem.author_name ?? null}, ${elem.website_url ?? null}, ${elem.media_type ?? null}, ${elem.media_url ?? null}, ${elem.media_static_url ?? null}, ${elem.tags_json ?? null}, ${elem.raw_json ?? null})
    ON CONFLICT (slug) DO UPDATE
    SET title = EXCLUDED.title,
        category_slug = EXCLUDED.category_slug,
        source_url = EXCLUDED.source_url,
        author_username = COALESCE(EXCLUDED.author_username, elements.author_username),
        author_name = COALESCE(EXCLUDED.author_name, elements.author_name),
        website_url = COALESCE(EXCLUDED.website_url, elements.website_url),
        media_type = COALESCE(EXCLUDED.media_type, elements.media_type),
        media_url = COALESCE(EXCLUDED.media_url, elements.media_url),
        media_static_url = COALESCE(EXCLUDED.media_static_url, elements.media_static_url),
        tags_json = COALESCE(EXCLUDED.tags_json, elements.tags_json),
        raw_json = COALESCE(EXCLUDED.raw_json, elements.raw_json)
  `;
};

export const insertCollectionItem = async (sql: SQL, item: DbCollectionItem): Promise<void> => {
  await sql`
    INSERT INTO collection_items (collection_slug, element_slug, item_type, item_url, title, author_username, author_name, website_url, media_url, media_static_url, tags_json, raw_json)
    VALUES (${item.collection_slug}, ${item.element_slug}, ${item.item_type}, ${item.item_url}, ${item.title}, ${item.author_username}, ${item.author_name}, ${item.website_url}, ${item.media_url}, ${item.media_static_url}, ${item.tags_json}, ${item.raw_json})
    ON CONFLICT (collection_slug, element_slug) DO UPDATE
    SET title = EXCLUDED.title,
        item_type = EXCLUDED.item_type,
        item_url = EXCLUDED.item_url,
        author_username = COALESCE(EXCLUDED.author_username, collection_items.author_username),
        author_name = COALESCE(EXCLUDED.author_name, collection_items.author_name),
        website_url = COALESCE(EXCLUDED.website_url, collection_items.website_url),
        media_url = COALESCE(EXCLUDED.media_url, collection_items.media_url),
        media_static_url = COALESCE(EXCLUDED.media_static_url, collection_items.media_static_url),
        tags_json = COALESCE(EXCLUDED.tags_json, collection_items.tags_json),
        raw_json = COALESCE(EXCLUDED.raw_json, collection_items.raw_json)
  `;
};

export const siteExists = async (sql: SQL, slug: string): Promise<boolean> => {
  const res = await sql`
    SELECT 1
    FROM sites s
    WHERE s.slug = ${slug}
      AND s.description IS NOT NULL
      AND EXISTS (SELECT 1 FROM site_media m WHERE m.site_slug = s.slug)
    LIMIT 1
  `;
  return res.length > 0;
};

export const upsertSiteCrawlQueue = async (sql: SQL, sourceUrl: string, siteUrls: string[]): Promise<void> => {
  const uniqueUrls = Array.from(new Set(siteUrls));
  await sql.begin(async tx => {
    for (const siteUrl of uniqueUrls) {
      const siteSlug = new URL(siteUrl).pathname.split("/").filter(Boolean).pop() || "";
      if (!siteSlug) throw new Error(`Queued site URL has no slug: ${siteUrl}`);
      await tx`
        INSERT INTO site_crawl_queue (source_url, site_slug, site_url)
        VALUES (${sourceUrl}, ${siteSlug}, ${siteUrl})
        ON CONFLICT (source_url, site_slug) DO UPDATE
        SET site_url = EXCLUDED.site_url,
            updated_at = now()
      `;
    }
  });
};

export const queuedSiteUrlsToScrape = async (sql: SQL, sourceUrl: string, fromEnd = false): Promise<string[]> => {
  const rows = await sql`
    SELECT q.site_url
    FROM site_crawl_queue q
    WHERE q.source_url = ${sourceUrl}
      AND NOT EXISTS (
        SELECT 1
        FROM sites s
        WHERE s.slug = q.site_slug
          AND s.description IS NOT NULL
          AND EXISTS (SELECT 1 FROM site_media m WHERE m.site_slug = s.slug)
      )
    ORDER BY q.discovered_at, q.site_slug
  ` as Array<{ site_url: string }>;
  const urls = rows.map(row => row.site_url);
  return fromEnd ? urls.reverse() : urls;
};

export const siteCrawlQueueCount = async (sql: SQL, sourceUrl: string): Promise<number> => {
  const rows = await sql`
    SELECT COUNT(*)::int AS count
    FROM site_crawl_queue
    WHERE source_url = ${sourceUrl}
  ` as Array<{ count: number }>;
  return rows[0]?.count ?? 0;
};

export const removeSiteFromCrawlQueue = async (sql: SQL, sourceUrl: string, siteSlug: string): Promise<void> => {
  await sql`
    DELETE FROM site_crawl_queue
    WHERE source_url = ${sourceUrl}
      AND site_slug = ${siteSlug}
  `;
};

export const removeCompletedSitesFromCrawlQueue = async (sql: SQL, sourceUrl: string): Promise<void> => {
  await sql`
    DELETE FROM site_crawl_queue q
    WHERE q.source_url = ${sourceUrl}
      AND EXISTS (
        SELECT 1
        FROM sites s
        WHERE s.slug = q.site_slug
          AND s.description IS NOT NULL
          AND EXISTS (SELECT 1 FROM site_media m WHERE m.site_slug = s.slug)
      )
  `;
};

export const upsertElementCrawlQueue = async (sql: SQL, sourceUrl: string, entries: Array<{ slug: string; url: string }>): Promise<void> => {
  const uniqueEntries = Array.from(new Map(entries.map(entry => [entry.slug, entry])).values());
  await sql.begin(async tx => {
    for (const entry of uniqueEntries) {
      await tx`
        INSERT INTO element_crawl_queue (source_url, element_slug, element_url)
        VALUES (${sourceUrl}, ${entry.slug}, ${entry.url})
        ON CONFLICT (source_url, element_slug) DO UPDATE
        SET element_url = EXCLUDED.element_url,
            updated_at = now()
      `;
    }
  });
};

export const queuedElementsToScrape = async (sql: SQL, sourceUrl: string): Promise<Array<{ slug: string; url: string }>> => {
  const rows = await sql`
    SELECT q.element_slug, q.element_url
    FROM element_crawl_queue q
    WHERE q.source_url = ${sourceUrl}
      AND NOT EXISTS (
        SELECT 1
        FROM elements e
        WHERE e.slug = q.element_slug
          AND e.source_url ~* '^https://www\\.awwwards\\.com/inspiration/[^/?#]+/?$'
          AND e.media_type IS NOT NULL
          AND e.media_url IS NOT NULL
          AND e.raw_json LIKE '%"kind":"element"%'
      )
    ORDER BY q.discovered_at, q.element_slug
  ` as Array<{ element_slug: string; element_url: string }>;
  return rows.map(row => ({ slug: row.element_slug, url: row.element_url }));
};

export const elementCrawlQueueCount = async (sql: SQL, sourceUrl: string): Promise<number> => {
  const rows = await sql`
    SELECT COUNT(*)::int AS count
    FROM element_crawl_queue
    WHERE source_url = ${sourceUrl}
  ` as Array<{ count: number }>;
  return rows[0]?.count ?? 0;
};

export const pendingCollectionItems = async (sql: SQL): Promise<PendingCollectionItem[]> => {
  return await sql`
    SELECT ci.collection_slug, ci.item_type, ci.element_slug, ci.item_url
    FROM collection_items ci
    WHERE (
      ci.item_type = 'site'
      AND NOT EXISTS (
        SELECT 1
        FROM sites s
        WHERE s.slug = ci.element_slug
          AND s.description IS NOT NULL
          AND EXISTS (SELECT 1 FROM site_media m WHERE m.site_slug = s.slug)
      )
    ) OR (
      ci.item_type = 'inspiration'
      AND NOT EXISTS (
        SELECT 1
        FROM elements e
        WHERE e.slug = ci.element_slug
          AND e.source_url ~* '^https://www\\.awwwards\\.com/inspiration/[^/?#]+/?$'
          AND e.media_type IS NOT NULL
          AND e.media_url IS NOT NULL
          AND e.raw_json LIKE '%"kind":"element"%'
      )
    )
    ORDER BY ci.collection_slug, ci.item_type, ci.element_slug
  ` as PendingCollectionItem[];
};

export const elementExists = async (sql: SQL, slug: string): Promise<boolean> => {
  const res = await sql`
    SELECT 1
    FROM elements
    WHERE slug = ${slug}
      AND source_url ~* '^https://www\\.awwwards\\.com/inspiration/[^/?#]+/?$'
      AND media_type IS NOT NULL
      AND media_url IS NOT NULL
      AND raw_json LIKE '%"kind":"element"%'
    LIMIT 1
  `;
  return res.length > 0;
};

export const deleteInvalidSiteData = async (sql: SQL, slug: string): Promise<void> => {
  await sql.begin(async tx => {
    await tx`
      DELETE FROM collection_items
      WHERE item_type = 'site' AND (element_slug = ${slug} OR item_url = ${`https://www.awwwards.com/sites/${slug}`})
    `;
    await tx`DELETE FROM sites WHERE slug = ${slug}`;
  });
};

export const deleteInvalidElementData = async (sql: SQL, slug: string): Promise<void> => {
  await sql.begin(async tx => {
    await tx`
      DELETE FROM collection_items
      WHERE item_type = 'inspiration' AND (element_slug = ${slug} OR item_url = ${`https://www.awwwards.com/inspiration/${slug}`})
    `;
    await tx`DELETE FROM element_crawl_queue WHERE element_slug = ${slug}`;
    await tx`DELETE FROM elements WHERE slug = ${slug}`;
  });
};

export const collectionHasItems = async (sql: SQL, slug: string): Promise<boolean> => {
  const res = await sql`SELECT 1 FROM collection_items WHERE collection_slug = ${slug} LIMIT 1`;
  return res.length > 0;
};

export const collectionNeedsRescan = async (sql: SQL, slug: string): Promise<boolean> => {
  const rows = await sql`
    SELECT c.items_count, COUNT(i.element_slug)::int AS scraped_count
    FROM collections c
    LEFT JOIN collection_items i ON i.collection_slug = c.slug
    WHERE c.slug = ${slug}
    GROUP BY c.slug, c.items_count
  ` as Array<{ items_count: number | null; scraped_count: number }>;
  const row = rows[0];
  if (!row) return true;
  if (row.items_count == null) return row.scraped_count === 0;
  return row.scraped_count !== row.items_count;
};

export const deleteStaleCollectionItems = async (sql: SQL, slug: string, currentItemUrls: string[]): Promise<void> => {
  const rows = await sql`
    SELECT item_url
    FROM collection_items
    WHERE collection_slug = ${slug}
  ` as Array<{ item_url: string }>;
  const current = new Set(currentItemUrls);
  for (const row of rows) {
    if (!current.has(row.item_url)) {
      await sql`DELETE FROM collection_items WHERE collection_slug = ${slug} AND item_url = ${row.item_url}`;
    }
  }
};

export const userExists = async (sql: SQL, username: string): Promise<boolean> => {
  const res = await sql`SELECT 1 FROM users WHERE username = ${username} LIMIT 1`;
  return res.length > 0;
};

export const updateScrapeProgress = async (sql: SQL, progress: {
  worker_id: string;
  phase: string;
  current_url?: string | null;
  discovered?: number;
  completed?: number;
  skipped?: number;
  failed?: number;
}): Promise<void> => {
  await sql`
    INSERT INTO scrape_progress (worker_id, phase, current_url, discovered, completed, skipped, failed, updated_at)
    VALUES (${progress.worker_id}, ${progress.phase}, ${progress.current_url ?? null}, ${progress.discovered ?? 0}, ${progress.completed ?? 0}, ${progress.skipped ?? 0}, ${progress.failed ?? 0}, now())
    ON CONFLICT (worker_id) DO UPDATE SET
      phase = EXCLUDED.phase,
      current_url = EXCLUDED.current_url,
      discovered = EXCLUDED.discovered,
      completed = EXCLUDED.completed,
      skipped = EXCLUDED.skipped,
      failed = EXCLUDED.failed,
      updated_at = now()
  `;
};

export const setScraperMetadata = async (sql: SQL, key: string, value: string): Promise<void> => {
  await sql`
    INSERT INTO scraper_metadata (key, value, updated_at)
    VALUES (${key}, ${value}, now())
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()
  `;
};
