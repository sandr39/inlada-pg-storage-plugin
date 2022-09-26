import {
  IAnyEvent, IEntityRelation, IObjectInfo, IStorageClientFactory,
} from 'inladajs';
import {
  determineMeAnother,
  exec,
  filterPresentInEventRelationMany, getRelations,
  getUpdateValuesFromEvent,
  makeOnConflictStatement, tableColumnTypes,
} from './utils';
import { createQueryBuilder } from '../queryBuilder';
import { ERROR_NAMES, IStorageFn, MY_PLUGIN_NAME } from '../const';

export const update: IStorageFn = async <
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
      name,
      type: {
        fieldsToUpdate, table, noNeedToReturn,
      } = {},
    },
  } = event;

  if (!fieldsToUpdate || !table) {
    throw new Error(`No data, ${name}: fieldsToUpdate: ${fieldsToUpdate}, table: ${table}`); // todo error
  }

  const myId = event.getGeneralIdentity();
  const relations = getRelations(relationsAll, name);
  const updateRelatedTables = await Promise.all(
    filterPresentInEventRelationMany(event, relations, relationsAll)
      .map(async ([relationFieldName, relation]) => {
        const realTable = relation.table;

        const { meJoinField, anotherJoinField } = determineMeAnother(event, relation);
        const ids = event.get(relationFieldName) as number[];

        if (ids.length) {
          const addNew = (await createQueryBuilder(pgClientFactory, event))
            .insert(realTable, [{ field: meJoinField }, { field: anotherJoinField }], ids.map(val => [myId?.[0] || myId, val])) // todo mass update - here I need number now to insert like id
            .onConflict(await makeOnConflictStatement(await pgClientFactory(event.uid), realTable, [meJoinField, anotherJoinField]))
            .setReturning(realTable, [{ field: anotherJoinField }])
            .noOuterReturn(true);

          // remove unnecessary
          return (await createQueryBuilder(pgClientFactory, event))
            .delete(realTable)
            .where([{
              table: realTable,
              field: anotherJoinField,
              value: addNew,
              operator: 'not in',
            }, {
              table: realTable,
              field: meJoinField,
              value: myId,
            }])
            .noOuterReturn(true);
        }

        // remove all
        return (await createQueryBuilder(pgClientFactory, event))
          .delete(realTable)
          .where([{
            table: realTable,
            field: meJoinField,
            value: myId,
          }])
          .noOuterReturn(true);
      }),
  );

  // let fieldsToUpdateSelective: string[];
  // let params: any[];
  const { fieldsWithValues: fieldsToUpdateSelective, params } = getUpdateValuesFromEvent(event, name, dbStructure);

  // duplicates in updateRelatedTables (try processEntityAssociations)
  if (!fieldsToUpdateSelective?.length && !updateRelatedTables.length) {
    event.errorThrower.setErrorAndThrow(event, ERROR_NAMES.nothingToProcess);
  }

  const columnTypes = await tableColumnTypes(await pgClientFactory(event.uid), table);

  const query = (await createQueryBuilder(pgClientFactory, event))
    .update(table, fieldsToUpdateSelective, params)
    .addUpdates(updateRelatedTables
      .filter((qb, idx) => updateRelatedTables.findIndex(q => q.mainTable === qb.mainTable) === idx))
    .noOuterReturn(!!noNeedToReturn)
    .where([{ table, field: 'id', value: event.getGeneralIdentity() }])
    .addColumnTypes(columnTypes);

  event.setPluginData(MY_PLUGIN_NAME, query);
};

export const afterUpdate = async <TEvent extends IAnyEvent>(e: TEvent): Promise<unknown | unknown[]> => {
  const rows = await exec(e) as unknown[];
  if (rows.length === 1) {
    return rows[0];
  }
  return rows;
};
