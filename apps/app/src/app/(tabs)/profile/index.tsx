import { ComingSoon } from '@/components/shell/ComingSoon';

export default function Profile() {
  return (
    <ComingSoon
      icon="person-circle"
      title="Your profile"
      blurb="Your ratings, stats and game history in one place."
      features={[
        { icon: 'stats-chart-outline', title: 'Ratings', text: 'Bullet, blitz, rapid and puzzle ratings with history.' },
        { icon: 'albums-outline', title: 'Game archive', text: 'Every game you play, ready to replay and review.' },
        { icon: 'ribbon-outline', title: 'Achievements', text: 'Milestones and streaks as you improve.' },
        { icon: 'settings-outline', title: 'Settings', text: 'Board theme, sounds, notifications and account.' },
      ]}
    />
  );
}
