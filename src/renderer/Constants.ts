import type { AppConfig } from 'model/AppConfig';
import { createDefaultAppConfig } from 'shared/app-config-defaults';

const { platform } = window.electron;

export const DEFAULT_CONFIG: AppConfig = createDefaultAppConfig(platform);
