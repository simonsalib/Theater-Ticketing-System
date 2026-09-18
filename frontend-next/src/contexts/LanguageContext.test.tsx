import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { LanguageProvider, useLanguage } from './LanguageContext';

const Probe = () => {
    const { isRTL, language, setLanguage } = useLanguage();
    return (
        <>
            <span data-testid="language">{language}</span>
            <span data-testid="direction">{String(isRTL)}</span>
            <button type="button" onClick={() => void setLanguage('en')}>English</button>
        </>
    );
};

describe('LanguageProvider integration', () => {
    beforeEach(() => {
        localStorage.clear();
        document.documentElement.lang = 'en';
        document.documentElement.dir = 'ltr';
    });

    it('restores a saved language and synchronizes the document direction', async () => {
        localStorage.setItem('language', 'ar');
        const user = userEvent.setup();

        render(<LanguageProvider><Probe /></LanguageProvider>);

        await waitFor(() => expect(screen.getByTestId('language')).toHaveTextContent('ar'));
        expect(screen.getByTestId('direction')).toHaveTextContent('true');
        expect(document.documentElement.lang).toBe('ar');
        expect(document.documentElement.dir).toBe('rtl');

        await user.click(screen.getByRole('button', { name: 'English' }));
        expect(document.documentElement.lang).toBe('en');
        expect(document.documentElement.dir).toBe('ltr');
        expect(localStorage.getItem('language')).toBe('en');
    });
});
