import { InfoPage } from '@/components/InfoPage';

export default function FairPlay() {
  return (
    <InfoPage
      title="pages.fairPlay.title"
      intro="pages.fairPlay.intro"
      sections={[
        ['pages.fairPlay.engineTitle', 'pages.fairPlay.engine'],
        ['pages.fairPlay.othersTitle', 'pages.fairPlay.others'],
        ['pages.fairPlay.detectTitle', 'pages.fairPlay.detect'],
        ['pages.fairPlay.actionsTitle', 'pages.fairPlay.actions'],
        ['pages.fairPlay.reportTitle', 'pages.fairPlay.report'],
        ['pages.fairPlay.appealTitle', 'pages.fairPlay.appeal'],
      ]}
    />
  );
}
