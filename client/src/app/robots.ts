import { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: '*', allow: '/', disallow: ['/s/', '/cohost/'] },
    sitemap: 'https://my-stream-vibes.vercel.app/sitemap.xml',
  };
}
