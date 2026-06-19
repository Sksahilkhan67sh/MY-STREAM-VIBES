'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Search } from 'lucide-react';

export default function SearchBar({ initialValue = '', className = '', placeholder = 'Search creators or streams' }: { initialValue?: string; className?: string; placeholder?: string }) {
  const [value, setValue] = useState(initialValue);
  const router = useRouter();

  const submit = () => {
    const q = value.trim();
    if (q) router.push(`/search?q=${encodeURIComponent(q)}`);
  };

  return (
    <div className={`relative ${className}`}>
      <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
      <input
        value={value}
        onChange={e => setValue(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') submit(); }}
        placeholder={placeholder}
        style={{ fontSize: '16px' }}
        className="w-full pl-10 pr-4 py-2.5 text-sm bg-gray-100 dark:bg-gray-800 border border-transparent focus:border-gray-300 dark:focus:border-gray-600 rounded-full text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:outline-none transition-colors"
      />
    </div>
  );
}
