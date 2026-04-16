export type BlogCategory = "AWS" | "DevOps" | "Personal";

export interface Frontmatter {
  title: string;
  date: string;
  category: BlogCategory;
  excerpt: string;
  coverImage: string;
  tags: string[];
  featured?: boolean;
  draft?: boolean;
}

export interface BlogPost extends Frontmatter {
  slug: string;
  readingTime: number;
  content: string;
}
