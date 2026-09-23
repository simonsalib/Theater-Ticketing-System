import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    replace: vi.fn(),
    auth: {
        user: null as { role: 'System Admin' | 'Organizer' | 'Standard User' | 'Scanner' } | null,
        loading: false,
    },
}));

vi.mock('next/navigation', () => ({
    useRouter: () => ({ replace: mocks.replace }),
}));

vi.mock('./AuthContext', () => ({
    useAuth: () => mocks.auth,
}));

vi.mock('@/components/shared/Loader', () => ({
    default: ({ message }: { message: string }) => <div>{message}</div>,
}));

import { ProtectedRoute } from './ProtectedRoute';

describe('ProtectedRoute', () => {
    beforeEach(() => {
        mocks.replace.mockReset();
        mocks.auth.user = null;
        mocks.auth.loading = false;
    });

    it('redirects anonymous users to login without rendering protected content', async () => {
        render(<ProtectedRoute><div>Private</div></ProtectedRoute>);

        expect(screen.queryByText('Private')).not.toBeInTheDocument();
        await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith('/login'));
    });

    it('redirects the wrong role and renders content for an allowed role', async () => {
        mocks.auth.user = { role: 'Standard User' };
        const { rerender } = render(
            <ProtectedRoute requiredRole="Organizer"><div>Organizer tools</div></ProtectedRoute>,
        );

        expect(screen.queryByText('Organizer tools')).not.toBeInTheDocument();
        await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith('/events'));

        mocks.replace.mockReset();
        mocks.auth.user = { role: 'Organizer' };
        rerender(<ProtectedRoute requiredRole="Organizer"><div>Organizer tools</div></ProtectedRoute>);

        expect(screen.getByText('Organizer tools')).toBeInTheDocument();
        expect(mocks.replace).not.toHaveBeenCalled();
    });
});
