import type {
  Node,
  S2CellType,
  SimpleDataItem,
  TooltipShowOptions,
  ViewMeta,
} from '@antv/s2';

export interface CustomTooltipProps {
  cell: S2CellType<Node | ViewMeta>;
  defaultTooltipShowOptions?: TooltipShowOptions<
    React.ReactNode,
    React.ReactNode,
    React.ReactNode
  >;
  label?:
    | React.ReactNode
    | ((
        cell: S2CellType<Node | ViewMeta>,
        defaultLabel: React.ReactNode,
      ) => React.ReactNode);
  showOriginalValue?: boolean;
  renderDerivedValue?: (
    currentValue: SimpleDataItem,
    originalValue: SimpleDataItem,
    cell: S2CellType<Node | ViewMeta>,
  ) => React.ReactNode;
  /**
   * 支持自定义指标和衍生指标部分 (copilot)
   */
  renderMainLabel?: (
    currentLabel: React.ReactNode,
    labelText: string,
    cell: S2CellType<Node | ViewMeta>,
  ) => React.ReactNode;
  renderDerivedLabel?: (
    currentLabel: React.ReactNode,
    labelText: string,
    cell: S2CellType<Node | ViewMeta>,
  ) => React.ReactNode;
}
