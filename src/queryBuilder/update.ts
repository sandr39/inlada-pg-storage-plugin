import { v4 } from 'uuid';
import { PGQueryFunction } from 'inlada-postgresql-client';
import {
  IQBExecutorCore, IQueryBuilderUpdate, IReturningFieldId, ISubQuery,
} from '../interfaces/queryBuilder';
import { IColumnTypes, QUERY_TYPES } from '../interfaces/base';
import { beatifyString } from './utils';
import { QueryBuilderExecutorCore } from './queryBuilderExecutor';
import { QueryBuilderWhere } from './queryBuilderWhere';

export class QueryBuilderUpdate extends QueryBuilderWhere<IQueryBuilderUpdate> implements IQueryBuilderUpdate {
  #updateFields: string[];
  #updateValues: any;
  #onConflict: any;
  #returning: IReturningFieldId[];
  #entitiesToUpdate: IQueryBuilderUpdate[];
  #columnTypes: any;
  #executor: IQBExecutorCore;
  type: QUERY_TYPES.update;

  constructor(pgQueryFunction: PGQueryFunction) {
    super();
    this.#updateFields = [];
    this.#updateValues = [];
    this.#onConflict = '';
    this.#returning = [];
    this.#entitiesToUpdate = [];
    this.#columnTypes = {};
    this.#executor = new QueryBuilderExecutorCore(pgQueryFunction);
    this.type = QUERY_TYPES.update;
  }

  #getAllAliases() {
    return Object.values(this.#entitiesToUpdate).reduce((acc, qb) => {
      acc.push(...qb.returnAliases.filter((al, idx) => qb.returnAliases.indexOf(al) === idx));
      return acc;
    }, (this.noOuterReturnParam || !this.mainAlias) ? [] : [this.mainAlias]);
  }

  getSubSql(paramsStartIdx = 0) {
    this.params = [];
    const queries: ISubQuery[] = [];

    if (this.mainAlias) { // main update query
      const mainStr = `update ${this.mainTable} as ${this.mainAlias} set ${this.#updateFields
        .map(f => `${f} = d.${(this.#columnTypes[f.toLowerCase()]) ? `${f}::${this.#columnTypes[f.toLowerCase()]}` : f}`).join(', ')}
        from (values (${Object.keys(this.#updateValues).map((k, i) => `$${this.params.length + paramsStartIdx + i + 1}`)}))
        as d(${this.#updateFields.join(', ')})`;
      this.params.push(...Object.values(this.#updateValues));
      const whereStr = this.parseWhere(paramsStartIdx);
      const returningStr = this.#returning.length
        ? `returning ${this.#returning.map(f => `${f.tableAlias}.${f.field}`).join(', ')}`
        : '';
      const sqlStr = `${mainStr} ${whereStr} ${this.#onConflict} ${returningStr}`;
      queries.push({ query: sqlStr, alias: this.mainAlias } as ISubQuery);
    }

    this.#entitiesToUpdate.forEach(qb => {
      const { sqlArr = [], params } = qb.getSubSql(this.params.length);
      this.params.push(...params);
      queries.push(...sqlArr);
    });

    return { sqlArr: queries.filter((q, idx) => queries.findIndex(({ alias }) => alias === q.alias) === idx), params: this.params };
  }

  getSql(paramsStartIdx = 0) {
    const { sqlArr = [], params } = this.getSubSql(paramsStartIdx);

    if (sqlArr.length === 1) {
      return { sqlStr: beatifyString(sqlArr[0].query), params };
    }

    const returnAliases = this.#getAllAliases();
    if (!returnAliases.length && this.#entitiesToUpdate.length) {
      returnAliases.push(sqlArr[0].alias);
    }
    const sqlStr = `with ${sqlArr.map(({ query, alias }) => `${alias} as (${query})`).join(', ')}
        select * from ${returnAliases.join(', ')}`;

    return { sqlStr: beatifyString(sqlStr), params };
  }

  update(tableName: string, fields: string[] = [], values: any[]) {
    if (fields.length) {
      // values = (values.length === 1 && !Array.isArray(values[0])) ? [values] : values;
      // logger.assert(!values.length || !fields.length || (values.length % fields.length) !== 0, 'Wrong number of params');
      const alias = this.createGetAlias(tableName);
      this.mainTable = tableName;
      this.mainAlias = alias;
      this.#updateFields = fields;
      // if (!(values instanceof QueryBuilderCore)) { // never, since it's array
      values.forEach(val => {
        this.#updateValues[v4()] = val;
      });
      this.#returning.push({ tableAlias: alias, field: 'id' });
    }
    return this as unknown as IQueryBuilderUpdate;
  }

  onConflict(onConflictStr: string) {
    this.#onConflict = onConflictStr;
    return this as unknown as IQueryBuilderUpdate;
  }

  addUpdates(qBuilders: IQueryBuilderUpdate[] = []) {
    this.#entitiesToUpdate.push(...qBuilders);
    return this as unknown as IQueryBuilderUpdate;
  }

  noOuterReturn(noNeedToReturn = false) {
    this.noOuterReturnParam = noNeedToReturn;
    return this;
  }

  addColumnTypes(columnTypes: IColumnTypes) {
    this.#columnTypes = columnTypes;
    return this as unknown as IQueryBuilderUpdate;
  }

  async execute<T = any>(): Promise<T[]> {
    const result = await this.#executor.execute<T>(this);
    return result.rows;
  }
}
