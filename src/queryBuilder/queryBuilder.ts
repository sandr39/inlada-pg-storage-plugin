import { PGQueryFunction } from 'inlada-postgresql-client';
import { QueryBuilderSelect } from './select';
import { QueryBuilderInsert } from './insert';
import { QueryBuilderUpdate } from './update';
import { QueryBuilderDelete } from './delete';
import { IFieldWithAlias, IQBFacade } from '../interfaces/queryBuilder';

export class QueryBuilder implements IQBFacade {
  #queryFunction;

  constructor(pgQueryFunction: PGQueryFunction) {
    this.#queryFunction = pgQueryFunction;
  }

  select(tableName: string, fields: IFieldWithAlias[] = []) { // fields: [{field, alias, type}, ...]
    const qBuilder = new QueryBuilderSelect(this.#queryFunction);
    return qBuilder.select(tableName, fields);
  }

  insert(tableName: string, fields: IFieldWithAlias[] = [], values: any[] = [], allCreatedEntities = {}) {
    const qBuilder = new QueryBuilderInsert(this.#queryFunction);
    return qBuilder.insert(tableName, fields, values, allCreatedEntities);
  }

  update(tableName: string, fields: string[] = [], values: any[] = []) {
    const qBuilder = new QueryBuilderUpdate(this.#queryFunction);
    return qBuilder.update(tableName, fields, values);
  }

  delete(tableName: string) {
    const qBuilder = new QueryBuilderDelete(this.#queryFunction);
    return qBuilder.delete(tableName);
  }
}
