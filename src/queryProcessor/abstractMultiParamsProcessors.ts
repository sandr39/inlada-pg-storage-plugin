export enum QUERY_PROCESSOR_NAMES {
  $cartesian,
  $multi,
  $flat,
}

const cartesian = (...arr : unknown[][]) => arr.reduce((a, b) => a.flatMap(d => b.map(e => [d, e].flat())));

/*
{
  name: ['title1', 'title2'],
  topicId: 1,
  parentId: [1,2]
} => [['title1', 1, 1],  ['title2', 1, 1], ['title1', 1, 2],  ['title2', 1, 2]]
*/
const cartesianProduct = (params: unknown[][]): unknown[][] => {
  const flatParams = params.map(p => [p].flat(2));
  return (flatParams.length) ? cartesian(...flatParams) as unknown[][] : [];
};

/*
{
  name: ['title1', 'title2'],
  topicId: 1,
  parentId: [1,2]
} => [['title1', 1, 1],  ['title2', 1, 2]]
*/
const multiArray = (params: unknown[][]) => {
  const arrayParams = params.filter(p => Array.isArray(p) && p.length > 1);

  if (!arrayParams.length) {
    // no arrays, nothing to do
    return params;
  }

  const arrayParamsMap = Object.fromEntries(arrayParams.map(p => [p, p]));
  if (Object.keys(arrayParamsMap).length > 1) {
    // several arrays with different lengths
    throw new Error(`multiArray: different lengths: ${arrayParams.map(p => ({ value: p, length: p.length }))}`);
  }

  const arrayParamLength = arrayParams[0].length; // any, since they are equal

  return [...Array(arrayParamLength).keys()].map(i => params.map(p => {
    if (Array.isArray(p)) {
      return p[i];
    }
    return p;
  }));
};

/*
{
  name: ['title1'],
  topicId: 1,
  parentId: [1]
} => ['title1', 1, 1]
*/
const flatten = (params: unknown[][]) => params.map(p => {
  if (Array.isArray(p)) {
    if (p.length > 1) {
      throw new Error(`flatten: Array with more than one element: ${p}`);
    }
    if (p.length === 0) {
      // don't currently know what to do
      // logger.warning(`flatten: empty array, ${params}`);
    }
    return p;
  }
  return p;
});

const noAction = (param: unknown[][]) => param;

export const multiParamProcessors: { [k in QUERY_PROCESSOR_NAMES | 'undefined']: (p: unknown[][]) => unknown[][] } = {
  [QUERY_PROCESSOR_NAMES.$cartesian]: cartesianProduct,
  [QUERY_PROCESSOR_NAMES.$multi]: multiArray,
  [QUERY_PROCESSOR_NAMES.$flat]: flatten,
  undefined: noAction,
};
