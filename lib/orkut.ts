import type { users } from "@/drizzle/schema";

type User = typeof users.$inferSelect;

const FORTUNES = [
  "Today is a great day to scrap an old friend.",
  "A new community will bring you luck.",
  "Your profile views will spike — smile!",
  "Someone is about to become your fan.",
  "Say yes to a testimonial request.",
  "Your crush list holds a secret.",
  "A forgotten friend will visit your profile.",
];

export function profileCompleteness(u: User): number {
  const fields = [u.about, u.interests, u.music, u.movies, u.books, u.city, u.country, u.relationship, u.status, u.avatarUrl];
  const filled = fields.filter((f) => f && String(f).trim().length > 0).length;
  return Math.round((filled / fields.length) * 100);
}

export function todaysFortune(seed: string): string {
  let h = 0;
  for (const c of seed) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return FORTUNES[h % FORTUNES.length];
}

export function avatarFor(name: string): string {
  return `https://api.dicebear.com/9.x/initials/svg?seed=${encodeURIComponent(name)}&backgroundColor=d4ddf5`;
}

// Orkut let people restyle their profile. The classic scheme was pink on pale
// blue, which is the default everyone remembers.
export const THEMES = {
  orkut: { label: "orkut pink", accent: "#ed2590", shell: "#d4ddf5", ink: "#5a6da8" },
  night: { label: "midnight", accent: "#7c5cff", shell: "#232338", ink: "#c9c9e8" },
  sunset: { label: "sunset", accent: "#e2603c", shell: "#ffe3d3", ink: "#a34a2c" },
  forest: { label: "forest", accent: "#2e7d4f", shell: "#dcefe1", ink: "#25603d" },
  mono: { label: "greyscale", accent: "#444", shell: "#e6e6e6", ink: "#333" },
} as const;

export type ThemeKey = keyof typeof THEMES;
export const THEME_KEYS = Object.keys(THEMES) as ThemeKey[];
