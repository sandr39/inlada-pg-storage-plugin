import {
  IAnyEvent, IEntityRelation, IObjectInfo, RELATION_TYPE,
} from 'inladajs';
import { IPGClient } from 'inlada-postgresql-client';
import { IColumnTypes, ITableColumnTypes } from '../interfaces/base';
import { ISuitableRelation, OPTION_NAMES, PLUGIN_NAME } from '../const';

export const determineMeAnother = <
  TOBJECT_NAMES extends string,
  TEvent extends IAnyEvent
  >(e: TEvent, relation: IEntityRelation<TOBJECT_NAMES>) => {
  const { me: { name } } = e;

  const { entities } = relation;
  const meIndex = name === entities[0] ? 0 : 1;

  const anotherIndex = +(!meIndex);
  const anotherEntityName = entities[anotherIndex];
  const anotherJoinField = relation.idFields[anotherIndex];
  const meJoinField = relation.idFields[meIndex];

  return {
    anotherEntityName,
    anotherJoinField,
    meJoinField,
  };
};

const getValuesFromEvent = <
  TOBJECT_NAMES extends string,
  TEvent extends IAnyEvent
  >(e: TEvent,
    entityName: TOBJECT_NAMES,
    fieldTo: 'fieldsToInsert' | 'fieldsToUpdate',
    dbStructure: Partial<Record<TOBJECT_NAMES, IObjectInfo<TOBJECT_NAMES>>>,
  ) => {
  const { fields } = dbStructure[entityName] as IObjectInfo<TOBJECT_NAMES>;

  const fieldsToProcess = dbStructure[entityName]?.[fieldTo];

  const fieldsWithValues: string[] = [];
  const params: unknown[] = [];

  fieldsToProcess?.forEach(fti => {
    const val = e.get(fti);
    const valAlias = e.get(fields?.[fti]?.alias);

    if (typeof val !== 'undefined') {
      fieldsWithValues.push(fti);
      params.push(val);
    } else if (typeof valAlias !== 'undefined') {
      fieldsWithValues.push(fti);
      params.push(valAlias);
    }
  });

  return {
    fieldsWithValues,
    params,
  };
};

export const getInsertValuesFromEvent = <TOBJECT_NAMES extends string, TEvent extends IAnyEvent>(
  e: TEvent,
  entityName: TOBJECT_NAMES,
  dbStructure: Partial<Record<TOBJECT_NAMES, IObjectInfo<TOBJECT_NAMES>>>,
) => getValuesFromEvent(e, entityName, 'fieldsToInsert', dbStructure);

export const getUpdateValuesFromEvent = <TOBJECT_NAMES extends string, TEvent extends IAnyEvent>(
  e: TEvent,
  entityName: TOBJECT_NAMES,
  dbStructure: Partial<Record<TOBJECT_NAMES, IObjectInfo<TOBJECT_NAMES>>>,
) => getValuesFromEvent(e, entityName, 'fieldsToUpdate', dbStructure);

export const filterPresentInEventRelationMany = <TOBJECT_NAMES extends string, TEvent extends IAnyEvent>(
  e: TEvent,
  relations: ISuitableRelation,
  relationsAll: IEntityRelation<TOBJECT_NAMES>[],
) => (Object.entries(relations)
    .filter(([relationFieldName]) => e.get(relationFieldName) !== undefined && e.get(relationFieldName) !== null)
    .map(([relationFieldName, rel]) => rel.map(i => [relationFieldName, relationsAll[i]]))
    .flat(1) as [string, IEntityRelation<TOBJECT_NAMES>][]) // f..ing flat!!
    .filter(([, { type }]) => type === RELATION_TYPE.many);

export const makeOnConflictStatement = async (pgClient: IPGClient, table: string, fields?: string[]) => {
  if (!fields?.length) {
    return '';
  }
  const uniqueKey = await pgClient.getTableUniqueKey(table);
  return uniqueKey && uniqueKey.length
    ? `on conflict (${uniqueKey}) DO UPDATE SET
        (${fields?.join(',')}) = (${fields?.map(ftu => `EXCLUDED.${ftu}`).join(',')})`
    : '';
};

export const exec = async <TEvent extends IAnyEvent>(e: TEvent): Promise<unknown[] | null> => {
  if (!e.getOptions(OPTION_NAMES.$doNotExecQuery)) {
    const query = e.getPluginData(PLUGIN_NAME);
    return query?.execute?.() || null;
  }

  return null;
};

export const getRelations = <TOBJECT_NAMES extends string>(
  $relations: IEntityRelation<TOBJECT_NAMES>[],
  entityName: TOBJECT_NAMES,
) => $relations.reduce((
    acc,
    { entities, fieldNameInQuery = [] }, // type
    i,
  ) => {
    if (entities.includes(entityName)) {
    // array, because could be several joins
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
      return fieldNameInQuery.reduce((a, f) => ({
        ...a,
        [f]: [...(acc[f] || []), i],
        [f.toLowerCase()]: [...(acc[f.toLowerCase()] || []), i],
      }), acc);
    }
    return acc;
  }, {} as {[f : string]: number[]});

export const filterUnique = <T>(arr: T[]) => [...new Set(arr)];

export const typeToSQLType = (typeName: string) => ({
  integer: 'integer',
  boolean: 'boolean',
  'timestamp without time zone': 'timestamp',
  'timestamp with time zone': 'timestamptz',
}[typeName]);

// todo add cache
export const tableColumnTypes = async (pgClient: IPGClient, tableName: string): Promise<IColumnTypes> => {
  const query = 'select column_name as cn, data_type as dt, table_name as tn from information_schema.columns  where table_schema = \'public\'';
  const { rows: columnTypes } = await pgClient.query<{ cn: string, dt: string, tn: string }>(query);

  const tablesColumns = columnTypes.reduce((acc, { cn, dt, tn }) => ({
    ...acc,
    [tn]: {
      ...(acc[tn] || {}),
      [cn]: typeToSQLType(dt),
    },
  }), {} as ITableColumnTypes);

  // logger.assert(!tablesColumns[tableName.toLowerCase()], `No table ${tableName.toLowerCase()} in CACHE_FIELDS.TABLES_COLUMNS cache`);

  return tablesColumns[tableName.toLowerCase()];
};
