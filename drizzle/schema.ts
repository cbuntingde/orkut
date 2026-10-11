import {
  pgTable, uuid, text, varchar, timestamp, integer, boolean,
  primaryKey, uniqueIndex, index, pgEnum,
} from "drizzle-orm/pg-core";

// 'blocked' was never written: blocking lives in the `blocks` table (see below).
export const friendshipStatus = pgEnum("friendship_status", ["pending", "accepted"]);
export const friendshipTier = pgEnum("friendship_tier", ["acquaintance", "good", "best"]);
export const testimonialStatus = pgEnum("testimonial_status", ["pending", "accepted", "rejected"]);
export const memberRole = pgEnum("member_role", ["member", "moderator", "owner"]);
export const joinPolicy = pgEnum("join_policy", ["open", "approval", "closed"]);

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: varchar("name", { length: 100 }).notNull(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  avatarUrl: text("avatar_url"),
  gender: varchar("gender", { length: 20 }),
  dob: timestamp("dob", { withTimezone: true }),
  status: varchar("status", { length: 255 }),
  relationship: varchar("relationship", { length: 50 }),
  city: varchar("city", { length: 100 }),
  country: varchar("country", { length: 100 }),
  about: text("about"),
  interests: text("interests"),
  music: text("music"),
  movies: text("movies"),
  books: text("books"),
  profileViews: integer("profile_views").default(0).notNull(),
  scrapsCount: integer("scraps_count").default(0).notNull(),
  luckyPct: integer("lucky_pct").default(50).notNull(),
  // Orkut let people restyle their profile. "orkut" is the original pink/blue.
  theme: varchar("theme", { length: 40 }).default("orkut").notNull(),
  // Orkut's jail system: repeated or severe reports produced a temporary
  // restriction rather than an immediate ban.
  jailedUntil: timestamp("jailed_until", { withTimezone: true }),
  jailCount: integer("jail_count").default(0).notNull(),
  emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true }),
  // TOTP secret, encrypted at rest with AES-256-GCM. It has to be recoverable,
  // because generating the next code requires it, so unlike a password it
  // cannot simply be hashed.
  totpSecret: text("totp_secret"),
  totpEnabledAt: timestamp("totp_enabled_at", { withTimezone: true }),
  // Highest TOTP counter already spent for this account. Without it, a code
  // captured in transit stays valid for the rest of its 30 second step, and the
  // +/-1 verification window would widen that to 90 seconds.
  totpLastCounter: integer("totp_last_counter"),
  // Site-wide administrator. Distinct from the community-scoped owner and
  // moderator roles in community_members: this is the only flag that grants
  // power over accounts other than the caller's own, namely the moderation
  // queue and the jail override. It is deliberately not self-service — there is
  // no action anywhere that sets it, only the seed and a manual UPDATE.
  isAdmin: boolean("is_admin").default(false).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [index("users_name_trgm").using("gin", t.name.op("gin_trgm_ops"))]);

export const sessions = pgTable("sessions", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  token: text("token").notNull().unique(),
  // Device identification, so "log out everywhere" can become "log out this one".
  userAgent: text("user_agent"),
  ip: varchar("ip", { length: 64 }),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).defaultNow().notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [index("sessions_user").on(t.userId, t.createdAt.desc())]);

/**
 * Recovery codes for two-factor login, stored as SHA-256 hashes. Each one works
 * once and is deleted as it is spent. The plain code is shown to the user exactly
 * once, at the moment they turn 2FA on, and never again.
 */
export const twoFactorRecovery = pgTable("two_factor_recovery", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  codeHash: text("code_hash").notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [index("two_factor_recovery_user").on(t.userId)]);

