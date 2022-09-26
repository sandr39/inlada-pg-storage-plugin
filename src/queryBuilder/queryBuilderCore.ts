import { IFieldWithAlias, IQueryBuilderCore } from '../interfaces/queryBuilder';
import { QUERY_TYPES } from '../interfaces/base';

export abstract class QueryBuilderCore implements IQueryBuilderCore {
  mainTable: string;
  mainAlias: string;
  returnAliases: string[];
  aliases: Record<string, string>;
  static aliasCount: number;
  noOuterReturnParam : boolean;
  params: unknown[]
  type: QUERY_TYPES

  protected constructor() {
    this.mainAlias = '';
    this.mainTable = '';
    this.returnAliases = [];
    this.aliases = {};
    this.noOuterReturnParam = false;
    this.params = [];
    this.type = QUERY_TYPES.undefined;
  }

  getFieldAliasArr(fields: IFieldWithAlias[] = []): string[] {
    // [tableAlias.]field [as alias]
    return fields.map(f => `${f.tableAlias ? `${f.tableAlias}.` : ''}${f.field} ${f.alias ? `as ${f.alias}` : ''}`);
  }

  // todo table as enum
  createGetAlias(table: string) {
    if (!this.aliases[table]) {
      this.aliases[table] = `${table}_${Object.keys(this.aliases).length + QueryBuilderCore.aliasCount}`;
      QueryBuilderCore.aliasCount += 1;
    }
    return this.aliases[table];
  }

  noOuterReturn(noNeedToReturn = false) {
    this.noOuterReturnParam = noNeedToReturn;
    return this;
  }

  abstract execute<T>(): Promise<T[]>
}

QueryBuilderCore.aliasCount = 0;
