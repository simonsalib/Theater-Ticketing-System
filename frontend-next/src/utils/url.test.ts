import { describe, expect, it } from 'vitest';
import { getSafeExternalUrl } from './url';

describe('getSafeExternalUrl', () => {
    it('accepts web payment links', () => {
        expect(getSafeExternalUrl('https://instapay.example/pay')).toBe('https://instapay.example/pay');
        expect(getSafeExternalUrl('http://localhost:3000/pay')).toBe('http://localhost:3000/pay');
    });

    it('rejects executable and malformed links', () => {
        expect(getSafeExternalUrl('javascript:alert(1)')).toBeNull();
        expect(getSafeExternalUrl('data:text/html,payment')).toBeNull();
        expect(getSafeExternalUrl('not-a-url')).toBeNull();
    });
});
