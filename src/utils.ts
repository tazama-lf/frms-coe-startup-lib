import { connect, type NatsConnection, type TlsOptions } from 'nats';
import { readFileSync } from 'node:fs';
import type { ILoggerService, IStartupConfig } from './interfaces';

export const getLogger = (config: IStartupConfig, loggerService?: ILoggerService): ILoggerService | Console => {
  if (loggerService) {
    return config.env === 'dev' || config.env === 'test' ? console : loggerService;
  } else {
    return console;
  }
};

export const getNatsTlsOptions = (
  config: Pick<IStartupConfig, 'natsAuthenticated' | 'natsCertificateAuthorityPath' | 'natsClientCertPath' | 'natsClientKeyPath'>,
): TlsOptions | undefined => {
  if (config.natsAuthenticated) {
    return {
      ca: readFileSync(config.natsCertificateAuthorityPath, 'utf8'),
      cert: readFileSync(config.natsClientCertPath, 'utf8'),
      key: readFileSync(config.natsClientKeyPath, 'utf8'),
    };
  }
};

export const connectToNats = async (servers: string, tlsOpts?: TlsOptions): Promise<NatsConnection> =>
  await connect({
    servers: [servers],
    ...(tlsOpts ? { tls: tlsOpts } : {}),
  });
