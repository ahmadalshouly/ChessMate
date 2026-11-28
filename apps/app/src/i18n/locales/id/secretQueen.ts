export const secretQueen = {
  name: 'Secret Queen',
  game: 'Permainan',
  standard: 'Standar',
  standardHint: 'Catur biasa.',
  rules: 'Pilih satu pion secara rahasia sebelum langkah pertamamu; pilihan ini final. Pion itu bisa bergerak seperti menteri, yang membuatnya terungkap, dan ia menampakkan diri saat memberi skak. Selalu santai, tidak pernah dicampur dengan permainan biasa.',
  casualOnly: 'Permainan Secret Queen selalu santai.',
  pick: 'Pilih menteri rahasiamu: ketuk salah satu pion yang disorot. Kamu tidak bisa menggantinya nanti.',
  chosen: 'Menteri rahasiamu adalah pion di {square}. Pilihan sudah dikunci, dan lawanmu tidak tahu.',
  revealed: {
    moved: 'Menteri rahasia {side} di {square} bergerak seperti menteri dan kini terungkap.',
    check: 'Menteri rahasia {side} di {square} memberi skak dan kini terungkap.',
    blocked: 'Langkah itu tidak bisa: menteri rahasia {side} di {square} menutupnya. Sekarang ia terungkap.',
    captured: 'Pion yang dimakan di {square} adalah menteri rahasia {side}.',
    end: 'Menteri rahasia {side} ada di {square}.',
  },
};
