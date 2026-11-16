import { ComingSoon } from '@/components/shell/ComingSoon';

export default function Learn() {
  return (
    <ComingSoon
      icon="school"
      title="Learn & Coach"
      blurb="An AI coach that explains the why behind every move, plus lessons that build on each other."
      features={[
        { icon: 'sparkles-outline', title: 'AI coach', text: 'Ask about any position and get a plain-language answer.' },
        { icon: 'analytics-outline', title: 'Game review', text: 'Engine evaluation, best moves and your key mistakes.' },
        { icon: 'book-outline', title: 'Lessons', text: 'Openings, middlegame plans and endgame technique.' },
        { icon: 'warning-outline', title: 'Threat trainer', text: 'Learn to spot what your opponent is threatening.' },
      ]}
    />
  );
}
