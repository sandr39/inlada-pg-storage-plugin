import { IAnyEvent, IStorageClientFactory } from 'inladajs';
import { QueryBuilder } from './queryBuilder';

export const createQueryBuilder = async <TEvent extends IAnyEvent>(pgClientFactory: IStorageClientFactory, event: TEvent) => {
  const pgClient = await pgClientFactory(event.uid);
  return new QueryBuilder(pgClient.query);
};
