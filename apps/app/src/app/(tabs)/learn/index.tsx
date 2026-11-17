import { ComingSoon } from '@/components/shell/ComingSoon';
import { useT } from '@/i18n';

export default function Learn() {
  const tr = useT();
  return (
    <ComingSoon
      icon="school"
      title={tr('learn.soon.title')}
      blurb={tr('learn.soon.blurb')}
      features={[
        { icon: 'sparkles-outline', title: tr('learn.soon.coach'), text: tr('learn.soon.coachText') },
        { icon: 'analytics-outline', title: tr('learn.soon.review'), text: tr('learn.soon.reviewText') },
        { icon: 'book-outline', title: tr('learn.soon.lessons'), text: tr('learn.soon.lessonsText') },
        { icon: 'warning-outline', title: tr('learn.soon.threats'), text: tr('learn.soon.threatsText') },
      ]}
    />
  );
}
