import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiMocks = vi.hoisted(() => ({
    get: vi.fn(),
    post: vi.fn(),
    clearStoredAuth: vi.fn(),
}));

vi.mock('@/services/api', () => ({
    default: { get: apiMocks.get, post: apiMocks.post },
    AUTH_EXPIRED_EVENT: 'ticketing:auth-expired',
    clearStoredAuth: apiMocks.clearStoredAuth,
}));

import { AuthProvider, useAuth } from './AuthContext';

const user = {
    _id: 'user-1',
    name: 'Test User',
    email: 'test@example.com',
    role: 'Standard User' as const,
};

const Probe = () => {
    const { user: currentUser, loading, authenticated, logout } = useAuth();
    return (
        <>
            <span data-testid="loading">{String(loading)}</span>
            <span data-testid="authenticated">{String(authenticated)}</span>
            <span data-testid="user">{currentUser?.email || 'none'}</span>
            <button onClick={() => void logout()}>Log out</button>
        </>
    );
};

describe('AuthProvider integration', () => {
    beforeEach(() => {
        localStorage.clear();
        apiMocks.get.mockReset();
        apiMocks.post.mockReset();
        apiMocks.clearStoredAuth.mockReset();
    });

    it('restores a valid bearer session even when the legacy flag is absent', async () => {
        localStorage.setItem('token', 'valid-token');
        apiMocks.get.mockResolvedValue({ data: { success: true, data: user } });

        render(<AuthProvider><Probe /></AuthProvider>);

        expect(await screen.findByTestId('user')).toHaveTextContent(user.email);
        expect(screen.getByTestId('authenticated')).toHaveTextContent('true');
        expect(apiMocks.get).toHaveBeenCalledWith('/user/profile');
    });

    it('drops protected UI state when the shared API layer reports session expiry', async () => {
        localStorage.setItem('token', 'valid-token');
        apiMocks.get.mockResolvedValue({ data: { success: true, data: user } });

        render(<AuthProvider><Probe /></AuthProvider>);
        await screen.findByText(user.email);
        window.dispatchEvent(new Event('ticketing:auth-expired'));

        await waitFor(() => expect(screen.getByTestId('user')).toHaveTextContent('none'));
        expect(screen.getByTestId('authenticated')).toHaveTextContent('false');
    });

    it('always clears local UI state when server logout is unavailable', async () => {
        localStorage.setItem('token', 'expired-token');
        apiMocks.get.mockResolvedValue({ data: { success: true, data: user } });
        apiMocks.post.mockRejectedValue({ response: { data: { message: 'expired' } } });
        const actor = userEvent.setup();

        render(<AuthProvider><Probe /></AuthProvider>);
        await screen.findByText(user.email);
        await actor.click(screen.getByRole('button', { name: 'Log out' }));

        await waitFor(() => expect(screen.getByTestId('user')).toHaveTextContent('none'));
        expect(apiMocks.clearStoredAuth).toHaveBeenCalledTimes(1);
    });
});
