import {
  PLUGIN_APPLY_STAGE, IPlugin, IStorageClientFactory, IEntityRelation, IAnyEvent, IObjectInfo,
} from 'inladajs';
import { ACTION_NAMES } from './const';
import { finalizeStorageOperation, prepareStorageOperation } from './storageOperations';

export const createPostgresStoragePlugin = <
  TACTION_NAMES extends string,
  TOBJECT_NAMES extends string,
  TPLUGIN_NAMES extends string,
  TEvent extends IAnyEvent
  >(
    pgClientFactory: IStorageClientFactory,
    dbStructure: Partial<Record<TOBJECT_NAMES, IObjectInfo<TOBJECT_NAMES>>>,
    relations: IEntityRelation<TOBJECT_NAMES>[],
  ): IPlugin<TACTION_NAMES | ACTION_NAMES, TPLUGIN_NAMES, TEvent> => ({
    [ACTION_NAMES.create]: {
      [PLUGIN_APPLY_STAGE.ACTION]: e => prepareStorageOperation(e, pgClientFactory, dbStructure, relations, ACTION_NAMES.create),
      [PLUGIN_APPLY_STAGE.FINALIZE_ACTION]: e => finalizeStorageOperation(e, pgClientFactory, dbStructure, relations, ACTION_NAMES.create),
    },
    [ACTION_NAMES.list]: {
      [PLUGIN_APPLY_STAGE.ACTION]: e => prepareStorageOperation(e, pgClientFactory, dbStructure, relations, ACTION_NAMES.list),
      [PLUGIN_APPLY_STAGE.FINALIZE_ACTION]: e => finalizeStorageOperation(e, pgClientFactory, dbStructure, relations, ACTION_NAMES.list),
    },
    [ACTION_NAMES.update]: {
      [PLUGIN_APPLY_STAGE.ACTION]: e => prepareStorageOperation(e, pgClientFactory, dbStructure, relations, ACTION_NAMES.update),
      [PLUGIN_APPLY_STAGE.FINALIZE_ACTION]: e => finalizeStorageOperation(e, pgClientFactory, dbStructure, relations, ACTION_NAMES.update),
    },
    [ACTION_NAMES.delete]: {
      [PLUGIN_APPLY_STAGE.ACTION]: e => prepareStorageOperation(e, pgClientFactory, dbStructure, relations, ACTION_NAMES.delete),
      [PLUGIN_APPLY_STAGE.FINALIZE_ACTION]: e => finalizeStorageOperation(e, pgClientFactory, dbStructure, relations, ACTION_NAMES.delete),
    },
    [ACTION_NAMES.detail]: {
      [PLUGIN_APPLY_STAGE.ACTION]: e => prepareStorageOperation(e, pgClientFactory, dbStructure, relations, ACTION_NAMES.detail),
      [PLUGIN_APPLY_STAGE.FINALIZE_ACTION]: e => finalizeStorageOperation(e, pgClientFactory, dbStructure, relations, ACTION_NAMES.detail),
    },
  });
