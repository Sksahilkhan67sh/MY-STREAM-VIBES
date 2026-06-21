import { redirect } from 'next/navigation';

// /landing used to be the marketing page; it has moved to / (the new root
// landing page). This redirect exists purely so old bookmarks/links to
// /landing — including the one in the feed page's footer — keep working.
export default function LandingRedirect() {
  redirect('/');
}
