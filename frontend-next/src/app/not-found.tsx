import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

export default function NotFound() {
    return (
        <section className="route-status">
            <div className="route-status-icon" aria-hidden="true">404</div>
            <h1>Page not found</h1>
            <p>This link is no longer available or the event has been removed.</p>
            <Link className="btn-primary" href="/events">
                <ArrowLeft size={18} aria-hidden="true" />
                Browse events
            </Link>
        </section>
    );
}
