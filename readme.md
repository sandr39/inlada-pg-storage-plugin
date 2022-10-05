Postgresql plugin for inladajs framework

Usage

```typescript
import { createPostgresStoragePlugin } from 'inlada-pg-storage-plugin';
import { pgClientFactoryFactory } from 'inlada-postgresql-client';

const clientParams: PoolConfig = {
  host: process.env.DB_HOST,
  port: +(process.env.DB_PORT || 0),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  max: 100,
};

const pgClientFactory = pgClientFactoryFactory(clientParams);

const storagePlugin = createPostgresStoragePlugin(pgClientFactory, dbStorage, dbRelations);

```
About plugin idea, usage and interface see [inladajs]()

```typescript

```
