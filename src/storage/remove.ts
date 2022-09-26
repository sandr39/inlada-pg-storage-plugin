import {
  IAnyEvent, IEntityRelation, IObjectInfo, IStorageClientFactory,
} from 'inladajs';
import { IIdObject } from 'inladajs/dist/interfaces/base';
import { createQueryBuilder } from '../queryBuilder';
import {
  ERROR_NAMES, IStorageFn, OPTION_NAMES, MY_PLUGIN_NAME,
} from '../const';
import { tableColumnTypes } from './utils';
import { IQueryBuilderDelete } from '../interfaces/queryBuilder';

export const remove: IStorageFn = async <
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
      type: { table, archive } = {},
      name,
    },
  } = event;

  if (!table) {
    throw new Error(`No data, ${name}: table: ${table}`); // todo error
  }

  const ids = event.getGeneralIdentity();
  if (ids.length > 1 && !archive) {
    event.errorThrower.setErrorAndThrow(event, ERROR_NAMES.noMassDelete);
  }
  if (!ids.length) {
    event.errorThrower.setErrorAndThrow(event, ERROR_NAMES.nothingToProcess);
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

  event.setPluginData(MY_PLUGIN_NAME, query);
};

export const afterRemove = async <TEvent extends IAnyEvent>(e: TEvent): Promise<boolean> => {
  if (e.getOptions(OPTION_NAMES.$doNotExecAndReturnQuery)) {
    return false;
  }

  const query = e.getPluginData(MY_PLUGIN_NAME);

  const rows = await (query as IQueryBuilderDelete).execute<IIdObject>();

  const ids = e.getGeneralIdentity();
  const deletedIds = rows.filter(({ id }) => id);

  if (deletedIds.length !== ids.length) {
    e.errorThrower.setErrorAndThrow(e, ERROR_NAMES.noAccess); // todo redo
  }

  return true;
};
