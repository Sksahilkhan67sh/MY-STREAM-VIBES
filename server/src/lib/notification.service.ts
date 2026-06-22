import prisma from './prisma';
import { getIo } from './socket';

/**
 * Notify Followers on go-live — real implementation.
 *
 * Previously lived inline in streams.ts. Extracted here so the background
 * job worker (queues/workers.ts) can call the exact same logic the route
 * handler used to call directly — no duplicated logic, no risk of the two
 * call sites drifting apart.
 *
 * Behavior is unchanged from before EXCEPT for one addition: each created
 * Notification is now also pushed live over Socket.IO to that follower's
 * browser tab (if connected), via the new `notify:<userId>` room. This is
 * what makes "the bell updates instantly" and "a toast appears" actually
 * true instead of waiting for NotificationBell's 30-second poll to catch up.
 * The DB write (so the bell/notifications page still works exactly as
 * before on next load or for offline-at-the-time followers) is unchanged.
 */
export async function notifyFollowersOfGoLive(creatorId: string, streamTitle: string, roomId: string) {
  const [creator, followers] = await Promise.all([
    prisma.user.findUnique({ where: { id: creatorId }, select: { name: true, username: true } }),
    // pushNotifsEnabled is the in-app/real-time notification channel this
    // Notification model actually powers (the bell icon) — a viewer who has
    // turned off notifications globally in Settings should not get one here
    // just because notifyOnLive happens to be true for this one creator.
    prisma.follow.findMany({
      where: { creatorId, notifyOnLive: true, follower: { pushNotifsEnabled: true } },
      select: { followerId: true },
    }),
  ]);
  if (!followers.length) return;

  const creatorName = creator?.name || creator?.username || 'A creator you follow';
  const title = `${creatorName} is live`;
  const actionUrl = `/s/${roomId}`;
  const followerIds = followers.map(f => f.followerId);

  await prisma.notification.createMany({
    data: followerIds.map(userId => ({ userId, type: 'live', title, body: streamTitle, actionUrl })),
  });

  // Read back the rows we just created (by recipient + matching content) so
  // the real-time push below can include real ids/timestamps. This costs one
  // extra query, fired only when a stream goes live — not on the hot path
  // of any frequent action — so the simplicity is worth it over relying on
  // createManyAndReturn, which isn't guaranteed available in every Prisma
  // version this project might run.
  const created = await prisma.notification.findMany({
    where: { userId: { in: followerIds }, type: 'live', actionUrl, title },
    orderBy: { createdAt: 'desc' },
    take: followerIds.length,
  });

  pushNotificationsToUsers(created);
}

/**
 * Push already-persisted Notification rows live to each recipient's
 * connected browser tab(s), if any. Safe to call even if Socket.IO hasn't
 * initialized yet (e.g. during tests) or the user has no open tab — in
 * both cases this is a silent no-op, and the notification is still sitting
 * in the database for NotificationBell to load on next poll/page view.
 */
export function pushNotificationsToUsers(
  notifications: Array<{ id: string; userId: string; type: string; title: string; body: string; actionUrl: string | null; isRead: boolean; createdAt: Date }>
) {
  const io = getIo();
  if (!io) return;
  for (const n of notifications) {
    io.to(`notify:${n.userId}`).emit('notification:new', {
      id: n.id,
      type: n.type,
      title: n.title,
      body: n.body,
      actionUrl: n.actionUrl,
      isRead: n.isRead,
      createdAt: n.createdAt,
    });
  }
}
