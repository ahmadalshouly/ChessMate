export const secretQueen = {
  name: 'Dame secrète',
  game: 'Partie',
  standard: 'Standard',
  standardHint: 'Échecs classiques.',
  rules: 'Choisis un pion en secret avant ton premier coup ; ce choix est définitif. Il peut se déplacer comme une dame, ce qui le révèle, et il se dévoile quand il donne échec. Toujours en amicale, jamais mélangé aux parties normales.',
  casualOnly: 'Les parties Dame secrète sont toujours amicales.',
  pick: 'Choisis ta dame secrète : touche l’un des pions en surbrillance. Tu ne pourras plus la changer.',
  chosen: 'Ta dame secrète est le pion en {square}. Elle est verrouillée, et ton adversaire ne le sait pas.',
  revealed: {
    moved: 'La dame secrète des {side} en {square} s’est déplacée comme une dame et est révélée.',
    check: 'La dame secrète des {side} en {square} a donné échec et est révélée.',
    blocked: 'Ce coup n’était pas possible : la dame secrète des {side} en {square} le contrôle. Elle est maintenant révélée.',
    captured: 'Le pion pris en {square} était la dame secrète des {side}.',
    end: 'La dame secrète des {side} était en {square}.',
  },
};
