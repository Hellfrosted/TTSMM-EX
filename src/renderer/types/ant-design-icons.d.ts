declare module '@ant-design/icons/es/icons/*' {
	import * as React from 'react';
	import type { AntdIconProps } from '@ant-design/icons/lib/components/AntdIcon';

	const Icon: React.ForwardRefExoticComponent<AntdIconProps & React.RefAttributes<HTMLSpanElement>>;
	export default Icon;
}
