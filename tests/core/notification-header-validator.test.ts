import { describe, it, expect } from 'vitest';
import {
  findReservedHeaderKeys,
  findLiteralTokenInHeaderValue,
} from '../../src/core/notification-header-validator.js';

describe('findReservedHeaderKeys', () => {
  it('flags X-ReleaseJet-* prefix (case-insensitive)', () => {
    expect(findReservedHeaderKeys({ 'X-ReleaseJet-Custom': 'a' })).toEqual([
      'X-ReleaseJet-Custom',
    ]);
    expect(findReservedHeaderKeys({ 'x-releasejet-foo': 'a' })).toEqual([
      'x-releasejet-foo',
    ]);
    expect(findReservedHeaderKeys({ 'X-RELEASEJET-BAR': 'a' })).toEqual([
      'X-RELEASEJET-BAR',
    ]);
  });

  it('flags Content-Type (case-insensitive)', () => {
    expect(findReservedHeaderKeys({ 'Content-Type': 'application/xml' })).toEqual([
      'Content-Type',
    ]);
    expect(findReservedHeaderKeys({ 'content-type': 'x' })).toEqual(['content-type']);
  });

  it('passes through non-reserved headers', () => {
    expect(
      findReservedHeaderKeys({
        Authorization: 'Bearer x',
        'X-Tenant': 'acme',
        'X-Api-Key': 'k',
      }),
    ).toEqual([]);
  });

  it('returns multiple keys when multiple violations exist', () => {
    const out = findReservedHeaderKeys({
      'X-ReleaseJet-Bad': 'a',
      'Content-Type': 'b',
      Authorization: 'c',
    });
    expect(out.sort()).toEqual(['Content-Type', 'X-ReleaseJet-Bad']);
  });
});

describe('findLiteralTokenInHeaderValue', () => {
  it('flags JWT-shaped Bearer tokens', () => {
    const out = findLiteralTokenInHeaderValue(
      'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.payload.sig',
    );
    expect(out.matched).toBe(true);
    expect(out.kind).toBe('jwt-bearer');
  });

  it('flags Slack tokens (xoxb/xoxa/xoxp/xoxr/xoxs)', () => {
    expect(findLiteralTokenInHeaderValue('xoxb-1234567890-abc').matched).toBe(true);
    expect(findLiteralTokenInHeaderValue('xoxp-9999-zzz').matched).toBe(true);
  });

  it('flags GitHub PATs', () => {
    expect(findLiteralTokenInHeaderValue('ghp_abcdefghijklmnopqrstuvwxyz').matched).toBe(true);
    expect(findLiteralTokenInHeaderValue('github_pat_11ABCDEFG_xyz').matched).toBe(true);
  });

  it('flags GitLab PATs', () => {
    expect(findLiteralTokenInHeaderValue('glpat-abcdef1234567890').matched).toBe(true);
  });

  it('flags OpenAI-shaped keys', () => {
    expect(findLiteralTokenInHeaderValue('sk-abcdefghijklmnopqrstuvwxyz').matched).toBe(true);
  });

  it('passes through ${VAR}-indirected values', () => {
    expect(findLiteralTokenInHeaderValue('Bearer ${MY_TOKEN}').matched).toBe(false);
    expect(findLiteralTokenInHeaderValue('${API_KEY}').matched).toBe(false);
  });

  it('passes through plain non-secret values', () => {
    expect(findLiteralTokenInHeaderValue('acme').matched).toBe(false);
    expect(findLiteralTokenInHeaderValue('application/json').matched).toBe(false);
    expect(findLiteralTokenInHeaderValue('en-US').matched).toBe(false);
  });
});
