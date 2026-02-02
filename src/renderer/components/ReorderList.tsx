import React from 'react';
import { Reorder } from 'motion/react';

type Axis = 'x' | 'y';

interface ReorderListProps<T> {
  items: T[];
  onReorder: (items: T[]) => void;
  enabled?: boolean;
  axis?: Axis;
  className?: string;
  itemClassName?: string;
  layoutScroll?: boolean;
  as?: keyof JSX.IntrinsicElements | React.ComponentType<any>;
  getKey?: (item: T, index: number) => string | number;
  children: (item: T, index: number) => React.ReactNode;
}

export function ReorderList<T>({
  items,
  onReorder,
  enabled = true,
  axis = 'y',
  className,
  itemClassName,
  layoutScroll = true,
  as = 'div',
  getKey,
  children,
}: ReorderListProps<T>) {
  if (!enabled) {
    const Container: any = as;
    return (
      <Container className={className}>
        {items.map((item, index) => (
          <div
            key={(getKey ? getKey(item, index) : (index as any)) as React.Key}
            className={itemClassName}
          >
            {children(item, index)}
          </div>
        ))}
      </Container>
    );
  }

  return (
    <Reorder.Group
      as={as as any}
      axis={axis}
      values={items}
      onReorder={onReorder as any}
      layoutScroll={layoutScroll}
      className={className}
    >
      {items.map((item, index) => (
        <Reorder.Item
          key={(getKey ? getKey(item, index) : (index as any)) as React.Key}
          value={item as any}
          className={itemClassName}
        >
          {children(item, index)}
        </Reorder.Item>
      ))}
    </Reorder.Group>
  );
}

export default ReorderList;
