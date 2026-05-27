/**
 * i18n Locale File Tests
 *
 * Validates all three locale files (en.json, hi.json, ta.json) for:
 * - Key completeness (no missing keys)
 * - Template variable preservation ({{variable}} placeholders)
 * - Value quality (non-empty, no placeholder English left)
 * - Structural consistency between locales
 */

const fs = require('fs');
const path = require('path');

const LOCALES_DIR = path.resolve(__dirname, '../locales');

function loadLocale(name) {
  const filePath = path.join(LOCALES_DIR, `${name}.json`);
  const raw = fs.readFileSync(filePath, 'utf-8');
  return JSON.parse(raw);
}

let en, hi, ta;

beforeAll(() => {
  en = loadLocale('en');
  hi = loadLocale('hi');
  ta = loadLocale('ta');
});

// ─── KEY COMPLETENESS ───────────────────────────────────────────────────────

describe('Key completeness', () => {
  test('en.json has keys (source of truth)', () => {
    const keys = Object.keys(en);
    expect(keys.length).toBeGreaterThan(800);
  });

  test('hi.json has all keys from en.json', () => {
    const missing = Object.keys(en).filter((k) => !(k in hi));
    expect(missing).toEqual([]);
  });

  test('ta.json has all keys from en.json', () => {
    const missing = Object.keys(en).filter((k) => !(k in ta));
    expect(missing).toEqual([]);
  });

  test('hi.json has no extra keys not in en.json', () => {
    const extra = Object.keys(hi).filter((k) => !(k in en));
    expect(extra).toEqual([]);
  });

  test('ta.json has no extra keys not in en.json', () => {
    const extra = Object.keys(ta).filter((k) => !(k in en));
    expect(extra).toEqual([]);
  });
});

// ─── TRANSLATION PROGRESS ───────────────────────────────────────────────────

describe('Translation progress', () => {
  test('hi.json has translated most keys (≤25 English placeholders)', () => {
    const stillEnglish = Object.keys(en).filter(
      (k) => k in hi && hi[k] === en[k] && k !== 'app.name'
    );
    // Allow some intentional English: acronyms (CPF, CNPJ, UPI),
    // brand names (WhatsApp), format placeholders, universal symbols
    expect(stillEnglish.length).toBeLessThanOrEqual(25);
  });

  test('ta.json has translated most keys (≤25 English placeholders)', () => {
    const stillEnglish = Object.keys(en).filter(
      (k) => k in ta && ta[k] === en[k] && k !== 'app.name'
    );
    expect(stillEnglish.length).toBeLessThanOrEqual(25);
  });
});

// ─── TEMPLATE VARIABLE PRESERVATION ─────────────────────────────────────────

describe('Template variable preservation', () => {
  // Extract all {{variable}} patterns from en.json values
  const variablePattern = /\{\{(\w+)\}\}/g;

  function extractVariables(str) {
    const vars = [];
    let match;
    while ((match = variablePattern.exec(str)) !== null) {
      vars.push(match[1]);
    }
    return vars;
  }

  // Build map of key -> variables from en.json (built at test runtime)
  function getEnVars() {
    const vars = {};
    for (const [key, value] of Object.entries(en)) {
      if (typeof value === 'string') {
        const extracted = extractVariables(value);
        if (extracted.length > 0) {
          vars[key] = extracted;
        }
      }
    }
    return vars;
  }

  test('en.json has template variables in some keys', () => {
    const keysWithVars = Object.keys(getEnVars());
    expect(keysWithVars.length).toBeGreaterThan(20);
  });

  test('hi.json preserves all template variables from en.json', () => {
    const enVars = getEnVars();
    const failures = [];
    for (const [key, expectedVars] of Object.entries(enVars)) {
      if (hi[key] === en[key]) continue; // skip intentional English keys
      const hiVars = extractVariables(hi[key]);
      for (const v of expectedVars) {
        if (!hiVars.includes(v)) {
          failures.push(`hi.${key}: missing variable {{${v}}}`);
        }
      }
      for (const v of hiVars) {
        if (!expectedVars.includes(v)) {
          failures.push(`hi.${key}: unexpected variable {{${v}}}`);
        }
      }
    }
    expect(failures).toEqual([]);
  });

  test('ta.json preserves all template variables from en.json', () => {
    const enVars = getEnVars();
    const failures = [];
    for (const [key, expectedVars] of Object.entries(enVars)) {
      if (ta[key] === en[key]) continue; // skip intentional English keys
      const taVars = extractVariables(ta[key]);
      for (const v of expectedVars) {
        if (!taVars.includes(v)) {
          failures.push(`ta.${key}: missing variable {{${v}}}`);
        }
      }
      for (const v of taVars) {
        if (!expectedVars.includes(v)) {
          failures.push(`ta.${key}: unexpected variable {{${v}}}`);
        }
      }
    }
    expect(failures).toEqual([]);
  });
});

