import { type ReactNode, useState } from 'react';

export function DetailCollapse({
	className = '',
	defaultActiveKey,
	items
}: {
	className?: string;
	defaultActiveKey?: string[];
	items: Array<{ key: string; label: ReactNode; children: ReactNode }>;
}) {
	const [openKeys, setOpenKeys] = useState<Set<string>>(() => new Set(defaultActiveKey || []));

	return (
		<div className={`ModDetailCollapse${className ? ` ${className}` : ''}`}>
			{items.map((item) => {
				const open = openKeys.has(item.key);
				return (
					<section key={item.key} className="ModDetailCollapseItem">
						<button
							type="button"
							className="ModDetailCollapseHeader"
							aria-expanded={open}
							onClick={() => {
								setOpenKeys((currentKeys) => {
									const nextKeys = new Set(currentKeys);
									if (nextKeys.has(item.key)) {
										nextKeys.delete(item.key);
									} else {
										nextKeys.add(item.key);
									}
									return nextKeys;
								});
							}}
						>
							<span aria-hidden="true">{open ? '▾' : '▸'}</span>
							<span>{item.label}</span>
						</button>
						{open ? <div className="ModDetailCollapsePanel">{item.children}</div> : null}
					</section>
				);
			})}
		</div>
	);
}
