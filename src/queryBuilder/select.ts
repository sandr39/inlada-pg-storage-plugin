import { v4 } from 'uuid';
import { PGQueryFunction } from 'inlada-postgresql-client';
import { beatifyString, paramToString } from './utils';
import { QueryBuilderWhere } from './queryBuilderWhere';

import { QueryBuilderExecutorSelect } from './queryBuilderExecutorSelect';
import { QueryBuilderCore } from './queryBuilderCore';
import {
  IField, IFieldWithAlias, IJoinCondition, IJoinExtend,
  IJoinField, IJoinRelation,
  IQBExecutorSelect, IQueryBuilderCore,
  IQueryBuilderSelect,
  IQueryParam,
} from '../interfaces/queryBuilder';

import {
  EXTEND_TYPE, JOIN_TYPES, QUERY_ORDER_DIRECTION, QUERY_TYPES,
} from '../interfaces/base';

const JOIN_TYPE_TO_JOIN_STR = {
  undefined: 'inner join',
  [JOIN_TYPES.inner]: 'inner join',
  [JOIN_TYPES.outer]: 'outer join',
  [JOIN_TYPES.left]: 'left join',
  [JOIN_TYPES.right]: 'right join',
};

export class QueryBuilderSelect extends QueryBuilderWhere<IQueryBuilderSelect> implements IQueryBuilderSelect {
  selectFields: IFieldWithAlias[];
  #joins: IJoinField[];
  returningPub: string[];
  type: QUERY_TYPES.select;
  #executor: IQBExecutorSelect;

  #order: string[] ;
  #orderDirection: QUERY_ORDER_DIRECTION;
  #limit: number;
  #groupBy: string[];

  constructor(pgQueryFunction: PGQueryFunction) {
    super();
    this.type = QUERY_TYPES.select;
    this.selectFields = [];
    this.#joins = []; // {  conditions, subquery, joinType, joinTable, alias }
    this.returningPub = []; // for subqueries in insert
    this.#executor = new QueryBuilderExecutorSelect(pgQueryFunction);

    this.#order = [];
    this.#orderDirection = QUERY_ORDER_DIRECTION.asc;
    this.#limit = 0;
    this.#groupBy = [];
  }

