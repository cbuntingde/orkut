import { eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { hashPassword } from "@/lib/auth";
import {
  communities, communityMembers, crushes, directMessages, eventRsvps, events, fans, friendships,
  photoAlbums, photoComments, photos, pollOptions, polls, posts, profileVisits, ratings,
  scraps, testimonials, topics, users,
} from "@/drizzle/schema";

const DEMO = [
  { name: "Ana Souza", email: "ana@example.com", city: "São Paulo", country: "Brazil", interests: "football, samba", dob: new Date("1990-10-15") },
  { name: "Rahul Sharma", email: "rahul@example.com", city: "Mumbai", country: "India", interests: "cricket, movies", dob: new Date("1988-10-12") },
  { name: "Priya Patel", email: "priya@example.com", city: "Delhi", country: "India", interests: "music, books", dob: new Date("1992-05-20") },
  { name: "Carlos Lima", email: "carlos@example.com", city: "Rio de Janeiro", country: "Brazil", interests: "surf, pagode", dob: new Date("1985-12-01") },
];

const RULES = "1. Complain, do not whine.\n2. No spam or adverts.\n3. Scraps on Mondays only.";

async function idFor(email: string): Promise<string> {
  const rows = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
  return rows[0].id;
}

export async function GET() {
  if (process.env.NODE_ENV === "production") {
    return Response.json({ error: "Seeding disabled in production" }, { status: 403 });
  }
  const passwordHash = await hashPassword("orkut123");
  for (const d of DEMO) {
    await db.insert(users).values({ ...d, passwordHash, luckyPct: 70, about: `Hi, I'm ${d.name}!` }).onConflictDoNothing({ target: users.email });
  }
  // Ana owns the demo community and is the account the screenshots show. She is
  // also the demo administrator, so the moderation queue is reachable locally.
  // The seed is refused in production, and nothing in the running app ever sets
  // is_admin, so this cannot grant itself on a live deployment.
  await db.update(users).set({ isAdmin: true }).where(eq(users.email, "ana@example.com"));
  const [ana, rahul, priya, carlos] = await Promise.all(DEMO.map((d) => idFor(d.email)));
  const ids = [ana, rahul, priya, carlos];

  // Demo content has no natural unique key anywhere, so re-seeding would keep
  // appending copies of everything. Clear it all first, then rebuild. The graph
  // tables (friendships, crushes, ratings, memberships) DO have unique keys, so
  // they are upserted instead.
  await db.delete(photoComments).where(sql`${photoComments.authorId} IN ${ids}`);
  await db.delete(photos).where(sql`${photos.ownerId} IN ${ids}`);
  await db.delete(directMessages).where(sql`${directMessages.senderId} IN ${ids} OR ${directMessages.receiverId} IN ${ids}`);
  await db.delete(testimonials).where(sql`${testimonials.authorId} IN ${ids} OR ${testimonials.subjectId} IN ${ids}`);
  await db.delete(scraps).where(sql`${scraps.ownerId} IN ${ids} OR ${scraps.authorId} IN ${ids}`);
  await db.delete(profileVisits).where(sql`${profileVisits.visitedId} IN ${ids}`);
  await db.delete(posts).where(sql`${posts.authorId} IN ${ids}`);
  await db.delete(topics).where(sql`${topics.authorId} IN ${ids}`);
  await db.delete(eventRsvps).where(sql`${eventRsvps.userId} IN ${ids}`);
  await db.delete(events).where(sql`${events.authorId} IN ${ids}`);
  await db.delete(polls).where(sql`${polls.authorId} IN ${ids}`);

  // Friendships, with Orkut's closeness tiers.
  const TIERS: [string, string, "acquaintance" | "good" | "best"][] = [
    [ana, rahul, "best"],
    [ana, priya, "good"],
    [rahul, carlos, "acquaintance"],
  ];
  for (const [a, b, tier] of TIERS) {
    await db.insert(friendships)
      .values({ requesterId: a, addresseeId: b, status: "accepted", tier })
      .onConflictDoUpdate({ target: [friendships.requesterId, friendships.addresseeId], set: { status: "accepted", tier } });
  }

  // Ratings, Orkut-style 1..3 per category.
  await db.insert(ratings).values([
    { raterId: rahul, ratedId: ana, cool: 3, sexy: 2, trustworthy: 3 },
    { raterId: priya, ratedId: ana, cool: 3, sexy: 1, trustworthy: 3 },
  ]).onConflictDoNothing();

  // Mutual crush ana<->rahul (revealed), one-sided priya->carlos.
  for (const [a, b] of [[ana, rahul], [rahul, ana], [priya, carlos]] as const) {
    await db.insert(crushes).values({ admirerId: a, crusheeId: b }).onConflictDoNothing();
  }

  // Fans are one-way and are not the same as a friendship, which is the whole
  // point of having both lists. Deliberately not symmetric.
  await db.insert(fans).values([
    { fanId: carlos, starId: ana },
    { fanId: priya, starId: ana },
    { fanId: rahul, starId: priya },
    { fanId: carlos, starId: rahul },
  ]).onConflictDoNothing();

  await db.insert(scraps).values([
    { authorId: rahul, ownerId: ana, body: "Welcome to orkut! Leave me a scrap :)" },
    { authorId: priya, ownerId: ana, body: "Happy birthday week! 🎂" },
    // Demonstrates the scrap formatter end to end.
    { authorId: rahul, ownerId: ana, body: "[color=red]I am so[/color] [b][i]happy[/i][/b] today! <3 [link=https://en.wikipedia.org/wiki/Orkut]orkut was great[/link] :D" },
  ]);

  await db.insert(testimonials).values([
    { authorId: rahul, subjectId: ana, body: "Ana is the best friend ever!", status: "accepted" },
    { authorId: carlos, subjectId: rahul, body: "Rahul knows everything about cricket.", status: "pending" },
  ]);

  await db.insert(directMessages).values([
    { senderId: rahul, receiverId: ana, body: "Hey! Did you see the new community?" },
    { senderId: ana, receiverId: rahul, body: "Yes! Just joined :)" },
  ]);

  // Photos live in albums on Orkut, so the seed creates some rather than leaving
  // everything in the unfiled bucket.
  await db.delete(photoAlbums).where(sql`${photoAlbums.ownerId} IN ${ids}`);
  const [album] = await db
    .insert(photoAlbums)
    .values({ ownerId: ana, title: "São Paulo", description: "Around the city" })
    .returning({ id: photoAlbums.id });

  await db.insert(photos).values([
    { ownerId: ana, albumId: album.id, url: "https://picsum.photos/seed/orkut-ana/400/300", caption: "São Paulo vibes" },
    { ownerId: ana, albumId: album.id, url: "https://picsum.photos/seed/orkut-ana2/400/300", caption: "Ibirapuera" },
    { ownerId: ana, url: "https://picsum.photos/seed/orkut-ana3/400/300", caption: "No album for this one" },
    { ownerId: rahul, url: "https://picsum.photos/seed/orkut-rahul/400/300", caption: "Match day!" },
  ]);

  // Community + members + forum + poll + event.
  // Name is unique, so a re-run hits the constraint and falls back to the row
  // that already exists. That is what keeps the seed idempotent without having
  // to delete communities out from under their members.
  const upsertCommunity = async (values: typeof communities.$inferInsert) => {
    const row = await db.insert(communities).values(values).returning({ id: communities.id }).catch(() => null);
    if (row) return row[0].id;
    return (await db.select({ id: communities.id }).from(communities).where(eq(communities.name, values.name!)).limit(1))[0].id;
  };

  const cid = await upsertCommunity({
    name: "Eu Odeio Segundas", description: "For everyone who hates Mondays",
    category: "humor", language: "Portuguese", ownerId: ana, membersCount: 4,
    rules: RULES, joinPolicy: "open",
  });

  // A couple more so the list, search, and related-communities features have
  // something to work with.
  const cricketId = await upsertCommunity({
    name: "Cricket Lovers", description: "Matches, scores, and arguments about both",
    category: "sports", language: "English", ownerId: rahul, membersCount: 3,
    rules: "1. No spoilers during a live match.", joinPolicy: "open",
  });
  const booksId = await upsertCommunity({
    name: "Clube de Leitura", description: "One book a month, everyone finishes it",
    category: "books", language: "Portuguese", ownerId: priya, membersCount: 2,
    rules: "1. Spoil nothing past chapter two.", joinPolicy: "approval",
  });

  for (const [communityId, uid, role] of [
    [cricketId, rahul, "owner"], [cricketId, ana, "member"], [cricketId, carlos, "member"],
    [booksId, priya, "owner"], [booksId, ana, "member"],
  ] as const) {
    await db.insert(communityMembers)
      .values({ communityId, userId: uid, role })
      .onConflictDoUpdate({ target: [communityMembers.communityId, communityMembers.userId], set: { role } });
  }
  await db.update(communities).set({ membersCount: 3 }).where(eq(communities.id, cricketId));
  await db.update(communities).set({ membersCount: 2 }).where(eq(communities.id, booksId));

  const ROLES: [string, "owner" | "moderator" | "member"][] = [
    [ana, "owner"], [rahul, "moderator"], [priya, "member"], [carlos, "member"],
  ];
  for (const [uid, role] of ROLES) {
    await db.insert(communityMembers)
      .values({ communityId: cid, userId: uid, role })
      .onConflictDoUpdate({ target: [communityMembers.communityId, communityMembers.userId], set: { role } });
  }
  await db.update(communities).set({ rules: RULES, joinPolicy: "open", membersCount: ROLES.length }).where(eq(communities.id, cid));

  const t = await db.insert(topics)
    .values({ communityId: cid, authorId: rahul, title: "Why Mondays exist?" })
    .returning({ id: topics.id });
  await db.insert(posts).values([
    { topicId: t[0].id, authorId: rahul, body: "Seriously, who invented Mondays?" },
    { topicId: t[0].id, authorId: ana, body: "Someone who hates us." },
  ]);

  const p = await db.insert(polls)
    .values({ communityId: cid, authorId: ana, question: "Best day of the week?" })
    .returning({ id: polls.id });
  for (const label of ["Friday", "Saturday", "Sunday"]) {
    await db.insert(pollOptions).values({ pollId: p[0].id, label });
  }

  await db.insert(events).values({
    communityId: cid, authorId: ana, title: "Anti-Monday Party",
    description: "Celebrate surviving another Monday", location: "São Paulo",
    startsAt: new Date(Date.now() + 7 * 24 * 3600 * 1000),
  });

  return Response.json({
    ok: true,
    login: "ana@example.com / orkut123",
    features: "friendship tiers, fans, ratings 1-3, scrap formatter, testimonials, DMs, photos, community roles, join policy, rules, forum, poll, event, birthdays",
  });
}