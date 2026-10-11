import { NextResponse } from "next/server";
import { desc, eq, or } from "drizzle-orm";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { communityMembers, crushes, fans, friendships, photos, scraps, testimonials, users } from "@/drizzle/schema";

// Orkut Takeout homage: download everything Google let users export in July 2014.
export async function GET() {
  const me = await getSessionUser();
  if (!me) return NextResponse.json({ error: "Login required" }, { status: 401 });
  const full = (await db.select().from(users).where(eq(users.id, me.id)).limit(1))[0];
  const [myScraps, myTestimonials, myFriends, myFans, myCrushes, myPhotos, myCommunities] = await Promise.all([
    db.select().from(scraps).where(eq(scraps.ownerId, me.id)).orderBy(desc(scraps.createdAt)).limit(500),
    db.select().from(testimonials).where(eq(testimonials.subjectId, me.id)).orderBy(desc(testimonials.createdAt)).limit(200),
    db.select().from(friendships).where(or(eq(friendships.requesterId, me.id), eq(friendships.addresseeId, me.id))).limit(1000),
    db.select().from(fans).where(eq(fans.starId, me.id)),
    db.select().from(crushes).where(eq(crushes.admirerId, me.id)),
    db.select().from(photos).where(eq(photos.ownerId, me.id)).limit(12),
    db.select().from(communityMembers).where(eq(communityMembers.userId, me.id)),
  ]);
  // Nothing credential-shaped leaves in an export. passwordHash is the obvious
  // one; totpSecret is the AES-256-GCM ciphertext of the account's TOTP secret,
  // which is still credential material and has no business being downloaded by
  // anyone who can reach this URL with a stolen session cookie. The user can
  // re-enrol a new secret at any time without ever needing the old one back.
  const {
    passwordHash: _passwordHash,
    totpSecret: _totpSecret,
    ...profile
  } = full;
  return NextResponse.json({
    exportedAt: new Date().toISOString(),
    service: "orkut-clone (homage to Google Takeout, July 2014)",
    profile,
    scrapbook: myScraps,
    testimonials: myTestimonials,
    friendships: myFriends,
    fans: myFans,
    crushList: myCrushes.map((c) => ({ crusheeId: c.crusheeId, createdAt: c.createdAt })),
    photos: myPhotos,
    communities: myCommunities,
    _note: "Crushes export only your side — their crushes stay secret unless mutual. Just like 2004.",
  });
}
