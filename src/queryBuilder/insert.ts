import { v4 } from 'uuid';
import { PGQueryFunction } from 'inlada-postgresql-client';
import { QueryBuilderWhere } from './queryBuilderWhere';

import { QueryBuilderExecutorCore } from './queryBuilderExecutor';
import { beatifyString } from './utils';

import { QueryBuilderCore } from './queryBuilderCore';
import {
  IFieldWithAlias,
  IQBExecutorCore, IQueryBuilderCore,
  IQueryBuilderInsert, IQueryBuilderSelect, IQueryParam,
  IReturningField, IReturningFieldInsert,
  ISubQuery,
} from '../interfaces/queryBuilder';
import { QUERY_TYPES } from '../interfaces/base';

export class QueryBuilderInsert extends QueryBuilderWhere<QueryBuilderInsert> implements IQueryBuilderInsert {
  #selectStr: string;
  entitiesToCreate: Record<string, IQueryBuilderInsert | IQueryBuilderSelect>;
  returning: IReturningFieldInsert[];
  #insertFields: string[];
  mainAliases: string[]
  #insertValueStorage: Record<string, (IQueryParam | IQueryBuilderCore)[]>;
  #onConflict;
  createdEntities;
  type: QUERY_TYPES.insert

  #executor: IQBExecutorCore;

  constructor(pgQueryFunction: PGQueryFunction) {
    super();
    this.type = QUERY_TYPES.insert;
    this.#selectStr = '';
    this.entitiesToCreate = {};
    this.returning = [];
    this.#insertFields = [];
    this.mainAliases = [];
    this.#insertValueStorage = {};
    this.#onConflict = '';
    this.createdEntities = {}; // { [tableName]: qBuilder}
    this.#executor = new QueryBuilderExecutorCore(pgQueryFunction);
  }

  #parseValues(paramsStartIdx = 0) {
    const valueStr = '';
    const compositeQuery = !!Object.values(this.#insertValueStorage)
      .flat(1)
      .find(v => v instanceof QueryBuilderCore);

    const valueArr = Object.values(this.#insertValueStorage).reduce((acc, value) => {
      if (compositeQuery) { // todo move upper
        const subQAliases: string[] = [];
        const fqToSelect = value.map(v => { // value fields and fields from subQueries to select
          if (v instanceof QueryBuilderCore) {
            const vQB = v as IQueryBuilderCore;
            subQAliases.push(vQB.mainAlias);

            let fieldValues: string[];
            if (vQB.type === QUERY_TYPES.select) {
              fieldValues = (vQB as IQueryBuilderSelect).returningPub.map(rp => `${vQB.mainAlias}.${rp}`);
            } else if (vQB.type === QUERY_TYPES.insert) {
              fieldValues = [`${vQB.mainAlias}.${(vQB as IQueryBuilderInsert).returning?.find(ret => ret.field === 'id')?.alias || 'id'}`];
            } else {
              throw new Error('SubQuery in insert can be only select or insert');
            }

            return fieldValues.join(', ');
          }
          const res = `$${this.params.length + paramsStartIdx + 1}`;
          this.params.push(v);
          return res;
        });
        this.#selectStr = `select ${fqToSelect.join(', ')}
            from ${subQAliases.filter((v, i, a) => a.indexOf(v) === i).join(' cross join ')}`;
        return [...acc, this.#selectStr];
      }

      if (value.length) {
        const res = [
          ...acc,
          `(${value.map((val, i) => `$${this.params.length + paramsStartIdx + i + 1}`).join(', ')})`,
        ];
        this.params.push(...value);
        return res;
      }

      return acc;
    }, []);

    if (compositeQuery) {
      return (valueArr.length > 1)
        ? valueArr.map(v => `insert into ${this.mainTable} (${this.#insertFields.join(', ')}) ${v}`)
        : `insert into ${this.mainTable} (${this.#insertFields.join(', ')}) ${this.#selectStr}`;
    }

    return (valueStr.length || valueArr.length)
      ? `insert into ${this.mainTable} (${this.#insertFields.join(', ')}) ${valueStr || `values ${valueArr.join(', ')}`}`
      : `insert into ${this.mainTable} DEFAULT values`;
  }

  // #getEntitiesToCreate() {
  //   return Object.values(this.entitiesToCreate).reduce((acc, qbIn) => {
  //     const { sqlStr, params } = qbIn.getSqlInner(this.params.length);
  //     this.params.push(...params);
  //     acc.push({ query: sqlStr, alias: qbIn.mainAlias } as ISubQuery);
  //     return acc;
  //   }, [] as ISubQuery[]);
  // }
  #getAllCreatedAliases() {
    return Object.values(this.entitiesToCreate).reduce((acc, qbIn) => {
      if (!qbIn.noOuterReturnParam) {
        acc.push(qbIn.mainAlias);
      }
      return acc;
    }, (this.noOuterReturnParam || !this.returning?.length) ? [] : this.mainAliases);
  }

  getAllCreatedEntities() {
    return Object.values(this.entitiesToCreate)
      .reduce((acc, qbIn) => ({
        ...acc, [qbIn.mainAlias]: qbIn,
      }), { [this.mainAlias]: this as unknown as IQueryBuilderInsert } as Record<string, IQueryBuilderInsert | IQueryBuilderSelect>); // , ...this.getAllCreatedEntities(qbIn)
  }
  getSubSql(paramsStartIdx = 0) {
    return this.#getSubSql(paramsStartIdx, true);
  }

  getSubSqlInner(paramsStartIdx = 0) {
    return this.#getSubSql(paramsStartIdx, false);
  }

  #getSubSql(paramsStartIdx = 0, outer = true) {
    this.params = [];
    const parsedValues = this.#parseValues(paramsStartIdx);
    let inserts: ISubQuery[] = Array.isArray(parsedValues)
      ? parsedValues.map((pv, i) => ({ query: pv, alias: `${this.mainAlias}_${i + 1}` }))
      : [{ query: parsedValues, alias: this.mainAlias }];

    this.mainAliases = Array.isArray(parsedValues)
      ? parsedValues.map((pv, i) => `${this.mainAlias}_${i + 1}`)
      : [this.mainAlias];

    if (outer) {
      // inserts[0][0] += ` ${this.#onConflict} ${returningStr}`;
      inserts = inserts.map((ins, idx) => {
        const returningStr = this.returning.length
          ? `returning ${this.returning.map(f => `${f.field} ${f.alias ? `as ${f.alias}_${idx}` : ''}`).join(', ')}`
          : '';
        return { ...ins, query: `${ins.query} ${this.#onConflict} ${returningStr}` };
      });

      inserts.push(...(Object.values(this.entitiesToCreate).map(qbIn => {
        const { sqlArr = [], params } = qbIn.type === QUERY_TYPES.insert
          ? qbIn.getSubSqlInner(this.params.length)
          : qbIn.getSubSql(this.params.length);
        this.params.push(...params);

        return sqlArr;
      }).flat(1)));

      return { sqlArr: inserts.reverse(), params: this.params };
    }

    const returningStr = this.returning.length
      ? `returning ${this.returning.map(f => `${f.field} ${f.alias ? `as ${f.alias}` : ''}`).join(', ')}`
      : '';
    const sqlArr = inserts.map(({ query, alias }) => ({ query: `${query} ${this.#onConflict} ${returningStr}`, alias } as ISubQuery));
    return { sqlArr, params: this.params };
  }

  getSqlInner(paramsStartIdx = 0) {
    return this.#getSql(paramsStartIdx, false);
  }

  getSql(paramsStartIdx = 0) {
    return this.#getSql(paramsStartIdx, true);
  }

  #getSql(paramsStartIdx = 0, outer = true) {
    // 1 form insert array
    // 2 wrap with with
    // 3 add final select

    const { sqlArr = [], params } = outer ? this.getSubSql(paramsStartIdx) : this.getSubSqlInner(paramsStartIdx);

    if (sqlArr.length === 1) {
      return { sqlStr: beatifyString(sqlArr[0].query), params };
    }

    const sqlStr = `with ${sqlArr.map(({ query, alias }) => `${alias} as (${query})`).join(', ')}
        select * from ${this.#getAllCreatedAliases().join(', ')}`;

    return { sqlStr: beatifyString(sqlStr), params };
  }

