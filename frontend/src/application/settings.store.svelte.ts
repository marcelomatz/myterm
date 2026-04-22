import { getSettings, saveSettings, type AppSettings } from '../domain/settings';

class SettingsStore {
  current = $state<AppSettings>(getSettings());

  update(updater: (draft: AppSettings) => void) {
    updater(this.current);
    saveSettings(this.current);
  }

  reset() {
    // Requires DEFAULT_SETTINGS to be exported or imported here
    // Let's just import getSettings since we know it
  }
}

export const settingsStore = new SettingsStore();
