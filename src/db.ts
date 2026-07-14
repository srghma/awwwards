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
  local_path: string;
}

export interface DbVote {
  site_slug: string;
  voter_username: string;
  voter_role: string | null;
  vote_type: "Jury" | "Community" | "DevJury";
  design_score: number | null;
  usability_score: number | null;
  creativity_score: number | null;
  content_score: number | null;
  overall_score: number | null;
}

export interface DbCollection {
  slug: string;
  name: string;
  url: string;
  is_blocked: boolean;
  is_valuable: boolean;
  clone_name_x6: string | null;
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
}

const runMigrations = async (sql: SQL): Promise<void> => {
  const files = (await readdir("migrations"))
    .filter(name => name.endsWith(".sql"))
    .sort();

  for (const file of files) {
    await sql.unsafe(await Bun.file(join("migrations", file)).text());
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
    INSERT INTO users (username, name, avatar_url, profile_url, role, country, email)
    VALUES (${user.username}, ${user.name}, ${user.avatar_url}, ${user.profile_url}, ${user.role}, ${user.country}, ${user.email})
    ON CONFLICT (username) DO UPDATE
    SET name = COALESCE(EXCLUDED.name, users.name),
        avatar_url = COALESCE(EXCLUDED.avatar_url, users.avatar_url),
        profile_url = COALESCE(EXCLUDED.profile_url, users.profile_url),
        role = COALESCE(EXCLUDED.role, users.role),
        country = COALESCE(EXCLUDED.country, users.country),
        email = COALESCE(EXCLUDED.email, users.email)
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
    INSERT INTO site_media (site_slug, media_type, source_url, local_path)
    VALUES (${media.site_slug}, ${media.media_type}, ${media.source_url}, ${media.local_path})
    ON CONFLICT (site_slug, source_url) DO UPDATE
    SET media_type = EXCLUDED.media_type,
        local_path = EXCLUDED.local_path
  `;
};

export const insertVote = async (sql: SQL, vote: DbVote): Promise<void> => {
  await sql`
    INSERT INTO votes (site_slug, voter_username, voter_role, vote_type, design_score, usability_score, creativity_score, content_score, overall_score)
    VALUES (${vote.site_slug}, ${vote.voter_username}, ${vote.voter_role}, ${vote.vote_type}, ${vote.design_score}, ${vote.usability_score}, ${vote.creativity_score}, ${vote.content_score}, ${vote.overall_score})
    ON CONFLICT (site_slug, voter_username, vote_type) DO UPDATE
    SET voter_role = EXCLUDED.voter_role,
        design_score = EXCLUDED.design_score,
        usability_score = EXCLUDED.usability_score,
        creativity_score = EXCLUDED.creativity_score,
        content_score = EXCLUDED.content_score,
        overall_score = EXCLUDED.overall_score
  `;
};

export const insertCollection = async (sql: SQL, col: DbCollection): Promise<void> => {
  await sql`
    INSERT INTO collections (slug, name, url, is_blocked, is_valuable, clone_name_x6)
    VALUES (${col.slug}, ${col.name}, ${col.url}, ${col.is_blocked}, ${col.is_valuable}, ${col.clone_name_x6})
    ON CONFLICT (slug) DO UPDATE
    SET name = EXCLUDED.name,
        url = EXCLUDED.url,
        is_blocked = EXCLUDED.is_blocked,
        is_valuable = EXCLUDED.is_valuable,
        clone_name_x6 = COALESCE(EXCLUDED.clone_name_x6, collections.clone_name_x6)
  `;
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
    INSERT INTO elements (slug, title, category_slug, source_url)
    VALUES (${elem.slug}, ${elem.title}, ${elem.category_slug}, ${elem.source_url})
    ON CONFLICT (slug) DO UPDATE
    SET title = EXCLUDED.title,
        category_slug = EXCLUDED.category_slug,
        source_url = EXCLUDED.source_url
  `;
};

export const siteExists = async (sql: SQL, slug: string): Promise<boolean> => {
  const res = await sql`SELECT 1 FROM sites WHERE slug = ${slug} LIMIT 1`;
  return res.length > 0;
};
