import {
  IAnyEvent, IEntityRelation, IObjectInfo, IStorageClientFactory, RELATION_TYPE,
} from 'inladajs';
import { determineMeAnother, getRelations } from './utils';
import {
  EXTEND_TYPE, JOIN_TYPES, QUERY_ORDER_DIRECTION,
} from '../interfaces/base';
import { IJoinExtend, IQueryBuilderSelect, IWereFieldInfo } from '../interfaces/queryBuilder';
import { createQueryBuilder } from '../queryBuilder';
import {
  ACTION_NAMES, IStorageFn, MY_PLUGIN_NAME, OPTION_NAMES,
} from '../const';

const getWhereFields = <
  TOBJECT_NAMES extends string,
  TEvent extends IAnyEvent
  >(e: TEvent,
    entityTypeName: TOBJECT_NAMES,
    dbStructure: Partial<Record<TOBJECT_NAMES, IObjectInfo<TOBJECT_NAMES>>>,
  ): IWereFieldInfo[] => {
  const { table: mainTable, addWhere = [], parentFields } = dbStructure[entityTypeName] as IObjectInfo<TOBJECT_NAMES>;
  if (!mainTable) {
    throw new Error(`No table for ${entityTypeName}`);
  }

  const result: IWereFieldInfo[] = [];

  result.push(...addWhere
    .map(field => ({ table: mainTable, field, value: e.get(field) })) // todo check alias here too
    .filter(({ value }) => typeof value !== 'undefined'));
  result.push(...Object.values(parentFields || {})
    .map(field => ({ table: mainTable, field, value: e.get(field) }))
    .filter(({ value }) => typeof value !== 'undefined'));

  return result;
};

// todo query type
const joinAndExtend = async <
  TOBJECT_NAMES extends string,
  TEvent extends IAnyEvent
  >(
  e: TEvent,
  query: IQueryBuilderSelect,
  { relation, fieldName }: {relation: IEntityRelation<TOBJECT_NAMES>, fieldName: string }, // todo types
  whereFields: { id: number | undefined },
  parentIdIsSet = false,
  dbStructure: Partial<Record<TOBJECT_NAMES, IObjectInfo<TOBJECT_NAMES>>>,
) => {
  // logger.assert(fieldName.substring(fieldName.length - 2) !== 'Id',
  //   `Alias should be ..Id or ..sId, got ...${fieldName.substr(fieldName.length - 3)}`);

  const fieldIsArray = fieldName.substring(fieldName.length - 3) === 'sId';
  const fieldNameNoId = fieldName.substring(0, fieldName.length - 2);
  const {
    me: {
      type: { table: mainTable } = {},
    },
  } = e;

  const { anotherEntityName, anotherJoinField, meJoinField } = determineMeAnother(e, relation);

  const addWhereFields = [];

  if (e.getOptions(OPTION_NAMES.$searchInside)) {
    addWhereFields.push(...getWhereFields(e, anotherEntityName as TOBJECT_NAMES, dbStructure));
  }

  const subQuery = await e.processNewEvent({
    [OPTION_NAMES.$doNotExecAndReturnQuery]: true,
    [OPTION_NAMES.$useExtendFieldSet]: true,
    // [OPTION_NAMES.$doNotAfterActionProcess]: true,
    ...whereFields,
    ...Object.fromEntries(addWhereFields.map(({ field, value }) => [field, value])),
  }, {
    actionName: ACTION_NAMES.list, objectName: anotherEntityName,
  }) as IQueryBuilderSelect;

  if (fieldIsArray) {
    subQuery.groupBy([{ field: 'id', table: dbStructure[anotherEntityName as TOBJECT_NAMES]?.table as string }]);
  }

  const extendFields: IJoinExtend[] = [];
  let fieldNameToJoinBy;
  let anotherFieldNameToJoinTo;
  if (!fieldIsArray) {
    extendFields.push({
      type: EXTEND_TYPE.notPacked,
      fields: [{ table: dbStructure[anotherEntityName as TOBJECT_NAMES]?.table, fieldAlias: 'id' }],
      alias: fieldName,
    });
    extendFields.push({
      type: EXTEND_TYPE.one,
      getAllFields: true,
      fields: [],
      alias: fieldNameNoId,
    });
    fieldNameToJoinBy = fieldName;
  } else {
    extendFields.push({
      type: EXTEND_TYPE.ids,
      fields: [{ table: dbStructure[anotherEntityName as TOBJECT_NAMES]?.table, fieldAlias: 'id' }],
      alias: fieldName,
    });
    extendFields.push({
      type: EXTEND_TYPE.many, getAllFields: true, fields: [], alias: fieldNameNoId,
    });
  }

  if (relation.type === RELATION_TYPE.many) {
    // join via many-to-many relation table
    fieldNameToJoinBy = meJoinField; // `${$fullInfo[$name]?.name || $name}Id`;
    subQuery.innerJoinAndSelect(
      relation.table,
      [{
        anotherTable: dbStructure[anotherEntityName as TOBJECT_NAMES]?.table as string,
        anotherField: 'id',
        thisField: anotherJoinField, // `${dbStructure[anotherEntityName as TOBJECT_NAMES]?.name || anotherEntityName}Id`,
      }],
      [{ field: fieldNameToJoinBy, alias: fieldNameToJoinBy }],
    );
    extendFields.push({
      type: EXTEND_TYPE.notPacked,
      fields: [{ table: relation.table, fieldAlias: fieldNameToJoinBy }],
      alias: fieldNameToJoinBy,
    });
    if (fieldIsArray) {
      subQuery.groupBy([{ field: fieldNameToJoinBy, table: relation.table }]);
    }
  } else if (relation.type === RELATION_TYPE.one) {
    anotherFieldNameToJoinTo = fieldName;
  }

  (query as IQueryBuilderSelect).joinSubQueryAndSelect(
    subQuery,
    [{ anotherTable: mainTable, anotherField: anotherFieldNameToJoinTo || 'id', thisField: fieldNameToJoinBy || 'id' }],
    extendFields,
    fieldNameToJoinBy ? [{ field: fieldNameToJoinBy, alias: fieldNameToJoinBy }] : [],
    parentIdIsSet ? JOIN_TYPES.inner : (relation.joinType || JOIN_TYPES.inner),
  );
};

