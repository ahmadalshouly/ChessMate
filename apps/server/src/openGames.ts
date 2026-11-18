import type { ColorChoice, OpenGame, PlayerInfo, TimeControl, Variant } from '@chessmate/core';
import { randomUUID } from 'node:crypto';

/** Custom games posted to the lobby, one per player, waiting for someone to join. */
export class OpenGames {
  private byId = new Map<string, OpenGame>();

  create(by: PlayerInfo, timeControl: TimeControl, rated: boolean, color: ColorChoice, now: number, range?: number, variant: Variant = 'standard'): OpenGame {
    this.removeBy(by.id);
    const game: OpenGame = { id: randomUUID().slice(0, 8), by, timeControl, rated, color, createdAt: now };
    if (range !== undefined) game.range = range;
    if (variant !== 'standard') game.variant = variant;
    this.byId.set(game.id, game);
    return game;
  }

  get(id: string): OpenGame | undefined {
    return this.byId.get(id);
  }

  removeBy(playerId: string): boolean {
    for (const [id, g] of this.byId) {
      if (g.by.id === playerId) {
        this.byId.delete(id);
        return true;
      }
    }
    return false;
  }

  remove(id: string): void {
    this.byId.delete(id);
  }

  /** Newest first. */
  list(): OpenGame[] {
    return [...this.byId.values()].sort((a, b) => b.createdAt - a.createdAt);
  }

  get size(): number {
    return this.byId.size;
  }

  /** Can a player with `rating` join? */
  static accepts(game: OpenGame, rating: number): boolean {
    return game.range === undefined || Math.abs(game.by.rating - rating) <= game.range;
  }
}
