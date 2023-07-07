import { type IStartupConfig } from './interfaces';
import { type IStartupService } from './interfaces/iStartupService';
import { StartupFactory } from './services/startupFactory';
import { type onMessageFunction } from './types/onMessageFunction';

export type { IStartupConfig, IStartupService, onMessageFunction };
export { StartupFactory };
