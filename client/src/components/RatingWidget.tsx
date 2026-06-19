'use client';
import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { Star } from 'lucide-react';
import { apiGet, apiPost } from '@/lib/api';

export default function RatingWidget({ streamId }: { streamId: string }) {
  const { data: session, status } = useSession();
  const userId = session?.user?.id ?? session?.user?.email ?? '';

  const [average, setAverage] = useState(0);
  const [count, setCount] = useState(0);
  const [myRating, setMyRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [review, setReview] = useState('');
  const [showReview, setShowReview] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    apiGet<{ ratings: any[]; average: number; count: number }>(`/api/ratings/${streamId}`)
      .then(d => {
        setAverage(d.average);
        setCount(d.count);
        const mine = d.ratings.find(r => r.userId === userId);
        if (mine) { setMyRating(mine.rating); setReview(mine.review ?? ''); }
      })
      .catch(() => {});
  }, [streamId, userId]);

  const submit = async (rating: number) => {
    if (status !== 'authenticated' || !userId) return;
    setMyRating(rating);
    setShowReview(true);
    try {
      await apiPost('/api/ratings', { streamId, userId, rating, review: review || undefined });
      setSubmitted(true);
      setTimeout(() => setSubmitted(false), 2000);
    } catch {}
  };

  const submitReview = async () => {
    await apiPost('/api/ratings', { streamId, userId, rating: myRating, review });
    setSubmitted(true);
    setTimeout(() => setSubmitted(false), 2000);
  };

  return (
    <div className="p-4 rounded-xl bg-gray-50 dark:bg-gray-900 border border-gray-100 dark:border-gray-800">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold text-gray-500 dark:text-gray-400">Rate this stream</span>
        {count > 0 && <span className="text-xs text-gray-400">{average.toFixed(1)} ★ ({count})</span>}
      </div>
      <div className="flex items-center gap-1 mb-2">
        {[1, 2, 3, 4, 5].map(i => (
          <button
            key={i}
            onClick={() => submit(i)}
            onMouseEnter={() => setHoverRating(i)}
            onMouseLeave={() => setHoverRating(0)}
            disabled={status !== 'authenticated'}
            className="disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Star className={`w-5 h-5 ${(hoverRating || myRating) >= i ? 'fill-amber-400 text-amber-400' : 'text-gray-300 dark:text-gray-600'}`} />
          </button>
        ))}
      </div>
      {showReview && myRating > 0 && (
        <div className="mt-2">
          <textarea
            value={review} onChange={e => setReview(e.target.value)}
            placeholder="Leave a review (optional)" rows={2}
            className="w-full text-xs px-2.5 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 resize-none"
          />
          <button onClick={submitReview} className="mt-1.5 text-xs font-semibold text-red-500 hover:underline">Save review</button>
        </div>
      )}
      {submitted && <p className="text-xs text-green-500 mt-1.5">Thanks for your feedback!</p>}
      {status !== 'authenticated' && <p className="text-xs text-gray-400 mt-1.5">Sign in to rate this stream.</p>}
    </div>
  );
}
