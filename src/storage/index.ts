import { afterInsert, insert } from './insert';
import { afterRemove, remove } from './remove';
import { list } from './list';
import { afterUpdate, update } from './update';
import { exec } from './utils';
import { IStorageFinalizeFn, IStorageFn } from '../const';

export enum STORAGE_ACTION_NAMES {
  'insert' = 'insert',
  'remove' = 'remove',
  'detail' = 'detail',
  'list' = 'list',
  'update' = 'update',
}

// todo add types
export const storage: Record<'preProcess' | 'postProcess', Record<STORAGE_ACTION_NAMES, IStorageFn | IStorageFinalizeFn>> = {
  preProcess: {
    remove,
    insert,
    list,
    update,
    detail: list,
  },
  postProcess: {
    remove: afterRemove,
    insert: afterInsert,
    list: exec,
    update: afterUpdate,
    detail: exec,
  },
};
