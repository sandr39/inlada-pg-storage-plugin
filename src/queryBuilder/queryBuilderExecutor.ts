import { PGQueryFunction } from 'inlada-postgresql-client';
import { IQBExecutorCore, IQueryBuilderCore, IQueryBuilderQueryable } from '../interfaces/queryBuilder';

export class QueryBuilderExecutorCore implements IQBExecutorCore {
  readonly #queryFunction: PGQueryFunction;

  constructor(queryFunction: PGQueryFunction) {
    this.#queryFunction = queryFunction;
  }

  async execute<T = any>(qb: IQueryBuilderQueryable & IQueryBuilderCore) {
    const { sqlStr, params } = qb.getSql();
    return this.#queryFunction<T>(sqlStr, params);
  }
}
