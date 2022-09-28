import {
  IAnyEvent, IEntityRelation, IError, IObjectInfo, IStorageClientFactory,
} from 'inladajs';

export enum ACTION_NAMES_EXPORT {
  create = 'create',
  delete = 'delete',
  detail = 'detail',
  list = 'list',
  update = 'update',
}

export enum OPTION_NAMES_EXPORT {
  $doNotExecQuery = '$doNotExecQuery',
  $useExtendFieldSet = '$useExtendFieldSet',
  $orderByIdDesc = '$orderByIdDesc',
  $orderById = '$orderById',
  $noExtend = '$noExtend',
  $searchInside = '$searchInside',
  $pluginSet = '$pluginSet'
}

export const PLUGIN_NAME_EXPORT = 'pgStoragePlugin';

export type IStorageFn = <TOBJECT_NAMES extends string, TEvent extends IAnyEvent>(
  event: TEvent,
  pgClientFactory: IStorageClientFactory,
  dbStructure: Partial<Record<TOBJECT_NAMES, IObjectInfo<TOBJECT_NAMES>>>,
  relationsAll: IEntityRelation<TOBJECT_NAMES>[],
) => Promise<void>

export type IStorageFinalizeFn = <TEvent extends IAnyEvent>(e: TEvent) =>
  Promise<boolean>
  | Promise<unknown | unknown[] | null>

export enum ERROR_NAMES_EXPORT {
  noMassDelete = 'noMassDelete',
  nothingToProcess = 'nothingToProcess',
  noAccess = 'noAccess',
  noExpectedData = 'noExpectedData'
}

export const ERRORS_INFO_EXPORT: Record<ERROR_NAMES_EXPORT, IError<ERROR_NAMES_EXPORT, IAnyEvent>> = {
  [ERROR_NAMES_EXPORT.noAccess]: { title: 'No access', status: 403 },
  [ERROR_NAMES_EXPORT.noMassDelete]: { title: 'No mass delete for non-archivable entity', status: 422 },
  [ERROR_NAMES_EXPORT.noExpectedData]: { title: 'Smth went wrong', status: 500 },
  [ERROR_NAMES_EXPORT.nothingToProcess]: { title: 'Nothing to process', status: 200 },
};

export interface ISuitableRelation {
  [field : string]: number[]
}

export enum PLUGIN_SETS_EXPORT {
  default = 'default',
  noExec = 'noExec',
}