export const friendships = pgTable("friendships", {
  id: uuid("id").defaultRandom().primaryKey(),
  requesterId: uuid("requester_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  addresseeId: uuid("addressee_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  status: friendshipStatus("status").default("pending").notNull(),
  // Orkut categorised friendships by closeness, not just by existence.
  tier: friendshipTier("tier").default("acquaintance").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [uniqueIndex("friendships_pair").on(t.requesterId, t.addresseeId)]);

export const fans = pgTable("fans", {
  fanId: uuid("fan_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  starId: uuid("star_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [primaryKey({ columns: [t.fanId, t.starId] })]);

export const blocks = pgTable("blocks", {
  blockerId: uuid("blocker_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  blockedId: uuid("blocked_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [primaryKey({ columns: [t.blockerId, t.blockedId] })]);

export const reportStatus = pgEnum("report_status", ["open", "reviewed", "actioned", "dismissed"]);

export const reports = pgTable("reports", {
  id: uuid("id").defaultRandom().primaryKey(),
  reporterId: uuid("reporter_id").references(() => users.id, { onDelete: "set null" }),
  targetType: varchar("target_type", { length: 30 }).notNull(),
  targetId: text("target_id").notNull(),
  reason: varchar("reason", { length: 280 }).notNull(),
  status: reportStatus("status").default("open").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [index("reports_status").on(t.status, t.createdAt.desc())]);

export const scraps = pgTable("scraps", {
  id: uuid("id").defaultRandom().primaryKey(),
  authorId: uuid("author_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  ownerId: uuid("owner_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  body: varchar("body", { length: 1000 }).notNull(),
  isPrivate: boolean("is_private").default(false).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [index("scraps_owner_created").on(t.ownerId, t.createdAt.desc())]);

export const testimonials = pgTable("testimonials", {
  id: uuid("id").defaultRandom().primaryKey(),
  authorId: uuid("author_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  subjectId: uuid("subject_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  body: text("body").notNull(),
  status: testimonialStatus("status").default("pending").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [index("testimonials_subject").on(t.subjectId, t.status)]);


export const communities = pgTable("communities", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: varchar("name", { length: 120 }).notNull().unique(),
  description: text("description"),
  category: varchar("category", { length: 80 }),
  language: varchar("language", { length: 40 }),
  avatarUrl: text("avatar_url"),
  ownerId: uuid("owner_id").references(() => users.id, { onDelete: "set null" }),
  membersCount: integer("members_count").default(1).notNull(),
  rules: text("rules"),
  joinPolicy: joinPolicy("join_policy").default("open").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [index("communities_name_trgm").using("gin", t.name.op("gin_trgm_ops"))]);

export const communityMembers = pgTable("community_members", {
  communityId: uuid("community_id").references(() => communities.id, { onDelete: "cascade" }).notNull(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  role: memberRole("role").default("member").notNull(),
  joinedAt: timestamp("joined_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [primaryKey({ columns: [t.communityId, t.userId] })]);

export const topics = pgTable("topics", {
  id: uuid("id").defaultRandom().primaryKey(),
  communityId: uuid("community_id").references(() => communities.id, { onDelete: "cascade" }).notNull(),
  authorId: uuid("author_id").references(() => users.id, { onDelete: "set null" }),
  title: varchar("title", { length: 200 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [index("topics_community").on(t.communityId, t.createdAt.desc())]);

export const posts = pgTable("posts", {
  id: uuid("id").defaultRandom().primaryKey(),
  topicId: uuid("topic_id").references(() => topics.id, { onDelete: "cascade" }).notNull(),
  authorId: uuid("author_id").references(() => users.id, { onDelete: "set null" }),
  body: text("body").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [index("posts_topic").on(t.topicId, t.createdAt)]);

export const polls = pgTable("polls", {
  id: uuid("id").defaultRandom().primaryKey(),
  communityId: uuid("community_id").references(() => communities.id, { onDelete: "cascade" }).notNull(),
  authorId: uuid("author_id").references(() => users.id, { onDelete: "set null" }),
  question: varchar("question", { length: 280 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [index("polls_community").on(t.communityId, t.createdAt.desc())]);

export const pollOptions = pgTable("poll_options", {
  id: uuid("id").defaultRandom().primaryKey(),
  pollId: uuid("poll_id").references(() => polls.id, { onDelete: "cascade" }).notNull(),
  label: varchar("label", { length: 140 }).notNull(),
  votesCount: integer("votes_count").default(0).notNull(),
}, (t) => [index("poll_options_poll").on(t.pollId)]);

export const pollVotes = pgTable("poll_votes", {
  pollId: uuid("poll_id").references(() => polls.id, { onDelete: "cascade" }).notNull(),
  voterId: uuid("voter_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  optionId: uuid("option_id").references(() => pollOptions.id, { onDelete: "cascade" }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [primaryKey({ columns: [t.pollId, t.voterId] })]);

export const events = pgTable("events", {
  id: uuid("id").defaultRandom().primaryKey(),
  communityId: uuid("community_id").references(() => communities.id, { onDelete: "cascade" }).notNull(),
  authorId: uuid("author_id").references(() => users.id, { onDelete: "set null" }),
  title: varchar("title", { length: 200 }).notNull(),
  description: text("description"),
  location: varchar("location", { length: 200 }),
  startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [index("events_community").on(t.communityId, t.startsAt)]);

export const eventRsvps = pgTable("event_rsvps", {
  eventId: uuid("event_id").references(() => events.id, { onDelete: "cascade" }).notNull(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  status: varchar("status", { length: 20 }).default("going").notNull(),
}, (t) => [primaryKey({ columns: [t.eventId, t.userId] })]);

export const directMessages = pgTable("direct_messages", {
  id: uuid("id").defaultRandom().primaryKey(),
  senderId: uuid("sender_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  receiverId: uuid("receiver_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  body: varchar("body", { length: 1000 }).notNull(),
  readAt: timestamp("read_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [index("dm_pair").on(t.senderId, t.receiverId, t.createdAt.desc())]);

export const profileVisits = pgTable("profile_visits", {
  id: uuid("id").defaultRandom().primaryKey(),
  visitorId: uuid("visitor_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  visitedId: uuid("visited_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  visitedAt: timestamp("visited_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [index("visits_visited").on(t.visitedId, t.visitedAt.desc())]);

export const crushes = pgTable("crushes", {
  admirerId: uuid("admirer_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  crusheeId: uuid("crushee_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [primaryKey({ columns: [t.admirerId, t.crusheeId] })]);

export const ratings = pgTable("ratings", {
  raterId: uuid("rater_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  ratedId: uuid("rated_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  cool: integer("cool").default(0).notNull(),
  sexy: integer("sexy").default(0).notNull(),
  trustworthy: integer("trustworthy").default(0).notNull(),
}, (t) => [primaryKey({ columns: [t.raterId, t.ratedId] })]);

export const photoAlbums = pgTable("photo_albums", {
  id: uuid("id").defaultRandom().primaryKey(),
  ownerId: uuid("owner_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  title: varchar("title", { length: 120 }).notNull(),
  description: varchar("description", { length: 280 }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [index("albums_owner").on(t.ownerId, t.createdAt.desc())]);

export const photos = pgTable("photos", {
  id: uuid("id").defaultRandom().primaryKey(),
  ownerId: uuid("owner_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  albumId: uuid("album_id").references(() => photoAlbums.id, { onDelete: "set null" }),
  url: text("url").notNull(),
  caption: varchar("caption", { length: 280 }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [index("photos_owner").on(t.ownerId, t.createdAt.desc()), index("photos_album").on(t.albumId, t.createdAt)]);

// Orkut had videos on profiles and in communities, either uploaded or embedded
// from YouTube.
export const videos = pgTable("videos", {
  id: uuid("id").defaultRandom().primaryKey(),
  ownerId: uuid("owner_id").references(() => users.id, { onDelete: "cascade" }),
  communityId: uuid("community_id").references(() => communities.id, { onDelete: "cascade" }),
  url: text("url").notNull(),
  title: varchar("title", { length: 160 }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [index("videos_owner").on(t.ownerId, t.createdAt.desc()), index("videos_community").on(t.communityId, t.createdAt.desc())]);

// Only the SHA-256 hash of a verification token is stored, so a database leak
// cannot be replayed into account access.
export const emailVerificationTokens = pgTable("email_verification_tokens", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  tokenHash: varchar("token_hash", { length: 64 }).notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  consumedAt: timestamp("consumed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [index("verification_user").on(t.userId, t.createdAt.desc())]);

export const notifications = pgTable("notifications", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  kind: varchar("kind", { length: 30 }).notNull(),
  actorId: uuid("actor_id").references(() => users.id, { onDelete: "cascade" }),
  targetId: text("target_id"),
  body: text("body"),
  readAt: timestamp("read_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [index("notifications_user").on(t.userId, t.createdAt.desc())]);

export const photoComments = pgTable("photo_comments", {
  id: uuid("id").defaultRandom().primaryKey(),
  photoId: uuid("photo_id").references(() => photos.id, { onDelete: "cascade" }).notNull(),
  authorId: uuid("author_id").references(() => users.id, { onDelete: "set null" }),
  body: varchar("body", { length: 500 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [index("photo_comments_photo").on(t.photoId, t.createdAt)]);

// Brute-force and mass-signup throttle. One row per (action, scope) key; the row
// resets itself once window_start falls outside the window.
export const rateLimits = pgTable("rate_limits", {
  key: varchar("key", { length: 200 }).primaryKey(),
  count: integer("count").default(0).notNull(),
  windowStart: timestamp("window_start", { withTimezone: true }).defaultNow().notNull(),
});
