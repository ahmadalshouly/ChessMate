# Sound credits

Every sound in this folder is an original work made for ChessMate. None of them is
sampled from or derived from a third-party recording, so there is no outside
licence and no attribution owed.

| File | Used for | Source |
| --- | --- | --- |
| move.wav | A quiet move | Original, made for ChessMate |
| capture.wav | A capture | Original, made for ChessMate |
| check.wav | A check or mate | Original, made for ChessMate |
| start.wav | Game start | Original, made for ChessMate |
| end.wav | Game over (draw) | Original, made for ChessMate |
| castle.wav | Castling | Synthesised by `scripts/synth-sounds.mjs` |
| promote.wav | Promotion | Synthesised by `scripts/synth-sounds.mjs` |
| lowtime.wav | Low time warning | Synthesised by `scripts/synth-sounds.mjs` |
| win.wav | Game won | Synthesised by `scripts/synth-sounds.mjs` |
| lose.wav | Game lost | Synthesised by `scripts/synth-sounds.mjs` |
| premove.wav | A premove was queued | Synthesised by `scripts/synth-sounds.mjs` |
| illegal.wav | An illegal move snapped back | Synthesised by `scripts/synth-sounds.mjs` |

To regenerate the synthesised files: `node apps/app/scripts/synth-sounds.mjs`. The noise
is seeded, so the output is byte-identical on every run.

If you add a sound you did not make, add a row here with its author, source URL and
licence (CC0 or CC-BY only, and credit CC-BY authors in the app's about screen too).
