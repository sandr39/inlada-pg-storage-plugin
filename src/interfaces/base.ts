export type IColumnTypes = Record<string, string | undefined>;
export type ITableColumnTypes = Record<string, IColumnTypes>;

export enum JOIN_TYPES {
  inner = 'inner',
  outer = 'outer',
  left = 'left',
  right = 'right',
}

export enum EXTEND_TYPE {
  one = 'one',
  many = 'many',
  ids = 'ids',
  notPacked = 'notPacked',
}

export enum QUERY_ORDER_DIRECTION {
  asc = 'asc',
  desc = 'desc',
}

export enum QUERY_TYPES {
  select,
  insert,
  update,
  delete,
  undefined,
}
