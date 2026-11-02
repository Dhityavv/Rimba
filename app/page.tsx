'use client';

import { useEffect } from 'react';
import '../src/style.css';
import '../src/phase2.css';

export default function RimbaPage() {
  useEffect(() => {
    let mounted = true;
    import('../src/main').then(mod => {
      if (mounted) {
        mod.bootRimbaGame();
      }
    });
    return () => {
      mounted = false;
    };
  }, []);

  return <div id="app" data-nextjs="true" />;
}
