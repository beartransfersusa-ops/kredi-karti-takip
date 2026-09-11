// node:sqlite tabanlı şifresiz sağlayıcı — test ve geliştirme aracı.
// Production'da EncryptedSqliteProvider kullanılır (02 §2.1); ikisi de
// SqliteDatabaseProvider üzerinden aynı Db portunu döndürür.

import { nodeSqliteDriver } from './drivers/nodeSqlite.ts';
import { SqliteDatabaseProvider } from './SqliteDatabaseProvider.ts';

export class NodeSqliteProvider extends SqliteDatabaseProvider {
  constructor(path = ':memory:') {
    super({ driver: nodeSqliteDriver, path });
  }
}
