import { IPGResult } from 'inlada-postgresql-client';
import {
  IColumnTypes, JOIN_TYPES, QUERY_ORDER_DIRECTION, QUERY_TYPES,
} from './base';

export interface IFieldWithAlias {
  tableAlias?: string
  field: string
  alias?: string | undefined
  type?: string | undefined
}

export interface IReturningFieldId {
  tableAlias: string
  field: 'id'
}

export interface IReturningField {
  alias?: string
  field: string
}

export interface IReturningFieldInsert extends IReturningField {
  table: string
}

export type IQueryParam = string | number | boolean | string[] | number[] | boolean[];

export interface IField {
  table: string
  field: string
}

export interface ISubQuery {
  query: string
  alias: string
}

interface IQueryBuilderCore {
  mainTable: string;
  mainAlias: string;
  aliases: Record<string, string>
  createGetAlias: (table: string) => string
  noOuterReturnParam: boolean
  params: any[]
  type: QUERY_TYPES
  noOuterReturn: (noNeedToReturn: boolean) => any // todo
}

export interface IFieldWhere extends IField {
  value: IQueryParam | IQueryBuilderCore
  operator?: string // todo enum
}

export interface IJoinRelation {
  anotherTable?: string
  anotherField?: string
  thisField: string
  thisFieldValue?: IQueryParam
}

export interface IJoinCondition {
  valueKey: string
  alias: string
  thisField: string
  anotherAlias: string
  anotherField: string
}

// todo joinTable OR subQuery
export interface IJoinField {
  joinType: JOIN_TYPES
  joinTable?: string
  alias: string
  conditions: IJoinCondition[]
  subQuery?: IQueryBuilderCore
}

export interface IJoinExtend {
  type: 'many' | 'one' | 'ids' | 'notPacked' // todo enum
  getAllFields?: boolean
  fields: {
    table?: string
    fieldAlias: string
    tableAlias?: string
  }[]
  alias: string
}

interface IQueryBuilderCore {
  returnAliases: string[]
  getFieldAliasArr: (fields: IFieldWithAlias[]) => string[]
  execute: <T = any>() => Promise<T[]>
}

export interface IQueryBuilderQueryable {
  getSubSql: (paramsStartIdx: number) => { sqlArr: ISubQuery[], params: any[] }
  getSql: (paramsStartIdx?: number) => { sqlStr: string, params: any[] }
}

interface IQBOrder<T> {
  order: (fields: IField[], direction?: QUERY_ORDER_DIRECTION) => T
  orderFlip: () => T
  // orderToString: () => string
}

interface IQBGroup<T> {
  groupBy: (fields: IField[]) => T
  // groupToString: () => string
}

export interface IQBExecutorCore {
  execute: <T = any>(qb: IQueryBuilderQueryable & IQueryBuilderCore) => Promise<IPGResult<T>>
}

export interface IQBExecutorSelect extends IQBExecutorCore {
  getMany: <T = any>(qb: IQueryBuilderQueryable & IQueryBuilderCore) => Promise<T[]>
  getTwo: <T = any>(qb: IQueryBuilderQueryable & IQueryBuilderCore) => Promise<T[]>
  setLimit: (rowsNum: number) => IQBExecutorSelect
}

interface IQBFilterCore<T> {
  whereArr: any
  paramValueStorage: Record<string, any>
  where: (wheres: IFieldWhere[]) => T
  parseWhere: (paramsStartIdx: number) => any
}

interface IQBOnConflict<T> {
  onConflict: (onConflictStr: string) => T
}

export { IQueryBuilderCore };

export interface IQBWhere<T> extends IQueryBuilderCore, IQBFilterCore<T> {}

export interface IQueryBuilderDelete extends IQueryBuilderCore, IQBFilterCore<IQueryBuilderDelete>, IQueryBuilderQueryable {
  type: QUERY_TYPES.delete
  delete: (tableName: string) => any
  // executor: IQBExecutorCore
}

export interface IQueryBuilderUpdate
  extends IQBWhere<IQueryBuilderUpdate>, IQBFilterCore<IQueryBuilderUpdate>,
    IQueryBuilderQueryable, IQBOnConflict<IQueryBuilderUpdate> {
  type: QUERY_TYPES.update
  addColumnTypes: (_ :IColumnTypes) => IQueryBuilderUpdate
  addUpdates: (qBuilders: IQueryBuilderUpdate[]) => IQueryBuilderUpdate
  update: (tableName: string, fields: string[], values: (IQueryParam | IQueryBuilderCore)[]) => IQueryBuilderUpdate
  // executor: IQBExecutorCore
}

export interface IQueryBuilderSelect extends IQueryBuilderCore,
  IQBFilterCore<IQueryBuilderSelect>, IQueryBuilderQueryable, IQBGroup<IQueryBuilderSelect>, IQBOrder<IQueryBuilderSelect> {
  type: QUERY_TYPES.select
  // executor: IQBExecutorSelect
  returningPub: string[];
  selectFields: IFieldWithAlias[]
  leftJoin: (joinTable: string, relations: IJoinRelation[]) => IQueryBuilderSelect
  leftJoinAndSelect: (joinTable: string, relations: IJoinRelation[], fields: IFieldWithAlias[]) => IQueryBuilderSelect
  innerJoin: (joinTable: string, relations: IJoinRelation[]) => IQueryBuilderSelect
  innerJoinAndSelect: (joinTable: string, relations: IJoinRelation[], fields: IFieldWithAlias[]) => IQueryBuilderSelect
  joinSubQueryAndSelect: (qBuilder: IQueryBuilderSelect, relations: IJoinRelation[],
                          extend: IJoinExtend[], fields: IFieldWithAlias[], joinType: JOIN_TYPES) => IQueryBuilderSelect
  changeSelectFields: (fields: IFieldWithAlias[]) => IQueryBuilderSelect
  select: (tableName: string, fields: IFieldWithAlias[]) => IQueryBuilderSelect
}

export interface IQueryBuilderInsert extends IQueryBuilderCore, IQueryBuilderQueryable, IQBOnConflict<IQueryBuilderInsert> {
  type: QUERY_TYPES.insert
  // executor: IQBExecutorCore
  returning: IReturningFieldInsert[]
  setReturning: (table: string, fields: IReturningField[]) => IQueryBuilderInsert
  entitiesToCreate: Record<string, IQueryBuilderInsert | IQueryBuilderSelect>
  insert: (tableName: string, fields: IField[], values: (IQueryParam | IQueryBuilderCore)[][], allCreatedEntities: any) => IQueryBuilderInsert
  getSubSqlInner: (paramsStartIdx: number) => { sqlArr: ISubQuery[], params: any[] }
  getSqlInner: (paramsStartIdx: number) => { sqlStr: string, params: any[] }
  getAllCreatedEntities: () => Record<string, IQueryBuilderInsert | IQueryBuilderSelect>
}

export interface IQBFacade {
  select: (tableName: string, fields: IFieldWithAlias[]) => IQueryBuilderSelect,
  insert: (tableName: string, fields: IFieldWithAlias[], values: any[], allCreatedEntities? : any) => IQueryBuilderInsert
  update: (tableName: string, fields: string[], values: any[]) => IQueryBuilderUpdate
  delete: (tableName: string) => IQueryBuilderDelete
}

export interface IWereFieldInfo {
  table: string
  field: string
  value: IQueryParam | IQueryBuilderCore
}
