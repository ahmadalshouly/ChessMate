/**
 * The start of a real Lichess broadcast game (FIDE World Junior 2026, round 3), as the
 * round's PGN download serves it: clocks, evals and several comments on one move.
 */
export const LICHESS_GAME = `[Event "Round 3: Zouaghi, Amir - Ahmad, Khagan"]
[Site "https://lichess.org/broadcast/fide-world-junior-chess-championship-2026-open/round-3/bGMQTexp/CZPmRsBR"]
[Date "2026.11.16"]
[Round "3.1"]
[White "Zouaghi, Amir"]
[Black "Ahmad, Khagan"]
[Result "*"]
[WhiteElo "2347"]
[WhiteTitle "FM"]
[WhiteFideId "249262"]
[BlackElo "2536"]
[BlackTitle "IM"]
[BlackFideId "13431552"]
[Variant "Standard"]
[ECO "B51"]
[Opening "Sicilian Defense: Moscow Variation"]
[UTCDate "2026.11.16"]
[UTCTime "15:29:22"]
[BroadcastName "FIDE World Junior Chess Championship 2026 | Open"]
[BroadcastURL "https://lichess.org/broadcast/fide-world-junior-chess-championship-2026-open/round-3/bGMQTexp"]
[GameURL "https://lichess.org/broadcast/fide-world-junior-chess-championship-2026-open/round-3/bGMQTexp/CZPmRsBR"]

1. e4 { [%eval 0.18] [%clk 1:30:57] } 1... c5 { [%eval 0.32] [%clk 1:30:17] } 2. Nf3 { [%eval 0.2] [%clk 1:31:18] } 2... d6 { [%eval 0.31] [%clk 1:30:42] } 3. Bb5+ { [%eval 0.05] [%clk 1:31:41] } 3... Nd7 { [%eval 0.12] [%clk 1:31:07] } 4. O-O { [%eval 0.07] [%clk 1:31:58] } 4... a6 { [%eval 0.11] [%clk 1:31:34] } 5. Be2 { [%eval 0.08] [%clk 1:32:20] } 5... Ngf6 { [%eval 0.03] [%clk 1:29:54] } 6. d3 { [%eval 0.0] [%clk 1:32:39] } 6... g6 { [%eval 0.24] [%clk 1:26:21] } 7. c4 { [%eval 0.2] [%clk 1:32:25] } 7... b6 { [%eval 0.23] [%clk 1:21:24] } 8. Nc3 { [%eval 0.2] [%clk 1:32:37] } 8... Bb7 { [%eval 0.2] [%clk 1:21:50] } 9. Rb1 { [%eval 0.17] [%clk 1:32:59] } 9... e6 { [%eval 0.23] [%clk 1:20:44] } 10. h3 { [%eval 0.28] [%clk 1:27:42] } 10... Qc7 { [%eval 0.32] [%clk 1:18:30] } 11. Bf4 { [%eval 0.23] [%clk 1:22:47] } 11... Ne5 { [%eval 0.42] [%clk 1:00:14] } 12. Qc2 { [%eval 0.28] [%clk 1:07:26] } 12... Nfd7 { [%eval 0.22] [%clk 0:55:31] } 13. b4 { [%eval 0.32] [%clk 0:59:23] } 13... Bg7 { [%eval 0.27] [%clk 0:54:24] } 14. Rfd1 { [%eval -0.11] [%clk 0:54:15] } 14... O-O { [%eval -0.12] [%clk 0:53:49] } 15. bxc5 { [%eval -0.18] [%clk 0:45:05] } 15... bxc5 { [%eval -0.06] [%clk 0:53:56] } 16. Nxe5 { [%eval -0.13] [%clk 0:40:48] } 16... Nxe5 { [%eval -0.16] [%clk 0:52:51] } 17. Bf1 { [%eval -0.25] [%clk 0:36:27] } 17... f5 { [%eval -0.23] [%clk 0:47:12] } 18. exf5 { [%eval -0.4] [%clk 0:36:12] } 18... gxf5 { [%eval -0.37] [%clk 0:44:47] } 19. Ne2 { [%eval -0.32] [%clk 0:34:06] } 19... Kh8?! { [%eval 0.3] } { Inaccuracy. Bc6 was best. } { [%clk 0:41:55] } 20. Qb3 { [%eval 0.35] [%clk 0:29:00] } 20... Rab8 { [%eval 0.36] [%clk 0:41:36] } 21. Qb6 { [%eval 0.35] [%clk 0:26:32] } 21... Qe7?! { [%eval 1.09] } { Inaccuracy. Qc6 was best. } { [%clk 0:37:59] } 22. Bxe5?! { [%eval 0.0] } { Inaccuracy. d4 was best. } { [%clk 0:24:47] } 22... Bxe5 { [%eval 0.01] [%clk 0:37:34] } 23. Qa7 { [%eval 0.04] [%clk 0:22:08] } 23... Rg8? { [%eval 1.66] } { Mistake. d5 was best. } { [%clk 0:12:04] } 24. Rb3 { [%eval 1.14] [%clk 0:15:34] } 24... d5 { [%eval 1.67] [%clk 0:01:14] } *`;

/** The same game as another board of the round, with other players. */
export function lichessBoard(board: number): string {
  return LICHESS_GAME.replace('[Round "3.1"]', `[Round "3.${board}"]`)
    .replace(/Zouaghi, Amir/g, `Player W${board}`)
    .replace(/Ahmad, Khagan/g, `Player B${board}`)
    .replace('[WhiteFideId "249262"]', `[WhiteFideId "${1000 + board}"]`)
    .replace('[BlackFideId "13431552"]', `[BlackFideId "${2000 + board}"]`);
}

/** A whole round download: boards separated by blank lines, as Lichess serves it. */
export function lichessRound(boards: number): string {
  return Array.from({ length: boards }, (_, i) => lichessBoard(i + 1)).join('\n\n\n') + '\n\n\n';
}
