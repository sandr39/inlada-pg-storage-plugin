import { IQueryParam } from '../interfaces/queryBuilder';

export const paramToString = (
  tableAlias: string | undefined, fieldName: string, value: IQueryParam, valueIndex: number, operator?: string,
): string => `${tableAlias ? `${tableAlias}.` : ''}${fieldName} ${operator || ' = '} ${
  Array.isArray(value)
    ? ` ANY($${valueIndex})`
    : ` $${valueIndex}`}`;

export const beatifyString = (str: string): string => str.replace(/\n/gi, ' ').replace(/\s+/gi, ' ');
