
// GET /api/streams?userId=xxx  — added for calendar + replay library
router.get('/', async (req, res) => {
  try {
    const { userId } = req.query;
    if (!userId || typeof userId !== 'string') {
      return res.status(400).json({ error: 'userId query param required' });
    }
    const streams = await prisma.stream.findMany({
      where:   { userId },
      orderBy: { createdAt: 'desc' },
      take:    100,
      select:  {
        id: true, roomId: true, title: true, isLive: true,
        scheduledAt: true, expiresAt: true, createdAt: true,
        thumbnailUrl: true, viewerCount: true,
      },
    });
    res.json({ streams });
  } catch (err) {
    console.error('[streams list]', err);
    res.status(500).json({ error: 'Failed to fetch streams' });
  }
});
