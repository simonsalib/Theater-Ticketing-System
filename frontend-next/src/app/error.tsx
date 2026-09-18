'use client';

import { useEffect } from 'react';
import { RefreshCw } from 'lucide-react';

export default function GlobalError({
    error,
    reset,
}: Readonly<{
    error: Error & { digest?: string };
    reset: () => void;
}>) {
    useEffect(() => {
        console.error('Unhandled route error:', error);
    }, [error]);

    return (
        <section className="route-status" aria-live="assertive">
            <div className="route-status-icon" aria-hidden="true">!</div>
            <h1>Something went wrong</h1>
            <p>The page could not finish loading. Try again before returning to the event list.</p>
            <button className="btn-primary" type="button" onClick={reset}>
                <RefreshCw size={18} aria-hidden="true" />
                Try again
            </button>
        </section>
    );
}
