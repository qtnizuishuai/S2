import {
  compact,
  concat,
  endsWith,
  includes,
  indexOf,
  isEmpty,
  isNaN,
  isNil,
  keys,
  map,
  split,
  toUpper,
  uniq,
} from 'lodash';
import { EXTRA_FIELD, ID_SEPARATOR, TOTAL_VALUE } from '../common/constant';
import type { Fields, SortMethod, SortParam } from '../common/interface';
import type { PivotDataSet } from '../data-set';
import type { DataType, SortActionParams } from '../data-set/interface';
import { getListBySorted, sortByItems } from '../utils/data-set-operate';
import { getDimensionsWithParentPath } from '../utils/dataset/pivot-data-set';
import { getLeafColumnsWithKey } from '../facet/utils';

export const isAscSort = (sortMethod) => toUpper(sortMethod) === 'ASC';

export const isDescSort = (sortMethod) => toUpper(sortMethod) === 'DESC';

const canTobeNumber = (a?: string | number) => !isNaN(Number(a));

/**
 * 执行排序
 * @param list - 待排序数组
 * @param sortMethod - 升、降序
 * @param key - 根据key数值排序，如果有key代表根据维度值排序，故按数字排，如果没有按照字典排
 */
export const sortAction = (
  list: Array<string | number | DataType>,
  sortMethod?: SortMethod,
  key?: string,
) => {
  const sort = isAscSort(sortMethod) ? 1 : -1;
  const specialValues = ['-', undefined];
  return list?.sort(
    (pre: string | number | DataType, next: string | number | DataType) => {
      let a = pre as string | number;
      let b = next as string | number;
      if (key) {
        a = pre[key] as string | number;
        b = next[key] as string | number;
        if (canTobeNumber(a) && canTobeNumber(b)) {
          return (Number(a) - Number(b)) * sort;
        }
        if (a && specialValues?.includes(a?.toString())) {
          return -sort;
        }
        if (Number(a) && specialValues?.includes(b?.toString())) {
          return sort;
        }
      }
      // 没有参数 key 时，需要理解成按字典序（首字母）进行排序，用于排维度值的。（我也不理解为啥要把这两个逻辑写在一起，很容易误解
      if (!isNil(a) && !isNil(b)) {
        // 数据健全兼容，用户数据不全时，能够展示.
        return a.toString().localeCompare(b.toString(), 'zh') * sort;
      }
      if (a) {
        return sort;
      }
      return -sort;
    },
  );
};

const mergeDataWhenASC = (
  sortedValues: string[],
  originValues: string[],
  asc: boolean,
) => {
  if (asc) {
    // 如果是升序，需要将无数据的项放到前面
    return sortByItems(originValues, uniq(sortedValues));
  }
  return [...new Set([...sortedValues, ...originValues])];
};

export const sortByCustom = (params: SortActionParams): string[] => {
  const { sortByValues, originValues } = params;

  // 从 originValues 中过滤出所有包含 sortByValue 的 id
  const idWithPre = originValues.filter((originItem) =>
    sortByValues.find((value) => endsWith(originItem, value)),
  );
  // 将 id 拆分为父节点和目标节点
  const idListWithPre = idWithPre.map((idStr) => {
    const ids = idStr.split(ID_SEPARATOR);
    if (ids.length > 1) {
      const parentId = ids.slice(0, ids.length - 1).join(ID_SEPARATOR);
      return [parentId, ids[ids.length - 1]];
    }
    return ids;
  });
  // 获取父节点顺序
  const parentOrder = Array.from(new Set(idListWithPre.map((id) => id[0])));
  // 排序
  idListWithPre.sort((a: string[], b: string[]) => {
    const aParent = a.slice(0, a.length - 1);
    const bParent = b.slice(0, b.length - 1);
    // 父节点不同时，按 parentOrder 排序
    if (aParent.join() !== bParent.join()) {
      const aParentIndex = parentOrder.indexOf(aParent[0]);
      const bParentIndex = parentOrder.indexOf(bParent[0]);
      return aParentIndex - bParentIndex;
    }
    // 父节点相同时，按 sortByValues 排序
    const aIndex = sortByValues.indexOf(a[a.length - 1]);
    const bIndex = sortByValues.indexOf(b[b.length - 1]);
    return aIndex - bIndex;
  });
  // 拼接 id
  const sortedIdWithPre = idListWithPre.map((idArr) =>
    idArr.join(ID_SEPARATOR),
  );

  return getListBySorted(originValues, sortedIdWithPre);
};

