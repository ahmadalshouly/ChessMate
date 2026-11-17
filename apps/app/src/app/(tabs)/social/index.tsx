import { ComingSoon } from '@/components/shell/ComingSoon';

export default function Social() {
  return (
    <ComingSoon
      icon="people"
      title="Social"
      blurb="Play your friends, join clubs and see how you stack up."
      features={[
        { icon: 'person-add-outline', title: 'Friends', text: 'Add friends and challenge them to a game.' },
        { icon: 'chatbubbles-outline', title: 'Chat', text: 'Message friends and talk during casual games.' },
        { icon: 'trophy-outline', title: 'Leaderboards', text: 'Top players by time control, globally and among friends.' },
        { icon: 'eye-outline', title: 'Watch', text: 'Follow live games from friends and top players.' },
      ]}
    />
  );
}
