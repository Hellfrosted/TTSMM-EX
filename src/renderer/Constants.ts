import type { AppConfig } from 'model/AppConfig';
import { createDefaultAppConfig } from 'shared/app-config-defaults';
import { TERRATECH_STEAM_APP_ID } from 'shared/terratech';

const { platform } = window.electron;
export const TT_APP_ID = TERRATECH_STEAM_APP_ID;

export const DEFAULT_CONFIG: AppConfig = createDefaultAppConfig(platform);
