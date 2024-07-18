// SPDX-License-Identifier: Apache-2.0

export interface ILoggerService {
  log: (message: string) => void;
  warn: (message: string) => void;
  error: (message: string | Error) => void;
}
