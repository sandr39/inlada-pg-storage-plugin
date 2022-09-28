import {
  IAnyEvent, IStorageClientFactory,
} from 'inladajs';
import { IIdObject } from 'inladajs/dist/interfaces/base';
import { createQueryBuilder } from '../queryBuilder';
import {
  ERROR_NAMES_EXPORT, IStorageFn, OPTION_NAMES_EXPORT, PLUGIN_NAME_EXPORT,
} from '../const';
import { tableColumnTypes } from './utils';
import { IQueryBuilderDelete } from '../interfaces/queryBuilder';

export const remove: IStorageFn = async <
  TOBJECT_NAMES extends string,
  TEvent extends IAnyEvent,
  >(
  event: TEvent,
  pgClientFactory: IStorageClientFactory,
  // dbStructure: Partial<Record<TOBJECT_NAMES, IObjectInfo<TOBJECT_NAMES>>>,
  // relationsAll: IEntityRelation<TOBJECT_NAMES>[],
) => {
  const {
    me: {
      type: { table, archive } = {},
      name,
    },
  } = event;

  if (!table) {
    throw new Error(`No data, ${name}: table: ${table}`); // todo error
  }

  const ids = event.getGeneralIdentity();
  if (ids.length > 1 && !archive) {
    event.errorThrower.setErrorAndThrow(event, ERROR_NAMES_EXPORT.noMassDelete);
  }
  if (!ids.length) {
    event.errorThrower.setErrorAndThrow(event, ERROR_NAMES_EXPORT.nothingToProcess);
  }

  const columnTypes = await tableColumnTypes(await pgClientFactory(event.uid), table);

  let query;

  if (archive) {
    query = (await createQueryBuilder(pgClientFactory, event))
      .update(table, ['archived'], [true])
      .where([{ table, field: 'id', value: ids }])
      .addColumnTypes(columnTypes);
  } else {
    query = (await createQueryBuilder(pgClientFactory, event))
      .delete(table)
      .where([{ table, field: 'id', value: ids[0] }]);
  }

  event.setPluginData(PLUGIN_NAME_EXPORT, { query });
};

export const afterRemove = async <TEvent extends IAnyEvent>(e: TEvent): Promise<boolean> => {
  if (e.getOptions(OPTION_NAMES_EXPORT.$doNotExecQuery)) {
    return false;
  }

  const query = e.getPluginData(PLUGIN_NAME_EXPORT) as IQueryBuilderDelete;

  const rows = await query.execute<IIdObject>();

  const ids = e.getGeneralIdentity();
  const deletedIds = rows.filter(({ id }) => id);

  if (deletedIds.length !== ids.length) {
    e.errorThrower.setErrorAndThrow(e, ERROR_NAMES_EXPORT.noAccess); // todo redo
  }

  return true;
};
