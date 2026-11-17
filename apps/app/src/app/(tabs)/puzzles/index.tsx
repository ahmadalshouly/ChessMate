import { ComingSoon } from '@/components/shell/ComingSoon';

export default function Puzzles() {
  return (
    <ComingSoon
      icon="extension-puzzle"
      title="Puzzles"
      blurb="Sharpen your tactics with positions from real games, matched to your level."
      features={[
        { icon: 'calendar-outline', title: 'Daily puzzle', text: 'One hand-picked position a day, same for everyone.' },
        { icon: 'trending-up', title: 'Rated puzzles', text: 'A puzzle rating that moves with every solve.' },
        { icon: 'timer-outline', title: 'Puzzle rush', text: 'Solve as many as you can against the clock.' },
        { icon: 'pricetags-outline', title: 'Themes', text: 'Train forks, pins, mates and endgames on purpose.' },
      ]}
    />
  );
}
