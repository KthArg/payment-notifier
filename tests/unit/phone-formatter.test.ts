import {
  normalizeCostaRicaPhone,
  maskPhoneNumber,
  formatPhoneForDisplay,
} from '../../src/utils/phone-formatter';

describe('phone-formatter', () => {
  describe('normalizeCostaRicaPhone', () => {
    it('normalizes 8-digit local number', () => {
      expect(normalizeCostaRicaPhone('88887777')).toBe('+50688887777');
    });

    it('normalizes number with dashes', () => {
      expect(normalizeCostaRicaPhone('8888-7777')).toBe('+50688887777');
    });

    it('normalizes number with spaces', () => {
      expect(normalizeCostaRicaPhone('8888 7777')).toBe('+50688887777');
    });

    it('leaves already-normalized number unchanged', () => {
      expect(normalizeCostaRicaPhone('+50688887777')).toBe('+50688887777');
    });

    it('handles 506 prefix without +', () => {
      expect(normalizeCostaRicaPhone('50688887777')).toBe('+50688887777');
    });
  });

  describe('maskPhoneNumber', () => {
    it('masks middle digits', () => {
      const masked = maskPhoneNumber('+50688887777');
      expect(masked).toContain('****');
      expect(masked).not.toBe('+50688887777');
    });

    it('handles short/invalid phones gracefully', () => {
      expect(() => maskPhoneNumber('123')).not.toThrow();
    });
  });

  describe('formatPhoneForDisplay', () => {
    it('returns number in XXXX-XXXX format', () => {
      const result = formatPhoneForDisplay('+50688887777');
      expect(result).toBe('8888-7777');
    });
  });
});
