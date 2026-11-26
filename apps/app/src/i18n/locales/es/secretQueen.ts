export const secretQueen = {
  name: 'Dama secreta',
  game: 'Partida',
  standard: 'Estándar',
  standardHint: 'Ajedrez normal.',
  rules: 'Elige un peón en secreto antes de tu primera jugada; la elección es definitiva. Puede moverse como una dama, lo que lo revela, y se descubre cuando da jaque. Siempre amistosa, nunca se mezcla con partidas normales.',
  casualOnly: 'Las partidas de Dama secreta son siempre amistosas.',
  pick: 'Elige tu dama secreta: toca uno de los peones resaltados. No podrás cambiarla después.',
  chosen: 'Tu dama secreta es el peón de {square}. Está fijada y tu rival no lo sabe.',
  revealed: {
    moved: 'La dama secreta de {side} en {square} se movió como una dama y queda revelada.',
    check: 'La dama secreta de {side} en {square} dio jaque y queda revelada.',
    blocked: 'Esa jugada no era posible: la dama secreta de {side} en {square} la cubre. Ahora queda revelada.',
    captured: 'El peón capturado en {square} era la dama secreta de {side}.',
    end: 'La dama secreta de {side} estaba en {square}.',
  },
};
