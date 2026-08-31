import type { AppProps } from 'next/app';
import { useEffect } from 'react';
import { useRouter } from 'next/router';
import { useAuthStore } from '@/store/auth.store';
import '@/globals.css';

function App({ Component, pageProps }: AppProps) {
  const router = useRouter();
  const { user } = useAuthStore();

  useEffect(() => {
    const isAuthPage = ['/login', '/register'].includes(router.pathname);
    const isAuthenticated = !!user || (typeof window !== 'undefined' && !!localStorage.getItem('accessToken'));

    if (!isAuthenticated && !isAuthPage) {
      router.push('/login');
    } else if (isAuthenticated && isAuthPage) {
      router.push('/dashboard');
    }
  }, [router, user]);

  return <Component {...pageProps} />;
}

export default App;
