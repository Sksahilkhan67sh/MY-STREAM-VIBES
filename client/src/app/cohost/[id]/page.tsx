import { Suspense } from 'react';
import CoHostPageClient from './CoHostPageClient';

export default function CoHostPage() {
  return (
    <Suspense fallback={
      <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:'sans-serif' }}>
        <p style={{ color:'#6B7280' }}>Loading co-host studio...</p>
      </div>
    }>
      <CoHostPageClient />
    </Suspense>
  );
}