export const sortByFunc = (params: SortActionParams): string[] => {
  const { originValues, measureValues, sortParam, dataSet } = params;
  const { sortFunc, sortFieldId, sortMethod } = sortParam;

  const sortResult = sortFunc({
    data: measureValues,
    ...sortParam,
  }) as string[];

  if (!sortResult?.length) {
    return originValues;
  }

  if (
    (dataSet.fields.rows.indexOf(sortFieldId) > 0 ||
      dataSet.fields.columns.indexOf(sortFieldId) > 0) &&
    !includes(sortResult[0], ID_SEPARATOR)
  ) {
    /**
     * 当被排序字段为 行、列维度的非首维度，且用户返回的结果没有 [&] 连接符，把使用 sortResult 按照手动排序进行兜底处理
     * 如 行维度=[province, city]，sortFieldId=city
     * sortResult 返回的为 ['成都', '杭州']，而不是 ['浙江[&]杭州', '四川[&]成都']
     */
    return sortByCustom({
      sortByValues: sortResult,
      originValues,
    });
  }

  // 用户返回的 sortResult 可能是不全的，需要用原始数据补全
  return mergeDataWhenASC(sortResult, originValues, isAscSort(sortMethod));
};

export const sortByMethod = (params: SortActionParams): string[] => {
  const { sortParam, measureValues, originValues, dataSet } = params;
  const { sortByMeasure, query, sortFieldId, sortMethod } = sortParam;
  const { rows, columns } = dataSet.fields;
  const isInRows = rows.includes(sortFieldId);
  let result;

  if (sortByMeasure) {
    const dimensions = sortAction(
      measureValues,
      sortMethod,
      sortByMeasure === TOTAL_VALUE ? query[EXTRA_FIELD] : sortByMeasure,
    ) as Record<string, DataType>[];

    result = getDimensionsWithParentPath(
      sortFieldId,
      isInRows ? rows : getLeafColumnsWithKey(columns),
      dimensions,
    );
  } else {
    result = map(sortAction(measureValues, sortMethod)) as string[];
  }

  return mergeDataWhenASC(result, originValues, isAscSort(sortMethod));
};

export const processSort = (params: SortActionParams): string[] => {
  const { sortParam, originValues, measureValues, dataSet } = params;
  const { sortFunc, sortMethod, sortBy } = sortParam;

  let result = originValues;
  const sortActionParams = {
    originValues,
    measureValues,
    sortParam,
    dataSet,
  };
  if (sortFunc) {
    result = sortByFunc(sortActionParams);
  } else if (sortBy) {
    // 自定义列表
    result = sortByCustom({ sortByValues: sortBy, originValues });
  } else if (isAscSort(sortMethod) || isDescSort(sortMethod)) {
    // 如果是升序，需要将无数据的项放到前面
    result = sortByMethod(sortActionParams);
  }
  return result;
};

/**
 * 生成 getTotalValue (前端计算）所需的 params
 * @param originValue
 * @param fields
 * @param sortFieldId
 */
const createTotalParams = (
  originValue: string,
  fields: Fields,
  sortFieldId: string,
) => {
  const totalParams = {};
  const isMultipleDimensionValue = includes(originValue, ID_SEPARATOR);

  if (isMultipleDimensionValue) {
    // 获取行/列小计时，需要将所有行/列维度的值作为 params
    const realOriginValue = split(originValue, ID_SEPARATOR);
    const keys = fields?.rows?.includes(sortFieldId)
      ? fields.rows
      : getLeafColumnsWithKey(fields.columns);

    for (let i = 0; i <= indexOf(keys, sortFieldId); i++) {
      totalParams[keys[i]] = realOriginValue[i];
    }
  } else {
    totalParams[sortFieldId] = originValue;
  }
  return totalParams;
};

const filterExtraField = (fields: string[]) =>
  fields.filter((field) => field !== EXTRA_FIELD);

/**
 * 获取 “按数值排序” 的排序参考数据
 *
 * 本函数可用以下结构的交叉表理解
 * rows：province、city
 * cols：type、subType
 * vals：price、account
 */
