import { Outlet } from 'react-router-dom';
import { IconRail } from '@/components/layout/IconRail';
import { CommandPalette } from '@/components/layout/CommandPalette';
import { SettingsEffects } from '@/components/settings/SettingsEffects';
import { WelcomeOnboarding } from '@/components/onboarding/WelcomeOnboarding';
import { AnnouncementCenter } from '@/components/onboarding/AnnouncementCenter';
import { useCdcChanges } from '@/hooks/useCdcChanges';

export function AppLayout() {
  useCdcChanges();
  return (
    <div className="flex h-screen overflow-hidden">
      <SettingsEffects />
      <IconRail />
      <main className="flex-1 min-w-0 overflow-y-auto">
        <Outlet />
      </main>
      <CommandPalette />
      <WelcomeOnboarding />
      <AnnouncementCenter />
    </div>
  );
}
