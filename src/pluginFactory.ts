import {
  IAnyEvent, IEntityRelation, IObjectInfo, IPlugin, IStorageClientFactory, PLUGIN_APPLY_STAGE,
} from 'inladajs';
import { ACTION_NAMES_EXPORT, PLUGIN_NAME_EXPORT } from './const';
import { finalizeStorageOperation, prepareStorageOperation } from './storageOperations';
import {
  IQueryBuilderDelete,
  IQueryBuilderInsert,
  IQueryBuilderSelect,
  IQueryBuilderUpdate,
} from './interfaces/queryBuilder';

export const createPostgresStoragePlugin = <
  TACTION_NAMES extends string,
  TOBJECT_NAMES extends string,
  TPLUGIN_NAMES extends string,
  TEvent extends IAnyEvent
  >(
    pgClientFactory: IStorageClientFactory,
    dbStructure: Partial<Record<TOBJECT_NAMES, IObjectInfo<TOBJECT_NAMES>>>,
    relations: IEntityRelation<TOBJECT_NAMES>[],
  ): IPlugin<TACTION_NAMES | ACTION_NAMES_EXPORT, TPLUGIN_NAMES, TEvent> => ({
    [PLUGIN_APPLY_STAGE.ACTION]: {
      [ACTION_NAMES_EXPORT.create]: {
        [PLUGIN_APPLY_STAGE.ACTION]: e => prepareStorageOperation(e, pgClientFactory, dbStructure, relations, ACTION_NAMES_EXPORT.create),
        [PLUGIN_APPLY_STAGE.FINALIZE_ACTION]: e => finalizeStorageOperation(e, pgClientFactory, dbStructure, relations, ACTION_NAMES_EXPORT.create),
      },
      [ACTION_NAMES_EXPORT.list]: {
        [PLUGIN_APPLY_STAGE.ACTION]: e => prepareStorageOperation(e, pgClientFactory, dbStructure, relations, ACTION_NAMES_EXPORT.list),
        [PLUGIN_APPLY_STAGE.FINALIZE_ACTION]: e => finalizeStorageOperation(e, pgClientFactory, dbStructure, relations, ACTION_NAMES_EXPORT.list),
      },
      [ACTION_NAMES_EXPORT.update]: {
        [PLUGIN_APPLY_STAGE.ACTION]: e => prepareStorageOperation(e, pgClientFactory, dbStructure, relations, ACTION_NAMES_EXPORT.update),
        [PLUGIN_APPLY_STAGE.FINALIZE_ACTION]: e => finalizeStorageOperation(e, pgClientFactory, dbStructure, relations, ACTION_NAMES_EXPORT.update),
      },
      [ACTION_NAMES_EXPORT.delete]: {
        [PLUGIN_APPLY_STAGE.ACTION]: e => prepareStorageOperation(e, pgClientFactory, dbStructure, relations, ACTION_NAMES_EXPORT.delete),
        [PLUGIN_APPLY_STAGE.FINALIZE_ACTION]: e => finalizeStorageOperation(e, pgClientFactory, dbStructure, relations, ACTION_NAMES_EXPORT.delete),
      },
      [ACTION_NAMES_EXPORT.detail]: {
        [PLUGIN_APPLY_STAGE.ACTION]: e => prepareStorageOperation(e, pgClientFactory, dbStructure, relations, ACTION_NAMES_EXPORT.detail),
        [PLUGIN_APPLY_STAGE.FINALIZE_ACTION]: e => finalizeStorageOperation(e, pgClientFactory, dbStructure, relations, ACTION_NAMES_EXPORT.detail),
      },
    },
    [PLUGIN_APPLY_STAGE.MERGE]: childEvent => {
      const { parentEvent } = childEvent;
      const params = parentEvent?.getPluginDataOrDefault(PLUGIN_NAME_EXPORT, {
        query: undefined, childQuery: undefined,
      } as {
        query: undefined | IQueryBuilderSelect | IQueryBuilderDelete | IQueryBuilderUpdate | IQueryBuilderInsert,
        childQuery: undefined | IQueryBuilderSelect | IQueryBuilderDelete | IQueryBuilderUpdate | IQueryBuilderInsert
      }) || {};

      const paramsChild = childEvent?.getPluginDataOrDefault(PLUGIN_NAME_EXPORT, {
        query: undefined,
      } as {
        query: undefined | IQueryBuilderSelect | IQueryBuilderDelete | IQueryBuilderUpdate | IQueryBuilderInsert,
      }) || {};

      parentEvent?.setPluginData(PLUGIN_NAME_EXPORT, { ...params, childQuery: paramsChild.query });
    },
  });