// ─── VALUE QUALITY ──────────────────────────────────────────────────────────

describe('Value quality', () => {
  test('all en.json values are non-empty strings', () => {
    for (const [key, value] of Object.entries(en)) {
      expect(typeof value).toBe('string');
      expect(value.trim()).not.toBe('');
    }
  });

  test('all hi.json values are non-empty strings', () => {
    for (const [key, value] of Object.entries(hi)) {
      expect(typeof value).toBe('string');
      expect(value.trim()).not.toBe('');
    }
  });

  test('all ta.json values are non-empty strings', () => {
    for (const [key, value] of Object.entries(ta)) {
      expect(typeof value).toBe('string');
      expect(value.trim()).not.toBe('');
    }
  });
});

// ─── VALUE STRUCTURE ────────────────────────────────────────────────────────

describe('Value structure', () => {
  // Check for newlines in strings — some keys (like whatsapp templates)
  // intentionally have escaped \\n sequences
  test('strings with newline characters are consistent across locales', () => {
    for (const key of Object.keys(en)) {
      const enVal = en[key];
      if (typeof enVal !== 'string') continue;
      const hasNewline = enVal.includes('\\n');
      if (hasNewline) {
        // If en has \\n, both hi and ta should too
        expect(hi[key]).toContain('\\n');
        expect(ta[key]).toContain('\\n');
      }
    }
  });
});

// ─── KEY NAMING CONVENTIONS ─────────────────────────────────────────────────

describe('Key naming conventions', () => {
  test('all keys use dot-notation namespacing', () => {
    for (const key of Object.keys(en)) {
      expect(key).toMatch(/^[a-zA-Z0-9]+\.[a-zA-Z0-9_.]+$/);
    }
  });

  test('all key segments are non-empty', () => {
    for (const key of Object.keys(en)) {
      const segments = key.split('.');
      for (const seg of segments) {
        expect(seg.length).toBeGreaterThan(0);
      }
    }
  });
});

// ─── JSON VALIDITY ──────────────────────────────────────────────────────────

describe('JSON validity', () => {
  test('en.json is valid JSON', () => {
    expect(() => loadLocale('en')).not.toThrow();
  });

  test('hi.json is valid JSON', () => {
    expect(() => loadLocale('hi')).not.toThrow();
  });

  test('ta.json is valid JSON', () => {
    expect(() => loadLocale('ta')).not.toThrow();
  });
});

// ─── WHITESPACE CHECK ───────────────────────────────────────────────────────

describe('Whitespace and formatting', () => {
  test('no leading/trailing whitespace in any key value', () => {
    const issues = [];
    for (const [key, value] of Object.entries(en)) {
      if (value !== value.trim()) issues.push(`en.${key}: "${value}"`);
    }
    for (const [key, value] of Object.entries(hi)) {
      if (value !== value.trim()) issues.push(`hi.${key}: "${value}"`);
    }
    for (const [key, value] of Object.entries(ta)) {
      if (value !== value.trim()) issues.push(`ta.${key}: "${value}"`);
    }
    expect(issues).toEqual([]);
  });
});
