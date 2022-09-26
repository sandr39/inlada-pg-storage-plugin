import {
  IAnyEvent, IEntityRelation, IError, IObjectInfo, IStorageClientFactory,
} from 'inladajs';

export enum ACTION_NAMES {
  create = 'create',
  delete = 'delete',
  detail = 'detail',
  list = 'list',
  update = 'update',
}

export enum OPTION_NAMES {
  $doNotExecAndReturnQuery = '$doNotExecAndReturnQuery',
  $useExtendFieldSet = '$useExtendFieldSet',
  $orderByIdDesc = '$orderByIdDesc',
  $orderById = '$orderById',
  $noExtend = '$noExtend',
  $searchInside = '$searchInside'
}

export const MY_PLUGIN_NAME = 'pgStoragePlugin';

export type IStorageFn = <TOBJECT_NAMES extends string, TEvent extends IAnyEvent>(
  event: TEvent,
  pgClientFactory: IStorageClientFactory,
  dbStructure: Partial<Record<TOBJECT_NAMES, IObjectInfo<TOBJECT_NAMES>>>,
  relationsAll: IEntityRelation<TOBJECT_NAMES>[],
) => Promise<void>

export type IStorageFinalizeFn = <TEvent extends IAnyEvent>(e: TEvent) =>
  Promise<boolean>
  | Promise<unknown | unknown[] | null>

export enum ERROR_NAMES {
  noMassDelete = 'noMassDelete',
  nothingToProcess = 'nothingToProcess',
  noAccess = 'noAccess',
  noExpectedData = 'noExpectedData'
}

export const ERRORS_INFO: Record<ERROR_NAMES, IError<ERROR_NAMES, IAnyEvent>> = {
  [ERROR_NAMES.noAccess]: { title: 'No access', status: 403 },
  [ERROR_NAMES.noMassDelete]: { title: 'No mass delete for non-archivable entity', status: 422 },
  [ERROR_NAMES.noExpectedData]: { title: 'Smth went wrong', status: 500 },
  [ERROR_NAMES.nothingToProcess]: { title: 'Nothing to process', status: 200 },
};

export interface ISuitableRelation {
  [field : string]: number[]
}
