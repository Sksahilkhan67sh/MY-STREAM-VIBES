// client/src/lib/discover-types.ts
export interface CategoryLite {
  id: string;
  name: string;
  slug: string;
  icon: string;
  liveCount?: number;
}

export interface CreatorLite {
  id: string;
  name: string | null;
  username: string | null;
  avatarUrl: string | null;
}

export interface StreamCard {
  id: string;
  roomId: string;
  title: string;
  description: string | null;
  thumbnailUrl: string | null;
  isLive: boolean;
  isPPV: boolean;
  ppvPrice: number | null;
  viewerCount: number;
  peakViewers?: number;
  language: string;
  country: string | null;
  tags: string[];
  scheduledAt: string | null;
  goneLiveAt: string | null;
  createdAt: string;
  category: { id: string; name: string; slug: string; icon: string } | null;
  user: CreatorLite | null;
}

export interface CreatorSearchResult {
  id: string;
  name: string | null;
  username: string | null;
  avatarUrl: string | null;
  bio: string | null;
  followerCount: number;
  streamCount: number;
}

export interface CreatorProfile {
  id: string;
  name: string | null;
  username: string | null;
  avatarUrl: string | null;
  bannerUrl: string | null;
  bio: string | null;
  socialLinks: Record<string, string>;
  followerCount: number;
  isFollowing: boolean;
  liveStreams: StreamCard[];
  upcomingStreams: StreamCard[];
  pastStreams: StreamCard[];
}
