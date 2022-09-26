import { PGQueryFunction } from 'inlada-postgresql-client';
import { QueryBuilderExecutorCore } from './queryBuilderExecutor';
import { IQBExecutorSelect, IQueryBuilderCore, IQueryBuilderQueryable } from '../interfaces/queryBuilder';

export class QueryBuilderExecutorSelect extends QueryBuilderExecutorCore implements IQBExecutorSelect {
  #limit: number;

  constructor(queryFunction: PGQueryFunction) {
    super(queryFunction);
    this.#limit = 0;
  }

  async getMany<T = any>(qb: IQueryBuilderQueryable & IQueryBuilderCore) {
    const { rows } = await this.execute<T>(qb);
    return rows;
  }

  async getTwo<T = any>(qb: IQueryBuilderQueryable & IQueryBuilderCore) {
    const { rows } = await this.setLimit(2).execute<T>(qb);
    return rows;
  }

  setLimit(limit: number) {
    this.#limit = limit;
    return this;
  }
}
