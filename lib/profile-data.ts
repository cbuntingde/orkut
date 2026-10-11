import { and, count, desc, eq, or, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { fans, friendships, profileVisits, ratings, scraps, testimonials, users } from "@/drizzle/schema";

export async function getProfileData(id: string, viewerId?: string) {
  const u = (await db.select().from(users).where(eq(users.id, id)).limit(1))[0];
  if (!u) return null;
  // A private scrap is visible to its owner only. `and()` drops undefined entries,
  // so the owner sees everything and every other viewer, guest included, sees
  // public scraps only.
  const visibleScraps = and(
    eq(scraps.ownerId, id),
    viewerId === id ? undefined : eq(scraps.isPrivate, false)
  );
  const [myScraps, visibleCount, accepted, pends, fanRows, ratingRows, visits, isFanRows, friendRows, myRatings] = await Promise.all([
    db.select().from(scraps).where(visibleScraps).orderBy(desc(scraps.createdAt)).limit(20),
    db.select({ n: count() }).from(scraps).where(visibleScraps),
    db.select().from(testimonials).where(and(eq(testimonials.subjectId, id), eq(testimonials.status, "accepted"))).orderBy(desc(testimonials.createdAt)).limit(10),
    viewerId === id ? db.select().from(testimonials).where(and(eq(testimonials.subjectId, id), eq(testimonials.status, "pending"))) : Promise.resolve([]),
    db.select().from(fans).where(eq(fans.starId, id)),
    db.select().from(ratings).where(eq(ratings.ratedId, id)),
    db.select({ visit: profileVisits, visitor: users }).from(profileVisits).innerJoin(users, eq(users.id, profileVisits.visitorId)).where(eq(profileVisits.visitedId, id)).orderBy(desc(profileVisits.visitedAt)).limit(5),
    viewerId ? db.select().from(fans).where(and(eq(fans.fanId, viewerId), eq(fans.starId, id))).limit(1) : Promise.resolve([]),
    // The friend is whoever is on the other side of the friendship, so the join
    // has to pick the column that is not this profile. Joining on addresseeId
    // alone listed the profile owner as their own friend whenever they were the
    // addressee, and filtering to requesterId alone hid every friend who had
    // invited them.
    db.select({ friendship: friendships, friend: users })
      .from(friendships)
      .innerJoin(
        users,
        eq(
          users.id,
          sql`CASE WHEN ${friendships.requesterId} = ${id} THEN ${friendships.addresseeId} ELSE ${friendships.requesterId} END`
        )
      )
      .where(
        and(
          eq(friendships.status, "accepted"),
          or(eq(friendships.requesterId, id), eq(friendships.addresseeId, id))
        )
      )
      .limit(24),
    viewerId ? db.select().from(ratings).where(and(eq(ratings.raterId, viewerId), eq(ratings.ratedId, id))).limit(1) : Promise.resolve([]),
  ]);
  // Fans and testimonials were friend-only on Orkut, so the profile needs to
  // know whether the viewer qualifies before offering the buttons.
  const isFriend = viewerId
    ? (await db
        .select({ id: friendships.id })
        .from(friendships)
        .where(
          and(
            eq(friendships.status, "accepted"),
            or(
              and(eq(friendships.requesterId, viewerId), eq(friendships.addresseeId, id)),
              and(eq(friendships.requesterId, id), eq(friendships.addresseeId, viewerId)),
            ),
          ),
        )
        .limit(1)).length > 0
    : false;
  // Orkut showed profile views as yesterday / last week / all time rather than a
  // single running total, which is what made the number feel alive.
  const [dayViews, weekViews] = await Promise.all([
    db.select({ n: count() }).from(profileVisits)
      .where(and(eq(profileVisits.visitedId, id), sql`${profileVisits.visitedAt} >= NOW() - INTERVAL '1 day'`)),
    db.select({ n: count() }).from(profileVisits)
      .where(and(eq(profileVisits.visitedId, id), sql`${profileVisits.visitedAt} >= NOW() - INTERVAL '7 days'`)),
  ]);
  return {
    u,
    myScraps,
    // Counted from the same predicate as the list, so it cannot leak the number of
    // private scraps the way `u.scrapsCount` would. Number() because postgres.js
    // may hand back an int8 as a string.
    visibleScrapCount: Number(visibleCount[0]?.n ?? 0),
    accepted,
    pending: pends,
    fanRows,
    ratingRows,
    visits,
    isFan: isFanRows.length > 0,
    friendRows,
    myRatings: myRatings[0],
    isFriend,
    viewsDay: Number(dayViews[0]?.n ?? 0),
    viewsWeek: Number(weekViews[0]?.n ?? 0),
  };
}