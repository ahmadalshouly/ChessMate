export const secretQueen = {
  name: 'Rainha Secreta',
  game: 'Partida',
  standard: 'Padrão',
  standardHint: 'Xadrez normal.',
  rules: 'Escolha um peão em segredo antes do seu primeiro lance; a escolha é definitiva. Ele pode se mover como uma dama, o que o revela, e também se revela ao dar xeque. Sempre casual, nunca misturado com partidas normais.',
  casualOnly: 'Partidas de Rainha Secreta são sempre casuais.',
  pick: 'Escolha sua rainha secreta: toque em um dos peões destacados. Não será possível mudar depois.',
  chosen: 'Sua rainha secreta é o peão em {square}. A escolha está travada, e seu adversário não sabe.',
  revealed: {
    moved: 'A rainha secreta das {side} em {square} se moveu como dama e foi revelada.',
    check: 'A rainha secreta das {side} em {square} deu xeque e foi revelada.',
    blocked: 'Esse lance não era possível: a rainha secreta das {side} em {square} o impede. Agora ela foi revelada.',
    captured: 'O peão capturado em {square} era a rainha secreta das {side}.',
    end: 'A rainha secreta das {side} estava em {square}.',
  },
};
