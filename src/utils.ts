import type { ILoggerService, IStartupConfig } from './interfaces';

export const getLogger = (config: IStartupConfig, loggerService?: ILoggerService): ILoggerService | Console => {
  if (loggerService) {
    return config.env === 'dev' || config.env === 'test' ? console : loggerService;
  } else {
    return console;
  }
};
