import { PGQueryFunction } from 'inlada-postgresql-client';
import { QueryBuilderCore } from './queryBuilderCore';
import { QueryBuilderExecutorCore } from './queryBuilderExecutor';
import { QueryBuilderWhere } from './queryBuilderWhere';
import { beatifyString } from './utils';
import {
  IFieldWithAlias,
  IQBExecutorCore,
  IQueryBuilderDelete,
  IQueryBuilderQueryable,
} from '../interfaces/queryBuilder';
import { QUERY_TYPES } from '../interfaces/base';

export class QueryBuilderDelete extends QueryBuilderWhere<IQueryBuilderDelete> implements IQueryBuilderDelete, IQueryBuilderQueryable {
  #returning: IFieldWithAlias[];
  #executor: IQBExecutorCore
  type: QUERY_TYPES.delete;
  #otherEntities: any[]

  constructor(pgQueryFunction: PGQueryFunction) {
    super();
    this.#returning = [];
    this.#executor = new QueryBuilderExecutorCore(pgQueryFunction);
    this.type = QUERY_TYPES.delete;
    this.#otherEntities = [];
  }

  delete(tableName: string) {
    const alias = this.createGetAlias(tableName);
    this.mainTable = tableName;
    this.mainAlias = alias;
    this.#returning.push({ tableAlias: alias, field: 'id' });
    return this;
  }

  // todo dry
  parseWhere(paramsStartIdx: number) {
    const whereArr = this.whereArr.reduce((acc, {
      field, valueKey, operator = 'in',
    }) => {
      const value = this.paramValueStorage[valueKey];
      if (value instanceof QueryBuilderCore) {
        const { sqlArr = [], params: newParams } = (value as unknown as IQueryBuilderQueryable).getSubSql(paramsStartIdx);
        this.params.push(...newParams);
        this.#otherEntities.push({ alias: value.mainAlias, subSqlStr: sqlArr[0]?.query });
        if (!value.noOuterReturnParam) {
          this.returnAliases.push(value.mainAlias);
        }
        return [...acc, `${field} ${operator} (select * from ${value.mainAlias})`];
      }
      this.params.push(value);
      const valueIdx = this.params.length + paramsStartIdx;
      return [...acc, `${field} ${Array.isArray(value) ? `= ANY($${valueIdx})` : `= $${valueIdx}`}`];
    }, [] as string[]);
    return (whereArr.length && `where ${whereArr.join(' and ')}`) || '';
  }

  getSubSql(paramsStartIdx = 0) {
    const sqlStrings: { query: string, alias: string }[] = [];
    this.params = [];
    const whereStr = this.parseWhere(paramsStartIdx);
    const returningStr = this.#returning.length
      ? `returning ${this.#returning.map(f => `${f.tableAlias}.${f.field}`).join(', ')}`
      : '';

    const otherEntities = this.#otherEntities; // this.#parseOtherFromWhere(paramsStartIdx);
    if (otherEntities.length) {
      sqlStrings.push(...otherEntities.map(ent => ({ query: ent.subSqlStr, alias: ent.alias })));
      sqlStrings.push({ query: `delete from ${this.mainTable} ${whereStr}`, alias: this.mainAlias });
    } else {
      sqlStrings.push({
        query: `delete from ${this.mainTable} ${this.mainAlias} ${whereStr} ${returningStr}`,
        alias: this.mainAlias,
      });
    }

    if (!this.noOuterReturnParam) {
      this.returnAliases.push(this.mainAlias);
    }
    this.returnAliases = this.returnAliases.filter((al, idx) => this.returnAliases.indexOf(al) === idx);

    return { sqlArr: sqlStrings, params: this.params };
  }

  getSql(paramsStartIdx = 0) {
    const { sqlArr = [], params } = this.getSubSql(paramsStartIdx);

    if (sqlArr.length === 1) {
      return { sqlStr: beatifyString(sqlArr[0].query), params };
    }

    const sqlStr = `with ${sqlArr.map(({ query, alias }) => `${alias} as (${query})`).join(', ')}
      ${this.returnAliases.length ? `select * from ${this.returnAliases.join(', ')}` : ''}`;
    return { sqlStr, params };
  }

  checkBeforeExecution() {
    if (!this.whereArr.length) {
      throw new Error('Where clause is mandatory in delete and update query!');
    }
  }

  async execute<T = any>(): Promise<T[]> {
    this.checkBeforeExecution();
    const result = await this.#executor.execute<T>(this);
    return result.rows;
  }
}