export const list: IStorageFn = async <
  TOBJECT_NAMES extends string,
  TEvent extends IAnyEvent,
  >(
  event: TEvent,
  pgClientFactory: IStorageClientFactory,
  dbStructure: Partial<Record<TOBJECT_NAMES, IObjectInfo<TOBJECT_NAMES>>>,
  relationsAll: IEntityRelation<TOBJECT_NAMES>[],
) => {
  const {
    me: {
      type: {
        table: mainTable, fieldsToGet, fieldsToExtend, where = {}, archive, fields,
      } = {},
      name,
    },
    parent,
  } = event;
  const useExtendFieldSet = event.getOptions(OPTION_NAMES.$useExtendFieldSet) as boolean;
  const fieldsToSelect = (useExtendFieldSet && fieldsToExtend) || fieldsToGet;

  const relations = getRelations(relationsAll, name);

  if (!fieldsToSelect || !mainTable) {
    throw new Error(`No data, ${name}: fieldsToSelect: ${fieldsToSelect}, mainTable: ${mainTable}`); // todo error
  }

  // select only this table fields here
  // filter(f => !relations[f])
  const query = (await createQueryBuilder(pgClientFactory, event)).select(
    mainTable,
    fieldsToSelect
      .filter(f => !fields?.[f]?.outer)
      .map(f => ({
        field: f,
        alias: fields?.[f]?.alias,
        type: fields?.[f]?.type,
      })),
  );
  const whereConditions: IWereFieldInfo[] = [];
  whereConditions.push(...Object.entries(where)
    .map(([k, v]) => ({ table: mainTable, field: k, value: v })));

  whereConditions.push(...getWhereFields(event, name, dbStructure));

  if (archive) { //  && !event.get('$getArchived')
    whereConditions.push({ table: mainTable, field: 'archived', value: false });
  }

  const ids = event.getGeneralIdentity();
  if (ids.length) {
    whereConditions.push({ table: mainTable, field: 'id', value: ids });
  }

  query.where(whereConditions);

  if (event.getOptions(OPTION_NAMES.$orderByIdDesc)) {
    query.order([{ table: mainTable, field: 'id' }], QUERY_ORDER_DIRECTION.desc);
  }

  if (event.getOptions(OPTION_NAMES.$orderById)) {
    query.order([{ table: mainTable, field: 'id' }]);
  }

  event.setPluginData(MY_PLUGIN_NAME, query);

  const noExtend = event.getOptions(OPTION_NAMES.$noExtend);
  if (!noExtend) {
    // join fields to select
    await Promise.all(fieldsToSelect.filter(fs => relations[fs])
      .map(fs => relations[fs].map(async rel => {
        const currentRelation = relationsAll[rel];

        const parentRelationWhere = parent.find(p => `${p.name}Id` === fs);
        const whereFields = { id: parentRelationWhere?.id[0] }; // todo parentFields / parentEntity
        const parentIdIsSet = !!parentRelationWhere?.id.length;
        return joinAndExtend(event, query, {
          relation: currentRelation,
          fieldName: fs,
        }, whereFields, parentIdIsSet, dbStructure);
      }))
      .flat(2));
  }
};