export const getSortByMeasureValues = (
  params: SortActionParams,
): DataType[] => {
  const { dataSet, sortParam, originValues } = params;
  const { fields } = dataSet;
  const { sortByMeasure, query, sortFieldId } = sortParam;
  const dataList = dataSet.getMultiData(
    query,
    undefined,
    undefined,
    undefined,
    true,
  ); // 按 query 查出所有数据
  const columns = getLeafColumnsWithKey(fields.columns);
  /**
   * 按明细数据
   * 需要过滤查询出的总/小计“汇总数据”
   */
  if (sortByMeasure !== TOTAL_VALUE) {
    const rowColFields = concat(fields.rows, columns);

    return dataList.filter((dataItem) => {
      const dataItemKeys = new Set(keys(dataItem));
      // 过滤出包含所有行列维度的数据
      // 若缺失任意 field，则是汇总数据，需要过滤掉
      return rowColFields.every((field) => dataItemKeys.has(field));
    });
  }

  /**
   * 按汇总值进行排序
   * 需要过滤出符合要求的 “汇总数据”
   * 因为 getMultiData 会查询出 query 及其子维度的所有数据
   * 如 query={ type: 'xx' } 会包含 { type: 'xx', subType: '*' } 的数据
   */
  const isSortFieldInRow = includes(fields.rows, sortFieldId);
  // 排序字段所在一侧的全部字段
  const sortFields = filterExtraField(isSortFieldInRow ? fields.rows : columns);
  // 与排序交叉的另一侧全部字段
  const oppositeFields = filterExtraField(
    isSortFieldInRow ? columns : fields.rows,
  );

  const fieldAfterSortField = sortFields[sortFields.indexOf(sortFieldId) + 1];
  const queryKeys = keys(query);
  const missedOppositeFields = oppositeFields.filter((field) => {
    return !queryKeys.includes(field);
  });

  const totalDataList = dataList.filter((dataItem) => {
    const dataItemKeys = new Set(keys(dataItem));
    if (!dataItemKeys.has(sortFieldId)) {
      // 若排序数据中都不含被排序字段，则过滤
      // 如按`省`排序，query={[EXTRA_FIELD]: 'price'} 时
      // 查询出的数据会包含 “行总计x列总计” 数据，需要过滤
      return false;
    }

    if (dataItemKeys.has(fieldAfterSortField)) {
      // 若排序数据包含`排序字段`的后一个维度字段，则过滤
      // 不需要比排序字段更 “明细” 的数据，只需取到 sortFieldId 当级的汇总
      return false;
    }

    // 当排序字段这一侧的维度匹配完成
    // 另一侧维度参考 query 中的维度缺失情况，过滤出汇总数据即可
    // 如 query={ type: 'xx',EXTRA_FIELD=price }，代表了最高可以取到 type 的小计汇总数据
    const allMissed = missedOppositeFields.every((missedField) => {
      return !dataItemKeys.has(missedField);
    });

    // 返回符合要求的汇总数据
    return allMissed;
  });

  if (!isEmpty(totalDataList)) {
    return totalDataList;
  }

  /**
   * 无汇总值的兜底
   * 按前端的小计，总计排序
   */
  return compact(
    map(originValues, (originValue) => {
      const totalParams = createTotalParams(originValue, fields, sortFieldId);

      return (dataSet as PivotDataSet).getTotalValue({
        ...query,
        ...totalParams,
      });
    }),
  );
};

export const handleSortAction = (params: SortActionParams): string[] => {
  const { dataSet, sortParam, originValues, isSortByMeasure } = params;
  let measureValues;
  if (isSortByMeasure) {
    // 根据指标排序，需要首先找到指标的对应的值
    measureValues = getSortByMeasureValues(params);
  } else {
    // 其他都是维度本身的排序方式
    measureValues = originValues;
  }

  return processSort({
    sortParam,
    originValues,
    measureValues,
    dataSet,
  });
};

export const getSortTypeIcon = (sortParam: SortParam, isSortCell?: boolean) => {
  if (sortParam?.sortMethod) {
    if (isAscSort(sortParam?.sortMethod)) {
      return 'groupAsc';
    }
    if (isDescSort(sortParam?.sortMethod)) {
      return 'groupDesc';
    }
  }
  if (isSortCell) {
    return 'SortDown';
  }
};
