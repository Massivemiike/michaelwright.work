import fs from "fs";
import path from "path";
import matter from "gray-matter";
import { readingTime } from "./reading-time";
import type { BlogPost, Frontmatter } from "@/types/blog";

const CONTENT_DIR = path.join(process.cwd(), "content", "blog");

function slugFromFile(filename: string) {
  return filename.replace(/\.mdx?$/, "");
}

export function getAllPosts(): BlogPost[] {
  if (!fs.existsSync(CONTENT_DIR)) return [];

  const files = fs.readdirSync(CONTENT_DIR).filter((f) => f.endsWith(".mdx"));

  const posts = files
    .map((file) => {
      const raw = fs.readFileSync(path.join(CONTENT_DIR, file), "utf-8");
      const { data, content } = matter(raw);
      const fm = data as Frontmatter;

      if (fm.draft) return null;

      return {
        ...fm,
        slug: slugFromFile(file),
        readingTime: readingTime(content),
        content,
      } satisfies BlogPost;
    })
    .filter(Boolean) as BlogPost[];

  return posts.sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );
}

export function getPostBySlug(slug: string): BlogPost | null {
  const filePath = path.join(CONTENT_DIR, `${slug}.mdx`);
  if (!fs.existsSync(filePath)) return null;

  const raw = fs.readFileSync(filePath, "utf-8");
  const { data, content } = matter(raw);
  const fm = data as Frontmatter;

  return {
    ...fm,
    slug,
    readingTime: readingTime(content),
    content,
  };
}

export function getFeaturedPost(): BlogPost | null {
  const posts = getAllPosts();
  return posts.find((p) => p.featured) ?? posts[0] ?? null;
}