  #getMainStr() {
    const fields = this.getFieldAliasArr(this.selectFields);
    return `select ${fields.length ? fields.join(', ') : `${this.mainAlias}.*`} from ${this.mainTable} ${this.mainAlias}`;
  }

  #parseJoins(paramsStartIdx: number): string {
    const joins = this.#joins.reduce((acc, joinObj) => {
      const conditions: string[] = joinObj.conditions.map(c => {
        if (c.valueKey) {
          const value = this.paramValueStorage[c.valueKey];

          if (value instanceof QueryBuilderCore) {
            // todo what to do?
            throw new Error('QueryBuilderCore as join value');
          }

          this.params.push(value);
          return paramToString(c.alias, c.thisField, value as IQueryParam, this.params.length + paramsStartIdx);
        }
        return `${c.alias}.${c.thisField} = ${c.anotherAlias}.${c.anotherField}`;
      });

      if (joinObj.subQuery instanceof QueryBuilderSelect) {
        const { sqlStr: subSqlStr, params: newParams } = joinObj.subQuery.getSql(this.params.length + paramsStartIdx);
        this.params.push(...newParams);
        return [...acc, `${JOIN_TYPE_TO_JOIN_STR[joinObj.joinType as JOIN_TYPES]} (${subSqlStr}) ${joinObj.alias} on ${conditions.join(' and ')}`];
      }

      return [...acc, `${
        JOIN_TYPE_TO_JOIN_STR[joinObj.joinType as JOIN_TYPES]
      } ${joinObj.joinTable} ${joinObj.alias} on ${conditions.join(' and ')}`];
    }, [] as string[]);
    return joins.join(' ');
  }

  // todo dry
  getSql(paramsStartIdx = 0) {
    this.params = [];
    const mainStr = this.#getMainStr();
    const whereStr = this.parseWhere(paramsStartIdx);
    const joinStr = this.#parseJoins(paramsStartIdx);
    const groupOrderLimit = this.#getGroupOrderLimit();

    const sqlStr = `${mainStr} ${joinStr} ${whereStr} ${groupOrderLimit}`;

    return { sqlStr: beatifyString(sqlStr), params: this.params };
  }

  getSubSql(paramsStartIdx = 0) {
    this.params = [];
    const mainStr = this.#getMainStr();
    const whereStr = this.parseWhere(paramsStartIdx);
    const joinStr = this.#parseJoins(paramsStartIdx);
    const groupOrderLimit = this.#getGroupOrderLimit();

    const sqlStr = `${mainStr} ${joinStr} ${whereStr} ${groupOrderLimit}`;

    return { sqlArr: [{ query: sqlStr, alias: this.mainAlias }], params: this.params };
  }

  #addSelectFields(alias: string, fields: IFieldWithAlias[] = []) { // fields: [{field, alias, type}, ...]
    this.selectFields.push(...fields.map(f => ({ tableAlias: alias, ...f })));
    this.returningPub.push(...fields.map(f => f.field));
  }

  select(tableName: string, fields: IFieldWithAlias[]) {
    const alias = this.createGetAlias(tableName);
    this.#addSelectFields(alias, fields);
    this.mainTable = tableName;
    this.mainAlias = alias;
    return this as unknown as IQueryBuilderSelect;
  }

  /**
   *
   * @param joinTable
   * @param relations
   * @param joinType one of JOIN_TYPES
   */
  #join(joinTable: string, relations: IJoinRelation[], joinType: JOIN_TYPES) {
    const alias = this.createGetAlias(joinTable);
    const conditions = relations.map(({
      anotherTable, anotherField, thisField, thisFieldValue,
    }) => {
      if (anotherTable) {
        const anotherAlias = this.createGetAlias(anotherTable);
        return {
          alias, thisField, anotherAlias, anotherField,
        } as IJoinCondition;
      }
      const valueKey = v4();
      this.paramValueStorage[valueKey] = thisFieldValue as IQueryParam;
      return { alias, thisField, valueKey } as IJoinCondition;
    });
    this.#joins.push({
      joinType, joinTable, alias, conditions,
    });
  }

  innerJoin(joinTable: string, relations: IJoinRelation[] = []) { // relations: [{anotherTable, anotherFiled, thisField, thisFieldValue}, ...]
    this.#join(joinTable, relations, JOIN_TYPES.inner);
    return this as unknown as IQueryBuilderSelect;
  }

  /**
   * Join and select
   * @param joinTable table or qBuilder
   * @param relations [{anotherTable, anotherFiled, thisField, thisFieldValue}, ...]
   * @param fields [{field, alias}, ...]
   * @returns {QueryBuilderSelect}
   */
  innerJoinAndSelect(joinTable: string, relations: IJoinRelation[] = [], fields: IFieldWithAlias[] = []) {
    this.innerJoin(joinTable, relations);
    const alias = this.createGetAlias(joinTable);
    this.#addSelectFields(alias, fields);
    return this as unknown as IQueryBuilderSelect;
  }

  /**
   * @param subQuery QueryBuilder
   * @param relations [{anotherTable, anotherField, thisField, thisFieldValue}, ...]
   * @param alias string
   * @param joinType one of JOIN_TYPES
   * @returns {QueryBuilderSelect}
   */
  joinAsSubQuery(subQuery: IQueryBuilderCore, relations: IJoinRelation[] = [], alias: string, joinType: JOIN_TYPES) {
    const conditions: IJoinCondition[] = relations.map(({
      anotherTable, anotherField, thisField, thisFieldValue,
    }) => {
      if (anotherTable) { // todo dry
        const anotherAlias = this.createGetAlias(anotherTable);
        return {
          alias, thisField, anotherAlias, anotherField,
        } as IJoinCondition;
      }
      const valueKey = v4();
      this.paramValueStorage[valueKey] = thisFieldValue as IQueryParam;
      return { alias, thisField, valueKey } as IJoinCondition;
    });
    this.#joins.push({
      subQuery, alias, conditions, joinType,
    });
    return this;
  }

  changeSelectFields(fields: IFieldWithAlias[] = []) {
    this.selectFields = fields;
    return this as unknown as IQueryBuilderSelect;
  }

  /**
   * Add join, inner by default
   * @param qBuilder: QueryBuilderCore
   * @param relations: [{anotherTable, anotherField, thisField, thisFieldValue}, ...]
   * @param extend: [{type: many | one | ids | notPacked, getAllFields: bool, fields: [{table, fieldAlias}], alias}, ...] // fieldAliases or getAllFields: true
   * @param fields: [{field, alias}, ...]
   * @param joinType one of JOIN_TYPES
   * @returns {QueryBuilderSelect}
   */
  joinSubQueryAndSelect(qBuilder: IQueryBuilderSelect, relations: IJoinRelation[] = [], extend: IJoinExtend[] = [],
    fields: IFieldWithAlias[] = [], joinType = JOIN_TYPES.inner) {
    qBuilder.changeSelectFields([...extend.map(extObj => {
      // eslint-disable-next-line no-param-reassign
      extObj.fields = extObj.fields?.map?.(({ table, fieldAlias }) => ({
        tableAlias: qBuilder.createGetAlias(table as string),
        fieldAlias,
      }));
      if (extObj.type === EXTEND_TYPE.many) {
        const extFields = extObj.getAllFields
          ? qBuilder.selectFields
          : qBuilder.selectFields.filter(f => extObj.fields.findIndex((
            { tableAlias, fieldAlias },
          ) => tableAlias === f.tableAlias && fieldAlias === (f.alias || f.field)) > -1);
        return ({
          field: `json_agg(json_build_object(${extFields.map((
            { tableAlias, field, alias },
          ) => `'${alias}', ${tableAlias ? `${tableAlias}.` : ''}${field}`).join(', ')}))`,
          alias: extObj.alias,
        });
      }
      if (extObj.type === EXTEND_TYPE.one) {
        const extFields = extObj.getAllFields
          ? qBuilder.selectFields
          : qBuilder.selectFields.filter(f => extObj.fields.findIndex((
            { tableAlias, fieldAlias },
          ) => tableAlias === f.tableAlias && fieldAlias === (f.alias || f.field)) > -1);
        return {
          field: `json_build_object(${extFields.map((
            { tableAlias, field, alias },
          ) => `'${alias}', ${tableAlias ? `${tableAlias}.` : ''}${field}`).join(', ')})`,
          alias: extObj.alias,
        } as IFieldWithAlias;
      }
      if (extObj.type === EXTEND_TYPE.ids) {
        const idField = extObj.fields[0];
        return ({ field: `array_agg(${idField.tableAlias}.${idField.fieldAlias})`, alias: extObj.alias } as IFieldWithAlias);
      }
      if (extObj.type === EXTEND_TYPE.notPacked) {
        const extField = qBuilder.selectFields.find((
          { tableAlias, alias, field },
        ) => extObj.fields[0].tableAlias === tableAlias && extObj.fields[0].fieldAlias === (alias || field));
        if (extField?.field) {
          return ({ tableAlias: extField.tableAlias, field: extField.field, alias: extObj.alias } as IFieldWithAlias);
        }
        return null;
      }
      return null;
    }).filter(_ => _) as IFieldWithAlias[]]);
    const sqAlias = this.createGetAlias(`sq_${qBuilder.mainTable}`); // _${Object.keys(this.#aliases).length + 1}
    this.#addSelectFields(sqAlias, [...fields, ...extend.map(ext => ({ field: ext.alias }))]);

    this.joinAsSubQuery(qBuilder, relations, sqAlias, joinType);
    return this as unknown as IQueryBuilderSelect;
  }

  leftJoin(joinTable: string, relations: IJoinRelation[] = []) { // relations: [{anotherTable, anotherFiled, thisField, thisFieldValue}, ...]
    this.#join(joinTable, relations, JOIN_TYPES.left);
    return this as unknown as IQueryBuilderSelect;
  }

  leftJoinAndSelect(joinTable: string, relations: IJoinRelation[], fields: IFieldWithAlias[]) {
    this.leftJoin(joinTable, relations);
    const alias = this.createGetAlias(joinTable);
    this.#addSelectFields(alias, fields);
    return this as unknown as IQueryBuilderSelect;
  }

  order(fields: IField[] = [], direction = QUERY_ORDER_DIRECTION.asc) {
    this.#order = fields.map(f => `${this.createGetAlias(f.table)}.${f.field}`);
    this.#orderDirection = direction;
    return this as unknown as IQueryBuilderSelect;
  }

  orderFlip() {
    this.#orderDirection = this.#orderDirection === QUERY_ORDER_DIRECTION.asc ? QUERY_ORDER_DIRECTION.desc : QUERY_ORDER_DIRECTION.asc;
    return this as unknown as IQueryBuilderSelect;
  }

  limit(rowsNum = 0) {
    this.#limit = rowsNum;
    return this as unknown as IQueryBuilderSelect;
  }

  groupBy(fields: IField[] = []) {
    this.#groupBy = fields.map(({ table, field }) => {
      const alias = this.createGetAlias(table);
      return `${alias}.${field}`;
    });
    return this as unknown as IQueryBuilderSelect;
  }

  #getGroupOrderLimit(): string {
    return `
      ${this.#groupBy.length ? `group by ${this.#groupBy.join(', ')}` : ''}
      ${this.#order.length ? `order by ${this.#order.join(', ')} ${this.#orderDirection}` : ''}
      ${this.#limit ? `limit ${this.#limit}` : ''}
    `;
  }

  async execute<T = any>(): Promise<T[]> {
    const result = await this.#executor.execute<T>(this);
    return result.rows;
  }
}
