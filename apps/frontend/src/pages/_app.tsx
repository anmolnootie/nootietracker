import type { AppProps } from 'next/app';
import { useEffect } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import { useAuthStore } from '@/store/auth.store';
import '@/globals.css';

function App({ Component, pageProps }: AppProps) {
  const router = useRouter();
  const { user, hydrated, hydrate } = useAuthStore();

  // Runs once after the initial hydration pass, so the store's first render still
  // matches the server (both `user: null`) and only picks up the persisted session
  // afterward - see the comment in auth.store.ts for why this can't happen eagerly.
  useEffect(() => {
    hydrate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    const isAuthPage = router.pathname === '/login';
    // Field staff open these from a shared link on their phones - they don't
    // have (and shouldn't need) an app login just to tap through to a form.
    // /store-team is The Pet Point's own page, unrelated to Nootie's app -
    // it's hosted here only because it's a separate, no-login page like this one.
    const isPublicPage = router.pathname === '/field-forms' || router.pathname === '/store-team';
    const isAuthenticated = !!user;

    if (!isAuthenticated && !isAuthPage && !isPublicPage) {
      router.push('/login');
    } else if (isAuthenticated && isAuthPage) {
      router.push('/dashboard');
    }
  }, [router, user, hydrated]);

  return (
    <>
      <Head>
        <title>nootie · PO Control Tower</title>
        <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
      </Head>
      <Component {...pageProps} />
    </>
  );
}

export default App;
