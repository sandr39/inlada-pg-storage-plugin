import {
  IAnyEvent, IEntityRelation, IObjectInfo, IStorageClientFactory, RELATION_TYPE,
} from 'inladajs';
import { IIdObject } from 'inladajs/dist/interfaces/base';
import {
  determineMeAnother, exec,
  filterPresentInEventRelationMany,
  getInsertValuesFromEvent, getRelations,
  makeOnConflictStatement,
} from './utils';
import { multiParamProcessors, QUERY_PROCESSOR_NAMES } from '../queryProcessor/abstractMultiParamsProcessors';
import {
  ACTION_NAMES_EXPORT, ERROR_NAMES_EXPORT, IStorageFn, OPTION_NAMES_EXPORT, PLUGIN_NAME_EXPORT, PLUGIN_SETS_EXPORT,
} from '../const';
import { createQueryBuilder } from '../queryBuilder';
import {
  IQueryBuilderDelete,
  IQueryBuilderInsert,
  IQueryBuilderSelect,
  IQueryBuilderUpdate,
} from '../interfaces/queryBuilder';

export const insert: IStorageFn = async <
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
        fieldsToInsert, fieldsToUpdate, table: mainTable, createDefaults = {}, name: entityName, noNeedToReturn,
      } = {},
      name,
    },
  } = event;
  const { $queryProcessorType = 'undefined' } : { $queryProcessorType: QUERY_PROCESSOR_NAMES | 'undefined' } = event.getOptions() as any;

  if (!fieldsToInsert || !mainTable) {
    throw new Error(`No data, ${entityName}: fieldsToInsert: ${fieldsToInsert}, fieldsToUpdate: ${fieldsToUpdate}, mainTable: ${mainTable}`); // todo error
  }

  const { fieldsWithValues: fieldsToInsertWithValues, params } = getInsertValuesFromEvent(event, name, dbStructure);

  const relations = getRelations(relationsAll, name);

  const createdFields = await Promise.all((Object.entries(relations)
    .filter(([relationFieldName]) => event.get(relationFieldName) === undefined || event.get(relationFieldName) === null)
    .map(([relationFieldName, rel]) => rel.map(i => [relationFieldName, Object.keys(dbStructure)[i]]))
    .flat(1) as [string, IEntityRelation<TOBJECT_NAMES>][]) // f..ing flat!!
    .filter(([relationFieldName, { type, table }]) => (type === RELATION_TYPE.one && table === name && createDefaults?.[relationFieldName]))
    .map(async ([relationFieldName, r]) => {
      const { anotherEntityName } = determineMeAnother(event, r);
      // anotherEntityName is ENTITY_NAMES since RELATION_TYPE.one

      const {
        fieldsWithValues: anotherInsertFields, params: anotherInsertParams,
      } = getInsertValuesFromEvent(event, anotherEntityName as TOBJECT_NAMES, dbStructure);
      let createData = Object.fromEntries(anotherInsertFields.map((f, i) => [f, anotherInsertParams[i]]));

      createData = Object
        .entries(createDefaults[relationFieldName])
        .reduce((a, [k, v]) => ((typeof v === 'function') ? { ...a, [k]: v(event) } : { ...a, [k]: v }), createData);

      await event.processNewEvent({
        [OPTION_NAMES_EXPORT.$doNotExecQuery]: true,
        [OPTION_NAMES_EXPORT.$pluginSet]: PLUGIN_SETS_EXPORT.noExec,
        ...createData,
      }, {
        actionName: ACTION_NAMES_EXPORT.create, objectName: anotherEntityName,
      });

      const { childQuery: subQuery } = event.getPluginData(PLUGIN_NAME_EXPORT) as { childQuery: undefined
        | IQueryBuilderSelect | IQueryBuilderDelete | IQueryBuilderUpdate | IQueryBuilderInsert };

      if (!subQuery) {
        event.errorThrower.setErrorAndThrow(event, ERROR_NAMES_EXPORT.noExpectedData);
      }

      return { field: relationFieldName, subQuery: subQuery.noOuterReturn(dbStructure[anotherEntityName as TOBJECT_NAMES]?.noNeedToReturn || false) };
    }));

  let query = (await createQueryBuilder(pgClientFactory, event)).insert(
    mainTable,
    [...fieldsToInsertWithValues, ...createdFields.map(({ field }) => field)].map(field => ({ field })),
    multiParamProcessors[$queryProcessorType]([...params, ...createdFields.map(({ subQuery }) => subQuery)]),
  );

  query.setReturning(mainTable, [{ field: 'id', alias: `${entityName || name}Id` }]);

  query.onConflict(await makeOnConflictStatement(await pgClientFactory(event.uid), mainTable, fieldsToUpdate));
  query.noOuterReturn(!!noNeedToReturn);

  let allCreatedEntities = {};
  // todo redo - async map cycle on outer var is weird
  await Promise.all(
    filterPresentInEventRelationMany(event, relations, relationsAll)
      .map(async ([field, relation]) => {
        const realTable = relation.table;

        const { meJoinField, anotherJoinField } = determineMeAnother(event, relation);
        const ids = event.get(field) as number[];

        allCreatedEntities = { ...allCreatedEntities, ...query.getAllCreatedEntities() };
        const addNew = (await createQueryBuilder(pgClientFactory, event))
          .insert(realTable, [{ field: meJoinField }, { field: anotherJoinField }], ids.map(val => [query, val]), allCreatedEntities)
          .onConflict(await makeOnConflictStatement(await pgClientFactory(event.uid), realTable, [meJoinField, anotherJoinField]))
          .setReturning(realTable, [{ field: anotherJoinField }])
          .noOuterReturn(true);

        query = addNew;
        return addNew;
      }),
  );

  event.setPluginData(PLUGIN_NAME_EXPORT, { query });
};

export const afterInsert = async <TEvent extends IAnyEvent>(e: TEvent): Promise<unknown | unknown[] | null> => {
  const { me: { name, type: { name: entityName } = {} } } = e;

  if (e.getOptions(OPTION_NAMES_EXPORT.$doNotExecQuery)) {
    return null;
  }

  const rows = await exec(e) as IIdObject[] | null;

  if (!rows || !rows.length) {
    return null;
  }

  e.addCreated((rows as Record<string, any>[])?.reduce((acc, r) => {
    Object.entries(r).forEach(([k, v]) => {
      // for batch insert "with" query returns 1 row with all created ids
      // here we need to separate them
      const idxIdx = k.indexOf('_');
      if (idxIdx > -1) {
        // eslint-disable-next-line no-param-reassign
        k = k.substring(0, idxIdx);
      }
      acc[k] = [...(acc[k] || []), v];
    });
    return acc;
  }, {}));

  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  const ids = Object.entries(e.getCreated() || {})
    .find(([k]) => k.substring(0, k.length - 2) === (entityName || name).toLowerCase())[1] as number[];

  if (ids.length === 1) {
    e.add('id', ids[0]).reParseIds();
  } else {
    e.add('id', ids).reParseIds();
  }

  return (rows.length === 1)
    ? {
      ...rows[0],
      id: (e.getGeneralIdentity().length === 1)
        ? e.getGeneralIdentity()[0]
        : e.getGeneralIdentity(),
    }
    : rows.map((r, i) => ({ ...r, id: ids[i] }));
};
