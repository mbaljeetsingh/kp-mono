import { TextClassContext } from './text';
import { cn } from '../../lib/utils';
import type { LucideIcon, LucideProps } from 'lucide-react-native';
// NativeWind v5's replacement for v4's `cssInterop`, which no longer exists in
// either package. The shape of the mapping is the same; the difference is that
// `styled` returns a wrapped component rather than mutating the one passed in,
// so the result has to be what gets exported.
import { styled } from 'nativewind';
import * as React from 'react';

type IconProps = LucideProps & {
  as: LucideIcon;
} & React.RefAttributes<LucideIcon>;

function IconImpl({ as: IconComponent, ...props }: IconProps) {
  return <IconComponent {...props} />;
}

const StyledIcon = styled(IconImpl, {
  className: {
    target: 'style',
    nativeStyleToProp: {
      height: 'size',
      width: 'size',
    },
  },
});

/**
 * A wrapper component for Lucide icons with Nativewind `className` support via `cssInterop`.
 *
 * This component allows you to render any Lucide icon while applying utility classes
 * using `nativewind`. It avoids the need to wrap or configure each icon individually.
 *
 * @component
 * @example
 * ```tsx
 * import { ArrowRight } from 'lucide-react-native';
 * import { Icon } from '@/registry/components/ui/icon';
 *
 * <Icon as={ArrowRight} className="text-red-500" size={16} />
 * ```
 *
 * @param {LucideIcon} as - The Lucide icon component to render.
 * @param {string} className - Utility classes to style the icon using Nativewind.
 * @param {number} size - Icon size (defaults to 14).
 * @param {...LucideProps} ...props - Additional Lucide icon props passed to the "as" icon.
 */
function Icon({ as: IconComponent, className, size = 14, ...props }: IconProps) {
  const textClass = React.useContext(TextClassContext);
  return (
    <StyledIcon
      as={IconComponent}
      className={cn('text-foreground', textClass, className)}
      size={size}
      {...props}
    />
  );
}

export { Icon };