  insert(
    tableName: string,
    fields: IFieldWithAlias[] = [],
    values: ((IQueryParam | IQueryBuilderCore)[][] | (IQueryParam | IQueryBuilderCore)[]) = [],
    allCreatedEntities = {},
  ) {
    // values can be params[] OR params[][] in case of multiple insert
    // so, we should transform it into [][]
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    const isSingleRow = values.length === 0 || values.some(
      (v: (IQueryParam | IQueryBuilderCore)[] | IQueryParam | IQueryBuilderCore) => !Array.isArray(v),
    );

    let valuesToInsert: (IQueryParam | IQueryBuilderCore)[][];
    if (isSingleRow) {
      valuesToInsert = [values as (IQueryParam | IQueryBuilderCore)[]];
    } else {
      valuesToInsert = values as (IQueryParam | IQueryBuilderCore)[][];
    }

    const alias = this.createGetAlias(tableName);
    this.mainTable = tableName;
    this.mainAlias = alias;
    this.#insertFields = fields.map(({ field }) => field);

    const hasAllCreatedEntities = !!Object.keys(allCreatedEntities).length;
    if (hasAllCreatedEntities) {
      this.entitiesToCreate = { ...this.entitiesToCreate, ...allCreatedEntities };
    }

    if (Array.isArray(valuesToInsert)) {
      valuesToInsert.forEach(value => {
        this.#insertValueStorage[v4()] = value;

        if (!hasAllCreatedEntities) {
          value.filter(v => v instanceof QueryBuilderInsert).forEach(v => {
            this.entitiesToCreate = {
              [(v as IQueryBuilderCore).mainAlias]: v as QueryBuilderInsert,
              ...this.entitiesToCreate,
              ...(v as IQueryBuilderInsert).entitiesToCreate,
            };
          });
        }
      });
    }
    return this as unknown as IQueryBuilderInsert;
  }

  setReturning(tableName: string, fields: IReturningField[] = []) { // fields: [{field, alias}]
    const notExistRet = this.returning
      .filter(ret => ret.table === tableName && fields.findIndex(f => f.field === ret.field) === -1);
    this.returning = [...notExistRet, ...fields.map(f => ({ table: tableName, ...f }))];
    return this as unknown as IQueryBuilderInsert;
  }

  onConflict(onConflictStr: string) {
    this.#onConflict = onConflictStr;
    return this as unknown as IQueryBuilderInsert;
  }

  noOuterReturn(noNeedToReturn = false) {
    this.noOuterReturnParam = noNeedToReturn;
    return this;
  }

  async execute<T = any>(): Promise<T[]> {
    const result = await this.#executor.execute<T>(this);
    return result.rows;
  }
}
