import { footballClub } from '@chessmate/core';
import { describe, expect, it } from 'vitest';

import { FootballLogoService, footballLogoRoutes, pickBadge, type Fetcher } from '../src/football/logos';

const team = (strTeam: string, strCountry: string, strBadge: string | null, strSport = 'Soccer') => ({ strTeam, strCountry, strBadge, strSport, strTeamAlternate: null });

describe('pickBadge', () => {
  const arsenal = footballClub('arsenal')!;
  it('takes the football team from the club country, preferring the exact name', () => {
    const teams = [
      team('Arsenal Women', 'England', 'https://img.test/aw.png'),
      team('Arsenal', 'England', 'https://img.test/a.png'),
      team('Arsenal', 'England', 'https://img.test/basket.png', 'Basketball'),
    ];
    expect(pickBadge(arsenal, 'Arsenal', teams)).toBe('https://img.test/a.png');
  });

  it('ignores teams from other countries and badges that are not https', () => {
    expect(pickBadge(arsenal, 'Arsenal', [team('Arsenal', 'Argentina', 'https://img.test/sarandi.png')])).toBeNull();
    expect(pickBadge(arsenal, 'Arsenal', [team('Arsenal', 'England', 'http://img.test/a.png')])).toBeNull();
    expect(pickBadge(footballClub('celtic')!, 'Celtic', [team('Celtic', 'Scotland', 'https://img.test/c.png')])).toBe('https://img.test/c.png');
  });
});

describe('FootballLogoService', () => {
  it('looks every club up, keeps what it finds and survives failures', async () => {
    const clubs = [footballClub('arsenal')!, footballClub('juventus')!, footballClub('ajax')!];
    const asked: string[] = [];
    const fetch: Fetcher = async (url) => {
      asked.push(url);
      if (url.includes('Juventus')) return { ok: false, status: 429, json: async () => null };
      if (url.includes('Ajax')) return { ok: true, status: 200, json: async () => ({ teams: null }) };
      return { ok: true, status: 200, json: async () => ({ teams: [team('Arsenal', 'England', 'https://img.test/a.png')] }) };
    };
    const logs: string[] = [];
    const service = new FootballLogoService({ fetch, gapMs: 0, clubs, apiKey: 'k', log: (m) => logs.push(m) });
    await service.refresh();
    expect(asked[0]).toBe('https://www.thesportsdb.com/api/v1/json/k/searchteams.php?t=Arsenal');
    expect(service.all()).toEqual({ arsenal: 'https://img.test/a.png' });
    expect(logs.at(-1)).toBe('football logos: 1 of 3 clubs have a logo');
  });

  it('serves the map over HTTP, empty when logos are off', async () => {
    const out: { status?: number; body?: string } = {};
    const res = {
      setHeader() {},
      writeHead(status: number) {
        out.status = status;
        return this;
      },
      end(body?: string) {
        out.body = body;
      },
    };
    const route = footballLogoRoutes(null);
    expect(route({ method: 'GET' } as never, res as never, new URL('http://x/api/other'))).toBe(false);
    expect(route({ method: 'GET' } as never, res as never, new URL('http://x/api/football/logos'))).toBe(true);
    expect(out.status).toBe(200);
    expect(JSON.parse(out.body!)).toEqual({ logos: {} });
  });
});
