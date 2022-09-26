import { v4 } from 'uuid';
import { QueryBuilderCore } from './queryBuilderCore';

import { paramToString } from './utils';
import {
  IFieldWhere,
  IQBWhere,
  IQueryBuilderCore,
  IQueryBuilderQueryable,
  IQueryParam,
} from '../interfaces/queryBuilder';

export abstract class QueryBuilderWhere<T> extends QueryBuilderCore implements IQBWhere<T> {
  whereArr: {alias: string, valueKey : string, field: string, operator?: string }[] // todo type
  paramValueStorage: Record<string, IQueryParam | IQueryBuilderCore>

  constructor() {
    super();
    this.whereArr = [];
    this.paramValueStorage = {};
  }

  where(wheres: IFieldWhere[] = []): T {
    this.whereArr.push(...wheres.map(({
      table, field, value, operator,
    }) => {
      const alias = this.createGetAlias(table);
      const valueKey = v4();
      this.paramValueStorage[valueKey] = value;
      return {
        alias, field, valueKey, operator,
      };
    }));
    return this as unknown as T;
  }

  parseWhere(paramsStartIdx: number) {
    const whereArr = this.whereArr.reduce((acc, {
      alias, field, valueKey, operator = 'in',
    }) => {
      const value = this.paramValueStorage[valueKey];
      if (value instanceof QueryBuilderCore) {
        const { sqlStr: subSqlStr, params: newParams } = (value as unknown as IQueryBuilderQueryable).getSql(this.params.length + paramsStartIdx);
        this.params.push(...newParams);
        return [...acc, `${alias ? `${alias}.` : ''}${field} ${operator} (${subSqlStr})`];
      }
      this.params.push(value);
      const valueIdx = this.params.length + paramsStartIdx;
      return [...acc, paramToString(alias, field, value as IQueryParam, valueIdx)];
    }, [] as string[]);
    return (whereArr.length && `where ${whereArr.join(' and ')}`) || '';
  }
}
