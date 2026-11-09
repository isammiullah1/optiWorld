import { Database } from '@nozbe/watermelondb';
import SQLiteAdapter from '@nozbe/watermelondb/adapters/sqlite';

import { posModelClasses } from './models';
import { posMigrations, posSchema } from './schema';

let database: Database | null = null;
let setupError: Error | null = null;

export function getPosDatabase(): Database {
  if (setupError) {
    throw setupError;
  }
  if (!database) {
    const adapter = new SQLiteAdapter({
      schema: posSchema,
      migrations: posMigrations,
      dbName: 'optiworld_pos',
      jsi: false,
      onSetUpError(error) {
        setupError = error;
      },
    });
    database = new Database({
      adapter,
      modelClasses: posModelClasses,
    });
  }
  return database;
}
