import {
  IAnyEvent, IEntityRelation, IObjectInfo, IStorageClientFactory,
} from 'inladajs';

import { logger } from 'inlada-logger';
import { IIdObject } from 'inladajs/dist/interfaces/base';
import {
  ACTION_NAMES_EXPORT, ERROR_NAMES_EXPORT, IStorageFinalizeFn, IStorageFn,
} from './const';
import { storage, STORAGE_ACTION_NAMES } from './storage';
import { filterUnique } from './storage/utils';

const STORAGE_ACTIONS_ROUTE: { [k in ACTION_NAMES_EXPORT]?: STORAGE_ACTION_NAMES } = {
  [ACTION_NAMES_EXPORT.create]: STORAGE_ACTION_NAMES.insert,
  [ACTION_NAMES_EXPORT.list]: STORAGE_ACTION_NAMES.list,
  [ACTION_NAMES_EXPORT.update]: STORAGE_ACTION_NAMES.update,
  [ACTION_NAMES_EXPORT.delete]: STORAGE_ACTION_NAMES.remove,
  [ACTION_NAMES_EXPORT.detail]: STORAGE_ACTION_NAMES.detail,
};

export const prepareStorageOperation = async <
  TOBJECT_NAMES extends string,
  TEvent extends IAnyEvent,
  >(event: TEvent,
  pgClientFactory: IStorageClientFactory,
  dbStructure: Partial<Record<TOBJECT_NAMES, IObjectInfo<TOBJECT_NAMES>>>,
  relations: IEntityRelation<TOBJECT_NAMES>[],
  actionName: ACTION_NAMES_EXPORT) => {
  const effectiveActionName = STORAGE_ACTIONS_ROUTE[actionName];

  if (effectiveActionName) {
    const storageActionHandler = storage.preProcess?.[effectiveActionName];
    await (storageActionHandler as IStorageFn)?.(event, pgClientFactory, dbStructure, relations);
  }

  return null;
};

let caseFields: Record<string, string>;

const processCase = <TOBJECT_NAMES extends string>(
  o: Record<string, unknown>,
  dbStructure: Partial<Record<TOBJECT_NAMES, IObjectInfo<TOBJECT_NAMES>>>,
) => {
  if (!caseFields) {
    caseFields = {
      ...Object.fromEntries(filterUnique((Object.values(dbStructure) as IObjectInfo<TOBJECT_NAMES>[])
        .map(({ fields }) => Object.keys(fields || {}))
        .flat(1))
        .map(fName => [fName.toLowerCase(), fName])),
      ...Object.fromEntries(Object.keys(dbStructure).map(k => [k.toLowerCase(), k])),
    };
  }
  return Object
    .entries(o)
    .reduce((acc, [k, v]) => ({
      ...acc,
      [caseFields[k] || k]: v,
    }), {});
};

export const finalizeStorageOperation = async <
  TOBJECT_NAMES extends string,
  TEvent extends IAnyEvent,
  >(event: TEvent,
  pgClientFactory: IStorageClientFactory,
  dbStructure: Partial<Record<TOBJECT_NAMES, IObjectInfo<TOBJECT_NAMES>>>,
  relations: IEntityRelation<TOBJECT_NAMES>[],
  actionName: ACTION_NAMES_EXPORT)
  : Promise<IIdObject[] | IIdObject | null | boolean | number> => {
  const effectiveActionName = STORAGE_ACTIONS_ROUTE[actionName];

  if (!effectiveActionName) {
    throw new Error(`No such action "${actionName}" in pg storage`);
  }

  const storageActionHandler = storage.postProcess?.[effectiveActionName];

  if (!storageActionHandler || typeof storageActionHandler !== 'function') {
    return null;
  }

  try {
    let res = await (storageActionHandler as IStorageFinalizeFn)(event);

    if (Array.isArray(res) && res?.length) {
      res = res.map(r => processCase(r, dbStructure));
    } else if (!Array.isArray(res) && res && typeof res === 'object') {
      res = processCase(res as Record<string, unknown>, dbStructure);
    }

    return res as IIdObject | IIdObject[];
  } catch (ex: any) {
    logger.error(ex);
    logger.error(ex?.stack);
    event.setErrorAndThrow(ERROR_NAMES_EXPORT.noExpectedData, null, ex);
  }

  return null;
};
