import { ComingSoon } from '@/components/shell/ComingSoon';
import { useT } from '@/i18n';

export default function Social() {
  const tr = useT();
  return (
    <ComingSoon
      icon="people"
      title={tr('social.soon.title')}
      blurb={tr('social.soon.blurb')}
      features={[
        { icon: 'person-add-outline', title: tr('social.soon.friends'), text: tr('social.soon.friendsText') },
        { icon: 'chatbubbles-outline', title: tr('social.soon.chat'), text: tr('social.soon.chatText') },
        { icon: 'trophy-outline', title: tr('social.soon.leaderboards'), text: tr('social.soon.leaderboardsText') },
        { icon: 'eye-outline', title: tr('social.soon.watch'), text: tr('social.soon.watchText') },
      ]}
    />
  );
}
