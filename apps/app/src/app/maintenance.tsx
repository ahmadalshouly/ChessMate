import { Redirect } from 'expo-router';
import { Platform } from 'react-native';

import { MaintenancePage } from '@/features/maintenance/MaintenancePage';
import { useMaintenance } from '@/features/maintenance/useMaintenance';
import { useAuth } from '@/lib/auth';

/** Web maintenance page. Everyone else is sent here while it is on; admins may open it to preview. */
export default function MaintenanceRoute() {
  const { ready, inForce, info } = useMaintenance();
  const { user } = useAuth();
  const admin = user?.role === 'admin';
  if (Platform.OS !== 'web') return <Redirect href="/" />;
  // Nothing to show once it is off (for admins: nothing to preview).
  if (ready && !inForce) return <Redirect href="/" />;
  return <MaintenancePage info={info} preview={admin} />;
}
